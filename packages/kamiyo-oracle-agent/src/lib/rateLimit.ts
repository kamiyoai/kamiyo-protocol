import { createLogger } from './logger';
import { RateLimitError } from './errors';

const log = createLogger('rate-limiter');

export interface RateLimitConfig {
  maxTokens: number;
  refillRate: number; // tokens per second
  refillInterval: number; // ms between refills
}

export interface RateLimiterStats {
  currentTokens: number;
  maxTokens: number;
  requestsAllowed: number;
  requestsDenied: number;
  lastRefill: number;
}

const DEFAULT_CONFIGS: Record<string, RateLimitConfig> = {
  llm: {
    maxTokens: 10,
    refillRate: 1,
    refillInterval: 1000,
  },
  rpc: {
    maxTokens: 50,
    refillRate: 10,
    refillInterval: 1000,
  },
  ipfs: {
    maxTokens: 5,
    refillRate: 1,
    refillInterval: 2000,
  },
};

class TokenBucket {
  private tokens: number;
  private lastRefill: number;
  private requestsAllowed = 0;
  private requestsDenied = 0;

  constructor(private config: RateLimitConfig) {
    this.tokens = config.maxTokens;
    this.lastRefill = Date.now();
  }

  async acquire(cost: number = 1): Promise<boolean> {
    this.refill();

    if (this.tokens >= cost) {
      this.tokens -= cost;
      this.requestsAllowed++;
      return true;
    }

    this.requestsDenied++;
    return false;
  }

  async acquireOrWait(cost: number = 1, maxWaitMs: number = 30000): Promise<void> {
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitMs) {
      if (await this.acquire(cost)) {
        return;
      }

      // Calculate wait time until enough tokens are available
      const tokensNeeded = cost - this.tokens;
      const waitMs = Math.ceil((tokensNeeded / this.config.refillRate) * 1000);
      const actualWait = Math.min(waitMs, maxWaitMs - (Date.now() - startTime));

      if (actualWait <= 0) break;

      await new Promise((r) => setTimeout(r, actualWait));
      this.refill();
    }

    throw new RateLimitError(
      Math.ceil((cost / this.config.refillRate) * 1000)
    );
  }

  getStats(): RateLimiterStats {
    this.refill();
    return {
      currentTokens: this.tokens,
      maxTokens: this.config.maxTokens,
      requestsAllowed: this.requestsAllowed,
      requestsDenied: this.requestsDenied,
      lastRefill: this.lastRefill,
    };
  }

  reset(): void {
    this.tokens = this.config.maxTokens;
    this.requestsAllowed = 0;
    this.requestsDenied = 0;
    this.lastRefill = Date.now();
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    const intervalsElapsed = Math.floor(elapsed / this.config.refillInterval);

    if (intervalsElapsed > 0) {
      const tokensToAdd = intervalsElapsed * this.config.refillRate;
      this.tokens = Math.min(this.config.maxTokens, this.tokens + tokensToAdd);
      this.lastRefill = now - (elapsed % this.config.refillInterval);
    }
  }
}

class RateLimiter {
  private buckets: Map<string, TokenBucket> = new Map();
  private configs: Map<string, RateLimitConfig> = new Map();

  constructor() {
    // Initialize default configs
    for (const [name, config] of Object.entries(DEFAULT_CONFIGS)) {
      this.configs.set(name, config);
    }
  }

  /**
   * Configure rate limit for a resource
   */
  configure(resource: string, config: RateLimitConfig): void {
    this.configs.set(resource, config);
    // Reset bucket with new config
    this.buckets.delete(resource);
  }

  /**
   * Try to acquire tokens, returns false if rate limited
   */
  async tryAcquire(resource: string, cost: number = 1): Promise<boolean> {
    const bucket = this.getBucket(resource);
    return bucket.acquire(cost);
  }

  /**
   * Acquire tokens or wait until available
   */
  async acquire(
    resource: string,
    cost: number = 1,
    maxWaitMs: number = 30000
  ): Promise<void> {
    const bucket = this.getBucket(resource);
    await bucket.acquireOrWait(cost, maxWaitMs);
  }

  /**
   * Execute operation with rate limiting
   */
  async withRateLimit<T>(
    resource: string,
    operation: () => Promise<T>,
    cost: number = 1
  ): Promise<T> {
    await this.acquire(resource, cost);
    return operation();
  }

  /**
   * Get stats for a resource
   */
  getStats(resource: string): RateLimiterStats | null {
    const bucket = this.buckets.get(resource);
    return bucket?.getStats() || null;
  }

  /**
   * Get stats for all resources
   */
  getAllStats(): Record<string, RateLimiterStats> {
    const stats: Record<string, RateLimiterStats> = {};
    for (const [name, bucket] of this.buckets.entries()) {
      stats[name] = bucket.getStats();
    }
    return stats;
  }

  /**
   * Reset a specific limiter
   */
  reset(resource: string): void {
    const bucket = this.buckets.get(resource);
    bucket?.reset();
  }

  /**
   * Reset all limiters
   */
  resetAll(): void {
    for (const bucket of this.buckets.values()) {
      bucket.reset();
    }
  }

  private getBucket(resource: string): TokenBucket {
    let bucket = this.buckets.get(resource);
    if (!bucket) {
      const config = this.configs.get(resource) || DEFAULT_CONFIGS.rpc;
      bucket = new TokenBucket(config);
      this.buckets.set(resource, bucket);
    }
    return bucket;
  }
}

// Singleton instance
const rateLimiter = new RateLimiter();

/**
 * Execute LLM call with rate limiting
 */
export async function withLLMRateLimit<T>(
  operation: () => Promise<T>,
  cost: number = 1
): Promise<T> {
  return rateLimiter.withRateLimit('llm', operation, cost);
}

/**
 * Execute RPC call with rate limiting
 */
export async function withRPCRateLimit<T>(
  operation: () => Promise<T>,
  cost: number = 1
): Promise<T> {
  return rateLimiter.withRateLimit('rpc', operation, cost);
}

/**
 * Execute IPFS call with rate limiting
 */
export async function withIPFSRateLimit<T>(
  operation: () => Promise<T>,
  cost: number = 1
): Promise<T> {
  return rateLimiter.withRateLimit('ipfs', operation, cost);
}

/**
 * Configure custom rate limits
 */
export function configureRateLimit(
  resource: string,
  config: RateLimitConfig
): void {
  rateLimiter.configure(resource, config);
  log.info('Rate limit configured', { resource, ...config });
}

/**
 * Get rate limiter instance for advanced usage
 */
export function getRateLimiter(): RateLimiter {
  return rateLimiter;
}

/**
 * Get all rate limiter stats
 */
export function getRateLimitStats(): Record<string, RateLimiterStats> {
  return rateLimiter.getAllStats();
}

