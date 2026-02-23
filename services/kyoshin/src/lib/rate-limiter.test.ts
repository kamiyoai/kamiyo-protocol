import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { TokenBucket, TwitterRateLimiter, TWITTER_RATE_LIMITS } from './rate-limiter';

describe('TokenBucket', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('allows requests within limit', () => {
    const bucket = new TokenBucket({ maxTokens: 10, refillRate: 1, refillInterval: 1000 });
    expect(bucket.tryConsume()).toBe(true);
    expect(bucket.tryConsume()).toBe(true);
  });

  it('blocks when tokens exhausted', () => {
    const bucket = new TokenBucket({ maxTokens: 2, refillRate: 1, refillInterval: 1000 });
    expect(bucket.tryConsume()).toBe(true);
    expect(bucket.tryConsume()).toBe(true);
    expect(bucket.tryConsume()).toBe(false);
  });

  it('refills tokens over time', () => {
    const bucket = new TokenBucket({ maxTokens: 2, refillRate: 1, refillInterval: 1000 });
    bucket.tryConsume();
    bucket.tryConsume();
    expect(bucket.tryConsume()).toBe(false);

    vi.advanceTimersByTime(1000);
    expect(bucket.tryConsume()).toBe(true);
  });

  it('does not exceed max tokens', () => {
    const bucket = new TokenBucket({ maxTokens: 5, refillRate: 10, refillInterval: 1000 });
    vi.advanceTimersByTime(10000); // Would add 100 tokens
    const status = bucket.getStatus();
    expect(status.available).toBeLessThanOrEqual(5);
  });

  it('returns correct status', () => {
    const bucket = new TokenBucket({ maxTokens: 10, refillRate: 1, refillInterval: 1000 });
    bucket.tryConsume();
    const status = bucket.getStatus();
    expect(status.max).toBe(10);
    expect(status.available).toBe(9);
  });

  it('calculates wait time when empty', () => {
    const bucket = new TokenBucket({ maxTokens: 1, refillRate: 1, refillInterval: 1000 });
    bucket.tryConsume();
    expect(bucket.getWaitTime()).toBeGreaterThan(0);
  });

  it('setRetryAfter blocks until time passes', () => {
    const bucket = new TokenBucket({ maxTokens: 10, refillRate: 1, refillInterval: 1000 });
    bucket.setRetryAfter(5); // 5 seconds
    expect(bucket.tryConsume()).toBe(false);

    vi.advanceTimersByTime(5000);
    expect(bucket.tryConsume()).toBe(true);
  });

  it('updateFromHeaders syncs with Twitter limits', () => {
    const bucket = new TokenBucket({ maxTokens: 100, refillRate: 1, refillInterval: 1000 });
    bucket.updateFromHeaders({
      'x-rate-limit-remaining': '50',
      'x-rate-limit-reset': String(Math.floor(Date.now() / 1000) + 60),
    });
    const status = bucket.getStatus();
    expect(status.available).toBe(50);
  });
});

describe('TwitterRateLimiter', () => {
  let limiter: TwitterRateLimiter;

  beforeEach(() => {
    vi.useFakeTimers();
    limiter = new TwitterRateLimiter();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('allows requests within limits with canCall', () => {
    expect(limiter.canCall('postTweet')).toBe(true);
    expect(limiter.canCall('getUserMentions')).toBe(true);
  });

  it('returns false when limit reached', () => {
    // Post tweet limit is 200 per 15 minutes
    for (let i = 0; i < TWITTER_RATE_LIMITS.postTweet.maxTokens; i++) {
      limiter.canCall('postTweet');
    }
    expect(limiter.canCall('postTweet')).toBe(false);
  });

  it('tracks each endpoint separately', () => {
    // Exhaust postTweet
    for (let i = 0; i < TWITTER_RATE_LIMITS.postTweet.maxTokens; i++) {
      limiter.canCall('postTweet');
    }
    // getUserMentions should still work
    expect(limiter.canCall('getUserMentions')).toBe(true);
  });

  it('getStatus returns all endpoint statuses', () => {
    const status = limiter.getStatus();
    expect(status.postTweet).toBeDefined();
    expect(status.getUserMentions).toBeDefined();
    expect(status.searchTweets).toBeDefined();
  });

  it('isAnyLimited detects exhausted buckets', () => {
    expect(limiter.isAnyLimited()).toBe(false);
    for (let i = 0; i < TWITTER_RATE_LIMITS.postTweet.maxTokens; i++) {
      limiter.canCall('postTweet');
    }
    expect(limiter.isAnyLimited()).toBe(true);
  });

  it('handleRateLimitError sets retry-after', () => {
    limiter.handleRateLimitError('postTweet', 60);
    expect(limiter.canCall('postTweet')).toBe(false);

    vi.advanceTimersByTime(60000);
    expect(limiter.canCall('postTweet')).toBe(true);
  });

  it('updateFromResponse syncs with headers', () => {
    limiter.updateFromResponse('postTweet', {
      'x-rate-limit-remaining': '10',
      'x-rate-limit-reset': String(Math.floor(Date.now() / 1000) + 60),
    });
    const status = limiter.getStatus();
    expect(status.postTweet.available).toBe(10);
  });
});
