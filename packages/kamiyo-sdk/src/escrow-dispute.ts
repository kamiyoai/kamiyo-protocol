/**
 * Escrow Dispute Manager - Dispute resolution for kamiyo-escrow program
 *
 * Handles oracle-based commit-reveal voting for companion escrows.
 */

import { PublicKey, Connection, Keypair, Transaction, SystemProgram } from "@solana/web3.js";
import { BN, Program, AnchorProvider, Wallet } from "@coral-xyz/anchor";
import {
  CompanionEscrow,
  CompanionEscrowStatus,
  CompanionEscrowOracleConfig,
  CompanionOracleSubmission,
  DisputeConsensusResult,
  KAMIYO_ESCROW_PROGRAM_ID,
  COMPANION_ESCROW_COMMIT_PHASE_DURATION,
  COMPANION_ESCROW_REVEAL_PHASE_DURATION,
  COMPANION_ESCROW_MIN_CONSENSUS_ORACLES,
  COMPANION_ESCROW_MAX_SCORE_DEVIATION,
  QUALITY_REFUND_SCALE,
} from "./types";

/**
 * EscrowDisputeManager - Manage disputes for companion escrows
 */
export class EscrowDisputeManager {
  private connection: Connection;
  private wallet: Wallet;
  private programId: PublicKey;

  constructor(
    connection: Connection,
    wallet: Wallet,
    programId: PublicKey = KAMIYO_ESCROW_PROGRAM_ID
  ) {
    this.connection = connection;
    this.wallet = wallet;
    this.programId = programId;
  }

