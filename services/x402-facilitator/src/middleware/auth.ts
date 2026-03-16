import { Request, Response, NextFunction } from 'express';
import * as crypto from 'crypto';
import { queryOne } from '../db/pool';
import { getConfig } from '../config';

export function hashApiKey(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex');
}

export function generateApiKey(): string {
  return `km_${crypto.randomBytes(32).toString('hex')}`;
}

function readInternalToken(req: Request): string {
  const authHeader = req.headers.authorization;
  if (typeof authHeader === 'string') {
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    if (match?.[1]) {
      return match[1].trim();
    }
  }

  const directHeader = req.headers['x-kizuna-internal-token'];
  if (typeof directHeader === 'string') {
    return directHeader.trim();
  }
  if (Array.isArray(directHeader) && typeof directHeader[0] === 'string') {
    return directHeader[0].trim();
  }

  return '';
}

function secureEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

export async function apiKeyAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const key = req.headers['x-api-key'] as string;
  if (!key) {
    res.status(401).json({ error: 'Missing X-API-Key header' });
    return;
  }

  const keyHash = hashApiKey(key);
  const row = await queryOne('SELECT * FROM api_keys WHERE key_hash = $1 AND revoked_at IS NULL', [keyHash]);

  if (!row) {
    res.status(401).json({ error: 'Invalid API key' });
    return;
  }

  (req as any).merchantWallet = row.merchant_wallet;
  (req as any).apiKeyId = row.id;
  (req as any).rateLimit = row.rate_limit;
  next();
}

export function internalTokenAuth(req: Request, res: Response, next: NextFunction): void {
  const expectedToken = getConfig().KIZUNA_INTERNAL_TOKEN.trim();
  const providedToken = readInternalToken(req);

  if (!expectedToken || !providedToken || !secureEqual(providedToken, expectedToken)) {
    res.status(401).json({ error: 'Invalid internal token' });
    return;
  }

  next();
}

export async function optionalApiKeyAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const key = req.headers['x-api-key'] as string;
  if (!key) {
    (req as any).authenticated = false;
    next();
    return;
  }

  const keyHash = hashApiKey(key);
  const row = await queryOne('SELECT * FROM api_keys WHERE key_hash = $1 AND revoked_at IS NULL', [keyHash]);

  if (!row) {
    (req as any).authenticated = false;
    next();
    return;
  }

  (req as any).authenticated = true;
  (req as any).merchantWallet = row.merchant_wallet;
  (req as any).apiKeyId = row.id;
  (req as any).rateLimit = row.rate_limit;
  next();
}
