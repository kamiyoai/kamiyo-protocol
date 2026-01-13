import { ReputationClient, Tier, TIER_THRESHOLDS, createSepoliaClient } from './reputation';

export interface CopyLimits {
  maxCopiers: number;
  maxTotalValue: number;  // USD
  maxLeverage: number;
}

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

  async checkCopyTrade(request: CopyTradeRequest): Promise<CopyTradeResult> {
    const { agentAddress, copierAddress, tradeValueUsd, leverage } = request;
    const tier = await this.reputation.getAgentTier(agentAddress);
    const limits = TIER_LIMITS[tier];

    if (tier === Tier.Unverified) {
      return {
        allowed: false,
        reason: 'Agent has no verified reputation tier',
        agentTier: tier,
        limits,
      };
    }

    const copiers = this.activeCopiers.get(agentAddress) || new Set();
    if (!copiers.has(copierAddress) && copiers.size >= limits.maxCopiers) {
      return {
        allowed: false,
        reason: `Agent at max copiers (${limits.maxCopiers}) for ${TIER_NAMES[tier]} tier`,
        agentTier: tier,
        limits,
      };
    }

    const currentValue = this.totalValue.get(agentAddress) || 0;
    if (currentValue + tradeValueUsd > limits.maxTotalValue) {
      return {
        allowed: false,
        reason: `Would exceed max value ($${limits.maxTotalValue.toLocaleString()}) for ${TIER_NAMES[tier]} tier`,
        agentTier: tier,
        limits,
      };
    }

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

  recordCopyTrade(agentAddress: string, copierAddress: string, valueUsd: number): void {
    if (!this.activeCopiers.has(agentAddress)) {
      this.activeCopiers.set(agentAddress, new Set());
    }
    this.activeCopiers.get(agentAddress)!.add(copierAddress);

    const current = this.totalValue.get(agentAddress) || 0;
    this.totalValue.set(agentAddress, current + valueUsd);
  }

  removeCopier(agentAddress: string, copierAddress: string, valueUsd: number): void {
    this.activeCopiers.get(agentAddress)?.delete(copierAddress);

    const current = this.totalValue.get(agentAddress) || 0;
    this.totalValue.set(agentAddress, Math.max(0, current - valueUsd));
  }

  getAgentStats(agentAddress: string): { copierCount: number; totalValue: number } {
    return {
      copierCount: this.activeCopiers.get(agentAddress)?.size || 0,
      totalValue: this.totalValue.get(agentAddress) || 0,
    };
  }
}
