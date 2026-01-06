import { X402Error, isX402Error, wrapError } from './errors';

describe('X402Error', () => {
  describe('constructor', () => {
    it('creates error with code and message', () => {
      const error = new X402Error('PAYMENT_REQUIRED', 'Payment needed');
      expect(error.code).toBe('PAYMENT_REQUIRED');
      expect(error.message).toBe('Payment needed');
      expect(error.name).toBe('X402Error');
    });

    it('includes optional statusCode', () => {
      const error = new X402Error('PAYMENT_REQUIRED', 'Payment needed', { statusCode: 402 });
      expect(error.statusCode).toBe(402);
    });

    it('includes optional details', () => {
      const details = { amount: 100, provider: 'test' };
      const error = new X402Error('PAYMENT_FAILED', 'Failed', { details });
      expect(error.details).toEqual(details);
    });

    it('includes optional cause', () => {
      const cause = new Error('original error');
      const error = new X402Error('NETWORK_ERROR', 'Network failed', { cause });
      expect(error.originalCause).toBe(cause);
    });
  });

  describe('retryable', () => {
    it('marks TIMEOUT as retryable', () => {
      const error = new X402Error('TIMEOUT', 'Timed out');
      expect(error.retryable).toBe(true);
    });

    it('marks NETWORK_ERROR as retryable', () => {
      const error = new X402Error('NETWORK_ERROR', 'Network failed');
      expect(error.retryable).toBe(true);
    });

    it('marks PAYMENT_REQUIRED as not retryable', () => {
      const error = new X402Error('PAYMENT_REQUIRED', 'Pay up');
      expect(error.retryable).toBe(false);
    });

    it('marks INVALID_INPUT as not retryable', () => {
      const error = new X402Error('INVALID_INPUT', 'Bad input');
      expect(error.retryable).toBe(false);
    });
  });

  describe('toJSON', () => {
    it('serializes error properties', () => {
      const error = new X402Error('PAYMENT_FAILED', 'Failed', {
        statusCode: 500,
        details: { tx: '123' },
      });
      const json = error.toJSON();
      expect(json).toEqual({
        name: 'X402Error',
        code: 'PAYMENT_FAILED',
        message: 'Failed',
        statusCode: 500,
        details: { tx: '123' },
        retryable: false,
      });
    });
  });

  describe('factory methods', () => {
    describe('paymentRequired', () => {
      it('creates 402 error', () => {
        const error = X402Error.paymentRequired({ amount: 100 });
        expect(error.code).toBe('PAYMENT_REQUIRED');
        expect(error.statusCode).toBe(402);
        expect(error.details).toEqual({ amount: 100 });
      });
    });

    describe('paymentFailed', () => {
      it('creates error with reason', () => {
        const error = X402Error.paymentFailed('Transaction rejected');
        expect(error.code).toBe('PAYMENT_FAILED');
        expect(error.message).toContain('Transaction rejected');
      });

      it('includes cause', () => {
        const cause = new Error('inner');
        const error = X402Error.paymentFailed('Failed', cause);
        expect(error.originalCause).toBe(cause);
      });
    });

    describe('insufficientFunds', () => {
      it('creates error with amounts', () => {
        const error = X402Error.insufficientFunds(10, 5);
        expect(error.code).toBe('INSUFFICIENT_FUNDS');
        expect(error.message).toContain('10');
        expect(error.message).toContain('5');
        expect(error.details).toEqual({ required: 10, available: 5 });
      });
    });

    describe('priceExceeded', () => {
      it('creates error with prices', () => {
        const error = X402Error.priceExceeded(1.5, 1.0);
        expect(error.code).toBe('PRICE_EXCEEDED');
        expect(error.message).toContain('1.5');
        expect(error.message).toContain('1');
        expect(error.details).toEqual({ price: 1.5, maxPrice: 1.0 });
      });
    });

    describe('slaViolation', () => {
      it('creates error with violations and score', () => {
        const violations = ['Latency exceeded', 'Quality too low'];
        const error = X402Error.slaViolation(violations, 45);
        expect(error.code).toBe('SLA_VIOLATION');
        expect(error.message).toContain('Latency exceeded');
        expect(error.message).toContain('Quality too low');
        expect(error.details).toEqual({ violations, qualityScore: 45 });
      });
    });

    describe('timeout', () => {
      it('creates error with operation and duration', () => {
        const error = X402Error.timeout('fetchData', 30000);
        expect(error.code).toBe('TIMEOUT');
        expect(error.message).toContain('fetchData');
        expect(error.message).toContain('30000');
        expect(error.details).toEqual({ operation: 'fetchData', timeoutMs: 30000 });
      });
    });

    describe('invalidInput', () => {
      it('creates error with field and reason', () => {
        const error = X402Error.invalidInput('amount', 'must be positive');
        expect(error.code).toBe('INVALID_INPUT');
        expect(error.message).toContain('amount');
        expect(error.message).toContain('must be positive');
        expect(error.details).toEqual({ field: 'amount', reason: 'must be positive' });
      });
    });

    describe('circuitOpen', () => {
      it('creates circuit breaker error', () => {
        const error = X402Error.circuitOpen();
        expect(error.code).toBe('CIRCUIT_OPEN');
        expect(error.message).toContain('Circuit breaker');
      });
    });
  });

  describe('fromResponse', () => {
    const mockResponse = (status: number, statusText: string = 'Error') => ({
      status,
      statusText,
      headers: new Map(),
    }) as unknown as Response;

    it('handles 400', () => {
      const error = X402Error.fromResponse(mockResponse(400));
      expect(error.code).toBe('INVALID_INPUT');
      expect(error.statusCode).toBe(400);
    });

    it('handles 401', () => {
      const error = X402Error.fromResponse(mockResponse(401));
      expect(error.code).toBe('PAYMENT_REQUIRED');
    });

    it('handles 402', () => {
      const error = X402Error.fromResponse(mockResponse(402));
      expect(error.code).toBe('PAYMENT_REQUIRED');
      expect(error.statusCode).toBe(402);
    });

    it('handles 403', () => {
      const error = X402Error.fromResponse(mockResponse(403));
      expect(error.code).toBe('PAYMENT_REJECTED');
    });

    it('handles 404', () => {
      const error = X402Error.fromResponse(mockResponse(404));
      expect(error.code).toBe('ESCROW_NOT_FOUND');
    });

    it('handles 408', () => {
      const error = X402Error.fromResponse(mockResponse(408));
      expect(error.code).toBe('TIMEOUT');
    });

    it('handles 429', () => {
      const error = X402Error.fromResponse(mockResponse(429));
      expect(error.code).toBe('NETWORK_ERROR');
    });

    it('handles 5xx', () => {
      for (const status of [500, 502, 503, 504]) {
        const error = X402Error.fromResponse(mockResponse(status));
        expect(error.code).toBe('NETWORK_ERROR');
      }
    });

    it('handles unknown status', () => {
      const error = X402Error.fromResponse(mockResponse(418, 'Teapot'));
      expect(error.code).toBe('UNKNOWN');
      expect(error.message).toContain('418');
    });

    it('extracts message from body error field', () => {
      const error = X402Error.fromResponse(mockResponse(400), { error: 'Invalid param' });
      expect(error.message).toBe('Invalid param');
    });

    it('extracts message from body message field', () => {
      const error = X402Error.fromResponse(mockResponse(400), { message: 'Bad request format' });
      expect(error.message).toBe('Bad request format');
    });
  });
});

