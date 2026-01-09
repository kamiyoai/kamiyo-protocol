import { RateLimitError } from './types';
import { DEFAULTS } from './constants';

interface Config {
  maxTokens: number;
  refillRate: number;
  maxQueueSize?: number;
}

interface QueueEntry {
  resolve: () => void;
  reject: (e: Error) => void;
  timeoutId: ReturnType<typeof setTimeout> | null;
}

export class RateLimiter {
  private tokens: number;
  private readonly max: number;
  private readonly rate: number;
  private readonly queueMax: number;
  private lastRefill: number;
  private queue: QueueEntry[] = [];
  private processing = false;

  constructor(cfg: Config = { maxTokens: DEFAULTS.RATE_LIMIT_RPS, refillRate: DEFAULTS.RATE_LIMIT_RPS }) {
    this.max = cfg.maxTokens;
    this.rate = cfg.refillRate;
    this.queueMax = cfg.maxQueueSize ?? 100;
    this.tokens = this.max;
    this.lastRefill = Date.now();
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    this.tokens = Math.min(this.max, this.tokens + elapsed * this.rate);
    this.lastRefill = now;
  }

  tryAcquire(): boolean {
    this.refill();
    if (this.tokens >= 1) {
      this.tokens--;
      return true;
    }
    return false;
  }

  async acquire(timeoutMs = 30000): Promise<void> {
    if (this.tryAcquire()) return;

    if (this.queue.length >= this.queueMax) {
      throw new RateLimitError(this.getWaitTime());
    }

    return new Promise((resolve, reject) => {
      const entry: QueueEntry = {
        resolve: () => {},
        reject: () => {},
        timeoutId: null
      };

      entry.resolve = () => {
        if (entry.timeoutId) clearTimeout(entry.timeoutId);
        resolve();
      };

      entry.reject = (e: Error) => {
        if (entry.timeoutId) clearTimeout(entry.timeoutId);
        reject(e);
      };

      this.queue.push(entry);

      entry.timeoutId = setTimeout(() => {
        const idx = this.queue.indexOf(entry);
        if (idx !== -1) {
          this.queue.splice(idx, 1);
          reject(new RateLimitError(this.getWaitTime()));
        }
      }, timeoutMs);

      this.processQueue();
    });
  }

  private async processQueue(): Promise<void> {
    if (this.processing || this.queue.length === 0) return;

    this.processing = true;

    while (this.queue.length > 0) {
      this.refill();

      if (this.tokens >= 1) {
        this.tokens--;
        this.queue.shift()?.resolve();
      } else {
        await new Promise(r => setTimeout(r, Math.ceil(1000 / this.rate)));
      }
    }

    this.processing = false;
  }

  getWaitTime(): number {
    this.refill();
    if (this.tokens >= 1) return 0;
    return Math.ceil(((1 - this.tokens) / this.rate) * 1000);
  }

  getAvailableTokens(): number {
    this.refill();
    return Math.floor(this.tokens);
  }

  getStats(): { availableTokens: number; maxTokens: number; queueLength: number; refillRate: number } {
    return {
      availableTokens: this.getAvailableTokens(),
      maxTokens: this.max,
      queueLength: this.queue.length,
      refillRate: this.rate
    };
  }

  clear(): void {
    const err = new RateLimitError(0);
    for (const entry of this.queue) {
      if (entry.timeoutId) clearTimeout(entry.timeoutId);
      entry.reject(err);
    }
    this.queue = [];
  }
}

export function rateLimited(limiter: RateLimiter) {
  return function <T extends (...args: unknown[]) => Promise<unknown>>(
    _target: unknown,
    _key: string,
    desc: TypedPropertyDescriptor<T>
  ) {
    const orig = desc.value;
    if (orig) {
      desc.value = async function (this: unknown, ...args: Parameters<T>) {
        await limiter.acquire();
        return orig.apply(this, args);
      } as T;
    }
    return desc;
  };
}
