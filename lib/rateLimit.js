/**
 * Rate Limiting Utility for Kamiyo API
 *
 * Tracks API requests per user per day and enforces tier-based limits.
 */

import prisma from './prisma';
import { getTierLimits } from './tiers';

/**
 * Check if user has exceeded their daily API rate limit
 *
 * @param {string} userId - User ID
 * @param {string} tier - User's subscription tier
 * @returns {Promise<{allowed: boolean, current: number, limit: number, resetAt: Date}>}
 */
export async function checkRateLimit(userId, tier) {
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  const limits = getTierLimits(tier);
  const dailyLimit = limits.apiRequestsPerDay;

  // Count requests for today
  const requestCount = await prisma.apiRequest.count({
    where: {
      userId,
      date: today
    }
  });

  // Calculate reset time (midnight UTC)
  const tomorrow = new Date();
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  tomorrow.setUTCHours(0, 0, 0, 0);

  // Enterprise tier has "unlimited" (999999) requests, always allowed
  const allowed = requestCount < dailyLimit;

  return {
    allowed,
    current: requestCount,
    limit: dailyLimit,
    resetAt: tomorrow
  };
}

/**
 * Record an API request for rate limiting
 *
 * @param {string} userId - User ID
 * @param {string} endpoint - API endpoint called
 * @returns {Promise<void>}
 */
export async function recordApiRequest(userId, endpoint) {
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

  try {
    await prisma.apiRequest.create({
      data: {
        userId,
        endpoint,
        date: today
      }
    });
  } catch (error) {
    // Log but don't fail the request if recording fails
    console.error('Failed to record API request:', error);
  }
}

/**
 * Middleware to enforce rate limiting on API routes
 *
 * Usage:
 * ```js
 * export default withRateLimit(async function handler(req, res) {
 *   // Your API logic here
 * });
 * ```
 */
export function withRateLimit(handler) {
  return async (req, res) => {
    const { method, url } = req;

    // Only rate limit GET requests to data endpoints
    if (method !== 'GET') {
      return handler(req, res);
    }

    // Skip rate limiting for non-data endpoints
    const dataEndpoints = ['/api/exploits', '/api/chains', '/api/stats'];
    const isDataEndpoint = dataEndpoints.some(endpoint => url.startsWith(endpoint));

    if (!isDataEndpoint) {
      return handler(req, res);
    }

    // Get user session and tier
    const { getServerSession } = await import('next-auth/next');
    const { default: authOptions } = await import('../pages/api/auth/[...nextauth]');
    const session = await getServerSession(req, res, authOptions);

    if (!session?.user?.email) {
      // Anonymous users get free tier limits tracked by IP
      const clientIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
                       req.headers['x-real-ip'] ||
                       req.connection?.remoteAddress ||
                       'unknown';

      // Hash IP for privacy
      const crypto = await import('crypto');
      const ipHash = crypto.createHash('sha256').update(clientIp).digest('hex').substring(0, 16);

      // Check if anonymous IP record exists, create if not
      let anonymousUser = await prisma.user.findUnique({
        where: { email: `anonymous-${ipHash}@kamiyo.internal` }
      });

      if (!anonymousUser) {
        anonymousUser = await prisma.user.create({
          data: { email: `anonymous-${ipHash}@kamiyo.internal` }
        });
      }

      // Check rate limit for anonymous user (free tier: 100/day)
      const rateLimit = await checkRateLimit(anonymousUser.id, 'free');

      res.setHeader('X-RateLimit-Limit', rateLimit.limit);
      res.setHeader('X-RateLimit-Remaining', Math.max(0, rateLimit.limit - rateLimit.current));
      res.setHeader('X-RateLimit-Reset', rateLimit.resetAt.toISOString());

      if (!rateLimit.allowed) {
        return res.status(429).json({
          error: 'Rate limit exceeded',
          message: 'Anonymous users are limited to 100 requests per day. Please sign in for higher limits.',
          limit: rateLimit.limit,
          current: rateLimit.current,
          resetAt: rateLimit.resetAt,
          signInUrl: '/auth/signin'
        });
      }

      // Record request for anonymous user
      await recordApiRequest(anonymousUser.id, url);
      return handler(req, res);
    }

    try {
      // Get user and their tier
      const user = await prisma.user.findUnique({
        where: { email: session.user.email },
        include: {
          subscriptions: {
            where: { status: 'active' },
            orderBy: { createdAt: 'desc' },
            take: 1
          }
        }
      });

      if (!user) {
        return handler(req, res);
      }

      const tier = user.subscriptions[0]?.tier || 'free';

      // Check rate limit
      const rateLimit = await checkRateLimit(user.id, tier);

      // Add rate limit headers
      res.setHeader('X-RateLimit-Limit', rateLimit.limit);
      res.setHeader('X-RateLimit-Remaining', Math.max(0, rateLimit.limit - rateLimit.current));
      res.setHeader('X-RateLimit-Reset', rateLimit.resetAt.toISOString());

      if (!rateLimit.allowed) {
        return res.status(429).json({
          error: 'Rate limit exceeded',
          message: `You have exceeded your daily API limit of ${rateLimit.limit} requests.`,
          limit: rateLimit.limit,
          current: rateLimit.current,
          resetAt: rateLimit.resetAt,
          upgradeUrl: '/pricing'
        });
      }

      // Record this request
      await recordApiRequest(user.id, url);

      // Proceed with the request
      return handler(req, res);

    } catch (error) {
      console.error('Rate limit check failed:', error);
      // On error, allow the request to proceed (fail open)
      return handler(req, res);
    }
  };
}

/**
 * Get current rate limit status for a user
 *
 * @param {string} userId - User ID
 * @param {string} tier - User's subscription tier
 * @returns {Promise<{current: number, limit: number, remaining: number, resetAt: Date}>}
 */
export async function getRateLimitStatus(userId, tier) {
  const rateLimit = await checkRateLimit(userId, tier);

  return {
    current: rateLimit.current,
    limit: rateLimit.limit,
    remaining: Math.max(0, rateLimit.limit - rateLimit.current),
    resetAt: rateLimit.resetAt,
    percentage: Math.round((rateLimit.current / rateLimit.limit) * 100)
  };
}
