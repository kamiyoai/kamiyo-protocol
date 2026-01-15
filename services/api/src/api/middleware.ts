// API middleware: auth, rate limiting, tier enforcement

import { Request, Response, NextFunction } from 'express';
import { verifyApiKey, JWTPayload } from './auth';
import { logger } from '../logger';

// Extend Express Request to include auth info
declare global {
  namespace Express {
    interface Request {
      auth?: JWTPayload;
    }
  }
}

// Rate limit state per wallet
interface RateLimitEntry {
  minute: { count: number; resetAt: number };
  day: { count: number; resetAt: number };
}

const rateLimits = new Map<string, RateLimitEntry>();

const LIMITS = {
  pro: { perMinute: 60, perDay: 10000 },
  companion: { perMinute: 0, perDay: 0 },
  free: { perMinute: 0, perDay: 0 },
};

function getRateLimitEntry(wallet: string): RateLimitEntry {
  const now = Date.now();
  let entry = rateLimits.get(wallet);

  if (!entry) {
    entry = {
      minute: { count: 0, resetAt: now + 60000 },
      day: { count: 0, resetAt: now + 86400000 },
    };
    rateLimits.set(wallet, entry);
  }

  // Reset if window expired
  if (now > entry.minute.resetAt) {
    entry.minute = { count: 0, resetAt: now + 60000 };
  }
  if (now > entry.day.resetAt) {
    entry.day = { count: 0, resetAt: now + 86400000 };
  }

  return entry;
}

// Clean up old entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [wallet, entry] of rateLimits) {
    if (now > entry.day.resetAt + 86400000) {
      rateLimits.delete(wallet);
    }
  }
}, 3600000); // Every hour

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
  const entry = getRateLimitEntry(req.auth.wallet);

  // Check minute limit
  if (entry.minute.count >= limits.perMinute) {
    const retryAfter = Math.ceil((entry.minute.resetAt - Date.now()) / 1000);
    res.setHeader('X-RateLimit-Limit', limits.perMinute);
    res.setHeader('X-RateLimit-Remaining', 0);
    res.setHeader('X-RateLimit-Reset', Math.ceil(entry.minute.resetAt / 1000));
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
  if (entry.day.count >= limits.perDay) {
    const retryAfter = Math.ceil((entry.day.resetAt - Date.now()) / 1000);
    res.status(429).json({
      error: {
        code: 'RATE_LIMITED',
        message: 'Daily limit exceeded',
        retryAfter,
      },
    });
    return;
  }

  // Increment counters
  entry.minute.count++;
  entry.day.count++;

  // Set rate limit headers
  res.setHeader('X-RateLimit-Limit', limits.perMinute);
  res.setHeader('X-RateLimit-Remaining', limits.perMinute - entry.minute.count);
  res.setHeader('X-RateLimit-Reset', Math.ceil(entry.minute.resetAt / 1000));

  next();
}

export function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction): void {
  logger.error('API error', { error: err.message, path: req.path });

  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An internal error occurred',
    },
  });
}
