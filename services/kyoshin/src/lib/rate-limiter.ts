/**
 * Token bucket rate limiter for Twitter API.
 */

import { createLogger } from './logger';

const log = createLogger('kyoshin:rate-limiter');

export interface RateLimitConfig {
  maxTokens: number;
  refillRate: number; // tokens per second
  refillInterval: number; // ms between refills
}

export interface RateLimitStatus {
  available: number;
  max: number;
  resetAt: number | null;
  isLimited: boolean;
}

export class TokenBucket {
  private tokens: number;
  private maxTokens: number;
  private refillRate: number;
  private lastRefill: number;
  private retryAfter: number | null = null;

  constructor(config: RateLimitConfig) {
    this.maxTokens = config.maxTokens;
    this.tokens = config.maxTokens;
    this.refillRate = config.refillRate;
    this.lastRefill = Date.now();
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    const tokensToAdd = (elapsed / 1000) * this.refillRate;

    this.tokens = Math.min(this.maxTokens, this.tokens + tokensToAdd);
    this.lastRefill = now;
  }

  /**
   * Try to consume a token. Returns true if successful.
   */
  tryConsume(tokens = 1): boolean {
    // Check if we're in a retry-after period
    if (this.retryAfter && Date.now() < this.retryAfter) {
      return false;
    }
    this.retryAfter = null;

    this.refill();

    if (this.tokens >= tokens) {
      this.tokens -= tokens;
      return true;
    }

    return false;
  }

  /**
   * Wait until a token is available, then consume it.
   */
  async waitAndConsume(tokens = 1, maxWaitMs = 60000): Promise<boolean> {
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitMs) {
      if (this.tryConsume(tokens)) {
        return true;
      }

      // Calculate wait time
      const waitTime = this.getWaitTime(tokens);
      if (waitTime > maxWaitMs - (Date.now() - startTime)) {
        return false;
      }

      await new Promise((resolve) => setTimeout(resolve, Math.min(waitTime, 1000)));
    }

    return false;
  }

  /**
   * Get time until tokens are available.
   */
  getWaitTime(tokens = 1): number {
    if (this.retryAfter) {
      return Math.max(0, this.retryAfter - Date.now());
    }

    this.refill();

    if (this.tokens >= tokens) {
      return 0;
    }

    const needed = tokens - this.tokens;
    return Math.ceil((needed / this.refillRate) * 1000);
  }

  /**
   * Set a retry-after time from Twitter API response.
   */
  setRetryAfter(seconds: number): void {
    this.retryAfter = Date.now() + seconds * 1000;
    log.info('Rate limit set', { retryAfterSeconds: seconds, resetAt: new Date(this.retryAfter).toISOString() });
  }

  /**
   * Update from rate limit headers.
   */
  updateFromHeaders(headers: {
    'x-rate-limit-limit'?: string;
    'x-rate-limit-remaining'?: string;
    'x-rate-limit-reset'?: string;
  }): void {
    if (headers['x-rate-limit-remaining']) {
      const remaining = parseInt(headers['x-rate-limit-remaining'], 10);
      if (!isNaN(remaining)) {
        // Sync our token count with Twitter's remaining count
        this.tokens = Math.min(remaining, this.maxTokens);
      }
    }

    if (headers['x-rate-limit-reset']) {
      const resetTimestamp = parseInt(headers['x-rate-limit-reset'], 10) * 1000;
      if (!isNaN(resetTimestamp) && resetTimestamp > Date.now()) {
        // If we're at 0 tokens, set retry-after
        if (this.tokens <= 0) {
          this.retryAfter = resetTimestamp;
        }
      }
    }
  }

  getStatus(): RateLimitStatus {
    this.refill();
    return {
      available: Math.floor(this.tokens),
      max: this.maxTokens,
      resetAt: this.retryAfter,
      isLimited: this.tokens < 1 || (this.retryAfter !== null && Date.now() < this.retryAfter),
    };
  }
}