  /**
   * Get escrow PDA
   */
  getEscrowPDA(sessionId: Uint8Array): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("escrow"), sessionId],
      this.programId
    );
  }

  /**
   * Get oracle config PDA
   */
  getOracleConfigPDA(): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("oracle_config")],
      this.programId
    );
  }

  /**
   * Generate a random 32-byte salt for commit-reveal
   */
  generateSalt(): Uint8Array {
    return crypto.getRandomValues(new Uint8Array(32));
  }

  /**
   * Compute commitment hash for commit-reveal voting
   * Hash = SHA256(session_id || oracle_pubkey || quality_score || salt)
   */
  async computeCommitmentHash(
    sessionId: Uint8Array,
    oracle: PublicKey,
    qualityScore: number,
    salt: Uint8Array
  ): Promise<Uint8Array> {
    const data = new Uint8Array([
      ...sessionId,
      ...oracle.toBytes(),
      qualityScore,
      ...salt,
    ]);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    return new Uint8Array(hashBuffer);
  }

  /**
   * Check if escrow is in commit phase
   */
  isInCommitPhase(escrow: CompanionEscrow): boolean {
    if (escrow.status !== CompanionEscrowStatus.Disputed) return false;
    if (!escrow.commitPhaseEndsAt) return false;

    const now = Math.floor(Date.now() / 1000);
    return now < escrow.commitPhaseEndsAt.toNumber();
  }

  /**
   * Check if escrow is in reveal phase
   */
  isInRevealPhase(escrow: CompanionEscrow): boolean {
    if (escrow.status !== CompanionEscrowStatus.Disputed) return false;
    if (!escrow.commitPhaseEndsAt) return false;

    const now = Math.floor(Date.now() / 1000);
    const commitEnds = escrow.commitPhaseEndsAt.toNumber();
    const revealEnds = commitEnds + COMPANION_ESCROW_REVEAL_PHASE_DURATION;

    return now >= commitEnds && now < revealEnds;
  }

  /**
   * Check if reveal phase has ended (ready for finalization)
   */
  isReadyForFinalization(escrow: CompanionEscrow): boolean {
    if (escrow.status !== CompanionEscrowStatus.Disputed) return false;
    if (!escrow.commitPhaseEndsAt) return false;

    const now = Math.floor(Date.now() / 1000);
    const commitEnds = escrow.commitPhaseEndsAt.toNumber();
    const revealEnds = commitEnds + COMPANION_ESCROW_REVEAL_PHASE_DURATION;

    return now >= revealEnds;
  }

  /**
   * Get time remaining in current phase (seconds)
   */
  getPhaseTimeRemaining(escrow: CompanionEscrow): { phase: string; remaining: number } {
    if (escrow.status !== CompanionEscrowStatus.Disputed || !escrow.commitPhaseEndsAt) {
      return { phase: "none", remaining: 0 };
    }

    const now = Math.floor(Date.now() / 1000);
    const commitEnds = escrow.commitPhaseEndsAt.toNumber();
    const revealEnds = commitEnds + COMPANION_ESCROW_REVEAL_PHASE_DURATION;

    if (now < commitEnds) {
      return { phase: "commit", remaining: commitEnds - now };
    }
    if (now < revealEnds) {
      return { phase: "reveal", remaining: revealEnds - now };
    }
    return { phase: "finalization", remaining: 0 };
  }

  /**
   * Calculate consensus from oracle submissions
   */
  calculateConsensus(
    submissions: CompanionOracleSubmission[],
    maxDeviation: number = COMPANION_ESCROW_MAX_SCORE_DEVIATION
  ): DisputeConsensusResult {
    if (submissions.length < COMPANION_ESCROW_MIN_CONSENSUS_ORACLES) {
      throw new Error(
        `At least ${COMPANION_ESCROW_MIN_CONSENSUS_ORACLES} submissions required for consensus`
      );
    }

    // Sort by quality score for median calculation
    const sorted = [...submissions].sort((a, b) => a.qualityScore - b.qualityScore);
    const scores = sorted.map((s) => s.qualityScore);

    // Calculate median
    const midIndex = Math.floor(scores.length / 2);
    const median =
      scores.length % 2 === 0
        ? Math.floor((scores[midIndex - 1] + scores[midIndex]) / 2)
        : scores[midIndex];

    // Identify valid submissions and outliers
    const validSubmissions: CompanionOracleSubmission[] = [];
    const outliers: PublicKey[] = [];

    for (const submission of sorted) {
      if (Math.abs(submission.qualityScore - median) <= maxDeviation) {
        validSubmissions.push(submission);
      } else {
        outliers.push(submission.oracle);
      }
    }

    // Calculate refund percentage based on median score
    const refundPercentage = this.calculateRefundPercentage(median);

    return {
      medianScore: median,
      validSubmissions,
      outliers,
      refundPercentage,
    };
  }

  /**
   * Calculate refund percentage based on quality score
   */
  calculateRefundPercentage(qualityScore: number): number {
    if (qualityScore <= QUALITY_REFUND_SCALE.POOR.maxQuality) {
      return QUALITY_REFUND_SCALE.POOR.refund; // 100%
    }
    if (qualityScore <= QUALITY_REFUND_SCALE.BELOW_AVERAGE.maxQuality) {
      return QUALITY_REFUND_SCALE.BELOW_AVERAGE.refund; // 75%
    }
    if (qualityScore <= QUALITY_REFUND_SCALE.AVERAGE.maxQuality) {
      return QUALITY_REFUND_SCALE.AVERAGE.refund; // 35%
    }
    return QUALITY_REFUND_SCALE.GOOD.refund; // 0%
  }

  /**
   * Calculate refund and payment amounts
   */
  calculateAmounts(
    totalAmount: BN,
    refundPercentage: number
  ): { refundAmount: BN; paymentAmount: BN } {
    const total = totalAmount.toNumber();
    const refund = Math.floor((total * refundPercentage) / 100);
    const payment = total - refund;

    return {
      refundAmount: new BN(refund),
      paymentAmount: new BN(payment),
    };
  }

  /**
   * Check if oracle has already committed
   */
  hasCommitted(escrow: CompanionEscrow, oracle: PublicKey): boolean {
    return escrow.oracleCommitments.some((c) => c.oracle.equals(oracle));
  }

  /**
   * Check if oracle has already revealed
   */
  hasRevealed(escrow: CompanionEscrow, oracle: PublicKey): boolean {
    const commitment = escrow.oracleCommitments.find((c) => c.oracle.equals(oracle));
    return commitment?.revealed ?? false;
  }

  /**
   * Check if oracle has submitted score
   */
  hasSubmitted(escrow: CompanionEscrow, oracle: PublicKey): boolean {
    return escrow.oracleSubmissions.some((s) => s.oracle.equals(oracle));
  }

  /**
   * Get commitment for an oracle
   */
  getCommitment(
    escrow: CompanionEscrow,
    oracle: PublicKey
  ): { commitmentHash: Uint8Array; committedAt: BN; revealed: boolean } | null {
    const commitment = escrow.oracleCommitments.find((c) => c.oracle.equals(oracle));
    if (!commitment) return null;

    return {
      commitmentHash: commitment.commitmentHash,
      committedAt: commitment.committedAt,
      revealed: commitment.revealed,
    };
  }

  /**
   * Get submission for an oracle
   */
  getSubmission(
    escrow: CompanionEscrow,
    oracle: PublicKey
  ): { qualityScore: number; submittedAt: BN } | null {
    const submission = escrow.oracleSubmissions.find((s) => s.oracle.equals(oracle));
    if (!submission) return null;

    return {
      qualityScore: submission.qualityScore,
      submittedAt: submission.submittedAt,
    };
  }

  /**
   * Verify commitment hash matches revealed values
   */
  async verifyCommitment(
    sessionId: Uint8Array,
    oracle: PublicKey,
    qualityScore: number,
    salt: Uint8Array,
    storedHash: Uint8Array
  ): Promise<boolean> {
    const computedHash = await this.computeCommitmentHash(
      sessionId,
      oracle,
      qualityScore,
      salt
    );
    return this.arraysEqual(computedHash, storedHash);
  }

  /**
   * Get status label
   */
  getStatusLabel(status: CompanionEscrowStatus): string {
    switch (status) {
      case CompanionEscrowStatus.Active:
        return "Active";
      case CompanionEscrowStatus.Disputed:
        return "Disputed";
      case CompanionEscrowStatus.Resolved:
        return "Resolved";
      case CompanionEscrowStatus.Released:
        return "Released";
      case CompanionEscrowStatus.Refunded:
        return "Refunded";
      default:
        return "Unknown";
    }
  }

  /**
   * Format escrow info for display
   */
  formatEscrowInfo(escrow: CompanionEscrow): string {
    const lines = [
      `User: ${escrow.user.toBase58()}`,
      `Treasury: ${escrow.treasury.toBase58()}`,
      `Amount: ${escrow.amount.toNumber() / 1e9} SOL`,
      `Status: ${this.getStatusLabel(escrow.status)}`,
      `Created: ${new Date(escrow.createdAt.toNumber() * 1000).toISOString()}`,
    ];

    if (escrow.rating !== null) {
      lines.push(`Rating: ${escrow.rating}/5`);
    }

    if (escrow.status === CompanionEscrowStatus.Disputed) {
      const phase = this.getPhaseTimeRemaining(escrow);
      lines.push(`Phase: ${phase.phase} (${phase.remaining}s remaining)`);
      lines.push(`Commitments: ${escrow.oracleCommitments.length}`);
      lines.push(`Submissions: ${escrow.oracleSubmissions.length}`);
    }

    if (escrow.qualityScore !== null) {
      lines.push(`Quality Score: ${escrow.qualityScore}`);
    }

    if (escrow.refundPercentage !== null) {
      lines.push(`Refund: ${escrow.refundPercentage}%`);
    }

    return lines.join("\n");
  }

  /**
   * Format phase timing info
   */
  formatPhaseInfo(escrow: CompanionEscrow): string {
    if (escrow.status !== CompanionEscrowStatus.Disputed || !escrow.commitPhaseEndsAt) {
      return "Not in dispute";
    }

    const now = Math.floor(Date.now() / 1000);
    const commitEnds = escrow.commitPhaseEndsAt.toNumber();
    const revealEnds = commitEnds + COMPANION_ESCROW_REVEAL_PHASE_DURATION;

    const lines = [
      `Disputed at: ${new Date((escrow.disputedAt?.toNumber() ?? 0) * 1000).toISOString()}`,
      `Commit phase ends: ${new Date(commitEnds * 1000).toISOString()}`,
      `Reveal phase ends: ${new Date(revealEnds * 1000).toISOString()}`,
    ];

    if (now < commitEnds) {
      lines.push(`Current phase: COMMIT (${commitEnds - now}s remaining)`);
    } else if (now < revealEnds) {
      lines.push(`Current phase: REVEAL (${revealEnds - now}s remaining)`);
    } else {
      lines.push(`Current phase: READY FOR FINALIZATION`);
    }

    return lines.join("\n");
  }

  /**
   * Validate quality score
   */
  validateQualityScore(score: number): void {
    if (!Number.isInteger(score) || score < 0 || score > 100) {
      throw new Error("Quality score must be an integer between 0 and 100");
    }
  }

  /**
   * Validate salt
   */
  validateSalt(salt: Uint8Array): void {
    if (salt.length !== 32) {
      throw new Error("Salt must be exactly 32 bytes");
    }
  }

  /**
   * Check if arrays are equal
   */
  private arraysEqual(a: Uint8Array, b: Uint8Array): boolean {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }
}
