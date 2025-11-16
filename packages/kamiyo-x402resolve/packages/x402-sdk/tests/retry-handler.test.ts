import { RetryHandler, CircuitBreaker, DEFAULT_RETRY_CONFIG } from '../src/retry-handler';

describe('RetryHandler', () => {
  describe('Configuration', () => {
    it('should create with default configuration', () => {
      const handler = new RetryHandler();
      expect(handler).toBeInstanceOf(RetryHandler);
    });

    it('should create with custom configuration', () => {
      const handler = new RetryHandler({
        maxRetries: 5,
        initialDelay: 500,
      });
      expect(handler).toBeInstanceOf(RetryHandler);
    });
  });

  describe('execute()', () => {
    it('should execute function successfully', async () => {
      const handler = new RetryHandler();
      const result = await handler.execute(async () => 'success');
      expect(result).toBe('success');
    });

    it('should retry on retryable errors', async () => {
      const handler = new RetryHandler({ maxRetries: 2, initialDelay: 10 });
      let attempts = 0;

      const result = await handler.execute(async () => {
        attempts++;
        if (attempts < 2) {
          throw new Error('timeout');
        }
        return 'success';
      });

      expect(result).toBe('success');
      expect(attempts).toBe(2);
    });

    it('should fail immediately on non-retryable error', async () => {
      const handler = new RetryHandler();

      await expect(
        handler.execute(async () => {
          throw new Error('Invalid input');
        })
      ).rejects.toThrow('Invalid input');
    });

    it('should exhaust retries and fail', async () => {
      const handler = new RetryHandler({ maxRetries: 2, initialDelay: 10 });

      await expect(
        handler.execute(async () => {
          throw new Error('timeout');
        })
      ).rejects.toThrow('Failed after 3 attempts');
    });
  });
});

describe('CircuitBreaker', () => {
  describe('State Management', () => {
    it('should start in closed state', () => {
      const breaker = new CircuitBreaker(3, 2, 1000);
      expect(breaker.getState()).toBe('closed');
      expect(breaker.canExecute()).toBe(true);
    });

    it('should open after threshold failures', () => {
      const breaker = new CircuitBreaker(3, 2, 1000);

      breaker.recordFailure();
      breaker.recordFailure();
      breaker.recordFailure();

      expect(breaker.getState()).toBe('open');
      expect(breaker.canExecute()).toBe(false);
    });

    it('should reset circuit breaker', () => {
      const breaker = new CircuitBreaker(3, 2, 1000);

      breaker.recordFailure();
      breaker.recordFailure();
      breaker.reset();

      expect(breaker.getState()).toBe('closed');
      expect(breaker.canExecute()).toBe(true);
    });
  });
});
