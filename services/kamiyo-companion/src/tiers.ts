import { Connection, PublicKey } from '@solana/web3.js';
import { getUserTier, updateUserTier, getOrCreateUser } from './db';

const KAMIYO_MINT = new PublicKey('Gy55EJmheLyDXiZ7k7CW2FhunD1UgjQxQibuBn3Npump');
const RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';

const connection = new Connection(RPC_URL, 'confirmed');

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
  try {
    const pubkey = new PublicKey(wallet);
    const accounts = await connection.getParsedTokenAccountsByOwner(pubkey, {
      mint: KAMIYO_MINT,
    });

    let total = 0;
    for (const account of accounts.value) {
      const amount = account.account.data.parsed.info.tokenAmount.uiAmount;
      if (amount) total += amount;
    }
    return total;
  } catch {
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
  const user = getOrCreateUser(userId, platform);

  // If user has a wallet, check token holdings
  if (wallet) {
    const tierFromHoldings = await calculateTierFromHoldings(wallet);

    // Token holdings give permanent access (no expiry)
    if (tierFromHoldings !== 'free') {
      updateUserTier(userId, tierFromHoldings, 0); // 0 = no expiry (token-based)
      return tierFromHoldings;
    }
  }

  // Otherwise check paid subscription
  const { tier, expired } = getUserTier(userId);

  if (expired) {
    return 'free';
  }

  return tier;
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

// Daily message limit tracking (in-memory, resets on restart)
const dailyMessageCounts = new Map<string, { count: number; date: string }>();

export function checkMessageLimit(userId: string, tier: string): { allowed: boolean; remaining: number } {
  const config = getTierConfig(tier);
  if (config.maxMessagesPerDay === -1) {
    return { allowed: true, remaining: -1 };
  }

  const today = new Date().toISOString().split('T')[0];
  const userCounts = dailyMessageCounts.get(userId);

  if (!userCounts || userCounts.date !== today) {
    dailyMessageCounts.set(userId, { count: 0, date: today });
    return { allowed: true, remaining: config.maxMessagesPerDay };
  }

  const remaining = config.maxMessagesPerDay - userCounts.count;
  return { allowed: remaining > 0, remaining };
}

export function incrementMessageCount(userId: string): void {
  const today = new Date().toISOString().split('T')[0];
  const userCounts = dailyMessageCounts.get(userId) || { count: 0, date: today };

  if (userCounts.date !== today) {
    dailyMessageCounts.set(userId, { count: 1, date: today });
  } else {
    userCounts.count++;
    dailyMessageCounts.set(userId, userCounts);
  }
}