// Twitter API rate limits (per 15-minute window)
// https://developer.twitter.com/en/docs/twitter-api/rate-limits
export const TWITTER_RATE_LIMITS = {
  // Tweets
  postTweet: { maxTokens: 200, refillRate: 200 / (15 * 60), refillInterval: 1000 },
  deleteTweet: { maxTokens: 50, refillRate: 50 / (15 * 60), refillInterval: 1000 },

  // Reads
  getTweet: { maxTokens: 300, refillRate: 300 / (15 * 60), refillInterval: 1000 },
  searchTweets: { maxTokens: 300, refillRate: 300 / (15 * 60), refillInterval: 1000 },
  getUserMentions: { maxTokens: 75, refillRate: 75 / (15 * 60), refillInterval: 1000 },
  getTimeline: { maxTokens: 75, refillRate: 75 / (15 * 60), refillInterval: 1000 },

  // Users
  getUser: { maxTokens: 300, refillRate: 300 / (15 * 60), refillInterval: 1000 },

  // Interactions
  likeTweet: { maxTokens: 200, refillRate: 200 / (15 * 60), refillInterval: 1000 },
  retweet: { maxTokens: 75, refillRate: 75 / (15 * 60), refillInterval: 1000 },
};

export type TwitterEndpoint = keyof typeof TWITTER_RATE_LIMITS;

/**
 * Rate limiter manager for all Twitter endpoints.
 */
export class TwitterRateLimiter {
  private buckets: Map<TwitterEndpoint, TokenBucket> = new Map();

  constructor() {
    for (const [endpoint, config] of Object.entries(TWITTER_RATE_LIMITS)) {
      this.buckets.set(endpoint as TwitterEndpoint, new TokenBucket(config));
    }
  }

  /**
   * Check if an endpoint can be called.
   */
  canCall(endpoint: TwitterEndpoint): boolean {
    const bucket = this.buckets.get(endpoint);
    if (!bucket) return true;
    return bucket.tryConsume();
  }

  /**
   * Wait until an endpoint can be called.
   */
  async waitForEndpoint(endpoint: TwitterEndpoint, maxWaitMs = 60000): Promise<boolean> {
    const bucket = this.buckets.get(endpoint);
    if (!bucket) return true;
    return bucket.waitAndConsume(1, maxWaitMs);
  }

  /**
   * Update rate limit from response headers.
   */
  updateFromResponse(endpoint: TwitterEndpoint, headers: Record<string, string | undefined>): void {
    const bucket = this.buckets.get(endpoint);
    if (bucket) {
      bucket.updateFromHeaders(headers);
    }
  }

  /**
   * Handle 429 response.
   */
  handleRateLimitError(endpoint: TwitterEndpoint, retryAfterSeconds: number): void {
    const bucket = this.buckets.get(endpoint);
    if (bucket) {
      bucket.setRetryAfter(retryAfterSeconds);
    }
  }

  /**
   * Get status of all endpoints.
   */
  getStatus(): Record<TwitterEndpoint, RateLimitStatus> {
    const status: Partial<Record<TwitterEndpoint, RateLimitStatus>> = {};
    for (const [endpoint, bucket] of this.buckets.entries()) {
      status[endpoint] = bucket.getStatus();
    }
    return status as Record<TwitterEndpoint, RateLimitStatus>;
  }

  /**
   * Check if any endpoint is rate limited.
   */
  isAnyLimited(): boolean {
    for (const bucket of this.buckets.values()) {
      if (bucket.getStatus().isLimited) {
        return true;
      }
    }
    return false;
  }
}

// Singleton instance
let rateLimiter: TwitterRateLimiter | null = null;

export function getRateLimiter(): TwitterRateLimiter {
  if (!rateLimiter) {
    rateLimiter = new TwitterRateLimiter();
  }
  return rateLimiter;
}
