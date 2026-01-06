/**
 * KAMIYO Helius Adapter - Rate Limiter
 * Token bucket implementation for API rate limiting
 */

import { RateLimitError } from './types';
import { DEFAULTS } from './constants';

interface RateLimiterConfig {
    maxTokens: number;
    refillRate: number; // tokens per second
    refillInterval?: number; // ms
}

export class RateLimiter {
    private tokens: number;
    private readonly maxTokens: number;
    private readonly refillRate: number;
    private lastRefill: number;
    private queue: Array<{
        resolve: () => void;
        reject: (error: Error) => void;
        timestamp: number;
    }> = [];
    private processing = false;

    constructor(config: RateLimiterConfig = {
        maxTokens: DEFAULTS.RATE_LIMIT_RPS,
        refillRate: DEFAULTS.RATE_LIMIT_RPS
    }) {
        this.maxTokens = config.maxTokens;
        this.refillRate = config.refillRate;
        this.tokens = this.maxTokens;
        this.lastRefill = Date.now();
    }

    /**
     * Refill tokens based on elapsed time
     */
    private refill(): void {
        const now = Date.now();
        const elapsed = (now - this.lastRefill) / 1000;
        const tokensToAdd = elapsed * this.refillRate;

        this.tokens = Math.min(this.maxTokens, this.tokens + tokensToAdd);
        this.lastRefill = now;
    }

    /**
     * Try to acquire a token without waiting
     */
    tryAcquire(): boolean {
        this.refill();

        if (this.tokens >= 1) {
            this.tokens -= 1;
            return true;
        }

        return false;
    }

    /**
     * Acquire a token, waiting if necessary
     */
    async acquire(timeoutMs: number = 30000): Promise<void> {
        if (this.tryAcquire()) {
            return;
        }

        return new Promise((resolve, reject) => {
            const entry = {
                resolve,
                reject,
                timestamp: Date.now()
            };

            this.queue.push(entry);

            // Set timeout
            setTimeout(() => {
                const index = this.queue.indexOf(entry);
                if (index !== -1) {
                    this.queue.splice(index, 1);
                    reject(new RateLimitError(this.getWaitTime()));
                }
            }, timeoutMs);

            this.processQueue();
        });
    }

    /**
     * Process queued requests
     */
    private async processQueue(): Promise<void> {
        if (this.processing || this.queue.length === 0) {
            return;
        }

        this.processing = true;

        while (this.queue.length > 0) {
            this.refill();

            if (this.tokens >= 1) {
                this.tokens -= 1;
                const entry = this.queue.shift();
                if (entry) {
                    entry.resolve();
                }
            } else {
                // Wait for next refill
                const waitTime = Math.ceil((1 / this.refillRate) * 1000);
                await this.delay(waitTime);
            }
        }

        this.processing = false;
    }

    /**
     * Get estimated wait time in ms
     */
    getWaitTime(): number {
        this.refill();

        if (this.tokens >= 1) {
            return 0;
        }

        const tokensNeeded = 1 - this.tokens;
        return Math.ceil((tokensNeeded / this.refillRate) * 1000);
    }

    /**
     * Get current token count
     */
    getAvailableTokens(): number {
        this.refill();
        return Math.floor(this.tokens);
    }

    /**
     * Get rate limiter stats
     */
    getStats(): {
        availableTokens: number;
        maxTokens: number;
        queueLength: number;
        refillRate: number;
    } {
        return {
            availableTokens: this.getAvailableTokens(),
            maxTokens: this.maxTokens,
            queueLength: this.queue.length,
            refillRate: this.refillRate
        };
    }

    /**
     * Clear the queue
     */
    clear(): void {
        const error = new RateLimitError(0);
        for (const entry of this.queue) {
            entry.reject(error);
        }
        this.queue = [];
    }

    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

/**
 * Decorator for rate-limited methods
 */
export function rateLimited(limiter: RateLimiter) {
    return function <T extends (...args: unknown[]) => Promise<unknown>>(
        _target: unknown,
        _propertyKey: string,
        descriptor: TypedPropertyDescriptor<T>
    ) {
        const originalMethod = descriptor.value;

        if (originalMethod) {
            descriptor.value = async function (this: unknown, ...args: Parameters<T>) {
                await limiter.acquire();
                return originalMethod.apply(this, args);
            } as T;
        }

        return descriptor;
    };
}
