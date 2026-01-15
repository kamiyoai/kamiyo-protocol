import jwt from 'jsonwebtoken';
const { sign, verify } = jwt;
import { PublicKey } from '@solana/web3.js';
import nacl from 'tweetnacl';
import bs58 from 'bs58';
import { randomBytes } from 'crypto';
import { getTokenBalance } from '../tiers.js';
import { logger } from '../logger.js';

const JWT_SECRET = process.env.JWT_SECRET || randomBytes(32).toString('hex');
const JWT_EXPIRY = '24h';
const CHALLENGE_EXPIRY_MS = 5 * 60 * 1000;

const challenges = new Map<string, { challenge: string; expiresAt: number }>();

export interface JWTPayload {
  wallet: string;
  tier: string;
  balance: number;
  iat: number;
  exp: number;
}

export function generateChallenge(wallet: string): { challenge: string; expiresAt: number } {
  const challenge = `Sign this message to authenticate with Holder API:\n\nWallet: ${wallet}\nNonce: ${randomBytes(16).toString('hex')}\nTimestamp: ${Date.now()}`;
  const expiresAt = Date.now() + CHALLENGE_EXPIRY_MS;

  challenges.set(wallet, { challenge, expiresAt });

  if (challenges.size > 1000) {
    const now = Date.now();
    for (const [w, c] of challenges) {
      if (c.expiresAt < now) challenges.delete(w);
    }
  }

  return { challenge, expiresAt };
}

export async function verifySignature(
  wallet: string,
  signature: string
): Promise<{ valid: boolean; error?: string }> {
  const stored = challenges.get(wallet);
  if (!stored) {
    return { valid: false, error: 'No challenge found. Request a new challenge.' };
  }

  if (Date.now() > stored.expiresAt) {
    challenges.delete(wallet);
    return { valid: false, error: 'Challenge expired. Request a new challenge.' };
  }

  try {
    const pubkey = new PublicKey(wallet);
    const messageBytes = new TextEncoder().encode(stored.challenge);
    const signatureBytes = bs58.decode(signature);

    const verified = nacl.sign.detached.verify(
      messageBytes,
      signatureBytes,
      pubkey.toBytes()
    );

    if (verified) {
      challenges.delete(wallet);
      return { valid: true };
    }

    return { valid: false, error: 'Invalid signature' };
  } catch (err) {
    logger.warn('Signature verification failed', { wallet, error: String(err) });
    return { valid: false, error: 'Invalid wallet or signature format' };
  }
}

export async function generateApiKey(wallet: string): Promise<{
  apiKey: string;
  tier: string;
  balance: number;
  expiresAt: number;
} | null> {
  const balance = await getTokenBalance(wallet);

  let tier = 'free';
  if (balance >= 1_000_000) tier = 'pro';
  else if (balance >= 100_000) tier = 'companion';

  if (tier !== 'pro') {
    return null;
  }

  const payload: Omit<JWTPayload, 'iat' | 'exp'> = {
    wallet,
    tier,
    balance,
  };

  const apiKey = sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRY });
  const decoded = verify(apiKey, JWT_SECRET) as JWTPayload;

  logger.info('API key generated', { wallet: wallet.slice(0, 8) + '...', tier, balance });

  return {
    apiKey,
    tier,
    balance,
    expiresAt: decoded.exp * 1000,
  };
}

export function verifyApiKey(token: string): JWTPayload | null {
  try {
    const payload = verify(token, JWT_SECRET) as JWTPayload;
    return payload;
  } catch {
    return null;
  }
}

export async function refreshApiKey(wallet: string): Promise<{
  apiKey: string;
  tier: string;
  balance: number;
  expiresAt: number;
} | null> {
  return generateApiKey(wallet);
}
