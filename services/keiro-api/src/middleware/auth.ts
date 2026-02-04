import { Context, Next } from 'hono';
import { PublicKey } from '@solana/web3.js';
import nacl from 'tweetnacl';
import bs58 from 'bs58';

// Simple signature-based auth middleware
// Client signs a message with their wallet, server verifies

export interface AuthContext {
  walletAddress: string;
  timestamp: number;
}

export async function verifyWalletSignature(
  c: Context,
  next: Next
) {
  const authHeader = c.req.header('Authorization');

  if (!authHeader) {
    return c.json({ error: 'Missing Authorization header' }, 401);
  }

  // Expected format: "Solana <base58-pubkey>:<base58-signature>:<timestamp>"
  const [scheme, credentials] = authHeader.split(' ');

  if (scheme !== 'Solana' || !credentials) {
    return c.json({ error: 'Invalid auth scheme' }, 401);
  }

  const [pubkeyStr, signatureStr, timestampStr] = credentials.split(':');

  if (!pubkeyStr || !signatureStr || !timestampStr) {
    return c.json({ error: 'Malformed credentials' }, 401);
  }

  try {
    const publicKey = new PublicKey(pubkeyStr);
    const signature = bs58.decode(signatureStr);
    const timestamp = parseInt(timestampStr, 10);

    // Check timestamp is within 5 minutes
    const now = Date.now();
    if (Math.abs(now - timestamp) > 5 * 60 * 1000) {
      return c.json({ error: 'Request expired' }, 401);
    }

    // Message format: "keiro-auth:{timestamp}"
    const message = new TextEncoder().encode(`keiro-auth:${timestamp}`);

    // Verify signature
    const isValid = nacl.sign.detached.verify(
      message,
      signature,
      publicKey.toBytes()
    );

    if (!isValid) {
      return c.json({ error: 'Invalid signature' }, 401);
    }

    // Set auth context
    c.set('auth', {
      walletAddress: pubkeyStr,
      timestamp,
    } as AuthContext);

    await next();
  } catch (error) {
    return c.json({ error: 'Auth verification failed' }, 401);
  }
}

// Optional auth - doesn't fail if not present
export async function optionalAuth(c: Context, next: Next) {
  const authHeader = c.req.header('Authorization');

  if (!authHeader) {
    await next();
    return;
  }

  // Try to verify, but don't fail
  try {
    const [scheme, credentials] = authHeader.split(' ');
    if (scheme === 'Solana' && credentials) {
      const [pubkeyStr, signatureStr, timestampStr] = credentials.split(':');
      if (pubkeyStr && signatureStr && timestampStr) {
        const publicKey = new PublicKey(pubkeyStr);
        const signature = bs58.decode(signatureStr);
        const timestamp = parseInt(timestampStr, 10);

        const message = new TextEncoder().encode(`keiro-auth:${timestamp}`);
        const isValid = nacl.sign.detached.verify(
          message,
          signature,
          publicKey.toBytes()
        );

        if (isValid && Math.abs(Date.now() - timestamp) <= 5 * 60 * 1000) {
          c.set('auth', { walletAddress: pubkeyStr, timestamp });
        }
      }
    }
  } catch {
    // Ignore errors, just proceed without auth
  }

  await next();
}
