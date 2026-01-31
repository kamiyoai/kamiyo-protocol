import type { JobDatabase } from '../db.js';
import type { Badge } from '../types.js';
import type { TierConfig } from '../personality.js';
import type { DKGPublisher } from './dkg-publisher.js';

export type BadgeType = 'reputation-verified' | 'transaction-count' | 'dispute-free';

export interface BadgeDefinition {
  type: BadgeType;
  name: string;
  description: string;
  icon: string;
  tiers: Array<{
    tier: number;
    requirement: string;
    label: string;
  }>;
}

export const BADGE_DEFINITIONS: BadgeDefinition[] = [
  {
    type: 'reputation-verified',
    name: 'Verified Reputation',
    description: 'Agent has verified their reputation tier with a ZK proof',
    icon: '✓',
    tiers: [
      { tier: 25, requirement: 'Bronze tier (25+)', label: 'Bronze Verified' },
      { tier: 50, requirement: 'Silver tier (50+)', label: 'Silver Verified' },
      { tier: 75, requirement: 'Gold tier (75+)', label: 'Gold Verified' },
      { tier: 90, requirement: 'Platinum tier (90+)', label: 'Platinum Verified' },
    ],
  },
  {
    type: 'transaction-count',
    name: 'Transaction Milestone',
    description: 'Agent has completed escrow transactions',
    icon: '$',
    tiers: [
      { tier: 1, requirement: '1 transaction', label: 'First Transaction' },
      { tier: 10, requirement: '10 transactions', label: 'Active Trader' },
      { tier: 50, requirement: '50 transactions', label: 'Power Trader' },
      { tier: 100, requirement: '100 transactions', label: 'Market Maker' },
    ],
  },
  {
    type: 'dispute-free',
    name: 'Dispute-Free',
    description: 'Agent has maintained a clean dispute record',
    icon: '★',
    tiers: [
      { tier: 10, requirement: '10 dispute-free transactions', label: 'Clean Record' },
      { tier: 50, requirement: '50 dispute-free transactions', label: 'Trusted Partner' },
      { tier: 100, requirement: '100 dispute-free transactions', label: 'Elite Partner' },
    ],
  },
];

export interface BadgeServiceConfig {
  db: JobDatabase;
  dkg?: DKGPublisher;
  badgeExpirationDays: number;
}

function generateBadgeId(agentId: string, badgeType: BadgeType, tier: number): string {
  return `${badgeType}-${agentId}-${tier}-${Date.now()}`;
}

export class BadgeService {
  private db: JobDatabase;
  private dkg?: DKGPublisher;
  private badgeExpirationDays: number;

  constructor(config: BadgeServiceConfig) {
    this.db = config.db;
    this.dkg = config.dkg;
    this.badgeExpirationDays = config.badgeExpirationDays;
  }

  async issueReputationBadge(
    agentId: string,
    tierConfig: TierConfig
  ): Promise<Badge | null> {
    const existingBadges = this.db.getBadges(agentId);
    const existingRepBadge = existingBadges.find(
      (b) => b.badgeType === 'reputation-verified' && b.tier >= tierConfig.threshold
    );

    if (existingRepBadge && !this.isExpired(existingRepBadge)) {
      return existingRepBadge;
    }

    const badgeId = generateBadgeId(agentId, 'reputation-verified', tierConfig.threshold);
    const expiresAt = this.badgeExpirationDays > 0
      ? Date.now() + this.badgeExpirationDays * 24 * 60 * 60 * 1000
      : undefined;

    let ual: string | undefined;
    if (this.dkg) {
      try {
        ual = await this.dkg.publishBadge({
          agentId,
          badgeType: 'reputation-verified',
          tier: tierConfig.threshold,
          badgeId,
        });
      } catch (err) {
        console.error('[BadgeService] DKG publish failed:', err);
      }
    }

    this.db.saveBadge({
      badgeId,
      agentId,
      badgeType: 'reputation-verified',
      tier: tierConfig.threshold,
      ual,
      expiresAt,
    });

    const badges = this.db.getBadges(agentId);
    return badges.find((b) => b.badgeId === badgeId) ?? null;
  }

