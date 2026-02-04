import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { withRetry, CircuitBreaker } from './resilience';

describe('withRetry', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns result on first success', async () => {
    const fn = vi.fn().mockResolvedValue('success');
    const result = await withRetry(fn);
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on failure', async () => {
    vi.useRealTimers();
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('fail 1'))
      .mockResolvedValueOnce('success');

    const result = await withRetry(fn, { maxAttempts: 3, initialDelayMs: 10 });
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('throws after max attempts', async () => {
    vi.useRealTimers(); // Use real timers for this test
    const fn = vi.fn().mockRejectedValue(new Error('always fails'));

    await expect(
      withRetry(fn, { maxAttempts: 3, initialDelayMs: 10, maxDelayMs: 20 })
    ).rejects.toThrow('always fails');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('uses exponential backoff', async () => {
    vi.useRealTimers();
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('1'))
      .mockRejectedValueOnce(new Error('2'))
      .mockResolvedValueOnce('success');

    const result = await withRetry(fn, {
      maxAttempts: 4,
      initialDelayMs: 10,
      backoffMultiplier: 2,
    });

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('respects max delay', async () => {
    vi.useRealTimers();
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('1'))
      .mockRejectedValueOnce(new Error('2'))
      .mockResolvedValueOnce('success');

    const result = await withRetry(fn, {
      maxAttempts: 4,
      initialDelayMs: 10,
      maxDelayMs: 15,
      backoffMultiplier: 10,
    });

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(3);
  });
});

describe('CircuitBreaker', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('allows requests when closed', async () => {
    const cb = new CircuitBreaker('test');
    const result = await cb.execute(() => Promise.resolve('success'));
    expect(result).toBe('success');
    expect(cb.getState()).toBe('closed');
  });

  it('opens after failure threshold', async () => {
    const cb = new CircuitBreaker('test', { failureThreshold: 2 });

    await expect(cb.execute(() => Promise.reject(new Error('1')))).rejects.toThrow();
    expect(cb.getState()).toBe('closed');

    await expect(cb.execute(() => Promise.reject(new Error('2')))).rejects.toThrow();
    expect(cb.getState()).toBe('open');
  });

  it('rejects requests when open', async () => {
    const cb = new CircuitBreaker('test', { failureThreshold: 1 });

    await expect(cb.execute(() => Promise.reject(new Error('1')))).rejects.toThrow();
    expect(cb.getState()).toBe('open');

    await expect(cb.execute(() => Promise.resolve('success'))).rejects.toThrow(
      'Circuit breaker test is open'
    );
  });

  it('transitions to half-open after reset timeout', async () => {
    const cb = new CircuitBreaker('test', {
      failureThreshold: 1,
      resetTimeoutMs: 5000,
    });

    await expect(cb.execute(() => Promise.reject(new Error('1')))).rejects.toThrow();
    expect(cb.getState()).toBe('open');

    vi.advanceTimersByTime(5000);

    // Next call should transition to half-open and execute
    const result = await cb.execute(() => Promise.resolve('success'));
    expect(result).toBe('success');
    expect(cb.getState()).toBe('half-open');
  });

  it('closes after success threshold in half-open', async () => {
    const cb = new CircuitBreaker('test', {
      failureThreshold: 1,
      resetTimeoutMs: 1000,
      halfOpenSuccessThreshold: 2,
    });

    // Trip the circuit
    await expect(cb.execute(() => Promise.reject(new Error('1')))).rejects.toThrow();

    // Wait for reset timeout
    vi.advanceTimersByTime(1000);

    // First success in half-open
    await cb.execute(() => Promise.resolve('success 1'));
    expect(cb.getState()).toBe('half-open');

    // Second success closes circuit
    await cb.execute(() => Promise.resolve('success 2'));
    expect(cb.getState()).toBe('closed');
  });

  it('reopens on failure in half-open', async () => {
    const cb = new CircuitBreaker('test', {
      failureThreshold: 1,
      resetTimeoutMs: 1000,
    });

    await expect(cb.execute(() => Promise.reject(new Error('1')))).rejects.toThrow();
    vi.advanceTimersByTime(1000);

    // Fail in half-open
    await expect(cb.execute(() => Promise.reject(new Error('2')))).rejects.toThrow();
    expect(cb.getState()).toBe('open');
  });

  it('resets failures on success', async () => {
    const cb = new CircuitBreaker('test', { failureThreshold: 3 });

    await expect(cb.execute(() => Promise.reject(new Error('1')))).rejects.toThrow();
    await expect(cb.execute(() => Promise.reject(new Error('2')))).rejects.toThrow();

    // Success resets failures
    await cb.execute(() => Promise.resolve('success'));

    // Need 3 more failures to open
    await expect(cb.execute(() => Promise.reject(new Error('3')))).rejects.toThrow();
    await expect(cb.execute(() => Promise.reject(new Error('4')))).rejects.toThrow();
    expect(cb.getState()).toBe('closed');

    await expect(cb.execute(() => Promise.reject(new Error('5')))).rejects.toThrow();
    expect(cb.getState()).toBe('open');
  });

  it('reset() restores closed state', async () => {
    const cb = new CircuitBreaker('test', { failureThreshold: 1 });

    await expect(cb.execute(() => Promise.reject(new Error('1')))).rejects.toThrow();
    expect(cb.getState()).toBe('open');

    cb.reset();
    expect(cb.getState()).toBe('closed');

    const result = await cb.execute(() => Promise.resolve('success'));
    expect(result).toBe('success');
  });
});
