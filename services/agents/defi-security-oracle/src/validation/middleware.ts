import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError, ZodIssue } from 'zod';

export function validateRequest(schema: {
  params?: ZodSchema;
  query?: ZodSchema;
  body?: ZodSchema;
}) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (schema.params) {
        const validatedParams = await schema.params.parseAsync(req.params);
        req.params = validatedParams as typeof req.params;
      }

      if (schema.query) {
        const validatedQuery = await schema.query.parseAsync(req.query);
        req.query = validatedQuery as typeof req.query;
      }

      if (schema.body) {
        req.body = await schema.body.parseAsync(req.body);
      }

      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const errors = error.issues.map((err: ZodIssue) => ({
          field: err.path.join('.'),
          message: err.message,
          code: err.code
        }));

        return res.status(400).json({
          error: 'Validation Error',
          message: 'Invalid request parameters',
          details: errors
        });
      }

      console.error('Validation middleware error:', error);
      return res.status(500).json({
        error: 'Internal Server Error',
        message: 'Request validation failed'
      });
    }
  };
}

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

export function rateLimitMiddleware(options: {
  windowMs: number;
  maxRequests: number;
}) {
  return (req: Request, res: Response, next: NextFunction) => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();

    if (Math.random() < 0.01) {
      for (const [key, entry] of rateLimitStore.entries()) {
        if (now > entry.resetTime) {
          rateLimitStore.delete(key);
        }
      }
    }

    const entry = rateLimitStore.get(ip);

    if (entry) {
      if (now < entry.resetTime) {
        if (entry.count >= options.maxRequests) {
          return res.status(429).json({
            error: 'Too Many Requests',
            message: `Rate limit exceeded. Try again in ${Math.ceil((entry.resetTime - now) / 1000)} seconds`,
            retryAfter: Math.ceil((entry.resetTime - now) / 1000)
          });
        }
        entry.count++;
      } else {
        entry.count = 1;
        entry.resetTime = now + options.windowMs;
      }
    } else {
      rateLimitStore.set(ip, {
        count: 1,
        resetTime: now + options.windowMs
      });
    }

    next();
  };
}

export function securityHeadersMiddleware(req: Request, res: Response, next: NextFunction) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');

  if (req.secure) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }

  res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");

  next();
}

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction) {
  const requestId = req.headers['x-request-id'] as string || generateRequestId();
  req.headers['x-request-id'] = requestId;
  res.setHeader('X-Request-ID', requestId);
  next();
}

function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}
