import { RetryHandler, CircuitBreaker, ResilientExecutor, DEFAULT_RETRY_CONFIG } from './retry';

describe('RetryHandler', () => {
  let handler: RetryHandler;

  beforeEach(() => {
    handler = new RetryHandler({ maxRetries: 2, initialDelayMs: 10, maxDelayMs: 100 });
  });

  describe('isRetryable', () => {
    it('returns true for timeout errors', () => {
      expect(handler.isRetryable(new Error('Request timeout'))).toBe(true);
    });

    it('returns true for network errors', () => {
      expect(handler.isRetryable(new Error('fetch failed'))).toBe(true);
      expect(handler.isRetryable(new Error('ECONNREFUSED'))).toBe(true);
      expect(handler.isRetryable(new Error('ECONNRESET'))).toBe(true);
      expect(handler.isRetryable(new Error('ETIMEDOUT'))).toBe(true);
    });

    it('returns true for rate limiting (429)', () => {
      expect(handler.isRetryable(new Error('HTTP 429 Too Many Requests'))).toBe(true);
    });

    it('returns true for server errors (5xx)', () => {
      expect(handler.isRetryable(new Error('HTTP 502 Bad Gateway'))).toBe(true);
      expect(handler.isRetryable(new Error('HTTP 503 Service Unavailable'))).toBe(true);
      expect(handler.isRetryable(new Error('HTTP 504 Gateway Timeout'))).toBe(true);
    });

    it('returns true for Solana-specific errors', () => {
      expect(handler.isRetryable(new Error('blockhash not found'))).toBe(true);
      expect(handler.isRetryable(new Error('transaction was not confirmed'))).toBe(true);
      expect(handler.isRetryable(new Error('node is unhealthy'))).toBe(true);
    });

    it('returns false for auth errors', () => {
      expect(handler.isRetryable(new Error('Unauthorized'))).toBe(false);
      expect(handler.isRetryable(new Error('Forbidden'))).toBe(false);
    });

    it('returns false for invalid signature', () => {
      expect(handler.isRetryable(new Error('Invalid signature'))).toBe(false);
    });

    it('returns false for insufficient funds', () => {
      expect(handler.isRetryable(new Error('Insufficient funds'))).toBe(false);
    });

    it('returns false for client errors (4xx)', () => {
      expect(handler.isRetryable(new Error('HTTP 400'))).toBe(false);
      expect(handler.isRetryable(new Error('HTTP 401'))).toBe(false);
      expect(handler.isRetryable(new Error('HTTP 403'))).toBe(false);
      expect(handler.isRetryable(new Error('HTTP 404'))).toBe(false);
    });

    it('returns false for program errors', () => {
      expect(handler.isRetryable(new Error('Program error: invalid instruction'))).toBe(false);
    });

    it('returns false for unknown errors', () => {
      expect(handler.isRetryable(new Error('Something completely unknown'))).toBe(false);
    });
  });

  describe('execute', () => {
    it('returns result on success', async () => {
      const fn = jest.fn().mockResolvedValue('success');
      const result = await handler.execute(fn);
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('retries on retryable error', async () => {
      const fn = jest.fn()
        .mockRejectedValueOnce(new Error('timeout'))
        .mockResolvedValue('success');

      const result = await handler.execute(fn);
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('does not retry on non-retryable error', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('Unauthorized'));

      await expect(handler.execute(fn)).rejects.toThrow('Unauthorized');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('fails after max retries', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('timeout'));

      await expect(handler.execute(fn)).rejects.toThrow(/Failed after 3 attempts/);
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('includes context in final error', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('timeout'));

      await expect(handler.execute(fn, 'myOperation')).rejects.toThrow(/\[myOperation\]/);
    });
  });
});

describe('CircuitBreaker', () => {
  let breaker: CircuitBreaker;

  beforeEach(() => {
    breaker = new CircuitBreaker(3, 2, 100);
  });

  describe('initial state', () => {
    it('starts closed', () => {
      expect(breaker.getState()).toBe('closed');
    });

    it('allows execution', () => {
      expect(breaker.canExecute()).toBe(true);
    });
  });

  describe('failure handling', () => {
    it('stays closed below threshold', () => {
      breaker.recordFailure();
      breaker.recordFailure();
      expect(breaker.getState()).toBe('closed');
      expect(breaker.canExecute()).toBe(true);
    });

    it('opens at threshold', () => {
      breaker.recordFailure();
      breaker.recordFailure();
      breaker.recordFailure();
      expect(breaker.getState()).toBe('open');
      expect(breaker.canExecute()).toBe(false);
    });

    it('resets failure count on success', () => {
      breaker.recordFailure();
      breaker.recordFailure();
      breaker.recordSuccess();
      breaker.recordFailure();
      expect(breaker.getState()).toBe('closed');
    });
  });

  describe('half-open state', () => {
    beforeEach(() => {
      // Open the circuit
      breaker.recordFailure();
      breaker.recordFailure();
      breaker.recordFailure();
    });

    it('transitions to half-open after timeout', async () => {
      expect(breaker.canExecute()).toBe(false);
      await new Promise(resolve => setTimeout(resolve, 110));
      expect(breaker.canExecute()).toBe(true);
      expect(breaker.getState()).toBe('half-open');
    });

    it('closes after success threshold in half-open', async () => {
      await new Promise(resolve => setTimeout(resolve, 110));
      breaker.canExecute(); // Trigger half-open
      breaker.recordSuccess();
      expect(breaker.getState()).toBe('half-open');
      breaker.recordSuccess();
      expect(breaker.getState()).toBe('closed');
    });

    it('reopens on failure in half-open', async () => {
      await new Promise(resolve => setTimeout(resolve, 110));
      breaker.canExecute(); // Trigger half-open
      breaker.recordFailure();
      breaker.recordFailure();
      breaker.recordFailure();
      expect(breaker.getState()).toBe('open');
    });
  });

  describe('reset', () => {
    it('resets to closed state', () => {
      breaker.recordFailure();
      breaker.recordFailure();
      breaker.recordFailure();
      expect(breaker.getState()).toBe('open');

      breaker.reset();
      expect(breaker.getState()).toBe('closed');
      expect(breaker.canExecute()).toBe(true);
    });
  });
});

describe('ResilientExecutor', () => {
  let executor: ResilientExecutor;

  beforeEach(() => {
    executor = new ResilientExecutor(
      { maxRetries: 2, initialDelayMs: 10, maxDelayMs: 50 },
      { failureThreshold: 2, successThreshold: 1, resetTimeoutMs: 100 }
    );
  });

  it('executes successfully', async () => {
    const result = await executor.execute(() => Promise.resolve('success'));
    expect(result).toBe('success');
  });

  it('retries and succeeds', async () => {
    let attempts = 0;
    const result = await executor.execute(() => {
      attempts++;
      if (attempts === 1) throw new Error('timeout');
      return Promise.resolve('success');
    });
    expect(result).toBe('success');
    expect(attempts).toBe(2);
  });

  it('records success in circuit breaker', async () => {
    await executor.execute(() => Promise.resolve('ok'));
    expect(executor.getCircuitState()).toBe('closed');
  });

  it('opens circuit after failures', async () => {
    const fn = () => Promise.reject(new Error('timeout'));

    await expect(executor.execute(fn)).rejects.toThrow();
    await expect(executor.execute(fn)).rejects.toThrow();

    expect(executor.getCircuitState()).toBe('open');
  });

  it('rejects when circuit is open', async () => {
    const fn = () => Promise.reject(new Error('timeout'));
    await expect(executor.execute(fn)).rejects.toThrow();
    await expect(executor.execute(fn)).rejects.toThrow();

    await expect(executor.execute(() => Promise.resolve('ok'))).rejects.toThrow(/Circuit breaker is open/);
  });

  it('resets circuit', async () => {
    const fn = () => Promise.reject(new Error('timeout'));
    await expect(executor.execute(fn)).rejects.toThrow();
    await expect(executor.execute(fn)).rejects.toThrow();

    executor.resetCircuit();
    expect(executor.getCircuitState()).toBe('closed');

    const result = await executor.execute(() => Promise.resolve('ok'));
    expect(result).toBe('ok');
  });
});

describe('DEFAULT_RETRY_CONFIG', () => {
  it('has sensible defaults', () => {
    expect(DEFAULT_RETRY_CONFIG.maxRetries).toBe(3);
    expect(DEFAULT_RETRY_CONFIG.initialDelayMs).toBe(1000);
    expect(DEFAULT_RETRY_CONFIG.maxDelayMs).toBe(30000);
    expect(DEFAULT_RETRY_CONFIG.backoffMultiplier).toBe(2);
    expect(DEFAULT_RETRY_CONFIG.retryablePatterns).toContain('timeout');
    expect(DEFAULT_RETRY_CONFIG.retryablePatterns).toContain('503');
  });
});
