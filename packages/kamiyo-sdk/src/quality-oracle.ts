/**
 * Quality Oracle - Automated service quality assessment for dispute resolution
 *
 * Provides automated quality assessment that oracles can use to vote on disputes.
 */

import { PublicKey, Connection } from "@solana/web3.js";
import BN from "bn.js";
import {
  QualityAssessment,
  QualityWeights,
  QualityReport,
  SchemaField,
  DEFAULT_QUALITY_WEIGHTS,
  calculateOverallScore,
  generateQualityReport,
  validateSchema,
  checkCompleteness,
  verifyFactualAccuracy,
  createAssessment,
  serializeAssessment,
} from "./quality";
import { EscrowDisputeManager } from "./escrow-dispute";
import {
  CompanionEscrow,
  CompanionEscrowStatus,
  COMPANION_ESCROW_COMMIT_PHASE_DURATION,
} from "./types";

/**
 * Service request specification
 */
export interface ServiceSpec {
  /** Expected output schema */
  schema: Record<string, SchemaField>;
  /** Required fields in response */
  requiredFields: string[];
  /** Optional fields */
  optionalFields?: string[];
  /** Known facts to verify against */
  expectedValues?: Record<string, unknown>;
  /** Numeric tolerance for fact checking */
  tolerance?: Record<string, number>;
  /** Maximum acceptable response time (ms) */
  maxResponseTime?: number;
  /** Maximum acceptable data age (seconds) */
  maxDataAge?: number;
}

/**
 * Service response with metadata
 */
export interface ServiceResponse {
  /** Response data */
  data: unknown;
  /** Response time in milliseconds */
  responseTimeMs: number;
  /** Data timestamp (for freshness) */
  dataTimestamp?: number;
  /** Service provider address */
  provider?: PublicKey;
  /** Request timestamp */
  requestedAt?: number;
}

/**
 * Oracle vote with commitment
 */
export interface OracleVote {
  /** Escrow being disputed */
  escrowPda: PublicKey;
  /** Quality score (0-100) */
  qualityScore: number;
  /** Salt for commitment */
  salt: Uint8Array;
  /** Commitment hash */
  commitmentHash: Uint8Array;
  /** Full quality assessment */
  assessment: QualityAssessment;
  /** Quality report */
  report: QualityReport;
}

/**
 * Pending dispute for oracle processing
 */
export interface PendingDispute {
  escrowPda: PublicKey;
  escrow: CompanionEscrow;
  sessionId: Uint8Array;
  amount: BN;
  disputedAt: number;
  commitPhaseEndsAt: number;
  currentCommitments: number;
  hasVoted: boolean;
}

/**
 * Quality Oracle - Automated quality assessment service
 */
export class QualityOracle {
  private disputeManager: EscrowDisputeManager;
  private weights: QualityWeights;
  private threshold: number;
  private oracleKeypair?: PublicKey;

  constructor(
    connection: Connection,
    wallet: any,
    options: {
      weights?: QualityWeights;
      threshold?: number;
      programId?: PublicKey;
    } = {}
  ) {
    this.disputeManager = new EscrowDisputeManager(
      connection,
      wallet,
      options.programId
    );
    this.weights = options.weights ?? DEFAULT_QUALITY_WEIGHTS;
    this.threshold = options.threshold ?? 70;
    this.oracleKeypair = wallet.publicKey;
  }

  /**
   * Assess service response quality
   */
  assessQuality(
    response: ServiceResponse,
    spec: ServiceSpec
  ): QualityReport {
    // Validate schema
    const schemaResult = validateSchema(response.data, spec.schema);

    // Check completeness
    const completenessResult = checkCompleteness(
      response.data,
      spec.requiredFields,
      spec.optionalFields
    );

    // Verify factual accuracy
    let factualScore = 100;
    if (spec.expectedValues && typeof response.data === "object" && response.data !== null) {
      const factualResult = verifyFactualAccuracy(
        response.data as Record<string, unknown>,
        spec.expectedValues,
        spec.tolerance
      );
      factualScore = factualResult.score;
    }

    // Create assessment
    const assessment = createAssessment({
      factualAccuracy: factualScore,
      schemaCompliance: schemaResult.score,
      completeness: completenessResult.score,
      freshnessTimestamp: response.dataTimestamp ?? Math.floor(Date.now() / 1000),
      maxFreshnessAge: spec.maxDataAge,
      responseTimeMs: response.responseTimeMs,
    });

    return generateQualityReport(assessment, this.threshold, this.weights);
  }

  /**
   * Generate oracle vote for a dispute
   */
  async generateVote(
    escrowPda: PublicKey,
    sessionId: Uint8Array,
    response: ServiceResponse,
    spec: ServiceSpec
  ): Promise<OracleVote> {
    // Assess quality
    const report = this.assessQuality(response, spec);

    // Generate salt and commitment
    const salt = this.disputeManager.generateSalt();
    const commitmentHash = await this.disputeManager.computeCommitmentHash(
      sessionId,
      this.oracleKeypair!,
      report.overallScore,
      salt
    );

    return {
      escrowPda,
      qualityScore: report.overallScore,
      salt,
      commitmentHash,
      assessment: report.assessment,
      report,
    };
  }

  /**
   * Check if oracle should vote on a dispute
   */
  shouldVote(escrow: CompanionEscrow): { should: boolean; reason: string } {
    if (escrow.status !== CompanionEscrowStatus.Disputed) {
      return { should: false, reason: "Escrow is not disputed" };
    }

    if (!this.disputeManager.isInCommitPhase(escrow)) {
      return { should: false, reason: "Not in commit phase" };
    }

    if (this.oracleKeypair && this.disputeManager.hasCommitted(escrow, this.oracleKeypair)) {
      return { should: false, reason: "Already committed" };
    }

    return { should: true, reason: "Ready to vote" };
  }

