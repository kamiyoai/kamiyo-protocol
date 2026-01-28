/**
 * Dispute resolution for kamiyo-escrow program.
 * Handles oracle-based commit-reveal voting.
 */

import {
  PublicKey,
  Connection,
  Keypair,
  Transaction,
  SystemProgram,
  TransactionInstruction,
  SendTransactionError,
} from "@solana/web3.js";
import { BN, Program, AnchorProvider, Wallet, Idl } from "@coral-xyz/anchor";
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

// Instruction discriminators from IDL
const DISCRIMINATORS = {
  markDisputed: Buffer.from([136, 86, 152, 120, 3, 21, 223, 251]),
  commitVote: Buffer.from([134, 97, 90, 126, 91, 66, 16, 26]),
  revealVote: Buffer.from([100, 157, 139, 17, 186, 75, 185, 149]),
  finalizeDispute: Buffer.from([190, 211, 17, 122, 247, 157, 27, 223]),
  disputedTimeoutRelease: Buffer.from([206, 179, 158, 86, 140, 59, 139, 243]),
};

const COMMITMENT_DOMAIN = new TextEncoder().encode("kamiyo-escrow-v1:commit");
const TX_CONFIRMATION_TIMEOUT_MS = 60000;

export interface TransactionResult {
  signature: string;
  confirmed: boolean;
}

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

  getEscrowPDA(sessionId: Uint8Array): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("escrow"), sessionId],
      this.programId
    );
  }

  getOracleConfigPDA(): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("oracle_config")],
      this.programId
    );
  }

  generateSalt(): Uint8Array {
    return crypto.getRandomValues(new Uint8Array(32));
  }

  async computeCommitmentHash(
    sessionId: Uint8Array,
    oracle: PublicKey,
    qualityScore: number,
    salt: Uint8Array
  ): Promise<Uint8Array> {
    // Validate inputs
    if (sessionId.length !== 32) {
      throw new Error("Session ID must be 32 bytes");
    }
    if (salt.length !== 32) {
      throw new Error("Salt must be 32 bytes");
    }
    if (qualityScore < 0 || qualityScore > 100) {
      throw new Error("Quality score must be 0-100");
    }

    const oracleBytes = oracle.toBytes();
    const data = new Uint8Array([
      ...COMMITMENT_DOMAIN,
      sessionId.length,
      ...sessionId,
      oracleBytes.length,
      ...oracleBytes,
      qualityScore,
      salt.length,
      ...salt,
    ]);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    return new Uint8Array(hashBuffer);
  }

  async getClusterTime(): Promise<number> {
    try {
      const slot = await this.connection.getSlot("confirmed");
      const blockTime = await this.connection.getBlockTime(slot);
      if (blockTime !== null) return blockTime;
    } catch {}
    return Math.floor(Date.now() / 1000);
  }

  isInCommitPhase(escrow: CompanionEscrow): boolean {
    if (escrow.status !== CompanionEscrowStatus.Disputed) return false;
    if (!escrow.commitPhaseEndsAt) return false;

    const now = Math.floor(Date.now() / 1000);
    return now < escrow.commitPhaseEndsAt.toNumber();
  }

  async isInCommitPhaseAsync(escrow: CompanionEscrow): Promise<boolean> {
    if (escrow.status !== CompanionEscrowStatus.Disputed) return false;
    if (!escrow.commitPhaseEndsAt) return false;

    const now = await this.getClusterTime();
    return now < escrow.commitPhaseEndsAt.toNumber();
  }

  isInRevealPhase(escrow: CompanionEscrow): boolean {
    if (escrow.status !== CompanionEscrowStatus.Disputed) return false;
    if (!escrow.commitPhaseEndsAt) return false;

    const now = Math.floor(Date.now() / 1000);
    const commitEnds = escrow.commitPhaseEndsAt.toNumber();
    const revealEnds = commitEnds + COMPANION_ESCROW_REVEAL_PHASE_DURATION;

    return now >= commitEnds && now < revealEnds;
  }

  async isInRevealPhaseAsync(escrow: CompanionEscrow): Promise<boolean> {
    if (escrow.status !== CompanionEscrowStatus.Disputed) return false;
    if (!escrow.commitPhaseEndsAt) return false;

    const now = await this.getClusterTime();
    const commitEnds = escrow.commitPhaseEndsAt.toNumber();
    const revealEnds = commitEnds + COMPANION_ESCROW_REVEAL_PHASE_DURATION;

    return now >= commitEnds && now < revealEnds;
  }

  isReadyForFinalization(escrow: CompanionEscrow): boolean {
    if (escrow.status !== CompanionEscrowStatus.Disputed) return false;
    if (!escrow.commitPhaseEndsAt) return false;

    const now = Math.floor(Date.now() / 1000);
    const commitEnds = escrow.commitPhaseEndsAt.toNumber();
    const revealEnds = commitEnds + COMPANION_ESCROW_REVEAL_PHASE_DURATION;

    return now >= revealEnds;
  }

  async isReadyForFinalizationAsync(escrow: CompanionEscrow): Promise<boolean> {
    if (escrow.status !== CompanionEscrowStatus.Disputed) return false;
    if (!escrow.commitPhaseEndsAt) return false;

    const now = await this.getClusterTime();
    const commitEnds = escrow.commitPhaseEndsAt.toNumber();
    const revealEnds = commitEnds + COMPANION_ESCROW_REVEAL_PHASE_DURATION;

    return now >= revealEnds;
  }

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

  async getPhaseTimeRemainingAsync(
    escrow: CompanionEscrow
  ): Promise<{ phase: string; remaining: number }> {
    if (escrow.status !== CompanionEscrowStatus.Disputed || !escrow.commitPhaseEndsAt) {
      return { phase: "none", remaining: 0 };
    }

    const now = await this.getClusterTime();
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

  // ============================================================
  // Transaction Builders - Submit actual on-chain transactions
  // ============================================================

  /**
   * Fetch escrow account data
   */
  async fetchEscrow(escrowPda: PublicKey): Promise<CompanionEscrow | null> {
    const accountInfo = await this.connection.getAccountInfo(escrowPda);
    if (!accountInfo) return null;

    // Skip 8-byte discriminator
    const data = accountInfo.data.slice(8);
    return this.deserializeEscrow(data);
  }

  /**
   * Fetch oracle config account data
   */
  async fetchOracleConfig(): Promise<CompanionEscrowOracleConfig | null> {
    const [configPda] = this.getOracleConfigPDA();
    const accountInfo = await this.connection.getAccountInfo(configPda);
    if (!accountInfo) return null;

    // Skip 8-byte discriminator
    const data = accountInfo.data.slice(8);
    return this.deserializeOracleConfig(data);
  }

  /**
   * Mark an escrow as disputed (user only)
   */
  async markDisputed(escrowPda: PublicKey): Promise<TransactionResult> {
    const instruction = new TransactionInstruction({
      keys: [
        { pubkey: this.wallet.publicKey, isSigner: true, isWritable: false },
        { pubkey: escrowPda, isSigner: false, isWritable: true },
      ],
      programId: this.programId,
      data: DISCRIMINATORS.markDisputed,
    });

    return this.sendTransaction([instruction]);
  }

  /**
   * Commit a quality score hash for a disputed escrow (oracle only)
   */
  async commitVote(
    escrowPda: PublicKey,
    commitmentHash: Uint8Array
  ): Promise<TransactionResult> {
    if (commitmentHash.length !== 32) {
      throw new Error("Commitment hash must be 32 bytes");
    }

    const [oracleConfigPda] = this.getOracleConfigPDA();

    // Build instruction data: discriminator + commitment_hash
    const data = Buffer.concat([
      DISCRIMINATORS.commitVote,
      Buffer.from(commitmentHash),
    ]);

    const instruction = new TransactionInstruction({
      keys: [
        { pubkey: this.wallet.publicKey, isSigner: true, isWritable: false },
        { pubkey: escrowPda, isSigner: false, isWritable: true },
        { pubkey: oracleConfigPda, isSigner: false, isWritable: false },
      ],
      programId: this.programId,
      data,
    });

    return this.sendTransaction([instruction]);
  }

  /**
   * Reveal a previously committed vote (oracle only)
   */
  async revealVote(
    escrowPda: PublicKey,
    qualityScore: number,
    salt: Uint8Array
  ): Promise<TransactionResult> {
    this.validateQualityScore(qualityScore);
    this.validateSalt(salt);

    const [oracleConfigPda] = this.getOracleConfigPDA();

    // Build instruction data: discriminator + quality_score (u8) + salt ([u8; 32])
    const data = Buffer.concat([
      DISCRIMINATORS.revealVote,
      Buffer.from([qualityScore]),
      Buffer.from(salt),
    ]);

    const instruction = new TransactionInstruction({
      keys: [
        { pubkey: this.wallet.publicKey, isSigner: true, isWritable: false },
        { pubkey: escrowPda, isSigner: false, isWritable: true },
        { pubkey: oracleConfigPda, isSigner: false, isWritable: false },
      ],
      programId: this.programId,
      data,
    });

    return this.sendTransaction([instruction]);
  }

  /**
   * Finalize a dispute after reveal phase ends (permissionless)
   */
  async finalizeDispute(escrowPda: PublicKey): Promise<TransactionResult> {
    const escrow = await this.fetchEscrow(escrowPda);
    if (!escrow) {
      throw new Error("Escrow not found");
    }

    const [oracleConfigPda] = this.getOracleConfigPDA();

    const instruction = new TransactionInstruction({
      keys: [
        { pubkey: escrow.user, isSigner: false, isWritable: true },
        { pubkey: escrow.treasury, isSigner: false, isWritable: true },
        { pubkey: escrowPda, isSigner: false, isWritable: true },
        { pubkey: oracleConfigPda, isSigner: false, isWritable: false },
      ],
      programId: this.programId,
      data: DISCRIMINATORS.finalizeDispute,
    });

    return this.sendTransaction([instruction]);
  }

  /**
   * Commit and prepare for reveal in one call
   * Returns the salt needed for reveal
   * Idempotent: returns existing commitment if already committed
   */
  async commitVoteWithScore(
    escrowPda: PublicKey,
    qualityScore: number
  ): Promise<{ result: TransactionResult; salt: Uint8Array; alreadyCommitted: boolean }> {
    this.validateQualityScore(qualityScore);

    const escrow = await this.fetchEscrow(escrowPda);
    if (!escrow) {
      throw new Error("Escrow not found");
    }

    // Check if already committed (idempotency)
    if (this.hasCommitted(escrow, this.wallet.publicKey)) {
      const commitment = this.getCommitment(escrow, this.wallet.publicKey);
      return {
        result: { signature: "", confirmed: true },
        salt: new Uint8Array(32), // Cannot recover salt - caller should have stored it
        alreadyCommitted: true,
      };
    }

    const salt = this.generateSalt();
    const commitmentHash = await this.computeCommitmentHash(
      escrow.sessionId,
      this.wallet.publicKey,
      qualityScore,
      salt
    );

    const result = await this.commitVote(escrowPda, commitmentHash);
    return { result, salt, alreadyCommitted: false };
  }

  /**
   * Release a disputed escrow after 72h timeout if oracles fail
   */
  async disputedTimeoutRelease(escrowPda: PublicKey): Promise<TransactionResult> {
    const escrow = await this.fetchEscrow(escrowPda);
    if (!escrow) {
      throw new Error("Escrow not found");
    }

    const [oracleConfigPda] = this.getOracleConfigPDA();

    const instruction = new TransactionInstruction({
      keys: [
        { pubkey: escrow.user, isSigner: false, isWritable: true },
        { pubkey: escrowPda, isSigner: false, isWritable: true },
        { pubkey: oracleConfigPda, isSigner: false, isWritable: false },
      ],
      programId: this.programId,
      data: DISCRIMINATORS.disputedTimeoutRelease,
    });

    return this.sendTransaction([instruction]);
  }

  /**
   * Send transaction and wait for confirmation with timeout
   */
  private async sendTransaction(
    instructions: TransactionInstruction[]
  ): Promise<TransactionResult> {
    const transaction = new Transaction();
    transaction.add(...instructions);

    const { blockhash, lastValidBlockHeight } =
      await this.connection.getLatestBlockhash("confirmed");
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = this.wallet.publicKey;

    // Sign with wallet
    const signed = await this.wallet.signTransaction(transaction);

    // Send transaction
    const signature = await this.connection.sendRawTransaction(
      signed.serialize(),
      { skipPreflight: false }
    );

    // Confirm with timeout using AbortController
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => {
      abortController.abort();
    }, TX_CONFIRMATION_TIMEOUT_MS);

    try {
      const confirmation = await this.connection.confirmTransaction(
        {
          signature,
          blockhash,
          lastValidBlockHeight,
          abortSignal: abortController.signal,
        },
        "confirmed"
      );

      if (confirmation.value.err) {
        throw new SendTransactionError({
          action: "send",
          signature,
          transactionMessage: `Transaction failed: ${JSON.stringify(confirmation.value.err)}`,
        });
      }

      return { signature, confirmed: true };
    } catch (error: any) {
      if (error.name === "AbortError") {
        throw new Error(
          `Transaction confirmation timed out after ${TX_CONFIRMATION_TIMEOUT_MS}ms. ` +
            `Signature: ${signature}. Check transaction status manually.`
        );
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Ensure buffer has enough bytes for read operation
   */
  private ensureBytes(data: Buffer, offset: number, needed: number): void {
    if (offset + needed > data.length) {
      throw new Error(
        `Buffer underflow: need ${needed} bytes at offset ${offset}, but only ${data.length - offset} available`
      );
    }
  }

  /**
   * Deserialize escrow account data with bounds checking
   */
  private deserializeEscrow(data: Buffer): CompanionEscrow {
    const minSize = 32 + 32 + 32 + 8 + 8 + 1 + 1; // Minimum fixed fields
    if (data.length < minSize) {
      throw new Error(`Invalid escrow data: expected at least ${minSize} bytes, got ${data.length}`);
    }

    let offset = 0;

    this.ensureBytes(data, offset, 32);
    const user = new PublicKey(data.slice(offset, offset + 32));
    offset += 32;

    this.ensureBytes(data, offset, 32);
    const treasury = new PublicKey(data.slice(offset, offset + 32));
    offset += 32;

    this.ensureBytes(data, offset, 32);
    const sessionId = new Uint8Array(data.slice(offset, offset + 32));
    offset += 32;

    this.ensureBytes(data, offset, 8);
    const amount = new BN(data.slice(offset, offset + 8), "le");
    offset += 8;

    this.ensureBytes(data, offset, 8);
    const createdAt = new BN(data.slice(offset, offset + 8), "le");
    offset += 8;

    this.ensureBytes(data, offset, 1);
    const bump = data[offset];
    offset += 1;

    this.ensureBytes(data, offset, 1);
    const status = data[offset] as CompanionEscrowStatus;
    offset += 1;

    // Option<u8> rating
    this.ensureBytes(data, offset, 1);
    const hasRating = data[offset] === 1;
    offset += 1;
    let rating: number | null = null;
    if (hasRating) {
      this.ensureBytes(data, offset, 1);
      rating = data[offset];
      offset += 1;
    }

    // Option<i64> disputed_at
    this.ensureBytes(data, offset, 1);
    const hasDisputedAt = data[offset] === 1;
    offset += 1;
    let disputedAt: BN | null = null;
    if (hasDisputedAt) {
      this.ensureBytes(data, offset, 8);
      disputedAt = new BN(data.slice(offset, offset + 8), "le");
      offset += 8;
    }

    // Option<i64> commit_phase_ends_at
    this.ensureBytes(data, offset, 1);
    const hasCommitPhaseEndsAt = data[offset] === 1;
    offset += 1;
    let commitPhaseEndsAt: BN | null = null;
    if (hasCommitPhaseEndsAt) {
      this.ensureBytes(data, offset, 8);
      commitPhaseEndsAt = new BN(data.slice(offset, offset + 8), "le");
      offset += 8;
    }

    // Vec<OracleCommitment>
    this.ensureBytes(data, offset, 4);
    const commitmentsLen = data.readUInt32LE(offset);
    offset += 4;

    // Sanity check: max 5 oracles per escrow
    if (commitmentsLen > 5) {
      throw new Error(`Invalid commitments count: ${commitmentsLen}`);
    }

    const oracleCommitments = [];
    for (let i = 0; i < commitmentsLen; i++) {
      this.ensureBytes(data, offset, 32 + 32 + 8 + 1);
      const oracle = new PublicKey(data.slice(offset, offset + 32));
      offset += 32;
      const commitmentHash = new Uint8Array(data.slice(offset, offset + 32));
      offset += 32;
      const committedAt = new BN(data.slice(offset, offset + 8), "le");
      offset += 8;
      const revealed = data[offset] === 1;
      offset += 1;
      oracleCommitments.push({ oracle, commitmentHash, committedAt, revealed });
    }

    // Vec<OracleSubmission>
    this.ensureBytes(data, offset, 4);
    const submissionsLen = data.readUInt32LE(offset);
    offset += 4;

    // Sanity check: max 5 oracles per escrow
    if (submissionsLen > 5) {
      throw new Error(`Invalid submissions count: ${submissionsLen}`);
    }

    const oracleSubmissions = [];
    for (let i = 0; i < submissionsLen; i++) {
      this.ensureBytes(data, offset, 32 + 1 + 8);
      const oracle = new PublicKey(data.slice(offset, offset + 32));
      offset += 32;
      const qualityScore = data[offset];
      offset += 1;
      const submittedAt = new BN(data.slice(offset, offset + 8), "le");
      offset += 8;
      oracleSubmissions.push({ oracle, qualityScore, submittedAt });
    }

    // Option<u8> quality_score
    this.ensureBytes(data, offset, 1);
    const hasQualityScore = data[offset] === 1;
    offset += 1;
    let qualityScore: number | null = null;
    if (hasQualityScore) {
      this.ensureBytes(data, offset, 1);
      qualityScore = data[offset];
      offset += 1;
    }

    // Option<u8> refund_percentage
    this.ensureBytes(data, offset, 1);
    const hasRefundPercentage = data[offset] === 1;
    offset += 1;
    let refundPercentage: number | null = null;
    if (hasRefundPercentage) {
      this.ensureBytes(data, offset, 1);
      refundPercentage = data[offset];
    }

    return {
      user,
      treasury,
      sessionId,
      amount,
      createdAt,
      bump,
      status,
      rating,
      disputedAt,
      commitPhaseEndsAt,
      oracleCommitments,
      oracleSubmissions,
      qualityScore,
      refundPercentage,
    };
  }

  /**
   * Deserialize oracle config account data
   */
  private deserializeOracleConfig(data: Buffer): CompanionEscrowOracleConfig {
    let offset = 0;

    const admin = new PublicKey(data.slice(offset, offset + 32));
    offset += 32;

    const minConsensus = data[offset];
    offset += 1;

    const maxScoreDeviation = data[offset];
    offset += 1;

    const commitDuration = new BN(data.slice(offset, offset + 8), "le");
    offset += 8;

    const revealDuration = new BN(data.slice(offset, offset + 8), "le");
    offset += 8;

    const bump = data[offset];
    offset += 1;

    // Vec<Pubkey> registered_oracles
    const oraclesLen = data.readUInt32LE(offset);
    offset += 4;
    const registeredOracles = [];
    for (let i = 0; i < oraclesLen; i++) {
      registeredOracles.push(new PublicKey(data.slice(offset, offset + 32)));
      offset += 32;
    }

    return {
      admin,
      minConsensus,
      maxScoreDeviation,
      commitDuration,
      revealDuration,
      bump,
      registeredOracles,
    };
  }
}
