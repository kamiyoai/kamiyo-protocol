// Wallet authentication and JWT management

import { sign, verify } from 'jsonwebtoken';
import { PublicKey } from '@solana/web3.js';
import nacl from 'tweetnacl';
import bs58 from 'bs58';
import { randomBytes } from 'crypto';
import { getTokenBalance } from '../tiers';
import { logger } from '../logger';

// JWT_SECRET must be set in production - fail startup if missing
if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required');
}
const JWT_SECRET: string = process.env.JWT_SECRET;

const JWT_EXPIRY = '24h';
const CHALLENGE_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes
const CHALLENGE_MAX_SIZE = 10000; // Maximum stored challenges
const CHALLENGE_CLEANUP_INTERVAL = 60 * 1000; // 1 minute

// In-memory challenge store with cleanup
const challenges = new Map<string, { challenge: string; expiresAt: number }>();

// Rate limit challenge generation per wallet (max 5 per minute)
const challengeRateLimits = new Map<string, { count: number; resetAt: number }>();
const CHALLENGE_RATE_LIMIT = 5;
const CHALLENGE_RATE_WINDOW = 60 * 1000; // 1 minute

// Periodic cleanup of expired challenges
let cleanupInterval: NodeJS.Timeout | null = null;

export function startChallengeCleanup(): void {
  if (cleanupInterval) return;
  cleanupInterval = setInterval(() => {
    const now = Date.now();
    let cleaned = 0;
    for (const [wallet, entry] of challenges) {
      if (entry.expiresAt < now) {
        challenges.delete(wallet);
        cleaned++;
      }
    }
    // Also clean up rate limit entries
    for (const [wallet, entry] of challengeRateLimits) {
      if (entry.resetAt < now) {
        challengeRateLimits.delete(wallet);
      }
    }
    if (cleaned > 0) {
      logger.debug('Cleaned expired challenges', { count: cleaned });
    }
  }, CHALLENGE_CLEANUP_INTERVAL);
}

export function stopChallengeCleanup(): void {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }
}

function isChallengeLimited(wallet: string): boolean {
  const now = Date.now();
  let entry = challengeRateLimits.get(wallet);

  if (!entry || entry.resetAt < now) {
    entry = { count: 0, resetAt: now + CHALLENGE_RATE_WINDOW };
    challengeRateLimits.set(wallet, entry);
  }

  return entry.count >= CHALLENGE_RATE_LIMIT;
}

function incrementChallengeCount(wallet: string): void {
  const now = Date.now();
  let entry = challengeRateLimits.get(wallet);

  if (!entry || entry.resetAt < now) {
    entry = { count: 1, resetAt: now + CHALLENGE_RATE_WINDOW };
  } else {
    entry.count++;
  }

  challengeRateLimits.set(wallet, entry);
}

export interface JWTPayload {
  wallet: string;
  tier: string;
  balance: number;
  iat: number;
  exp: number;
}

export function generateChallenge(wallet: string): { challenge: string; expiresAt: number } | null {
  // Check rate limit
  if (isChallengeLimited(wallet)) {
    logger.warn('Challenge rate limited', { wallet: wallet.slice(0, 8) });
    return null;
  }

  // Check if we're at capacity - reject new challenges if so
  if (challenges.size >= CHALLENGE_MAX_SIZE) {
    logger.warn('Challenge store at capacity', { size: challenges.size });
    return null;
  }

  const challenge = `Sign this message to authenticate with KAMIYO API:\n\nWallet: ${wallet}\nNonce: ${randomBytes(16).toString('hex')}\nTimestamp: ${Date.now()}`;
  const expiresAt = Date.now() + CHALLENGE_EXPIRY_MS;

  challenges.set(wallet, { challenge, expiresAt });
  incrementChallengeCount(wallet);

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
    return null; // API access requires pro tier
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
  // Re-check balance on refresh
  return generateApiKey(wallet);
}

// Generate a wallet-only JWT (no tier/balance requirements)
export function generateWalletToken(wallet: string): string {
  const payload: Omit<JWTPayload, 'iat' | 'exp'> = {
    wallet,
    tier: 'wallet',
    balance: 0,
  };
  return sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRY });
}
