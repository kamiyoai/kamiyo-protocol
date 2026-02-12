import { Context, Next } from 'hono';
import { PublicKey } from '@solana/web3.js';
import nacl from 'tweetnacl';
import bs58 from 'bs58';

export interface AuthContext {
  walletAddress: string;
  timestamp: number;
}

type ParsedCredentials =
  | {
      ok: true;
      pubkeyStr: string;
      signatureStr: string;
      timestampStr: string;
    }
  | { ok: false; reason: 'invalid_scheme' | 'malformed' };

function parseCredentials(authHeader: string): ParsedCredentials {
  const [scheme, credentials] = authHeader.split(' ');
  if (scheme !== 'Solana' || !credentials) return { ok: false, reason: 'invalid_scheme' };

  const [pubkeyStr, signatureStr, timestampStr] = credentials.split(':');
  if (!pubkeyStr || !signatureStr || !timestampStr) return { ok: false, reason: 'malformed' };

  return { ok: true, pubkeyStr, signatureStr, timestampStr };
}

function isFreshTimestamp(timestamp: number): boolean {
  return Math.abs(Date.now() - timestamp) <= 5 * 60 * 1000;
}

function verifySignature(pubkeyStr: string, signatureStr: string, timestamp: number): boolean {
  const publicKey = new PublicKey(pubkeyStr);
  const signature = bs58.decode(signatureStr);
  const message = new TextEncoder().encode(`keiro-auth:${timestamp}`);
  return nacl.sign.detached.verify(message, signature, publicKey.toBytes());
}

export async function verifyWalletSignature(
  c: Context,
  next: Next
) {
  const authHeader = c.req.header('Authorization');

  if (!authHeader) {
    return c.json({ error: 'Missing Authorization header' }, 401);
  }

  const parsed = parseCredentials(authHeader);
  if (!parsed.ok) {
    if (parsed.reason === 'malformed') {
      return c.json({ error: 'Malformed credentials' }, 401);
    }
    return c.json({ error: 'Invalid auth scheme' }, 401);
  }

  const { pubkeyStr, signatureStr, timestampStr } = parsed;

  try {
    const timestamp = parseInt(timestampStr, 10);
    if (!isFreshTimestamp(timestamp)) {
      return c.json({ error: 'Request expired' }, 401);
    }

    if (!verifySignature(pubkeyStr, signatureStr, timestamp)) {
      return c.json({ error: 'Invalid signature' }, 401);
    }

    c.set('auth', {
      walletAddress: pubkeyStr,
      timestamp,
    } as AuthContext);

    await next();
  } catch {
    return c.json({ error: 'Auth verification failed' }, 401);
  }
}

export async function optionalAuth(c: Context, next: Next) {
  const authHeader = c.req.header('Authorization');

  if (!authHeader) {
    await next();
    return;
  }

  try {
    const parsed = parseCredentials(authHeader);
    if (parsed.ok) {
      const { pubkeyStr, signatureStr, timestampStr } = parsed;
      const timestamp = parseInt(timestampStr, 10);
      if (isFreshTimestamp(timestamp) && verifySignature(pubkeyStr, signatureStr, timestamp)) {
        c.set('auth', { walletAddress: pubkeyStr, timestamp });
      }
    }
  } catch {
    // proceed without auth context
  }

  await next();
}
