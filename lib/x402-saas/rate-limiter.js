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
    }

    async checkLimit(tenantId, tier = 'free') {
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
        for (const [key, data] of this.requests.entries()) {
            if (now >= data.resetTime + 3600000) { // 1 hour after reset
                this.requests.delete(key);
            }
        }
    }

    // For Redis-based implementation (future)
    async checkLimitRedis(tenantId, tier = 'free') {
        // TODO: Implement with Redis when REDIS_URL is available
        // This would use Redis INCR with EXPIRE for distributed rate limiting
        throw new Error('Redis rate limiting not yet implemented');
    }
}

// Singleton instance
const rateLimiter = new RateLimiter();

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
