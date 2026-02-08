import { Request, Response, NextFunction } from 'express';
import { query, queryOne } from '../db/pool';

const store = new Map<string, { count: number; resetAt: number }>();
const DEFAULT_LIMIT = 100;
const WINDOW_MS = 60_000;
const DB_RETENTION_MINUTES = 10;

function resolveLimit(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_LIMIT;
  return Math.floor(parsed);
}

function setRateLimitHeaders(res: Response, limit: number, remaining: number, resetEpochSeconds: number): void {
  res.setHeader('X-RateLimit-Limit', String(limit));
  res.setHeader('X-RateLimit-Remaining', String(Math.max(0, remaining)));
  res.setHeader('X-RateLimit-Reset', String(Math.max(0, Math.floor(resetEpochSeconds))));
}

function applyMemoryRateLimit(key: string, limit: number, req: Request, res: Response, next: NextFunction): void {
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || now > entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + WINDOW_MS });
    setRateLimitHeaders(res, limit, limit - 1, (now + WINDOW_MS) / 1000);
    next();
    return;
  }

  if (entry.count >= limit) {
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
    res.set('Retry-After', String(retryAfter));
    setRateLimitHeaders(res, limit, 0, entry.resetAt / 1000);
    res.status(429).json({ error: 'Rate limit exceeded' });
    return;
  }

  entry.count++;
  setRateLimitHeaders(res, limit, limit - entry.count, entry.resetAt / 1000);
  next();
}

export async function rateLimit(req: Request, res: Response, next: NextFunction): Promise<void> {
  const rawKey = (req as any).apiKeyId
    ? `api:${String((req as any).apiKeyId)}`
    : `ip:${req.ip || 'unknown'}`;
  const limit = resolveLimit((req as any).rateLimit);

  try {
    const row = await queryOne<{ count: string | number; reset_epoch: string | number }>(
      `WITH upsert AS (
         INSERT INTO api_rate_limit_windows (rate_key, window_start, count)
         VALUES ($1, date_trunc('minute', NOW()), 1)
         ON CONFLICT (rate_key, window_start)
         DO UPDATE SET count = api_rate_limit_windows.count + 1
         RETURNING
           count,
           EXTRACT(EPOCH FROM (window_start + INTERVAL '1 minute')) AS reset_epoch
       )
       SELECT count, reset_epoch FROM upsert`,
      [rawKey]
    );

    if (!row) {
      throw new Error('rate limit upsert returned no rows');
    }

    const count = Number(row.count);
    const resetEpoch = Number(row.reset_epoch);
    const remaining = limit - count;

    if (count > limit) {
      const retryAfter = Math.max(1, Math.ceil(resetEpoch - Date.now() / 1000));
      res.set('Retry-After', String(retryAfter));
      setRateLimitHeaders(res, limit, 0, resetEpoch);
      res.status(429).json({ error: 'Rate limit exceeded' });
      return;
    }

    setRateLimitHeaders(res, limit, remaining, resetEpoch);
    next();
  } catch {
    // Fallback keeps traffic flowing if DB is temporarily unavailable.
    applyMemoryRateLimit(rawKey, limit, req, res, next);
  }
}

const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) if (now > entry.resetAt) store.delete(key);
}, 60_000);

cleanupTimer.unref?.();

const dbCleanupTimer = setInterval(() => {
  query(
    `DELETE FROM api_rate_limit_windows
     WHERE window_start < NOW() - ($1::text || ' minutes')::interval`,
    [String(DB_RETENTION_MINUTES)]
  ).catch(() => {
    // ignore cleanup failures; enforced by primary insert path
  });
}, 5 * 60_000);

dbCleanupTimer.unref?.();
