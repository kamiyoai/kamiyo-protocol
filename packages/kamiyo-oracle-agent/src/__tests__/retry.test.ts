import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  withRetry,
  withCircuitBreaker,
  resetCircuit,
  DEFAULT_RETRY_CONFIG,
  DEFAULT_CIRCUIT_CONFIG,
} from '../lib/retry';
import { RateLimitError, BlockchainError } from '../lib/errors';

describe('retry', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetCircuit('test-circuit');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('withRetry', () => {
    it('returns result on first success', async () => {
      const operation = vi.fn().mockResolvedValue('success');

      const result = await withRetry(operation, 'test');

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('retries on transient failure', async () => {
      vi.useRealTimers(); // Use real timers for this test

      const operation = vi
        .fn()
        .mockRejectedValueOnce(new BlockchainError('connection timeout'))
        .mockResolvedValueOnce('success');

      const result = await withRetry(operation, 'test', {
        maxAttempts: 3,
        baseDelayMs: 10,
        jitterMs: 5,
      });

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(2);
    }, 10000);

    it('throws after max attempts', async () => {
      vi.useRealTimers();

      const error = new BlockchainError('connection timeout');
      const operation = vi.fn().mockRejectedValue(error);

      await expect(
        withRetry(operation, 'test', {
          maxAttempts: 2,
          baseDelayMs: 10,
          jitterMs: 5,
        })
      ).rejects.toThrow('connection timeout');

      expect(operation).toHaveBeenCalledTimes(2);
    }, 10000);

    it('does not retry non-retryable errors', async () => {
      const error = new Error('validation failed');
      const operation = vi.fn().mockRejectedValue(error);

      await expect(
        withRetry(operation, 'test', { maxAttempts: 3 })
      ).rejects.toThrow('validation failed');

      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('respects rate limit delay', async () => {
      vi.useRealTimers();

      const operation = vi
        .fn()
        .mockRejectedValueOnce(new RateLimitError(100))
        .mockResolvedValueOnce('success');

      const result = await withRetry(operation, 'test', { maxAttempts: 3 });

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(2);
    }, 10000);
  });

  describe('withCircuitBreaker', () => {
    it('allows operations when circuit is closed', async () => {
      const operation = vi.fn().mockResolvedValue('success');

      const result = await withCircuitBreaker(operation, 'test-circuit');

      expect(result).toBe('success');
    });

    it('opens circuit after threshold failures', async () => {
      const operation = vi.fn().mockRejectedValue(new Error('fail'));

      const config = { failureThreshold: 3, resetTimeoutMs: 60000 };

      // Fail enough times to open circuit
      for (let i = 0; i < 3; i++) {
        await expect(
          withCircuitBreaker(operation, 'test-circuit', config)
        ).rejects.toThrow('fail');
      }

      // Next call should fail fast
      await expect(
        withCircuitBreaker(operation, 'test-circuit', config)
      ).rejects.toThrow('Circuit test-circuit is open');
    });

    it('resets failure count on success', async () => {
      const operation = vi
        .fn()
        .mockRejectedValueOnce(new Error('fail'))
        .mockRejectedValueOnce(new Error('fail'))
        .mockResolvedValueOnce('success')
        .mockRejectedValueOnce(new Error('fail'))
        .mockRejectedValueOnce(new Error('fail'));

      const config = { failureThreshold: 3, resetTimeoutMs: 60000 };

      // Two failures
      await expect(
        withCircuitBreaker(operation, 'test-circuit', config)
      ).rejects.toThrow();
      await expect(
        withCircuitBreaker(operation, 'test-circuit', config)
      ).rejects.toThrow();

      // Success resets count
      await withCircuitBreaker(operation, 'test-circuit', config);

      // Two more failures should not open circuit
      await expect(
        withCircuitBreaker(operation, 'test-circuit', config)
      ).rejects.toThrow();
      await expect(
        withCircuitBreaker(operation, 'test-circuit', config)
      ).rejects.toThrow();

      // Circuit should still be closed
      await expect(
        withCircuitBreaker(
          vi.fn().mockResolvedValue('ok'),
          'test-circuit',
          config
        )
      ).resolves.toBe('ok');
    });

    it('resets circuit after timeout', async () => {
      const failingOp = vi.fn().mockRejectedValue(new Error('fail'));
      const successOp = vi.fn().mockResolvedValue('success');

      const config = { failureThreshold: 2, resetTimeoutMs: 1000 };

      // Open circuit
      await expect(
        withCircuitBreaker(failingOp, 'test-circuit', config)
      ).rejects.toThrow();
      await expect(
        withCircuitBreaker(failingOp, 'test-circuit', config)
      ).rejects.toThrow();

      // Circuit is open
      await expect(
        withCircuitBreaker(successOp, 'test-circuit', config)
      ).rejects.toThrow('Circuit test-circuit is open');

      // Advance past reset timeout
      await vi.advanceTimersByTimeAsync(1100);

      // Circuit should be reset
      const result = await withCircuitBreaker(successOp, 'test-circuit', config);
      expect(result).toBe('success');
    });
  });

  describe('resetCircuit', () => {
    it('resets circuit state', async () => {
      const failingOp = vi.fn().mockRejectedValue(new Error('fail'));
      const successOp = vi.fn().mockResolvedValue('success');

      const config = { failureThreshold: 2, resetTimeoutMs: 60000 };

      // Open circuit
      await expect(
        withCircuitBreaker(failingOp, 'test-circuit', config)
      ).rejects.toThrow();
      await expect(
        withCircuitBreaker(failingOp, 'test-circuit', config)
      ).rejects.toThrow();

      // Circuit is open
      await expect(
        withCircuitBreaker(successOp, 'test-circuit', config)
      ).rejects.toThrow('Circuit test-circuit is open');

      // Reset manually
      resetCircuit('test-circuit');

      // Should work now
      const result = await withCircuitBreaker(successOp, 'test-circuit', config);
      expect(result).toBe('success');
    });
  });
});
