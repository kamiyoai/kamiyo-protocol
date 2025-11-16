/**
 * Reputation management for x402Resolve
 */

import { Connection, PublicKey, TransactionInstruction } from '@solana/web3.js';
import { Program } from '@coral-xyz/anchor';

export interface EntityReputation {
  entity: PublicKey;
  entityType: 'Agent' | 'Provider';
  totalTransactions: number;
  disputesFiled: number;
  disputesWon: number;
  disputesPartial: number;
  disputesLost: number;
  averageQualityReceived: number;
  reputationScore: number; // 0-1000
  createdAt: number;
  lastUpdated: number;
}

export interface VerificationLevel {
  level: 'Basic' | 'Staked' | 'Social' | 'KYC';
  hourlyLimit: number;
  dailyLimit: number;
}

export class Hyoban {
  constructor(
    private connection: Connection,
    private program: Program,
    private programId: PublicKey
  ) {}

  /**
   * Get reputation PDA address for an entity
   */
  getReputationPDA(entity: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('reputation'), entity.toBuffer()],
      this.programId
    );
  }

  /**
   * Get rate limiter PDA address for an entity
   */
  getRateLimiterPDA(entity: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('rate_limit'), entity.toBuffer()],
      this.programId
    );
  }

  /**
   * Fetch reputation for an entity
   */
  async getReputation(entity: PublicKey): Promise<EntityReputation | null> {
    try {
      const [repPDA] = this.getReputationPDA(entity);
      const account = await (this.program.account as any).entityReputation.fetch(repPDA);
      
      return {
        entity: account.entity,
        entityType: account.entityType.agent ? 'Agent' : 'Provider',
        totalTransactions: account.totalTransactions.toNumber(),
        disputesFiled: account.disputesFiled.toNumber(),
        disputesWon: account.disputesWon.toNumber(),
        disputesPartial: account.disputesPartial.toNumber(),
        disputesLost: account.disputesLost.toNumber(),
        averageQualityReceived: account.averageQualityReceived,
        reputationScore: account.reputationScore,
        createdAt: account.createdAt.toNumber(),
        lastUpdated: account.lastUpdated.toNumber(),
      };
    } catch (error) {
      return null;
    }
  }

  /**
   * Calculate dispute success rate
   */
  getDisputeSuccessRate(reputation: EntityReputation): number {
    const total = reputation.disputesWon + reputation.disputesPartial + reputation.disputesLost;
    if (total === 0) return 0;
    
    // Full wins count as 100%, partial as 50%
    const successScore = reputation.disputesWon + (reputation.disputesPartial * 0.5);
    return (successScore / total) * 100;
  }

  /**
   * Get verification level limits
   */
  getVerificationLevelLimits(level: VerificationLevel['level']): VerificationLevel {
    const limits = {
      Basic: { hourlyLimit: 1, dailyLimit: 10 },
      Staked: { hourlyLimit: 10, dailyLimit: 100 },
      Social: { hourlyLimit: 50, dailyLimit: 500 },
      KYC: { hourlyLimit: 1000, dailyLimit: 10000 },
    };

    return {
      level,
      ...limits[level],
    };
  }

  /**
   * Check if entity can perform action based on rate limits
   */
  async canPerformAction(entity: PublicKey): Promise<boolean> {
    try {
      const [rateLimiterPDA] = this.getRateLimiterPDA(entity);
      const rateLimiter = await (this.program.account as any).rateLimiter.fetch(rateLimiterPDA);
      
      const level = this.getVerificationLevelLimits(
        rateLimiter.verificationLevel.basic ? 'Basic' :
        rateLimiter.verificationLevel.staked ? 'Staked' :
        rateLimiter.verificationLevel.social ? 'Social' : 'KYC'
      );

      return (
        rateLimiter.transactionsLastHour < level.hourlyLimit &&
        rateLimiter.transactionsLastDay < level.dailyLimit
      );
    } catch (error) {
      // No rate limiter exists yet, allow action
      return true;
    }
  }

  /**
   * Calculate dispute cost based on reputation
   */
  calculateDisputeCost(reputation: EntityReputation | null): number {
    if (!reputation || reputation.totalTransactions === 0) {
      return 0.001; // Base cost in SOL
    }

    const disputeRate = (reputation.disputesFiled / reputation.totalTransactions) * 100;
    
    // Escalating cost based on dispute rate
    if (disputeRate <= 20) return 0.001;
    if (disputeRate <= 40) return 0.002;
    if (disputeRate <= 60) return 0.005;
    return 0.01;
  }
}
