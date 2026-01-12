/**
 * Copy Trading with Reputation Checks
 *
 * Enforces tier-based limits before executing copy trades.
 * Queries on-chain ZK reputation to determine agent eligibility.
 */

import { ReputationClient, Tier, TIER_THRESHOLDS, createSepoliaClient } from './reputation';

export interface CopyLimits {
  maxCopiers: number;
  maxTotalValue: number;  // USD
  maxLeverage: number;
}

// Tier-based copy trading limits
export const TIER_LIMITS: Record<Tier, CopyLimits> = {
  [Tier.Unverified]: {
    maxCopiers: 0,
    maxTotalValue: 0,
    maxLeverage: 0,
  },
  [Tier.Bronze]: {
    maxCopiers: 10,
    maxTotalValue: 10_000,
    maxLeverage: 3,
  },
  [Tier.Silver]: {
    maxCopiers: 50,
    maxTotalValue: 100_000,
    maxLeverage: 5,
  },
  [Tier.Gold]: {
    maxCopiers: 200,
    maxTotalValue: 500_000,
    maxLeverage: 10,
  },
  [Tier.Platinum]: {
    maxCopiers: 1000,
    maxTotalValue: 5_000_000,
    maxLeverage: 20,
  },
};

const TIER_NAMES = ['Unverified', 'Bronze', 'Silver', 'Gold', 'Platinum'];

export interface CopyTradeRequest {
  agentAddress: string;
  copierAddress: string;
  tradeValueUsd: number;
  leverage: number;
}

export interface CopyTradeResult {
  allowed: boolean;
  reason?: string;
  agentTier: Tier;
  limits: CopyLimits;
}

export class CopyTradingGuard {
  private reputation: ReputationClient;
  private activeCopiers: Map<string, Set<string>> = new Map(); // agent -> copiers
  private totalValue: Map<string, number> = new Map(); // agent -> total USD

  constructor(reputationClient?: ReputationClient) {
    this.reputation = reputationClient || createSepoliaClient();
  }

  /**
   * Check if a copy trade is allowed based on agent's ZK-verified tier
   */
  async checkCopyTrade(request: CopyTradeRequest): Promise<CopyTradeResult> {
    const { agentAddress, copierAddress, tradeValueUsd, leverage } = request;

    // Query on-chain tier
    const tier = await this.reputation.getAgentTier(agentAddress);
    const limits = TIER_LIMITS[tier];

    // Check if agent is verified
    if (tier === Tier.Unverified) {
      return {
        allowed: false,
        reason: 'Agent has no verified reputation tier',
        agentTier: tier,
        limits,
      };
    }

    // Check copier limit
    const copiers = this.activeCopiers.get(agentAddress) || new Set();
    if (!copiers.has(copierAddress) && copiers.size >= limits.maxCopiers) {
      return {
        allowed: false,
        reason: `Agent at max copiers (${limits.maxCopiers}) for ${TIER_NAMES[tier]} tier`,
        agentTier: tier,
        limits,
      };
    }

    // Check total value limit
    const currentValue = this.totalValue.get(agentAddress) || 0;
    if (currentValue + tradeValueUsd > limits.maxTotalValue) {
      return {
        allowed: false,
        reason: `Would exceed max value ($${limits.maxTotalValue.toLocaleString()}) for ${TIER_NAMES[tier]} tier`,
        agentTier: tier,
        limits,
      };
    }

    // Check leverage limit
    if (leverage > limits.maxLeverage) {
      return {
        allowed: false,
        reason: `Leverage ${leverage}x exceeds max (${limits.maxLeverage}x) for ${TIER_NAMES[tier]} tier`,
        agentTier: tier,
        limits,
      };
    }

    return {
      allowed: true,
      agentTier: tier,
      limits,
    };
  }

  /**
   * Record a copy trade (call after successful execution)
   */
  recordCopyTrade(agentAddress: string, copierAddress: string, valueUsd: number): void {
    // Track copier
    if (!this.activeCopiers.has(agentAddress)) {
      this.activeCopiers.set(agentAddress, new Set());
    }
    this.activeCopiers.get(agentAddress)!.add(copierAddress);

    // Track value
    const current = this.totalValue.get(agentAddress) || 0;
    this.totalValue.set(agentAddress, current + valueUsd);
  }

  /**
   * Remove a copier (call when they stop copying)
   */
  removeCopier(agentAddress: string, copierAddress: string, valueUsd: number): void {
    this.activeCopiers.get(agentAddress)?.delete(copierAddress);

    const current = this.totalValue.get(agentAddress) || 0;
    this.totalValue.set(agentAddress, Math.max(0, current - valueUsd));
  }

  /**
   * Get current stats for an agent
   */
  getAgentStats(agentAddress: string): { copierCount: number; totalValue: number } {
    return {
      copierCount: this.activeCopiers.get(agentAddress)?.size || 0,
      totalValue: this.totalValue.get(agentAddress) || 0,
    };
  }
}
