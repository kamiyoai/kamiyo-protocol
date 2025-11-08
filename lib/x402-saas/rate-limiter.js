// lib/x402-saas/rate-limiter.js
// In-memory rate limiting (Redis-based for production with REDIS_URL)

class RateLimiter {
    constructor() {
        this.requests = new Map(); // tenantId -> { count, resetTime }
        this.limits = {
            free: { perMinute: 10, perHour: 100 },
            starter: { perMinute: 100, perHour: 5000 },
            pro: { perMinute: 500, perHour: 50000 },
            enterprise: { perMinute: 2000, perHour: 200000 }
        };

        // Start periodic cleanup (every minute)
        this.cleanupInterval = setInterval(() => {
            this.cleanup();
        }, 60000);
    }

    async checkLimit(tenantId, tier = 'free') {
        // Use Redis if available
        if (this.redis) {
            return this.checkLimitRedis(tenantId, tier);
        }

        // Fall back to memory
        const now = Date.now();
        const minuteKey = `${tenantId}:minute`;
        const hourKey = `${tenantId}:hour`;

        // Get or initialize counters
        let minuteData = this.requests.get(minuteKey);
        let hourData = this.requests.get(hourKey);

        const minuteReset = Math.floor(now / 60000) * 60000 + 60000;
        const hourReset = Math.floor(now / 3600000) * 3600000 + 3600000;

        // Reset if expired
        if (!minuteData || now >= minuteData.resetTime) {
            minuteData = { count: 0, resetTime: minuteReset };
        }
        if (!hourData || now >= hourData.resetTime) {
            hourData = { count: 0, resetTime: hourReset };
        }

        // Check limits
        const limits = this.limits[tier] || this.limits.free;

        if (minuteData.count >= limits.perMinute) {
            return {
                allowed: false,
                limit: limits.perMinute,
                remaining: 0,
                resetTime: minuteData.resetTime,
                retryAfter: Math.ceil((minuteData.resetTime - now) / 1000),
                window: 'minute'
            };
        }

        if (hourData.count >= limits.perHour) {
            return {
                allowed: false,
                limit: limits.perHour,
                remaining: 0,
                resetTime: hourData.resetTime,
                retryAfter: Math.ceil((hourData.resetTime - now) / 1000),
                window: 'hour'
            };
        }

        // Increment counters
        minuteData.count++;
        hourData.count++;

        this.requests.set(minuteKey, minuteData);
        this.requests.set(hourKey, hourData);

        // Clean up old entries periodically
        if (Math.random() < 0.01) {
            this.cleanup();
        }

        return {
            allowed: true,
            limit: limits.perMinute,
            remaining: limits.perMinute - minuteData.count,
            resetTime: minuteData.resetTime
        };
    }

    cleanup() {
        const now = Date.now();
        let deleted = 0;
        for (const [key, data] of this.requests.entries()) {
            if (now >= data.resetTime + 3600000) { // 1 hour after reset
                this.requests.delete(key);
                deleted++;
            }
        }
        if (deleted > 0) {
            console.log(`Rate limiter cleanup: removed ${deleted} expired entries`);
        }
    }

    /**
     * Destroy rate limiter and clear intervals
     */
    destroy() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
        }
        if (this.redis) {
            this.redis.disconnect();
        }
    }

    // Redis-based rate limiting for production
    async initRedis(redisUrl) {
        if (!redisUrl) {
            console.warn('Redis URL not provided. Using in-memory rate limiting');
            return;
        }

        try {
            const Redis = (await import('ioredis')).default;
            this.redis = new Redis(redisUrl, {
                maxRetriesPerRequest: 3,
                enableReadyCheck: true,
            });

            this.redis.on('error', (error) => {
                console.error('Redis connection error:', error.message);
                this.redis = null;
            });

            this.redis.on('connect', () => {
                console.log('Redis rate limiter connected');
            });
        } catch (error) {
            console.error('Failed to initialize Redis:', error.message);
        }
    }

    async checkLimitRedis(tenantId, tier = 'free') {
        const now = Date.now();
        const minuteKey = `rate:${tenantId}:minute`;
        const hourKey = `rate:${tenantId}:hour`;

        const limits = this.limits[tier] || this.limits.free;

        try {
            // Check minute limit
            const minuteCount = await this.redis.incr(minuteKey);
            if (minuteCount === 1) {
                await this.redis.expire(minuteKey, 60);
            }

            if (minuteCount > limits.perMinute) {
                const ttl = await this.redis.ttl(minuteKey);
                return {
                    allowed: false,
                    limit: limits.perMinute,
                    remaining: 0,
                    resetTime: now + (ttl * 1000),
                    retryAfter: ttl,
                    window: 'minute'
                };
            }

            // Check hour limit
            const hourCount = await this.redis.incr(hourKey);
            if (hourCount === 1) {
                await this.redis.expire(hourKey, 3600);
            }

            if (hourCount > limits.perHour) {
                const ttl = await this.redis.ttl(hourKey);
                return {
                    allowed: false,
                    limit: limits.perHour,
                    remaining: 0,
                    resetTime: now + (ttl * 1000),
                    retryAfter: ttl,
                    window: 'hour'
                };
            }

            return {
                allowed: true,
                limit: limits.perMinute,
                remaining: limits.perMinute - minuteCount,
                resetTime: now + 60000
            };
        } catch (error) {
            console.error('Redis rate limit error:', error.message);
            // Fall back to memory
            return this.checkLimit(tenantId, tier);
        }
    }
}

// Singleton instance
const rateLimiter = new RateLimiter();

// Initialize Redis if REDIS_URL is provided
if (process.env.REDIS_URL) {
    rateLimiter.initRedis(process.env.REDIS_URL).catch(error => {
        console.error('Failed to initialize Redis for rate limiting:', error.message);
    });
}

export default rateLimiter;

// Middleware for Next.js API routes
export async function withRateLimit(handler) {
    return async (req, res) => {
        // Extract tenant info from request
        // This assumes tenantId is added to req by auth middleware
        const tenantId = req.tenantId;
        const tier = req.tenantTier || 'free';

        if (!tenantId) {
            // No tenant ID means no rate limiting (or rate limit by IP)
            return handler(req, res);
        }

        const result = await rateLimiter.checkLimit(tenantId, tier);

        // Add rate limit headers
        res.setHeader('X-RateLimit-Limit', result.limit);
        res.setHeader('X-RateLimit-Remaining', result.remaining);
        res.setHeader('X-RateLimit-Reset', result.resetTime);

        if (!result.allowed) {
            res.setHeader('Retry-After', result.retryAfter);
            return res.status(429).json({
                error: 'Rate limit exceeded',
                message: `Too many requests. Limit: ${result.limit}/${result.window}`,
                retryAfter: result.retryAfter,
                resetTime: new Date(result.resetTime).toISOString()
            });
        }

        return handler(req, res);
    };
}
