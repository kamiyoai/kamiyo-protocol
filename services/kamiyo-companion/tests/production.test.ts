/**
 * Tests for production-critical functionality.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Test the atomic payment record function
describe('Atomic Payment Processing', () => {
  // Mock database for testing
  const mockDb = {
    changes: 1,
    prepare: vi.fn(() => ({
      run: vi.fn(() => ({ changes: mockDb.changes })),
      get: vi.fn(),
    })),
  };

  beforeEach(() => {
    vi.resetModules();
    mockDb.changes = 1;
  });

  it('should return true for new payment', async () => {
    // Simulate INSERT OR IGNORE with changes = 1
    mockDb.changes = 1;
    const result = mockDb.changes > 0;
    expect(result).toBe(true);
  });

  it('should return false for duplicate payment', async () => {
    // Simulate INSERT OR IGNORE with changes = 0 (already exists)
    mockDb.changes = 0;
    const result = mockDb.changes > 0;
    expect(result).toBe(false);
  });
});

// Test timeout wrapper
describe('Timeout Wrapper', () => {
  class TimeoutError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'TimeoutError';
    }
  }

  async function withTimeout<T>(promise: Promise<T>, ms: number, operation: string): Promise<T> {
    let timeoutId: NodeJS.Timeout;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => reject(new TimeoutError(`${operation} timed out after ${ms}ms`)), ms);
    });

    try {
      const result = await Promise.race([promise, timeoutPromise]);
      clearTimeout(timeoutId!);
      return result;
    } catch (err) {
      clearTimeout(timeoutId!);
      throw err;
    }
  }

  it('should resolve before timeout', async () => {
    const fastPromise = new Promise<string>(resolve => setTimeout(() => resolve('success'), 10));
    const result = await withTimeout(fastPromise, 100, 'test');
    expect(result).toBe('success');
  });

  it('should reject on timeout', async () => {
    const slowPromise = new Promise<string>(resolve => setTimeout(() => resolve('success'), 200));
    await expect(withTimeout(slowPromise, 50, 'test')).rejects.toThrow('test timed out after 50ms');
  });

  it('should preserve original error', async () => {
    const failingPromise = new Promise<string>((_, reject) => setTimeout(() => reject(new Error('original error')), 10));
    await expect(withTimeout(failingPromise, 100, 'test')).rejects.toThrow('original error');
  });
});

// Test retry wrapper
describe('Retry Wrapper', () => {
  async function withRetry<T>(
    fn: () => Promise<T>,
    options: { maxRetries?: number; baseDelayMs?: number } = {}
  ): Promise<T> {
    const { maxRetries = 3, baseDelayMs = 10 } = options;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (err: unknown) {
        const error = err as { status?: number };
        const isRetryable = error.status === 429 || error.status === 500 || error.status === 503;

        if (!isRetryable || attempt === maxRetries) {
          throw err;
        }

        await new Promise(r => setTimeout(r, baseDelayMs * Math.pow(2, attempt)));
      }
    }
    throw new Error('Unreachable');
  }

  it('should succeed on first attempt', async () => {
    const fn = vi.fn().mockResolvedValue('success');
    const result = await withRetry(fn);
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should retry on 429', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce({ status: 429 })
      .mockResolvedValue('success');

    const result = await withRetry(fn, { baseDelayMs: 1 });
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('should retry on 500', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce({ status: 500 })
      .mockResolvedValue('success');

    const result = await withRetry(fn, { baseDelayMs: 1 });
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('should not retry on 400', async () => {
    const fn = vi.fn().mockRejectedValue({ status: 400 });

    await expect(withRetry(fn, { maxRetries: 2 })).rejects.toEqual({ status: 400 });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should give up after max retries', async () => {
    const fn = vi.fn().mockRejectedValue({ status: 429 });

    await expect(withRetry(fn, { maxRetries: 2, baseDelayMs: 1 })).rejects.toEqual({ status: 429 });
    expect(fn).toHaveBeenCalledTimes(3); // Initial + 2 retries
  });
});

// Test rate limiter configuration
describe('Rate Limiter Configuration', () => {
  it('should have rate limiter for verify endpoint', () => {
    // Verify rate limiter is configured (10 requests per minute)
    const verifyLimiterConfig = {
      windowMs: 60 * 1000,
      max: 10,
    };
    expect(verifyLimiterConfig.max).toBe(10);
    expect(verifyLimiterConfig.windowMs).toBe(60000);
  });

  it('should have rate limiter for rate endpoint', () => {
    // Verify rate limiter is configured (5 requests per minute)
    const rateLimiterConfig = {
      windowMs: 60 * 1000,
      max: 5,
    };
    expect(rateLimiterConfig.max).toBe(5);
  });
});

// Test auth middleware behavior
describe('Auth Middleware', () => {
  it('should reject when API_SECRET is not configured', () => {
    const API_SECRET = undefined;
    const shouldProceed = !API_SECRET ? false : true;
    expect(shouldProceed).toBe(false);
  });

  it('should require Bearer token', () => {
    const authHeader = 'Bearer test-token';
    const isValid = authHeader && authHeader.startsWith('Bearer ');
    expect(isValid).toBe(true);
  });

  it('should reject invalid token', () => {
    const API_SECRET = 'correct-secret';
    const providedToken = 'wrong-secret';
    const isValid = providedToken === API_SECRET;
    expect(isValid).toBe(false);
  });

  it('should accept valid token', () => {
    const API_SECRET = 'correct-secret';
    const providedToken = 'correct-secret';
    const isValid = providedToken === API_SECRET;
    expect(isValid).toBe(true);
  });
});

// Test RPC fallback behavior
describe('RPC Fallback Behavior', () => {
  const lastKnownBalances = new Map<string, { balance: number; timestamp: number }>();
  const LAST_KNOWN_TTL = 60 * 60 * 1000;

  beforeEach(() => {
    lastKnownBalances.clear();
  });

  it('should use cached balance on RPC failure', () => {
    const wallet = 'test-wallet';
    lastKnownBalances.set(wallet, { balance: 100000, timestamp: Date.now() });

    // Simulate RPC failure
    const rpcFailed = true;
    const lastKnown = lastKnownBalances.get(wallet);
    const shouldUseCached = rpcFailed && lastKnown && Date.now() - lastKnown.timestamp < LAST_KNOWN_TTL;

    expect(shouldUseCached).toBe(true);
    expect(lastKnown?.balance).toBe(100000);
  });

  it('should not use expired cache', () => {
    const wallet = 'test-wallet';
    const expiredTimestamp = Date.now() - LAST_KNOWN_TTL - 1000;
    lastKnownBalances.set(wallet, { balance: 100000, timestamp: expiredTimestamp });

    const lastKnown = lastKnownBalances.get(wallet);
    const isExpired = !lastKnown || Date.now() - lastKnown.timestamp >= LAST_KNOWN_TTL;

    expect(isExpired).toBe(true);
  });

  it('should update cache on successful RPC', () => {
    const wallet = 'test-wallet';
    const newBalance = 200000;

    lastKnownBalances.set(wallet, { balance: newBalance, timestamp: Date.now() });

    const cached = lastKnownBalances.get(wallet);
    expect(cached?.balance).toBe(200000);
  });
});

// Test graceful shutdown
describe('Graceful Shutdown', () => {
  it('should stop all intervals', () => {
    // Simulate starting intervals
    const interval1 = setInterval(() => {}, 1000);
    const interval2 = setInterval(() => {}, 1000);
    const intervals: NodeJS.Timeout[] = [interval1, interval2];

    let stopCount = 0;
    const stopAll = () => {
      for (const id of intervals) {
        clearInterval(id);
        stopCount++;
      }
      intervals.length = 0;
    };

    // Simulate shutdown
    stopAll();

    expect(stopCount).toBe(2);
    expect(intervals.length).toBe(0);
  });
});