  /**
   * Check if oracle should reveal vote
   */
  shouldReveal(escrow: CompanionEscrow): { should: boolean; reason: string } {
    if (escrow.status !== CompanionEscrowStatus.Disputed) {
      return { should: false, reason: "Escrow is not disputed" };
    }

    if (!this.disputeManager.isInRevealPhase(escrow)) {
      return { should: false, reason: "Not in reveal phase" };
    }

    if (!this.oracleKeypair) {
      return { should: false, reason: "No oracle keypair" };
    }

    if (!this.disputeManager.hasCommitted(escrow, this.oracleKeypair)) {
      return { should: false, reason: "No commitment found" };
    }

    if (this.disputeManager.hasRevealed(escrow, this.oracleKeypair)) {
      return { should: false, reason: "Already revealed" };
    }

    return { should: true, reason: "Ready to reveal" };
  }

  /**
   * Get pending disputes that need voting
   */
  filterPendingDisputes(
    escrows: Array<{ pda: PublicKey; escrow: CompanionEscrow }>
  ): PendingDispute[] {
    const pending: PendingDispute[] = [];

    for (const { pda, escrow } of escrows) {
      if (escrow.status !== CompanionEscrowStatus.Disputed) continue;
      if (!escrow.commitPhaseEndsAt) continue;

      const hasVoted = this.oracleKeypair
        ? this.disputeManager.hasCommitted(escrow, this.oracleKeypair)
        : false;

      pending.push({
        escrowPda: pda,
        escrow,
        sessionId: escrow.sessionId,
        amount: escrow.amount,
        disputedAt: escrow.disputedAt?.toNumber() ?? 0,
        commitPhaseEndsAt: escrow.commitPhaseEndsAt.toNumber(),
        currentCommitments: escrow.oracleCommitments.length,
        hasVoted,
      });
    }

    // Sort by commit phase ending soonest
    return pending.sort((a, b) => a.commitPhaseEndsAt - b.commitPhaseEndsAt);
  }

  /**
   * Calculate consensus from current submissions
   */
  previewConsensus(escrow: CompanionEscrow): {
    hasConsensus: boolean;
    medianScore: number | null;
    submissionCount: number;
    requiredSubmissions: number;
  } {
    const submissionCount = escrow.oracleSubmissions.length;
    const requiredSubmissions = 3; // MIN_CONSENSUS_ORACLES

    if (submissionCount < requiredSubmissions) {
      return {
        hasConsensus: false,
        medianScore: null,
        submissionCount,
        requiredSubmissions,
      };
    }

    try {
      const result = this.disputeManager.calculateConsensus(escrow.oracleSubmissions);
      return {
        hasConsensus: true,
        medianScore: result.medianScore,
        submissionCount,
        requiredSubmissions,
      };
    } catch {
      return {
        hasConsensus: false,
        medianScore: null,
        submissionCount,
        requiredSubmissions,
      };
    }
  }

  /**
   * Estimate outcome based on quality assessment
   */
  estimateOutcome(report: QualityReport, amount: BN): {
    qualityScore: number;
    refundPercentage: number;
    refundAmount: BN;
    paymentAmount: BN;
    verdict: "user_wins" | "provider_wins" | "partial";
  } {
    const refundPercentage = this.disputeManager.calculateRefundPercentage(
      report.overallScore
    );
    const { refundAmount, paymentAmount } = this.disputeManager.calculateAmounts(
      amount,
      refundPercentage
    );

    let verdict: "user_wins" | "provider_wins" | "partial";
    if (refundPercentage === 100) {
      verdict = "user_wins";
    } else if (refundPercentage === 0) {
      verdict = "provider_wins";
    } else {
      verdict = "partial";
    }

    return {
      qualityScore: report.overallScore,
      refundPercentage,
      refundAmount,
      paymentAmount,
      verdict,
    };
  }

  /**
   * Get dispute manager for direct access
   */
  getDisputeManager(): EscrowDisputeManager {
    return this.disputeManager;
  }

  /**
   * Update quality weights
   */
  setWeights(weights: QualityWeights): void {
    this.weights = weights;
  }

  /**
   * Update quality threshold
   */
  setThreshold(threshold: number): void {
    if (threshold < 0 || threshold > 100) {
      throw new Error("Threshold must be between 0 and 100");
    }
    this.threshold = threshold;
  }

  /**
   * Get current configuration
   */
  getConfig(): { weights: QualityWeights; threshold: number } {
    return {
      weights: { ...this.weights },
      threshold: this.threshold,
    };
  }
}

/**
 * Create a service spec from a simple schema definition
 */
export function createServiceSpec(params: {
  fields: Record<string, { type: SchemaField["type"]; required: boolean }>;
  expectedValues?: Record<string, unknown>;
  maxResponseTime?: number;
  maxDataAge?: number;
}): ServiceSpec {
  const schema: Record<string, SchemaField> = {};
  const requiredFields: string[] = [];
  const optionalFields: string[] = [];

  for (const [name, field] of Object.entries(params.fields)) {
    schema[name] = {
      type: field.type,
      required: field.required,
    };

    if (field.required) {
      requiredFields.push(name);
    } else {
      optionalFields.push(name);
    }
  }

  return {
    schema,
    requiredFields,
    optionalFields,
    expectedValues: params.expectedValues,
    maxResponseTime: params.maxResponseTime,
    maxDataAge: params.maxDataAge,
  };
}
