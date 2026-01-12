/**
 * Token bucket and sliding window rate limiters.
 */

export interface RateLimitConfig {
  tokensPerSecond: number;
  bucketSize: number;
  initialTokens?: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remainingTokens: number;
  retryAfterMs?: number;
}

export interface RateLimiter {
  tryAcquire(tokens?: number): RateLimitResult;
  acquire(tokens?: number): Promise<void>;
  getTokens(): number;
  reset(): void;
}

// Token bucket implementation
export class TokenBucket implements RateLimiter {
  private tokens: number;
  private lastRefill: number;
  private readonly config: Required<RateLimitConfig>;

  constructor(config: RateLimitConfig) {
    this.config = {
      ...config,
      initialTokens: config.initialTokens ?? config.bucketSize,
    };
    this.tokens = this.config.initialTokens;
    this.lastRefill = Date.now();
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    const newTokens = elapsed * this.config.tokensPerSecond;

    this.tokens = Math.min(this.config.bucketSize, this.tokens + newTokens);
    this.lastRefill = now;
  }

  tryAcquire(tokens: number = 1): RateLimitResult {
    this.refill();

    if (this.tokens >= tokens) {
      this.tokens -= tokens;
      return {
        allowed: true,
        remainingTokens: Math.floor(this.tokens),
      };
    }

    const deficit = tokens - this.tokens;
    const waitMs = Math.ceil((deficit / this.config.tokensPerSecond) * 1000);

    return {
      allowed: false,
      remainingTokens: Math.floor(this.tokens),
      retryAfterMs: waitMs,
    };
  }

  async acquire(tokens: number = 1): Promise<void> {
    const result = this.tryAcquire(tokens);
    if (result.allowed) return;

    await new Promise((resolve) => setTimeout(resolve, result.retryAfterMs));
    return this.acquire(tokens);
  }

  getTokens(): number {
    this.refill();
    return Math.floor(this.tokens);
  }

  reset(): void {
    this.tokens = this.config.bucketSize;
    this.lastRefill = Date.now();
  }
}

// Sliding window counter
export class SlidingWindowCounter implements RateLimiter {
  private windows: Map<number, number> = new Map();
  private readonly windowSizeMs: number;
  private readonly maxRequests: number;

  constructor(opts: { windowSizeMs: number; maxRequests: number }) {
    this.windowSizeMs = opts.windowSizeMs;
    this.maxRequests = opts.maxRequests;
  }

  private getCurrentWindow(): number {
    return Math.floor(Date.now() / this.windowSizeMs);
  }

  private cleanOldWindows(): void {
    const current = this.getCurrentWindow();
    for (const window of this.windows.keys()) {
      if (window < current - 1) {
        this.windows.delete(window);
      }
    }
  }

  private getCount(): number {
    this.cleanOldWindows();

    const current = this.getCurrentWindow();
    const previous = current - 1;
    const currentCount = this.windows.get(current) || 0;
    const previousCount = this.windows.get(previous) || 0;

    // Weight previous window by time remaining
    const elapsedInCurrent = Date.now() % this.windowSizeMs;
    const weight = 1 - elapsedInCurrent / this.windowSizeMs;

    return currentCount + previousCount * weight;
  }

  tryAcquire(tokens: number = 1): RateLimitResult {
    const count = this.getCount();

    if (count + tokens <= this.maxRequests) {
      const current = this.getCurrentWindow();
      this.windows.set(current, (this.windows.get(current) || 0) + tokens);

      return {
        allowed: true,
        remainingTokens: Math.floor(this.maxRequests - count - tokens),
      };
    }

    const retryAfterMs = this.windowSizeMs - (Date.now() % this.windowSizeMs);

    return {
      allowed: false,
      remainingTokens: Math.floor(Math.max(0, this.maxRequests - count)),
      retryAfterMs,
    };
  }

  async acquire(tokens: number = 1): Promise<void> {
    const result = this.tryAcquire(tokens);
    if (result.allowed) return;

    await new Promise((resolve) => setTimeout(resolve, result.retryAfterMs));
    return this.acquire(tokens);
  }

  getTokens(): number {
    return Math.floor(Math.max(0, this.maxRequests - this.getCount()));
  }

  reset(): void {
    this.windows.clear();
  }
}

