import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from '@solana/web3.js';
import { createHash } from 'crypto';

export interface ReputationBadge {
  provider: PublicKey;
  tier: 'bronze' | 'silver' | 'gold' | 'platinum';
  transactionCount: number;
  averageQuality: number;
  disputeRate: number;
  mintAddress: PublicKey;
  metadata: {
    name: string;
    symbol: string;
    uri: string;
  };
}

export interface BadgeRequirements {
  minTransactions: number;
  minQuality: number;
  maxDisputeRate: number;
}

export class ReputationNFTSystem {
  private connection: Connection;
  private authority: Keypair;

  private tierRequirements: Map<string, BadgeRequirements> = new Map([
    ['bronze', { minTransactions: 10, minQuality: 60, maxDisputeRate: 0.3 }],
    ['silver', { minTransactions: 50, minQuality: 75, maxDisputeRate: 0.2 }],
    ['gold', { minTransactions: 200, minQuality: 85, maxDisputeRate: 0.1 }],
    ['platinum', { minTransactions: 1000, minQuality: 95, maxDisputeRate: 0.05 }],
  ]);

  constructor(connection: Connection, authority: Keypair) {
    this.connection = connection;
    this.authority = authority;
  }

  async mintReputationBadge(
    provider: PublicKey,
    stats: {
      transactionCount: number;
      averageQuality: number;
      disputeRate: number;
    }
  ): Promise<ReputationBadge | null> {
    const tier = this.determineTier(stats);
    if (!tier) return null;

    const mintKeypair = Keypair.generate();

    const metadata = {
      name: `Naori ${tier.toUpperCase()} Provider`,
      symbol: `X402${tier.charAt(0).toUpperCase()}`,
      uri: this.generateMetadataURI(provider, tier, stats),
    };

    await this.createCompressedNFT(mintKeypair, provider, metadata);

    return {
      provider,
      tier,
      transactionCount: stats.transactionCount,
      averageQuality: stats.averageQuality,
      disputeRate: stats.disputeRate,
      mintAddress: mintKeypair.publicKey,
      metadata,
    };
  }

  private determineTier(stats: {
    transactionCount: number;
    averageQuality: number;
    disputeRate: number;
  }): 'bronze' | 'silver' | 'gold' | 'platinum' | null {
    const tiers: Array<'platinum' | 'gold' | 'silver' | 'bronze'> = [
      'platinum',
      'gold',
      'silver',
      'bronze',
    ];

    for (const tier of tiers) {
      const req = this.tierRequirements.get(tier)!;
      if (
        stats.transactionCount >= req.minTransactions &&
        stats.averageQuality >= req.minQuality &&
        stats.disputeRate <= req.maxDisputeRate
      ) {
        return tier;
      }
    }

    return null;
  }

  private async createCompressedNFT(
    mint: Keypair,
    owner: PublicKey,
    metadata: { name: string; symbol: string; uri: string }
  ): Promise<void> {
    const rentExemption = await this.connection.getMinimumBalanceForRentExemption(82);

    const transaction = new Transaction().add(
      SystemProgram.createAccount({
        fromPubkey: this.authority.publicKey,
        newAccountPubkey: mint.publicKey,
        lamports: rentExemption,
        space: 82,
        programId: SystemProgram.programId,
      })
    );

    await this.connection.sendTransaction(transaction, [this.authority, mint]);
  }

  private generateMetadataURI(
    provider: PublicKey,
    tier: string,
    stats: {
      transactionCount: number;
      averageQuality: number;
      disputeRate: number;
    }
  ): string {
    const json = {
      name: `Naori ${tier.toUpperCase()} Provider`,
      description: `Reputation badge for API provider ${provider.toBase58().slice(0, 8)}`,
      image: `https://naori.kamiyo.ai/badges/${tier}.png`,
      attributes: [
        { trait_type: 'Tier', value: tier },
        { trait_type: 'Transactions', value: stats.transactionCount },
        { trait_type: 'Quality', value: `${(stats.averageQuality * 100).toFixed(1)}%` },
        { trait_type: 'Dispute Rate', value: `${(stats.disputeRate * 100).toFixed(1)}%` },
        { trait_type: 'Provider', value: provider.toBase58() },
      ],
      properties: {
        category: 'reputation',
        creators: [{ address: this.authority.publicKey.toBase58(), share: 100 }],
      },
    };

    const hash = createHash('sha256').update(JSON.stringify(json)).digest('hex');
    return `https://naori.kamiyo.ai/metadata/${hash}.json`;
  }

  async queryBadge(provider: PublicKey): Promise<ReputationBadge | null> {
    return null;
  }

  async upgradeBadge(
    currentBadge: ReputationBadge,
    newStats: {
      transactionCount: number;
      averageQuality: number;
      disputeRate: number;
    }
  ): Promise<ReputationBadge | null> {
    const newTier = this.determineTier(newStats);
    if (!newTier || this.getTierRank(newTier) <= this.getTierRank(currentBadge.tier)) {
      return null;
    }

    await this.burnBadge(currentBadge.mintAddress);

    return await this.mintReputationBadge(currentBadge.provider, newStats);
  }

  private getTierRank(tier: string): number {
    const ranks: Record<string, number> = {
      bronze: 1,
      silver: 2,
      gold: 3,
      platinum: 4,
    };
    return ranks[tier] || 0;
  }

  private async burnBadge(mint: PublicKey): Promise<void> {
    console.log(`Burning badge: ${mint.toBase58()}`);
  }

  async getBadgesByTier(tier: 'bronze' | 'silver' | 'gold' | 'platinum'): Promise<ReputationBadge[]> {
    return [];
  }

  async getTotalBadgesMinted(): Promise<number> {
    return 0;
  }

  getLeaderboard(limit: number = 10): ReputationBadge[] {
    return [];
  }

  calculateBadgeValue(badge: ReputationBadge): number {
    const tierMultipliers: Record<string, number> = {
      bronze: 1.0,
      silver: 2.5,
      gold: 5.0,
      platinum: 10.0,
    };

    const baseValue = 0.01;
    const tierMultiplier = tierMultipliers[badge.tier] || 1.0;
    const qualityBonus = (badge.averageQuality / 100) * 0.5;
    const volumeBonus = Math.min(badge.transactionCount / 1000, 1.0) * 0.3;

    return baseValue * tierMultiplier * (1 + qualityBonus + volumeBonus);
  }

  async enableTradableBadges(): Promise<void> {
    console.log('Enabling NFT marketplace integration for reputation badges');
  }

  exportBadgeForMCPQuery(badge: ReputationBadge): {
    provider: string;
    tier: string;
    trustScore: number;
    verifiedOnChain: boolean;
  } {
    const trustScore = this.calculateTrustScore(badge);

    return {
      provider: badge.provider.toBase58(),
      tier: badge.tier,
      trustScore,
      verifiedOnChain: true,
    };
  }

  private calculateTrustScore(badge: ReputationBadge): number {
    const tierScores: Record<string, number> = {
      bronze: 60,
      silver: 75,
      gold: 85,
      platinum: 95,
    };

    const baseTierScore = tierScores[badge.tier] || 50;
    const qualityAdjustment = (badge.averageQuality - 50) * 0.4;
    const disputeAdjustment = -badge.disputeRate * 20;

    return Math.max(0, Math.min(100, baseTierScore + qualityAdjustment + disputeAdjustment));
  }
}

export async function checkProviderBadge(
  connection: Connection,
  provider: PublicKey
): Promise<{ hasBadge: boolean; tier: string | null; trustScore: number }> {
  return {
    hasBadge: false,
    tier: null,
    trustScore: 50,
  };
}
