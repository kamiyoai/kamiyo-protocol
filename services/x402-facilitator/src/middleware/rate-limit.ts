import { Request, Response, NextFunction } from 'express';

const store = new Map<string, { count: number; resetAt: number }>();
const DEFAULT_LIMIT = 100;
const WINDOW_MS = 60_000;

export function rateLimit(req: Request, res: Response, next: NextFunction): void {
  const key = (req as any).apiKeyId || req.ip || 'unknown';
  const limit = (req as any).rateLimit || DEFAULT_LIMIT;
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || now > entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + WINDOW_MS });
    res.setHeader('X-RateLimit-Limit', String(limit));
    res.setHeader('X-RateLimit-Remaining', String(limit - 1));
    res.setHeader('X-RateLimit-Reset', String(Math.floor((now + WINDOW_MS) / 1000)));
    next();
    return;
  }

  if (entry.count >= limit) {
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
    res.set('Retry-After', String(retryAfter));
    res.setHeader('X-RateLimit-Limit', String(limit));
    res.setHeader('X-RateLimit-Remaining', '0');
    res.setHeader('X-RateLimit-Reset', String(Math.floor(entry.resetAt / 1000)));
    res.status(429).json({ error: 'Rate limit exceeded' });
    return;
  }

  entry.count++;
  res.setHeader('X-RateLimit-Limit', String(limit));
  res.setHeader('X-RateLimit-Remaining', String(Math.max(0, limit - entry.count)));
  res.setHeader('X-RateLimit-Reset', String(Math.floor(entry.resetAt / 1000)));
  next();
}

setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) if (now > entry.resetAt) store.delete(key);
}, 60_000);
