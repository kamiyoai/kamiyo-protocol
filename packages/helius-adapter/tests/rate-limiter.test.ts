/**
 * Rate Limiter Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { RateLimiter } from '../src/rate-limiter';

describe('RateLimiter', () => {
    let limiter: RateLimiter;

    beforeEach(() => {
        limiter = new RateLimiter({
            maxTokens: 10,
            refillRate: 10 // 10 tokens per second
        });
    });

    describe('tryAcquire', () => {
        it('should successfully acquire when tokens available', () => {
            expect(limiter.tryAcquire()).toBe(true);
            expect(limiter.getAvailableTokens()).toBe(9);
        });

        it('should fail when no tokens available', () => {
            // Exhaust all tokens
            for (let i = 0; i < 10; i++) {
                expect(limiter.tryAcquire()).toBe(true);
            }

            // Next should fail
            expect(limiter.tryAcquire()).toBe(false);
        });

        it('should refill tokens over time', async () => {
            // Exhaust all tokens
            for (let i = 0; i < 10; i++) {
                limiter.tryAcquire();
            }

            expect(limiter.tryAcquire()).toBe(false);

            // Wait for refill (100ms = 1 token at 10/sec)
            await new Promise(resolve => setTimeout(resolve, 150));

            expect(limiter.tryAcquire()).toBe(true);
        });
    });

    describe('acquire', () => {
        it('should acquire immediately when tokens available', async () => {
            const start = Date.now();
            await limiter.acquire();
            const elapsed = Date.now() - start;

            expect(elapsed).toBeLessThan(50);
        });

        it('should wait when no tokens available', async () => {
            // Exhaust all tokens
            for (let i = 0; i < 10; i++) {
                await limiter.acquire();
            }

            const start = Date.now();
            await limiter.acquire();
            const elapsed = Date.now() - start;

            // Should have waited for at least one refill cycle
            expect(elapsed).toBeGreaterThanOrEqual(50);
        });
    });

    describe('getWaitTime', () => {
        it('should return 0 when tokens available', () => {
            expect(limiter.getWaitTime()).toBe(0);
        });

        it('should return positive wait time when no tokens', () => {
            // Exhaust all tokens
            for (let i = 0; i < 10; i++) {
                limiter.tryAcquire();
            }

            expect(limiter.getWaitTime()).toBeGreaterThan(0);
        });
    });

    describe('getStats', () => {
        it('should return correct statistics', () => {
            const stats = limiter.getStats();

            expect(stats.maxTokens).toBe(10);
            expect(stats.refillRate).toBe(10);
            expect(stats.availableTokens).toBe(10);
            expect(stats.queueLength).toBe(0);
        });

        it('should reflect token consumption', () => {
            limiter.tryAcquire();
            limiter.tryAcquire();

            const stats = limiter.getStats();
            expect(stats.availableTokens).toBe(8);
        });
    });

    describe('clear', () => {
        it('should clear the queue', async () => {
            // Exhaust tokens to create a queue
            for (let i = 0; i < 10; i++) {
                limiter.tryAcquire();
            }

            // Start acquiring (will queue)
            const promise = limiter.acquire(10000).catch(() => 'rejected');

            // Clear the queue
            limiter.clear();

            const result = await promise;
            expect(result).toBe('rejected');
        });
    });
});
