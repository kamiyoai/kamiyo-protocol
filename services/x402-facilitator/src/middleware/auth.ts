import { Request, Response, NextFunction } from 'express';
import * as crypto from 'crypto';
import { queryOne } from '../db/pool';

export function hashApiKey(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex');
}

export function generateApiKey(): string {
  return `km_${crypto.randomBytes(32).toString('hex')}`;
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
