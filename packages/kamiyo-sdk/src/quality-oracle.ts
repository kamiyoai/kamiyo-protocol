import { PublicKey, Connection } from "@solana/web3.js";
import BN from "bn.js";
import {
  QualityAssessment,
  QualityWeights,
  QualityReport,
  SchemaField,
  DEFAULT_QUALITY_WEIGHTS,
  generateQualityReport,
  validateSchema,
  checkCompleteness,
  verifyFactualAccuracy,
  createAssessment,
} from "./quality";
import { EscrowDisputeManager } from "./escrow-dispute";
import {
  CompanionEscrow,
  CompanionEscrowStatus,
} from "./types";

export interface ServiceSpec {
  schema: Record<string, SchemaField>;
  requiredFields: string[];
  optionalFields?: string[];
  expectedValues?: Record<string, unknown>;
  tolerance?: Record<string, number>;
  maxResponseTime?: number;
  maxDataAge?: number;
}

export interface ServiceResponse {
  data: unknown;
  responseTimeMs: number;
  dataTimestamp?: number;
  provider?: PublicKey;
  requestedAt?: number;
}

export interface OracleVote {
  escrowPda: PublicKey;
  qualityScore: number;
  salt: Uint8Array;
  commitmentHash: Uint8Array;
  assessment: QualityAssessment;
  report: QualityReport;
}

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

export class QualityOracle {
  private disputeManager: EscrowDisputeManager;
  private weights: QualityWeights;
  private threshold: number;
  private oraclePubkey?: PublicKey;

  constructor(
    connection: Connection,
    wallet: { publicKey?: PublicKey } | undefined | null,
    options: {
      weights?: QualityWeights;
      threshold?: number;
      programId?: PublicKey;
    } = {}
  ) {
    this.disputeManager = new EscrowDisputeManager(
      connection,
      wallet as any,
      options.programId
    );
    this.weights = options.weights ?? DEFAULT_QUALITY_WEIGHTS;
    const t = options.threshold ?? 70;
    if (t < 0 || t > 100) throw new Error("threshold must be 0-100");
    this.threshold = t;
    this.oraclePubkey = wallet?.publicKey;
  }

  assessQuality(
    response: ServiceResponse,
    spec: ServiceSpec
  ): QualityReport {
    const schemaResult = validateSchema(response.data, spec.schema);

    const completenessResult = checkCompleteness(
      response.data,
      spec.requiredFields,
      spec.optionalFields
    );

    let factualScore = 100;
    if (spec.expectedValues && typeof response.data === "object" && response.data !== null) {
      const factual = verifyFactualAccuracy(
        response.data as Record<string, unknown>,
        spec.expectedValues,
        spec.tolerance
      );
      factualScore = factual.score;
    }

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

  async generateVote(
    escrowPda: PublicKey,
    sessionId: Uint8Array,
    response: ServiceResponse,
    spec: ServiceSpec
  ): Promise<OracleVote> {
    if (!this.oraclePubkey) throw new Error("Missing oracle public key");

    const report = this.assessQuality(response, spec);
    const salt = this.disputeManager.generateSalt();
    const commitmentHash = await this.disputeManager.computeCommitmentHash(
      sessionId,
      this.oraclePubkey,
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

  shouldVote(escrow: CompanionEscrow): { should: boolean; reason: string } {
    if (escrow.status !== CompanionEscrowStatus.Disputed) {
      return { should: false, reason: "Escrow is not disputed" };
    }

    if (!this.disputeManager.isInCommitPhase(escrow)) {
      return { should: false, reason: "Not in commit phase" };
    }

    if (this.oraclePubkey && this.disputeManager.hasCommitted(escrow, this.oraclePubkey)) {
      return { should: false, reason: "Already committed" };
    }

    return { should: true, reason: "Ready to vote" };
  }

  shouldReveal(escrow: CompanionEscrow): { should: boolean; reason: string } {
    if (escrow.status !== CompanionEscrowStatus.Disputed) {
      return { should: false, reason: "Escrow is not disputed" };
    }

    if (!this.disputeManager.isInRevealPhase(escrow)) {
      return { should: false, reason: "Not in reveal phase" };
    }

    if (!this.oraclePubkey) {
      return { should: false, reason: "No oracle key" };
    }

    if (!this.disputeManager.hasCommitted(escrow, this.oraclePubkey)) {
      return { should: false, reason: "No commitment found" };
    }

    if (this.disputeManager.hasRevealed(escrow, this.oraclePubkey)) {
      return { should: false, reason: "Already revealed" };
    }

    return { should: true, reason: "Ready to reveal" };
  }

  filterPendingDisputes(
    escrows: Array<{ pda: PublicKey; escrow: CompanionEscrow }>
  ): PendingDispute[] {
    const pending: PendingDispute[] = [];

    for (const { pda, escrow } of escrows) {
      if (escrow.status !== CompanionEscrowStatus.Disputed) continue;
      if (!escrow.commitPhaseEndsAt) continue;

      const hasVoted = this.oraclePubkey
        ? this.disputeManager.hasCommitted(escrow, this.oraclePubkey)
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

    return pending.sort((a, b) => a.commitPhaseEndsAt - b.commitPhaseEndsAt);
  }

  previewConsensus(escrow: CompanionEscrow): {
    hasConsensus: boolean;
    medianScore: number | null;
    submissionCount: number;
    requiredSubmissions: number;
  } {
    const submissionCount = escrow.oracleSubmissions.length;
    const requiredSubmissions = 3;

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
    if (refundPercentage === 100) verdict = "user_wins";
    else if (refundPercentage === 0) verdict = "provider_wins";
    else verdict = "partial";

    return {
      qualityScore: report.overallScore,
      refundPercentage,
      refundAmount,
      paymentAmount,
      verdict,
    };
  }

  getDisputeManager(): EscrowDisputeManager {
    return this.disputeManager;
  }

  setWeights(weights: QualityWeights): void {
    this.weights = weights;
  }

  setThreshold(threshold: number): void {
    if (threshold < 0 || threshold > 100) throw new Error("Threshold must be 0-100");
    this.threshold = threshold;
  }

  getConfig(): { weights: QualityWeights; threshold: number } {
    return {
      weights: { ...this.weights },
      threshold: this.threshold,
    };
  }
}

export function createServiceSpec(params: {
  fields: Record<string, { type: SchemaField["type"]; required: boolean }>;
  expectedValues?: Record<string, unknown>;
  maxResponseTime?: number;
  maxDataAge?: number;
}): {
  schema: Record<string, SchemaField>;
  requiredFields: string[];
  optionalFields?: string[];
  expectedValues?: Record<string, unknown>;
  maxResponseTime?: number;
  maxDataAge?: number;
} {
  const schema: Record<string, SchemaField> = {};
  const requiredFields: string[] = [];
  const optionalFields: string[] = [];

  for (const [name, field] of Object.entries(params.fields)) {
    schema[name] = { type: field.type, required: field.required };
    if (field.required) requiredFields.push(name);
    else optionalFields.push(name);
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