// Per-key rate limiter
export class KeyedRateLimiter {
  private limiters = new Map<string, RateLimiter>();
  private readonly config: RateLimitConfig;
  private readonly maxKeys: number;
  private readonly factory: (config: RateLimitConfig) => RateLimiter;

  constructor(
    config: RateLimitConfig,
    opts: {
      maxKeys?: number;
      factory?: (config: RateLimitConfig) => RateLimiter;
    } = {}
  ) {
    this.config = config;
    this.maxKeys = opts.maxKeys || 1000;
    this.factory = opts.factory || ((c) => new TokenBucket(c));
  }

  private getLimiter(key: string): RateLimiter {
    let limiter = this.limiters.get(key);

    if (!limiter) {
      if (this.limiters.size >= this.maxKeys) {
        const oldest = this.limiters.keys().next().value;
        if (oldest) this.limiters.delete(oldest);
      }

      limiter = this.factory(this.config);
      this.limiters.set(key, limiter);
    }

    return limiter;
  }

  tryAcquire(key: string, tokens?: number): RateLimitResult {
    return this.getLimiter(key).tryAcquire(tokens);
  }

  async acquire(key: string, tokens?: number): Promise<void> {
    return this.getLimiter(key).acquire(tokens);
  }

  getTokens(key: string): number {
    return this.getLimiter(key).getTokens();
  }

  reset(key?: string): void {
    if (key) {
      this.limiters.get(key)?.reset();
    } else {
      this.limiters.clear();
    }
  }

  get size(): number {
    return this.limiters.size;
  }
}

// Composite rate limiter (AND logic - all must allow)
export class CompositeRateLimiter implements RateLimiter {
  private limiters: RateLimiter[];

  constructor(limiters: RateLimiter[]) {
    this.limiters = limiters;
  }

  tryAcquire(tokens?: number): RateLimitResult {
    let minRemaining = Infinity;
    let maxRetry = 0;

    for (const limiter of this.limiters) {
      const result = limiter.tryAcquire(tokens);
      if (!result.allowed) {
        maxRetry = Math.max(maxRetry, result.retryAfterMs || 0);
      }
      minRemaining = Math.min(minRemaining, result.remainingTokens);
    }

    if (maxRetry > 0) {
      return {
        allowed: false,
        remainingTokens: Math.floor(minRemaining),
        retryAfterMs: maxRetry,
      };
    }

    return {
      allowed: true,
      remainingTokens: Math.floor(minRemaining),
    };
  }

  async acquire(tokens?: number): Promise<void> {
    const result = this.tryAcquire(tokens);
    if (result.allowed) return;

    await new Promise((resolve) => setTimeout(resolve, result.retryAfterMs));
    return this.acquire(tokens);
  }

  getTokens(): number {
    return Math.min(...this.limiters.map((l) => l.getTokens()));
  }

  reset(): void {
    this.limiters.forEach((l) => l.reset());
  }
}

// Rate limit decorator
export function rateLimit(limiter: RateLimiter) {
  return function <T extends (...args: unknown[]) => Promise<unknown>>(
    target: object,
    propertyKey: string,
    descriptor: TypedPropertyDescriptor<T>
  ): TypedPropertyDescriptor<T> {
    const original = descriptor.value!;

    descriptor.value = async function (this: unknown, ...args: unknown[]) {
      await limiter.acquire();
      return original.apply(this, args);
    } as T;

    return descriptor;
  };
}

// Middleware-style rate limiter
export interface RateLimitMiddleware {
  (key: string): Promise<RateLimitResult>;
}

export function createRateLimitMiddleware(limiter: KeyedRateLimiter): RateLimitMiddleware {
  return async (key: string) => {
    const result = limiter.tryAcquire(key);
    if (!result.allowed) {
      await new Promise((resolve) => setTimeout(resolve, result.retryAfterMs));
      return limiter.tryAcquire(key);
    }
    return result;
  };
}

// Default rate limit configs
export const RATE_LIMIT_PRESETS = {
  // 10 requests per second, burst of 20
  standard: { tokensPerSecond: 10, bucketSize: 20 },

  // 100 requests per second, burst of 200
  high: { tokensPerSecond: 100, bucketSize: 200 },

  // 1 request per second, burst of 5
  low: { tokensPerSecond: 1, bucketSize: 5 },

  // 1 request per 10 seconds, burst of 3
  strict: { tokensPerSecond: 0.1, bucketSize: 3 },
} as const;
