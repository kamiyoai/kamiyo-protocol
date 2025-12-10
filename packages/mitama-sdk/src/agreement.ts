/**
 * Agreement (Escrow) Management - Conflict Resolution
 */

import { PublicKey } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import { MitamaClient } from "./client";
import {
  Agreement,
  AgreementStatus,
  CreateAgreementParams,
  ResolutionResult,
  QUALITY_REFUND_SCALE,
  MIN_TIME_LOCK_SECONDS,
  MAX_TIME_LOCK_SECONDS,
} from "./types";

/**
 * Agreement Manager - High-level agreement/escrow operations
 */
export class AgreementManager {
  constructor(private client: MitamaClient) {}

  /**
   * Create a new agreement between agent and provider
   */
  async create(
    provider: PublicKey,
    amountSol: number,
    timeLockHours: number,
    transactionId: string,
    tokenMint?: PublicKey
  ): Promise<{ signature: string; pda: PublicKey }> {
    const timeLockSeconds = timeLockHours * 3600;

    if (timeLockSeconds < MIN_TIME_LOCK_SECONDS) {
      throw new Error(`Time lock must be at least ${MIN_TIME_LOCK_SECONDS / 3600} hour(s)`);
    }
    if (timeLockSeconds > MAX_TIME_LOCK_SECONDS) {
      throw new Error(`Time lock must be at most ${MAX_TIME_LOCK_SECONDS / 86400} days`);
    }

    const params: CreateAgreementParams = {
      provider,
      amount: new BN(amountSol * 1e9),
      timeLockSeconds: new BN(timeLockSeconds),
      transactionId,
      tokenMint,
    };

    const signature = await this.client.createAgreement(params);
    const [pda] = this.client.getAgreementPDA(transactionId);

    return { signature, pda };
  }

  /**
   * Get agreement by transaction ID
   */
  async getByTransactionId(transactionId: string): Promise<Agreement | null> {
    return this.client.getAgreementByTransactionId(transactionId);
  }

  /**
   * Release funds to provider (happy path - agent satisfied)
   */
  async releaseFunds(
    transactionId: string,
    provider: PublicKey
  ): Promise<string> {
    return this.client.releaseFunds(transactionId, provider);
  }

  /**
   * Mark agreement as disputed (trigger conflict resolution)
   */
  async dispute(transactionId: string): Promise<string> {
    return this.client.markDisputed(transactionId);
  }

  /**
   * Get agreement status
   */
  async getStatus(transactionId: string): Promise<AgreementStatus | null> {
    const agreement = await this.getByTransactionId(transactionId);
    return agreement?.status ?? null;
  }

  /**
   * Check if agreement is expired
   */
  async isExpired(transactionId: string): Promise<boolean> {
    const agreement = await this.getByTransactionId(transactionId);
    if (!agreement) return false;

    const now = Math.floor(Date.now() / 1000);
    return now >= agreement.expiresAt.toNumber();
  }

  /**
   * Get time remaining until expiry
   */
  async getTimeRemaining(transactionId: string): Promise<number | null> {
    const agreement = await this.getByTransactionId(transactionId);
    if (!agreement) return null;

    const now = Math.floor(Date.now() / 1000);
    const expiresAt = agreement.expiresAt.toNumber();
    return Math.max(0, expiresAt - now);
  }

  /**
   * Get agreement PDA
   */
  getPDA(transactionId: string): PublicKey {
    const [pda] = this.client.getAgreementPDA(transactionId);
    return pda;
  }

  /**
   * Calculate expected resolution based on quality score
   */
  calculateResolution(
    amount: BN,
    qualityScore: number
  ): ResolutionResult {
    let refundPercentage: number;

    if (qualityScore <= QUALITY_REFUND_SCALE.POOR.maxQuality) {
      refundPercentage = QUALITY_REFUND_SCALE.POOR.refund;
    } else if (qualityScore <= QUALITY_REFUND_SCALE.BELOW_AVERAGE.maxQuality) {
      refundPercentage = QUALITY_REFUND_SCALE.BELOW_AVERAGE.refund;
    } else if (qualityScore <= QUALITY_REFUND_SCALE.AVERAGE.maxQuality) {
      refundPercentage = QUALITY_REFUND_SCALE.AVERAGE.refund;
    } else {
      refundPercentage = QUALITY_REFUND_SCALE.GOOD.refund;
    }

    const amountNum = amount.toNumber();
    const refundAmount = Math.floor((amountNum * refundPercentage) / 100);
    const paymentAmount = amountNum - refundAmount;

    return {
      qualityScore,
      refundPercentage,
      refundAmount: new BN(refundAmount),
      paymentAmount: new BN(paymentAmount),
    };
  }

  /**
   * Generate unique transaction ID
   */
  generateTransactionId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 10);
    return `${timestamp}-${random}`;
  }

  /**
   * Get human-readable status
   */
  getStatusLabel(status: AgreementStatus): string {
    switch (status) {
      case AgreementStatus.Active:
        return "Active";
      case AgreementStatus.Released:
        return "Released";
      case AgreementStatus.Disputed:
        return "Disputed";
      case AgreementStatus.Resolved:
        return "Resolved";
      default:
        return "Unknown";
    }
  }

  /**
   * Format time remaining
   */
  formatTimeRemaining(seconds: number): string {
    if (seconds <= 0) return "Expired";

    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    if (hours >= 24) {
      const days = Math.floor(hours / 24);
      return `${days}d ${hours % 24}h`;
    }
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  }
}
