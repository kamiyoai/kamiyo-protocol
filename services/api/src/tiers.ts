import { PublicKey } from '@solana/web3.js';
import { getUserTier, updateUserTier, getOrCreateUser, getDailyMessageCount, incrementDailyMessageCount } from './db';
import { tierCache, balanceCache } from './cache';
import { rpcCalls } from './metrics';
import { logger } from './logger';
import { getSolanaConnection } from './solana';

const KAMIYO_MINT = new PublicKey('Gy55EJmheLyDXiZ7k7CW2FhunD1UgjQxQibuBn3Npump');
const connection = getSolanaConnection();

// Long-term balance cache for RPC failure fallback (1 hour)
const lastKnownBalances = new Map<string, { balance: number; timestamp: number }>();
const LAST_KNOWN_TTL = 60 * 60 * 1000; // 1 hour

export interface TierConfig {
  name: string;
  minTokens: number;           // Minimum KAMIYO tokens to hold
  pricePerMonth: number;       // SOL per month (if not holding enough tokens)
  maxMessagesPerDay: number;
  contextMemory: boolean;
  privateMode: boolean;
  researchTasks: boolean;
  apiAccess: boolean;
}

export const TIERS: Record<string, TierConfig> = {
  free: {
    name: 'Free',
    minTokens: 0,
    pricePerMonth: 0,
    maxMessagesPerDay: 10,
    contextMemory: false,
    privateMode: false,
    researchTasks: false,
    apiAccess: false,
  },
  companion: {
    name: 'Companion',
    minTokens: 100_000,        // 100K KAMIYO = free Companion tier
    pricePerMonth: 0.5,        // 0.5 SOL/month if not holding tokens
    maxMessagesPerDay: 100,
    contextMemory: true,
    privateMode: true,
    researchTasks: false,
    apiAccess: false,
  },
  pro: {
    name: 'Companion Pro',
    minTokens: 1_000_000,      // 1M KAMIYO = free Pro tier
    pricePerMonth: 1.0,        // 1 SOL/month if not holding tokens
    maxMessagesPerDay: -1,     // Unlimited
    contextMemory: true,
    privateMode: true,
    researchTasks: true,
    apiAccess: true,
  },
};

export async function getTokenBalance(wallet: string): Promise<number> {
  // Check short-term cache first
  const cached = balanceCache.get(wallet);
  if (cached !== undefined) {
    return cached;
  }

  try {
    const pubkey = new PublicKey(wallet);
    rpcCalls.inc({ method: 'getParsedTokenAccountsByOwner', status: 'attempt' });

    const accounts = await connection.getParsedTokenAccountsByOwner(pubkey, {
      mint: KAMIYO_MINT,
    });

    rpcCalls.inc({ method: 'getParsedTokenAccountsByOwner', status: 'success' });

    let total = 0;
    for (const account of accounts.value) {
      const amount = account.account.data.parsed.info.tokenAmount.uiAmount;
      if (amount) total += amount;
    }

    // Cache the result (both short-term and long-term)
    balanceCache.set(wallet, total);
    lastKnownBalances.set(wallet, { balance: total, timestamp: Date.now() });

    return total;
  } catch (err) {
    rpcCalls.inc({ method: 'getParsedTokenAccountsByOwner', status: 'error' });

    // On RPC failure, use last known balance if available and not too old
    const lastKnown = lastKnownBalances.get(wallet);
    if (lastKnown && Date.now() - lastKnown.timestamp < LAST_KNOWN_TTL) {
      logger.warn('RPC failed, using cached balance', {
        wallet: wallet.slice(0, 8) + '...',
        cachedBalance: lastKnown.balance,
        cacheAge: Math.floor((Date.now() - lastKnown.timestamp) / 1000) + 's',
        error: String(err),
      });
      return lastKnown.balance;
    }

    // No valid cache - log error but don't downgrade immediately
    // Return -1 to indicate error (caller should handle gracefully)
    logger.error('RPC failed with no cached balance', {
      wallet: wallet.slice(0, 8) + '...',
      error: String(err),
    });

    // Return 0 only as last resort - but caller should check tier from DB first
    return 0;
  }
}

export async function calculateTierFromHoldings(wallet: string): Promise<string> {
  const balance = await getTokenBalance(wallet);

  if (balance >= TIERS.pro.minTokens) return 'pro';
  if (balance >= TIERS.companion.minTokens) return 'companion';
  return 'free';
}

export async function refreshUserTier(userId: string, platform: string, wallet: string | null): Promise<string> {
  // Check cache first
  const cacheKey = `${userId}:${wallet || 'no-wallet'}`;
  const cached = tierCache.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }

  getOrCreateUser(userId, platform);

  // Get existing tier from DB first (as fallback)
  const { tier: existingTier, expired } = getUserTier(userId);
  const currentDbTier = expired ? 'free' : existingTier;

  // If user has a wallet, check token holdings
  if (wallet) {
    const tierFromHoldings = await calculateTierFromHoldings(wallet);

    // Token holdings give permanent access (no expiry)
    if (tierFromHoldings !== 'free') {
      updateUserTier(userId, tierFromHoldings, 0); // 0 = no expiry (token-based)
      tierCache.set(cacheKey, tierFromHoldings);
      return tierFromHoldings;
    }

    // If holdings check returned 'free' but user had a tier,
    // it might be due to RPC failure - keep existing tier as safety net
    if (currentDbTier !== 'free' && !expired) {
      logger.info('Keeping existing tier (RPC may have failed)', {
        userId,
        existingTier: currentDbTier,
      });
      tierCache.set(cacheKey, currentDbTier);
      return currentDbTier;
    }
  }

  // Use paid subscription tier
  tierCache.set(cacheKey, currentDbTier);
  return currentDbTier;
}

// Invalidate tier cache when wallet is linked
export function invalidateTierCache(userId: string): void {
  // Clear any cached entries for this user
  tierCache.delete(`${userId}:no-wallet`);
}

export function getTierConfig(tier: string): TierConfig {
  return TIERS[tier] || TIERS.free;
}

export function canUseFeature(tier: string, feature: keyof TierConfig): boolean {
  const config = getTierConfig(tier);
  const value = config[feature];
  return typeof value === 'boolean' ? value : true;
}

export function getRequiredPayment(tier: string): { sol: number; lamports: number } {
  const config = getTierConfig(tier);
  const sol = config.pricePerMonth;
  return { sol, lamports: Math.floor(sol * 1_000_000_000) };
}

export function checkMessageLimit(userId: string, tier: string): { allowed: boolean; remaining: number } {
  const config = getTierConfig(tier);
  if (config.maxMessagesPerDay === -1) {
    return { allowed: true, remaining: -1 };
  }

  const today = new Date().toISOString().split('T')[0];
  const count = getDailyMessageCount(userId, today);
  const remaining = config.maxMessagesPerDay - count;

  return { allowed: remaining > 0, remaining };
}

export function incrementMessageCount(userId: string): void {
  const today = new Date().toISOString().split('T')[0];
  incrementDailyMessageCount(userId, today);
}
