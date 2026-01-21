/**
 * Vibe trading module tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  validateStrategy,
  isValidAsset,
  ValidationError,
  ParseError,
  SUPPORTED_ASSETS,
  DEFAULT_RISK_LIMITS,
  Strategy,
  Trigger,
} from '../src/vibe-types';
import {
  withRetry,
  withTimeout,
  CircuitBreaker,
  Mutex,
  TimeoutError,
  RetryExhaustedError,
  CircuitState,
  nullLogger,
  createConsoleLogger,
  sleep,
} from '../src/vibe-utils';

describe('vibe-types', () => {
  describe('isValidAsset', () => {
    it('returns true for supported assets', () => {
      for (const asset of SUPPORTED_ASSETS) {
        expect(isValidAsset(asset)).toBe(true);
      }
    });

    it('returns false for unsupported assets', () => {
      expect(isValidAsset('INVALID')).toBe(false);
      expect(isValidAsset('btc')).toBe(false);
      expect(isValidAsset('')).toBe(false);
    });
  });

  describe('validateStrategy', () => {
    const validStrategy: Strategy = {
      id: 'test-id-123',
      thesis: 'Long ETH',
      asset: 'ETH',
      direction: 'long',
      leverage: 5,
      sizeUsd: 1000,
      trigger: {},
      risk: { stopLossPercent: -0.05 },
      status: 'pending',
      createdAt: Date.now(),
    };

    it('accepts valid strategy', () => {
      expect(() => validateStrategy(validStrategy)).not.toThrow();
    });

    it('rejects missing id', () => {
      const s = { ...validStrategy, id: '' };
      expect(() => validateStrategy(s)).toThrow(ValidationError);
    });

    it('rejects unsupported asset', () => {
      const s = { ...validStrategy, asset: 'INVALID' };
      expect(() => validateStrategy(s)).toThrow(ValidationError);
      expect(() => validateStrategy(s)).toThrow(/Unsupported asset/);
    });

    it('rejects invalid direction', () => {
      const s = { ...validStrategy, direction: 'sideways' as any };
      expect(() => validateStrategy(s)).toThrow(ValidationError);
    });

    it('rejects leverage out of range', () => {
      expect(() => validateStrategy({ ...validStrategy, leverage: 0 })).toThrow(ValidationError);
      expect(() => validateStrategy({ ...validStrategy, leverage: 21 })).toThrow(ValidationError);
    });

    it('rejects size out of range', () => {
      expect(() => validateStrategy({ ...validStrategy, sizeUsd: 5 })).toThrow(ValidationError);
      expect(() => validateStrategy({ ...validStrategy, sizeUsd: 200000 })).toThrow(ValidationError);
    });

    it('rejects invalid stop loss', () => {
      const s = { ...validStrategy, risk: { stopLossPercent: 0.05 } };
      expect(() => validateStrategy(s)).toThrow(ValidationError);
      expect(() => validateStrategy(s)).toThrow(/Stop loss must be between/);
    });

    it('rejects invalid take profit', () => {
      const s = { ...validStrategy, risk: { takeProfitPercent: -0.05 } };
      expect(() => validateStrategy(s)).toThrow(ValidationError);
    });

    it('validates trigger price', () => {
      const s = {
        ...validStrategy,
        trigger: { price: { asset: 'BTC', operator: '>' as const, price: 100000 } },
      };
      expect(() => validateStrategy(s)).not.toThrow();
    });

    it('rejects invalid trigger asset', () => {
      const s = {
        ...validStrategy,
        trigger: { price: { asset: 'INVALID', operator: '>' as const, price: 100000 } },
      };
      expect(() => validateStrategy(s)).toThrow(ValidationError);
    });

    it('rejects invalid trigger price', () => {
      const s = {
        ...validStrategy,
        trigger: { price: { asset: 'BTC', operator: '>' as const, price: -100 } },
      };
      expect(() => validateStrategy(s)).toThrow(ValidationError);
    });

    it('validates nested triggers', () => {
      const s: Strategy = {
        ...validStrategy,
        trigger: {
          and: [
            { price: { asset: 'BTC', operator: '>' as const, price: 100000 } },
            { price: { asset: 'ETH', operator: '<' as const, price: 5000 } },
          ],
        },
      };
      expect(() => validateStrategy(s)).not.toThrow();
    });
  });
});

describe('vibe-utils', () => {
  describe('withTimeout', () => {
    it('returns result for fast operation', async () => {
      const result = await withTimeout(Promise.resolve(42), 1000, 'test');
      expect(result).toBe(42);
    });

    it('throws TimeoutError for slow operation', async () => {
      const slowOp = new Promise(resolve => setTimeout(() => resolve(42), 500));
      await expect(withTimeout(slowOp, 50, 'test')).rejects.toThrow(TimeoutError);
    });

    it('includes operation name in error', async () => {
      const slowOp = new Promise(resolve => setTimeout(() => resolve(42), 500));
      await expect(withTimeout(slowOp, 50, 'my_operation')).rejects.toThrow(/my_operation/);
    });
  });

  describe('withRetry', () => {
    it('returns result on first success', async () => {
      const fn = vi.fn().mockResolvedValue(42);
      const result = await withRetry(fn, 'test', { maxAttempts: 3 });
      expect(result).toBe(42);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('retries on failure', async () => {
      const fn = vi.fn()
        .mockRejectedValueOnce(new Error('fail 1'))
        .mockRejectedValueOnce(new Error('fail 2'))
        .mockResolvedValue(42);

      const result = await withRetry(fn, 'test', { maxAttempts: 3, baseDelayMs: 10 });
      expect(result).toBe(42);
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('throws RetryExhaustedError after max attempts', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('always fails'));

      await expect(
        withRetry(fn, 'test', { maxAttempts: 3, baseDelayMs: 10 })
      ).rejects.toThrow(RetryExhaustedError);

      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('respects retryOn predicate', async () => {
      const fn = vi.fn().mockRejectedValue(new ValidationError('no retry'));

      try {
        await withRetry(fn, 'test', {
          maxAttempts: 3,
          baseDelayMs: 10,
          retryOn: (err) => !(err instanceof ValidationError),
        });
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(RetryExhaustedError);
        expect((err as RetryExhaustedError).lastError).toBeInstanceOf(ValidationError);
        expect((err as RetryExhaustedError).attempts).toBe(3);
      }

      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('applies exponential backoff', async () => {
      const fn = vi.fn()
        .mockRejectedValueOnce(new Error('1'))
        .mockRejectedValueOnce(new Error('2'))
        .mockResolvedValue(42);

      const start = Date.now();
      await withRetry(fn, 'test', { maxAttempts: 3, baseDelayMs: 50, maxDelayMs: 1000 });
      const elapsed = Date.now() - start;

      expect(elapsed).toBeGreaterThanOrEqual(100); // 50 + 100
    });
  });

  describe('CircuitBreaker', () => {
    let circuit: CircuitBreaker;

    beforeEach(() => {
      circuit = new CircuitBreaker({ failureThreshold: 3, resetTimeoutMs: 100 }, nullLogger);
    });

    it('starts in closed state', () => {
      expect(circuit.getState()).toBe(CircuitState.CLOSED);
    });

    it('allows successful operations', async () => {
      const result = await circuit.execute(() => Promise.resolve(42), 'test');
      expect(result).toBe(42);
      expect(circuit.getState()).toBe(CircuitState.CLOSED);
    });

    it('opens after threshold failures', async () => {
      const failingFn = () => Promise.reject(new Error('fail'));

      for (let i = 0; i < 3; i++) {
        await expect(circuit.execute(failingFn, 'test')).rejects.toThrow('fail');
      }

      expect(circuit.getState()).toBe(CircuitState.OPEN);
    });

    it('rejects immediately when open', async () => {
      const failingFn = () => Promise.reject(new Error('fail'));

      for (let i = 0; i < 3; i++) {
        await expect(circuit.execute(failingFn, 'test')).rejects.toThrow();
      }

      await expect(circuit.execute(() => Promise.resolve(42), 'test')).rejects.toThrow(/Circuit breaker open/);
    });

    it('transitions to half-open after timeout', async () => {
      const failingFn = () => Promise.reject(new Error('fail'));

      for (let i = 0; i < 3; i++) {
        await expect(circuit.execute(failingFn, 'test')).rejects.toThrow();
      }

      expect(circuit.getState()).toBe(CircuitState.OPEN);

      await sleep(150);

      const result = await circuit.execute(() => Promise.resolve(42), 'test');
      expect(result).toBe(42);
      expect(circuit.getState()).toBe(CircuitState.HALF_OPEN);
    });

    it('resets on success in half-open', async () => {
      const cb = new CircuitBreaker({ failureThreshold: 2, resetTimeoutMs: 50, halfOpenMaxAttempts: 2 }, nullLogger);
      const failingFn = () => Promise.reject(new Error('fail'));

      await expect(cb.execute(failingFn, 'test')).rejects.toThrow();
      await expect(cb.execute(failingFn, 'test')).rejects.toThrow();

      await sleep(100);

      await cb.execute(() => Promise.resolve(1), 'test');
      await cb.execute(() => Promise.resolve(2), 'test');

      expect(cb.getState()).toBe(CircuitState.CLOSED);
    });

    it('can be reset manually', async () => {
      const failingFn = () => Promise.reject(new Error('fail'));

      for (let i = 0; i < 3; i++) {
        await expect(circuit.execute(failingFn, 'test')).rejects.toThrow();
      }

      expect(circuit.getState()).toBe(CircuitState.OPEN);
      circuit.reset();
      expect(circuit.getState()).toBe(CircuitState.CLOSED);
    });
  });

  describe('Mutex', () => {
    it('allows single access', async () => {
      const mutex = new Mutex();
      const release = await mutex.acquire();
      expect(typeof release).toBe('function');
      release();
    });

    it('serializes concurrent access', async () => {
      const mutex = new Mutex();
      const order: number[] = [];

      const task = async (id: number, delay: number) => {
        const release = await mutex.acquire();
        order.push(id);
        await sleep(delay);
        release();
      };

      await Promise.all([
        task(1, 50),
        task(2, 20),
        task(3, 10),
      ]);

      expect(order).toEqual([1, 2, 3]);
    });

    it('releases correctly on multiple acquires', async () => {
      const mutex = new Mutex();

      const r1 = await mutex.acquire();
      const p2 = mutex.acquire();
      const p3 = mutex.acquire();

      r1();
      const r2 = await p2;
      r2();
      const r3 = await p3;
      r3();
    });
  });

  describe('createConsoleLogger', () => {
    it('creates logger with all methods', () => {
      const logger = createConsoleLogger('test');
      expect(typeof logger.debug).toBe('function');
      expect(typeof logger.info).toBe('function');
      expect(typeof logger.warn).toBe('function');
      expect(typeof logger.error).toBe('function');
    });
  });

  describe('nullLogger', () => {
    it('has all methods as no-ops', () => {
      expect(() => nullLogger.debug('test')).not.toThrow();
      expect(() => nullLogger.info('test')).not.toThrow();
      expect(() => nullLogger.warn('test')).not.toThrow();
      expect(() => nullLogger.error('test')).not.toThrow();
    });
  });
});

describe('error classes', () => {
  it('ValidationError has correct code', () => {
    const err = new ValidationError('test');
    expect(err.code).toBe('VALIDATION_ERROR');
    expect(err.name).toBe('ValidationError');
  });

  it('ParseError has correct code', () => {
    const err = new ParseError('test');
    expect(err.code).toBe('PARSE_ERROR');
    expect(err.name).toBe('ParseError');
  });

  it('errors include details', () => {
    const err = new ValidationError('test', { field: 'asset', value: 'INVALID' });
    expect(err.details).toEqual({ field: 'asset', value: 'INVALID' });
  });
});
