import { describe, it, expect } from 'vitest';
import {
  NikaError,
  RetryableError,
  PermanentError,
  RateLimitError,
  AuthenticationError,
  ValidationError,
  ModerationError,
  CircuitOpenError,
  TimeoutError,
  classifyTwitterError,
  classifyAnthropicError,
  isRetryable,
  getRetryDelay,
} from './errors';

describe('Error classes', () => {
  describe('NikaError', () => {
    it('creates error with code and metadata', () => {
      const error = new NikaError('test error', 'TEST_CODE', true, { key: 'value' });
      expect(error.message).toBe('test error');
      expect(error.code).toBe('TEST_CODE');
      expect(error.retryable).toBe(true);
      expect(error.metadata).toEqual({ key: 'value' });
      expect(error.name).toBe('NikaError');
    });
  });

  describe('RetryableError', () => {
    it('includes suggested delay', () => {
      const error = new RetryableError('retry me', 'RETRY_CODE', 5000);
      expect(error.suggestedDelayMs).toBe(5000);
      expect(error.retryable).toBe(true);
      expect(error.name).toBe('RetryableError');
    });
  });

  describe('RateLimitError', () => {
    it('includes retry-after seconds', () => {
      const error = new RateLimitError(60);
      expect(error.retryAfterSeconds).toBe(60);
      expect(error.suggestedDelayMs).toBe(60000);
      expect(error.code).toBe('RATE_LIMITED');
    });
  });

  describe('ModerationError', () => {
    it('includes moderation reasons', () => {
      const error = new ModerationError(['blocked phrase', 'suspicious URL']);
      expect(error.reasons).toEqual(['blocked phrase', 'suspicious URL']);
      expect(error.message).toContain('blocked phrase');
      expect(error.code).toBe('MODERATION_BLOCKED');
    });
  });

  describe('CircuitOpenError', () => {
    it('includes service name in message', () => {
      const error = new CircuitOpenError('twitter');
      expect(error.message).toContain('twitter');
      expect(error.code).toBe('CIRCUIT_OPEN');
      expect(error.metadata.service).toBe('twitter');
    });
  });

  describe('TimeoutError', () => {
    it('includes operation and timeout in message', () => {
      const error = new TimeoutError('operation', 30000);
      expect(error.message).toContain('30000');
      expect(error.message).toContain('operation');
      expect(error.code).toBe('TIMEOUT');
      expect(error.metadata.timeoutMs).toBe(30000);
    });
  });

  describe('ValidationError', () => {
    it('includes field name', () => {
      const error = new ValidationError('Invalid input', 'email');
      expect(error.field).toBe('email');
      expect(error.code).toBe('VALIDATION_FAILED');
    });
  });

  describe('AuthenticationError', () => {
    it('sets correct code', () => {
      const error = new AuthenticationError('Invalid API key');
      expect(error.code).toBe('AUTH_FAILED');
      expect(error.retryable).toBe(false);
    });
  });
});

describe('classifyTwitterError', () => {
  it('classifies rate limit errors by status code', () => {
    const error = { code: 429, message: 'Too Many Requests' };
    const result = classifyTwitterError(error);
    expect(result).toBeInstanceOf(RateLimitError);
  });

  it('classifies rate limit errors by message', () => {
    const error = new Error('rate limit exceeded');
    const result = classifyTwitterError(error);
    expect(result).toBeInstanceOf(RateLimitError);
  });

  it('classifies authentication errors (401)', () => {
    const error = { code: 401, message: 'Unauthorized' };
    const result = classifyTwitterError(error);
    expect(result).toBeInstanceOf(AuthenticationError);
  });

  it('classifies forbidden (403) as authentication error', () => {
    const error = { code: 403, message: 'Forbidden' };
    const result = classifyTwitterError(error);
    expect(result).toBeInstanceOf(AuthenticationError);
  });

  it('classifies not found (404) as permanent error', () => {
    const error = { code: 404, message: 'Not Found' };
    const result = classifyTwitterError(error);
    expect(result).toBeInstanceOf(PermanentError);
    expect(result.code).toBe('NOT_FOUND');
  });

  it('classifies bad request (400) as validation error', () => {
    const error = { code: 400, message: 'Bad Request' };
    const result = classifyTwitterError(error);
    expect(result).toBeInstanceOf(ValidationError);
  });

  it('classifies server errors (5xx) as retryable', () => {
    const error = { code: 500, message: 'Internal Server Error' };
    const result = classifyTwitterError(error);
    expect(result).toBeInstanceOf(RetryableError);
    expect(result.code).toBe('SERVER_ERROR');
  });

  it('classifies network errors as retryable', () => {
    const error = new Error('ECONNREFUSED');
    const result = classifyTwitterError(error);
    expect(result).toBeInstanceOf(RetryableError);
    expect(result.code).toBe('NETWORK_ERROR');
  });

  it('classifies duplicate content as permanent', () => {
    const error = new Error('Status is a duplicate');
    const result = classifyTwitterError(error);
    expect(result).toBeInstanceOf(PermanentError);
    expect(result.code).toBe('DUPLICATE_CONTENT');
  });

  it('returns NikaError for already-classified errors', () => {
    const original = new NikaError('test', 'TEST', false);
    const result = classifyTwitterError(original);
    expect(result).toBe(original);
  });

  it('handles non-Error objects', () => {
    const result = classifyTwitterError('string error');
    expect(result).toBeInstanceOf(NikaError);
  });
});

