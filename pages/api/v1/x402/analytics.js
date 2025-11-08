// pages/api/v1/x402/analytics.js
import prisma from '../../../../lib/prisma';
import { APIKeyManager } from '../../../../lib/x402-saas/api-key-manager';
import { InputValidation } from '../../../../lib/x402-saas/input-validation';
import rateLimiter from '../../../../lib/x402-saas/rate-limiter';
import { captureException } from '../../../../lib/x402-saas/sentry-config';

/**
 * Get usage analytics for tenant dashboard
 *
 * Returns:
 * - Verification trend over time
 * - Verifications by chain
 * - Success rate
 * - Response time metrics
 */
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let apiKey;

  try {
    // Authenticate request
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'Missing or invalid authorization header',
        errorCode: 'UNAUTHENTICATED'
      });
    }

    apiKey = authHeader.substring(7);

    // Validate API key and get tenant info
    const keyInfo = await APIKeyManager.validateApiKey(apiKey);
    if (!keyInfo) {
      return res.status(401).json({
        error: 'Invalid API key',
        errorCode: 'INVALID_API_KEY'
      });
    }

    // Check rate limit
    const rateLimit = await rateLimiter.checkLimit(keyInfo.tenantId, keyInfo.tier);
    res.setHeader('X-RateLimit-Limit', rateLimit.limit);
    res.setHeader('X-RateLimit-Remaining', rateLimit.remaining);
    res.setHeader('X-RateLimit-Reset', rateLimit.resetTime);

    if (!rateLimit.allowed) {
      res.setHeader('Retry-After', rateLimit.retryAfter);
      return res.status(429).json({
        error: 'Rate limit exceeded',
        errorCode: 'RATE_LIMIT_EXCEEDED',
        retryAfter: rateLimit.retryAfter
      });
    }

    // Get and validate query parameters
    const { days = 30 } = req.query;
    const daysValidation = InputValidation.validateDays(days);

    if (!daysValidation.valid) {
      return res.status(400).json({
        error: daysValidation.error,
        errorCode: 'INVALID_PARAMETER'
      });
    }

    const daysInt = daysValidation.value;

    // Calculate date range
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysInt);

    // Get verification logs for this tenant
    const verifications = await prisma.x402VerificationLog.findMany({
      where: {
        tenantId: keyInfo.tenantId,
        createdAt: {
          gte: startDate,
          lte: endDate
        }
      },
      select: {
        createdAt: true,
        chain: true,
        success: true,
        responseTimeMs: true
      },
      orderBy: {
        createdAt: 'asc'
      }
    });

    // Process data for charts
    const analytics = processAnalytics(verifications, daysInt);

    return res.status(200).json({
      tenant_id: keyInfo.tenantId,
      period: {
        start: startDate.toISOString(),
        end: endDate.toISOString(),
        days: daysInt
      },
      ...analytics
    });

  } catch (error) {
    console.error('Analytics error:', error);

    // Track error with context
    captureException(error, {
      endpoint: '/api/v1/x402/analytics',
      method: req.method,
      apiKey: apiKey?.substring(0, 20) + '...'
    });

    return res.status(500).json({
      error: 'Internal server error',
      errorCode: 'INTERNAL_ERROR',
      message: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}

/**
 * Process verification logs into analytics data
 */
function processAnalytics(verifications, days) {
  // Initialize daily buckets
  const dailyBuckets = {};
  const chainCounts = {};
  let successCount = 0;
  let totalCount = verifications.length;
  const responseTimes = [];

  // Process verifications
  for (const verification of verifications) {
    // Daily trend
    const dateKey = verification.createdAt.toISOString().split('T')[0];
    if (!dailyBuckets[dateKey]) {
      dailyBuckets[dateKey] = 0;
    }
    dailyBuckets[dateKey]++;

    // Chain breakdown
    const chain = verification.chain || 'unknown';
    if (!chainCounts[chain]) {
      chainCounts[chain] = 0;
    }
    chainCounts[chain]++;

    // Success rate
    if (verification.success) {
      successCount++;
    }

    // Response times
    if (verification.responseTimeMs) {
      responseTimes.push(verification.responseTimeMs);
    }
  }

  // Format trend data
  const trendData = Object.entries(dailyBuckets).map(([date, count]) => ({
    date: formatDate(new Date(date)),
    verifications: count
  }));

  // Pad missing days with zeros
  const allDays = generateDateRange(days);
  const trendDataComplete = allDays.map(date => {
    const existing = trendData.find(d => d.date === date);
    return existing || { date, verifications: 0 };
  });

  // Format chain data
  const chainData = Object.entries(chainCounts)
    .map(([chain, count]) => ({
      chain: capitalizeChain(chain),
      count
    }))
    .sort((a, b) => b.count - a.count);

  // Calculate success rate
  const successRate = totalCount > 0 ? (successCount / totalCount) * 100 : 0;

  // Calculate response time stats
  const avgResponseTime = responseTimes.length > 0
    ? responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length
    : 0;

  const responseTimeData = calculateResponseTimeTrend(verifications);

  return {
    total_verifications: totalCount,
    trend_data: trendDataComplete,
    chain_data: chainData,
    success_rate: Math.round(successRate * 10) / 10, // Round to 1 decimal
    successful_verifications: successCount,
    failed_verifications: totalCount - successCount,
    response_time_data: responseTimeData,
    avg_response_time_ms: Math.round(avgResponseTime)
  };
}

/**
 * Generate date range for trend data
 */
function generateDateRange(days) {
  const dates = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    dates.push(formatDate(date));
  }
  return dates;
}

/**
 * Format date as MM/DD
 */
function formatDate(date) {
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

/**
 * Capitalize chain name
 */
function capitalizeChain(chain) {
  if (!chain) return 'Unknown';
  return chain.charAt(0).toUpperCase() + chain.slice(1).toLowerCase();
}

/**
 * Calculate response time trend (hourly averages for last 24 hours)
 */
function calculateResponseTimeTrend(verifications) {
  const hourlyBuckets = {};

  // Get last 24 hours of data
  const cutoff = new Date();
  cutoff.setHours(cutoff.getHours() - 24);

  const recentVerifications = verifications.filter(v => v.createdAt >= cutoff);

  // Bucket by hour
  for (const verification of recentVerifications) {
    if (!verification.responseTimeMs) continue;

    const hour = verification.createdAt.getHours();
    if (!hourlyBuckets[hour]) {
      hourlyBuckets[hour] = [];
    }
    hourlyBuckets[hour].push(verification.responseTimeMs);
  }

  // Calculate hourly averages
  const hourlyData = [];
  for (let i = 0; i < 24; i++) {
    const hour = (new Date().getHours() - 23 + i + 24) % 24;
    const times = hourlyBuckets[hour] || [];
    const avg = times.length > 0
      ? times.reduce((sum, time) => sum + time, 0) / times.length
      : 0;

    hourlyData.push({
      time: `${hour}:00`,
      latency: Math.round(avg)
    });
  }

  return hourlyData;
}
