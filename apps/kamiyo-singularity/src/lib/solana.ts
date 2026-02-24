import { Connection, PublicKey } from '@solana/web3.js';
import { BN } from '@coral-xyz/anchor';
import { RPC_ENDPOINT, PROGRAM_IDS, MarketIDL } from './programs';
import type { Market, MarketStatus } from '@/types';
import { logger } from '@/lib/logger';

let connection: Connection | null = null;
let cachedEndpoint: string | null = null;

// Allow env override for localnet testing
const getRpcEndpoint = (): string => {
  // NEXT_PUBLIC_ env vars are available on both client and server
  return process.env.NEXT_PUBLIC_RPC_ENDPOINT || RPC_ENDPOINT;
};

export function getConnection(): Connection {
  const endpoint = getRpcEndpoint();
  // Reset if endpoint changed
  if (cachedEndpoint && cachedEndpoint !== endpoint) {
    connection = null;
  }
  if (!connection) {
    connection = new Connection(endpoint, 'confirmed');
    cachedEndpoint = endpoint;
  }
  return connection;
}

export function resetConnection(): void {
  connection = null;
}

// Field names match IDL snake_case (Anchor BorshAccountsCoder preserves IDL naming)
interface OnChainMarket {
  market_id: string;
  question: string;
  description: string;
  category: string;
  authority: PublicKey;
  oracle: PublicKey;
  yes_mint: PublicKey;
  no_mint: PublicKey;
  vault: PublicKey;
  collateral_mint: PublicKey;
  status:
    | { Active: Record<string, never> }
    | { Paused: Record<string, never> }
    | { Resolved: Record<string, never> }
    | { Cancelled: Record<string, never> };
  resolution_deadline: BN;
  trading_end: BN;
  resolved_outcome: number;
  total_collateral: BN;
  total_yes_supply: BN;
  total_no_supply: BN;
  fee_bps: number;
  protocol_fee_share_bps: number;
  protocol_treasury: PublicKey;
  accumulated_fees: BN;
  protocol_fees_withdrawn: BN;
  creator_fees_withdrawn: BN;
  bump: number;
  yes_mint_bump: number;
  no_mint_bump: number;
  vault_bump: number;
  created_at: BN;
  resolved_at: BN;
}

function parseMarketStatus(status: OnChainMarket['status']): MarketStatus {
  if ('Active' in status) return 'active';
  if ('Paused' in status) return 'paused';
  if ('Resolved' in status) return 'resolved';
  if ('Cancelled' in status) return 'cancelled';
  return 'active';
}

function calculateProbability(yesSupply: BN, noSupply: BN): number {
  const yes = yesSupply.toNumber();
  const no = noSupply.toNumber();
  const total = yes + no;
  if (total === 0) return 0.5;
  return yes / total;
}

export function transformOnChainMarket(
  account: OnChainMarket,
  pubkey: PublicKey
): Market {
  const probability = calculateProbability(
    account.total_yes_supply,
    account.total_no_supply
  );

  const totalCollateral = account.total_collateral.toNumber() / 1e6; // USDC decimals
  const yesSupply = account.total_yes_supply.toNumber() / 1e6;
  const noSupply = account.total_no_supply.toNumber() / 1e6;

  return {
    id: pubkey.toBase58(),
    address: pubkey.toBase58(),
    question: account.question,
    description: account.description,
    category: account.category,
    status: parseMarketStatus(account.status),
    createdAt: new Date(account.created_at.toNumber() * 1000).toISOString(),
    tradingEnd: new Date(account.trading_end.toNumber() * 1000).toISOString(),
    resolutionDeadline: new Date(account.resolution_deadline.toNumber() * 1000).toISOString(),
    resolvedAt: account.resolved_at.toNumber() > 0
      ? new Date(account.resolved_at.toNumber() * 1000).toISOString()
      : undefined,
    yesPrice: probability,
    noPrice: 1 - probability,
    yesSupply,
    noSupply,
    volume24h: totalCollateral,
    totalVolume: totalCollateral,
    totalCollateral,
    feeBps: account.fee_bps,
    oracle: account.oracle.toBase58(),
    collateralMint: account.collateral_mint.toBase58(),
    yesMint: account.yes_mint.toBase58(),
    noMint: account.no_mint.toBase58(),
    outcomes: [
      {
        label: 'Yes',
        probability: probability,
      },
      {
        label: 'No',
        probability: 1 - probability,
      },
    ],
    frequency: 'daily',
  };
}

export async function fetchAllMarkets(): Promise<Market[]> {
  const conn = getConnection();

  try {
    // Fetch all program accounts for the market program
    const accounts = await conn.getProgramAccounts(PROGRAM_IDS.market, {
      commitment: 'confirmed',
    });

    if (accounts.length === 0) {
      return [];
    }

    // We need to decode the accounts using Anchor's BorshAccountsCoder
    // For now, return empty - accounts exist but need proper decoding
    // In production, use @coral-xyz/anchor's Program class with IDL
    const markets: Market[] = [];

    for (const { pubkey, account } of accounts) {
      try {
        // Skip accounts that are too small to be markets
        if (account.data.length < 200) continue;

        // Decode using Anchor coder
        const { BorshAccountsCoder } = await import('@coral-xyz/anchor');
        const coder = new BorshAccountsCoder(MarketIDL as never);

        // Try to decode as Market account (name must match IDL exactly)
        const decoded = coder.decode('Market', account.data) as OnChainMarket;
        if (decoded && decoded.market_id) {
          markets.push(transformOnChainMarket(decoded, pubkey));
        }
      } catch {
        // Not a market account or decode failed, skip
        continue;
      }
    }

    return markets;
  } catch (error) {
    logger.error('Failed to fetch markets from chain:', error);
    return [];
  }
}

export async function fetchMarket(marketPubkey: string): Promise<Market | null> {
  const conn = getConnection();

  try {
    const pubkey = new PublicKey(marketPubkey);
    const accountInfo = await conn.getAccountInfo(pubkey);

    if (!accountInfo) {
      return null;
    }

    const { BorshAccountsCoder } = await import('@coral-xyz/anchor');
    const coder = new BorshAccountsCoder(MarketIDL as never);
    const decoded = coder.decode('Market', accountInfo.data) as OnChainMarket;

    return transformOnChainMarket(decoded, pubkey);
  } catch (error) {
    logger.error('Failed to fetch market:', error);
    return null;
  }
}

export function getMarketPDA(marketId: string): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('market'), Buffer.from(marketId)],
    PROGRAM_IDS.market
  );
}
