/*
 * $KAMIYO Burn Utilities
 *
 * Helpers for token burn calculations and API integration.
 */

import {
  KAMIYO_DECIMALS,
  BURN_RATE_BPS,
  KamiyoBurnStats,
  KamiyoTokenStats,
  KamiyoBurnRecord,
} from './swarm-types.js';

/**
 * Format raw token amount to human-readable string.
 * @param rawAmount - Raw amount with decimals (bigint or string)
 * @param decimals - Token decimals (default: 6 for KAMIYO)
 * @returns Formatted string (e.g., "1,000.5")
 */
export function formatKamiyoAmount(
  rawAmount: bigint | string,
  decimals: number = KAMIYO_DECIMALS
): string {
  const amount = typeof rawAmount === 'string' ? BigInt(rawAmount) : rawAmount;
  const divisor = BigInt(10 ** decimals);
  const whole = amount / divisor;
  const fraction = amount % divisor;

  if (fraction === 0n) {
    return whole.toLocaleString();
  }

  const fractionStr = fraction
    .toString()
    .padStart(decimals, '0')
    .replace(/0+$/, '');
  return `${whole.toLocaleString()}.${fractionStr}`;
}

/**
 * Parse human-readable amount to raw token amount.
 * @param formatted - Human-readable amount (e.g., "1000.5")
 * @param decimals - Token decimals (default: 6 for KAMIYO)
 * @returns Raw amount as bigint
 */
export function parseKamiyoAmount(
  formatted: string,
  decimals: number = KAMIYO_DECIMALS
): bigint {
  const clean = formatted.replace(/,/g, '');
  const parts = clean.split('.');
  const whole = BigInt(parts[0] || '0');
  const fraction = parts[1] || '';
  const paddedFraction = fraction.padEnd(decimals, '0').slice(0, decimals);
  return whole * BigInt(10 ** decimals) + BigInt(paddedFraction);
}

/**
 * Calculate burn amount from fee (1% by default).
 * @param feeAmount - Total fee amount (raw with decimals)
 * @param burnRateBps - Burn rate in basis points (default: 100 = 1%)
 * @returns Object with burn amount and treasury amount
 */
export function calculateBurnSplit(
  feeAmount: bigint,
  burnRateBps: number = BURN_RATE_BPS
): { burnAmount: bigint; treasuryAmount: bigint } {
  const burnAmount = (feeAmount * BigInt(burnRateBps)) / 10_000n;
  const treasuryAmount = feeAmount - burnAmount;
  return { burnAmount, treasuryAmount };
}

/**
 * API client for fetching $KAMIYO burn statistics.
 */
export class KamiyoAPI {
  private baseUrl: string;

  constructor(baseUrl: string = 'https://api.kamiyo.ai') {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  /**
   * Fetch combined token statistics (on-chain + API burns).
   */
  async getTokenStats(): Promise<KamiyoTokenStats> {
    const res = await fetch(`${this.baseUrl}/api/kamiyo/stats`);
    if (!res.ok) {
      throw new Error(`Failed to fetch token stats: ${res.status}`);
    }
    return res.json() as Promise<KamiyoTokenStats>;
  }

  /**
   * Fetch burn statistics from API usage.
   */
  async getBurnStats(): Promise<KamiyoBurnStats> {
    const res = await fetch(`${this.baseUrl}/api/kamiyo/burns/stats`);
    if (!res.ok) {
      throw new Error(`Failed to fetch burn stats: ${res.status}`);
    }
    return res.json() as Promise<KamiyoBurnStats>;
  }

  /**
   * Fetch burn history with optional filtering.
   */
  async getBurns(options?: {
    source?: string;
    wallet?: string;
    status?: string;
    limit?: number;
    offset?: number;
  }): Promise<{
    burns: KamiyoBurnRecord[];
    stats: KamiyoBurnStats;
    pagination: { limit: number; offset: number; hasMore: boolean };
  }> {
    const params = new URLSearchParams();
    if (options?.source) params.set('source', options.source);
    if (options?.wallet) params.set('wallet', options.wallet);
    if (options?.status) params.set('status', options.status);
    if (options?.limit) params.set('limit', String(options.limit));
    if (options?.offset) params.set('offset', String(options.offset));

    const url = `${this.baseUrl}/api/kamiyo/burns?${params.toString()}`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Failed to fetch burns: ${res.status}`);
    }
    return res.json() as Promise<{
      burns: KamiyoBurnRecord[];
      stats: KamiyoBurnStats;
      pagination: { limit: number; offset: number; hasMore: boolean };
    }>;
  }

  /**
   * Get total burned amount (on-chain supply reduction).
   */
  async getOnChainBurn(): Promise<{
    burned: string;
    burnedFormatted: string;
    currentSupply: string;
    currentSupplyFormatted: string;
  }> {
    const res = await fetch(`${this.baseUrl}/api/kamiyo/burn`);
    if (!res.ok) {
      throw new Error(`Failed to fetch on-chain burn: ${res.status}`);
    }
    return res.json() as Promise<{
      burned: string;
      burnedFormatted: string;
      currentSupply: string;
      currentSupplyFormatted: string;
    }>;
  }
}

/**
 * Default API instance pointing to production.
 */
export const kamiyoApi = new KamiyoAPI();

/**
 * Get burn stats from the default API.
 * Convenience function matching the integration plan.
 * @returns Promise resolving to burn stats
 */
export async function getBurnStats(): Promise<{
  totalBurned: bigint;
  burns24h: bigint;
}> {
  const stats = await kamiyoApi.getBurnStats();
  return {
    totalBurned: BigInt(stats.totalBurnedKamiyo),
    burns24h: BigInt(stats.burns24h),
  };
}