  async issueTransactionBadge(
    agentId: string,
    transactionCount: number
  ): Promise<Badge | null> {
    const definition = BADGE_DEFINITIONS.find((d) => d.type === 'transaction-count');
    if (!definition) return null;

    // Find highest eligible tier
    const eligibleTier = definition.tiers
      .filter((t) => transactionCount >= t.tier)
      .sort((a, b) => b.tier - a.tier)[0];

    if (!eligibleTier) return null;

    const existingBadges = this.db.getBadges(agentId);
    const existingTxBadge = existingBadges.find(
      (b) => b.badgeType === 'transaction-count' && b.tier >= eligibleTier.tier
    );

    if (existingTxBadge && !this.isExpired(existingTxBadge)) {
      return existingTxBadge;
    }

    const badgeId = generateBadgeId(agentId, 'transaction-count', eligibleTier.tier);

    let ual: string | undefined;
    if (this.dkg) {
      try {
        ual = await this.dkg.publishBadge({
          agentId,
          badgeType: 'transaction-count',
          tier: eligibleTier.tier,
          badgeId,
        });
      } catch (err) {
        console.error('[BadgeService] DKG publish failed:', err);
      }
    }

    this.db.saveBadge({
      badgeId,
      agentId,
      badgeType: 'transaction-count',
      tier: eligibleTier.tier,
      ual,
    });

    const badges = this.db.getBadges(agentId);
    return badges.find((b) => b.badgeId === badgeId) ?? null;
  }

  async issueDisputeFreeBadge(
    agentId: string,
    disputeFreeCount: number
  ): Promise<Badge | null> {
    const definition = BADGE_DEFINITIONS.find((d) => d.type === 'dispute-free');
    if (!definition) return null;

    const eligibleTier = definition.tiers
      .filter((t) => disputeFreeCount >= t.tier)
      .sort((a, b) => b.tier - a.tier)[0];

    if (!eligibleTier) return null;

    const existingBadges = this.db.getBadges(agentId);
    const existingBadge = existingBadges.find(
      (b) => b.badgeType === 'dispute-free' && b.tier >= eligibleTier.tier
    );

    if (existingBadge && !this.isExpired(existingBadge)) {
      return existingBadge;
    }

    const badgeId = generateBadgeId(agentId, 'dispute-free', eligibleTier.tier);

    let ual: string | undefined;
    if (this.dkg) {
      try {
        ual = await this.dkg.publishBadge({
          agentId,
          badgeType: 'dispute-free',
          tier: eligibleTier.tier,
          badgeId,
        });
      } catch (err) {
        console.error('[BadgeService] DKG publish failed:', err);
      }
    }

    this.db.saveBadge({
      badgeId,
      agentId,
      badgeType: 'dispute-free',
      tier: eligibleTier.tier,
      ual,
    });

    const badges = this.db.getBadges(agentId);
    return badges.find((b) => b.badgeId === badgeId) ?? null;
  }

  getBadges(agentId: string): Badge[] {
    return this.db.getBadges(agentId).filter((b) => !this.isExpired(b));
  }

  getHighestBadge(agentId: string, badgeType: BadgeType): Badge | null {
    const badges = this.getBadges(agentId).filter((b) => b.badgeType === badgeType);
    if (badges.length === 0) return null;
    return badges.sort((a, b) => b.tier - a.tier)[0];
  }

  formatBadgeDisplay(badge: Badge): string {
    const definition = BADGE_DEFINITIONS.find((d) => d.type === badge.badgeType);
    if (!definition) return `${badge.badgeType} (Tier ${badge.tier})`;

    const tierInfo = definition.tiers.find((t) => t.tier === badge.tier);
    if (!tierInfo) return `${definition.name} (Tier ${badge.tier})`;

    return `${definition.icon} ${tierInfo.label}`;
  }

  formatBadgeList(agentId: string): string {
    const badges = this.getBadges(agentId);
    if (badges.length === 0) {
      return 'No badges earned yet.';
    }

    const lines = badges.map((b) => {
      const display = this.formatBadgeDisplay(b);
      const date = new Date(b.issuedAt).toISOString().split('T')[0];
      return `- ${display} (${date})`;
    });

    return lines.join('\n');
  }

  private isExpired(badge: Badge): boolean {
    if (!badge.expiresAt) return false;
    return Date.now() > badge.expiresAt;
  }

  getBadgeDefinitions(): BadgeDefinition[] {
    return [...BADGE_DEFINITIONS];
  }
}
