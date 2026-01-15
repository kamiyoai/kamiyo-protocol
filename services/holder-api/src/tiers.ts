import { Connection, PublicKey } from '@solana/web3.js';
import { balanceCache } from './cache.js';
import { rpcCalls } from './metrics.js';
import { logger } from './logger.js';

const KAMIYO_MINT = new PublicKey(
  process.env.KAMIYO_MINT || 'Gy55EJmheLyDXiZ7k7CW2FhunD1UgjQxQibuBn3Npump'
);
const RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';

const PRO_MIN = parseInt(process.env.PRO_MIN_TOKENS || '1000000', 10);
const COMPANION_MIN = parseInt(process.env.COMPANION_MIN_TOKENS || '100000', 10);

const connection = new Connection(RPC_URL, 'confirmed');

const lastKnownBalances = new Map<string, { balance: number; timestamp: number }>();
const LAST_KNOWN_TTL = 60 * 60 * 1000;

export interface TierConfig {
  name: string;
  minTokens: number;
  apiAccess: boolean;
}

export const TIERS: Record<string, TierConfig> = {
  free: {
    name: 'Free',
    minTokens: 0,
    apiAccess: false,
  },
  companion: {
    name: 'Companion',
    minTokens: COMPANION_MIN,
    apiAccess: false,
  },
  pro: {
    name: 'Pro',
    minTokens: PRO_MIN,
    apiAccess: true,
  },
};

export async function getTokenBalance(wallet: string): Promise<number> {
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

    balanceCache.set(wallet, total);
    lastKnownBalances.set(wallet, { balance: total, timestamp: Date.now() });

    return total;
  } catch (err) {
    rpcCalls.inc({ method: 'getParsedTokenAccountsByOwner', status: 'error' });

    const lastKnown = lastKnownBalances.get(wallet);
    if (lastKnown && Date.now() - lastKnown.timestamp < LAST_KNOWN_TTL) {
      logger.warn('RPC failed, using cached balance', {
        wallet: wallet.slice(0, 8) + '...',
        cachedBalance: lastKnown.balance,
        error: String(err),
      });
      return lastKnown.balance;
    }

    logger.error('RPC failed with no cached balance', {
      wallet: wallet.slice(0, 8) + '...',
      error: String(err),
    });

    return 0;
  }
}

export async function calculateTierFromHoldings(wallet: string): Promise<string> {
  const balance = await getTokenBalance(wallet);

  if (balance >= TIERS.pro.minTokens) return 'pro';
  if (balance >= TIERS.companion.minTokens) return 'companion';
  return 'free';
}

export function getTierConfig(tier: string): TierConfig {
  return TIERS[tier] || TIERS.free;
}
