import type { IncomingMessage } from 'http';

interface RateLimitState {
  count: number;
  resetAt: number;
}

export interface RateLimitDecision {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
}

export class InMemoryRateLimiter {
  private readonly buckets = new Map<string, RateLimitState>();

  check(key: string, limit: number, windowMs: number, now = Date.now()): RateLimitDecision {
    const existing = this.buckets.get(key);
    if (!existing || now >= existing.resetAt) {
      this.buckets.set(key, { count: 1, resetAt: now + windowMs });
      return { allowed: true, remaining: Math.max(0, limit - 1), retryAfterMs: 0 };
    }

    if (existing.count >= limit) {
      return {
        allowed: false,
        remaining: 0,
        retryAfterMs: Math.max(1, existing.resetAt - now),
      };
    }

    existing.count += 1;
    return {
      allowed: true,
      remaining: Math.max(0, limit - existing.count),
      retryAfterMs: 0,
    };
  }

  prune(now = Date.now()): void {
    for (const [key, state] of this.buckets.entries()) {
      if (now >= state.resetAt) this.buckets.delete(key);
    }
  }
}

export function extractClientIp(req: IncomingMessage): string {
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.length > 0) {
    return xff.split(',')[0]?.trim() || 'unknown';
  }

  if (Array.isArray(xff) && xff.length > 0) {
    return xff[0]?.split(',')[0]?.trim() || 'unknown';
  }

  return req.socket.remoteAddress ?? 'unknown';
}

export function readApiKey(req: IncomingMessage): string | null {
  const headerKey = req.headers['x-api-key'];
  if (typeof headerKey === 'string' && headerKey.trim().length > 0) {
    return headerKey.trim();
  }

  const authHeader = req.headers.authorization;
  if (typeof authHeader !== 'string') return null;
  const [scheme, token] = authHeader.split(' ');
  if (scheme?.toLowerCase() !== 'bearer') return null;
  if (!token || token.trim().length === 0) return null;
  return token.trim();
}
