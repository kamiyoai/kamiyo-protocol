// API middleware: auth, rate limiting, tier enforcement

import { Request, Response, NextFunction } from 'express';
import { verifyApiKey, JWTPayload } from './auth';
import { logger } from '../logger';
import { getApiRateLimit, incrementApiRateLimit, cleanupOldRateLimits } from '../db';

// Note: req.auth is typed as JWTPayload for API routes
// MCP routes use their own AuthInfo type from the SDK

const LIMITS = {
  pro: { perMinute: 60, perDay: 10000 },
  companion: { perMinute: 0, perDay: 0 },
  free: { perMinute: 0, perDay: 0 },
};

// Clean up old rate limit entries periodically
let cleanupInterval: NodeJS.Timeout | null = null;

export function startRateLimitCleanup(): void {
  if (cleanupInterval) return;
  cleanupInterval = setInterval(() => {
    const cleaned = cleanupOldRateLimits();
    if (cleaned > 0) {
      logger.debug('Cleaned old rate limit entries', { count: cleaned });
    }
  }, 3600000); // Every hour
}

export function stopRateLimitCleanup(): void {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }
}

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Extract token from header or query
  let token: string | undefined;

  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    token = authHeader.slice(7);
  } else if (req.query.api_key) {
    token = req.query.api_key as string;
  }

  if (!token) {
    res.status(401).json({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Missing API key. Include Authorization: Bearer <token> header.',
      },
    });
    return;
  }

  const payload = verifyApiKey(token);
  if (!payload) {
    res.status(401).json({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Invalid or expired API key.',
      },
    });
    return;
  }

  req.auth = payload;
  next();
}

export function tierMiddleware(minTier: 'pro' | 'companion' | 'free') {
  const tierRank = { free: 0, companion: 1, pro: 2 };

  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.auth) {
      res.status(401).json({
        error: { code: 'UNAUTHORIZED', message: 'Not authenticated' },
      });
      return;
    }

    const userRank = tierRank[req.auth.tier as keyof typeof tierRank] ?? 0;
    const requiredRank = tierRank[minTier];

    if (userRank < requiredRank) {
      res.status(403).json({
        error: {
          code: 'INSUFFICIENT_TIER',
          message: `This endpoint requires ${minTier} tier. You have ${req.auth.tier}.`,
        },
      });
      return;
    }

    next();
  };
}

export function rateLimitMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (!req.auth) {
    res.status(401).json({
      error: { code: 'UNAUTHORIZED', message: 'Not authenticated' },
    });
    return;
  }

  const limits = LIMITS[req.auth.tier as keyof typeof LIMITS] || LIMITS.free;

  // Get persisted rate limit entry (handles expiration/reset automatically)
  const entry = getApiRateLimit(req.auth.wallet);
  const minuteCount = entry?.minute_count ?? 0;
  const dayCount = entry?.day_count ?? 0;
  const minuteResetAt = entry?.minute_reset_at ?? Date.now() + 60000;
  const dayResetAt = entry?.day_reset_at ?? Date.now() + 86400000;

  // Check minute limit
  if (minuteCount >= limits.perMinute) {
    const retryAfter = Math.ceil((minuteResetAt - Date.now()) / 1000);
    res.setHeader('X-RateLimit-Limit', limits.perMinute);
    res.setHeader('X-RateLimit-Remaining', 0);
    res.setHeader('X-RateLimit-Reset', Math.ceil(minuteResetAt / 1000));
    res.setHeader('Retry-After', retryAfter);
    res.status(429).json({
      error: {
        code: 'RATE_LIMITED',
        message: 'Rate limit exceeded',
        retryAfter,
      },
    });
    return;
  }

  // Check daily limit
  if (dayCount >= limits.perDay) {
    const retryAfter = Math.ceil((dayResetAt - Date.now()) / 1000);
    res.status(429).json({
      error: {
        code: 'RATE_LIMITED',
        message: 'Daily limit exceeded',
        retryAfter,
      },
    });
    return;
  }

  // Increment counters (persisted to database)
  const updated = incrementApiRateLimit(req.auth.wallet);

  // Set rate limit headers
  res.setHeader('X-RateLimit-Limit', limits.perMinute);
  res.setHeader('X-RateLimit-Remaining', Math.max(0, limits.perMinute - updated.minute_count));
  res.setHeader('X-RateLimit-Reset', Math.ceil(updated.minute_reset_at / 1000));

  next();
}

export function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction): void {
  // Log full error details internally
  logger.error('API error', { error: err.message, stack: err.stack, path: req.path });

  // Ensure CORS headers are set on error responses
  // This prevents browsers from showing CORS errors instead of the actual error
  const origin = req.headers.origin;
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }

  // Return generic message to client (don't expose internals)
  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An internal error occurred',
    },
  });
}
