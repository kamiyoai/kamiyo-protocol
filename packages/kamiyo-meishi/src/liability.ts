import { PublicKey } from '@solana/web3.js';
import { MeishiClient } from './client.js';
import type { LiabilityAllocation, SetLiabilityParams } from './types.js';

const BPS_TOTAL = 10000;

export class LiabilityManager {
  constructor(private client: MeishiClient) {}

  async get(
    passportAddress: PublicKey,
    counterparty: PublicKey
  ): Promise<LiabilityAllocation | null> {
    return this.client.getLiability(passportAddress, counterparty);
  }

  getAddress(passportAddress: PublicKey, counterparty: PublicKey): PublicKey {
    const [pda] = this.client.getLiabilityPDA(passportAddress, counterparty);
    return pda;
  }

  isValid(allocation: LiabilityAllocation): boolean {
    const now = Math.floor(Date.now() / 1000);
    return allocation.expiresAt.toNumber() > now;
  }

  isBalanced(allocation: LiabilityAllocation): boolean {
    const total =
      allocation.consumerLiabilityBps +
      allocation.developerLiabilityBps +
      allocation.merchantLiabilityBps +
      allocation.platformLiabilityBps;
    return total === BPS_TOTAL;
  }

  calculateLiabilityUsd(
    allocation: LiabilityAllocation,
    disputeAmountUsd: number
  ): {
    consumer: number;
    developer: number;
    merchant: number;
    platform: number;
    capped: boolean;
  } {
    const maxUsd = allocation.maxLiabilityUsd.toNumber() / 1_000_000;
    const effectiveAmount = Math.min(disputeAmountUsd, maxUsd);
    const capped = disputeAmountUsd > maxUsd;

    return {
      consumer: (effectiveAmount * allocation.consumerLiabilityBps) / BPS_TOTAL,
      developer: (effectiveAmount * allocation.developerLiabilityBps) / BPS_TOTAL,
      merchant: (effectiveAmount * allocation.merchantLiabilityBps) / BPS_TOTAL,
      platform: (effectiveAmount * allocation.platformLiabilityBps) / BPS_TOTAL,
      capped,
    };
  }

  static validateBps(consumer: number, developer: number, merchant: number, platform: number): boolean {
    return consumer + developer + merchant + platform === BPS_TOTAL;
  }

  /**
   * Generate a suggested liability split based on transaction context.
   */
  static suggestAllocation(context: {
    agentComplianceScore: number;
    merchantVerified: boolean;
    transactionAmountUsd: number;
    humanApproved: boolean;
  }): { consumer: number; developer: number; merchant: number; platform: number } {
    // High compliance + human approved = consumer has more responsibility
    // Low compliance = developer bears more risk
    // Unverified merchant = merchant bears more
    const { agentComplianceScore, merchantVerified, humanApproved } = context;

    if (humanApproved) {
      // Human explicitly approved — consumer takes primary responsibility
      return {
        consumer: 6000,
        developer: 1000,
        merchant: merchantVerified ? 2000 : 3000,
        platform: merchantVerified ? 1000 : 0,
      };
    }

    if (agentComplianceScore >= 800) {
      // Highly compliant agent — balanced split
      return {
        consumer: 3000,
        developer: 2000,
        merchant: merchantVerified ? 3000 : 4000,
        platform: merchantVerified ? 2000 : 1000,
      };
    }

    if (agentComplianceScore >= 400) {
      // Moderate compliance — developer takes more
      return {
        consumer: 2000,
        developer: 4000,
        merchant: merchantVerified ? 2500 : 3500,
        platform: merchantVerified ? 1500 : 500,
      };
    }

    // Low compliance — developer bears most risk
    return {
      consumer: 1000,
      developer: 6000,
      merchant: merchantVerified ? 2000 : 3000,
      platform: merchantVerified ? 1000 : 0,
    };
  }
}