describe('isX402Error', () => {
  it('returns true for X402Error instances', () => {
    const error = new X402Error('UNKNOWN', 'test');
    expect(isX402Error(error)).toBe(true);
  });

  it('returns false for regular errors', () => {
    expect(isX402Error(new Error('test'))).toBe(false);
  });

  it('returns false for non-errors', () => {
    expect(isX402Error('error string')).toBe(false);
    expect(isX402Error({ code: 'UNKNOWN' })).toBe(false);
    expect(isX402Error(null)).toBe(false);
  });
});

describe('wrapError', () => {
  it('returns X402Error unchanged', () => {
    const original = new X402Error('PAYMENT_FAILED', 'failed');
    const wrapped = wrapError(original);
    expect(wrapped).toBe(original);
  });

  it('wraps timeout errors', () => {
    const wrapped = wrapError(new Error('Request timeout exceeded'));
    expect(wrapped.code).toBe('TIMEOUT');
  });

  it('wraps network errors', () => {
    const wrapped = wrapError(new Error('Network connection failed'));
    expect(wrapped.code).toBe('NETWORK_ERROR');
  });

  it('wraps fetch errors', () => {
    const wrapped = wrapError(new Error('fetch failed'));
    expect(wrapped.code).toBe('NETWORK_ERROR');
  });

  it('wraps insufficient funds errors', () => {
    const wrapped = wrapError(new Error('Insufficient balance'));
    expect(wrapped.code).toBe('INSUFFICIENT_FUNDS');
  });

  it('wraps unknown errors as UNKNOWN', () => {
    const wrapped = wrapError(new Error('Something random'));
    expect(wrapped.code).toBe('UNKNOWN');
  });

  it('handles non-Error values', () => {
    const wrapped = wrapError('string error');
    expect(wrapped.code).toBe('UNKNOWN');
    expect(wrapped.message).toContain('string error');
  });

  it('adds context prefix', () => {
    const wrapped = wrapError(new Error('failed'), 'myOperation');
    expect(wrapped.message).toContain('[myOperation]');
  });

  it('preserves original error as cause', () => {
    const original = new Error('original');
    const wrapped = wrapError(original);
    expect(wrapped.originalCause).toBe(original);
  });
});