describe('classifyAnthropicError', () => {
  it('classifies rate limit errors (429)', () => {
    const error = { status: 429, message: 'Rate limited' };
    const result = classifyAnthropicError(error);
    expect(result).toBeInstanceOf(RateLimitError);
  });

  it('classifies authentication errors (401)', () => {
    const error = { status: 401, message: 'Invalid API key' };
    const result = classifyAnthropicError(error);
    expect(result).toBeInstanceOf(AuthenticationError);
  });

  it('classifies bad request (400) as permanent', () => {
    const error = { status: 400, message: 'Invalid request' };
    const result = classifyAnthropicError(error);
    expect(result).toBeInstanceOf(PermanentError);
    expect(result.code).toBe('INVALID_REQUEST');
  });

  it('classifies overloaded (529) as retryable', () => {
    const error = { status: 529, message: 'API overloaded' };
    const result = classifyAnthropicError(error);
    expect(result).toBeInstanceOf(RetryableError);
    expect(result.code).toBe('API_OVERLOADED');
  });

  it('classifies overloaded by message', () => {
    const error = new Error('The API is overloaded');
    const result = classifyAnthropicError(error);
    expect(result).toBeInstanceOf(RetryableError);
    expect(result.code).toBe('API_OVERLOADED');
  });

  it('classifies server errors (5xx) as retryable', () => {
    const error = { status: 500, message: 'Internal error' };
    const result = classifyAnthropicError(error);
    expect(result).toBeInstanceOf(RetryableError);
    expect(result.code).toBe('SERVER_ERROR');
  });
});

describe('isRetryable', () => {
  it('returns true for RetryableError', () => {
    expect(isRetryable(new RetryableError('test', 'CODE'))).toBe(true);
  });

  it('returns true for RateLimitError', () => {
    expect(isRetryable(new RateLimitError(60))).toBe(true);
  });

  it('returns false for PermanentError', () => {
    expect(isRetryable(new PermanentError('test', 'CODE'))).toBe(false);
  });

  it('returns false for AuthenticationError', () => {
    expect(isRetryable(new AuthenticationError('test'))).toBe(false);
  });

  it('returns false for ModerationError', () => {
    expect(isRetryable(new ModerationError(['reason']))).toBe(false);
  });

  it('classifies generic Error and checks retryable', () => {
    // Generic errors get classified as retryable by default
    expect(isRetryable(new Error('unknown'))).toBe(true);
  });
});

describe('getRetryDelay', () => {
  it('uses suggested delay from RetryableError', () => {
    const error = new RetryableError('test', 'CODE', 5000);
    expect(getRetryDelay(error)).toBe(5000);
  });

  it('uses retry-after from RateLimitError (in ms)', () => {
    const error = new RateLimitError(120);
    expect(getRetryDelay(error)).toBe(120000);
  });

  it('returns default delay for generic errors', () => {
    const error = new Error('generic');
    expect(getRetryDelay(error)).toBe(5000);
  });
});
