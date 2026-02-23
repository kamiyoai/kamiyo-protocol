import type { X402Program } from '../solana/anchor.js';
import {
  buildTruthCourtCommittee,
  executeTruthCourtGauntlet,
  TruthCourtEngine,
  type TruthCourtCaseInput,
  type TruthCourtCommitteeOptions,
  type TruthCourtGauntletResult,
  type TruthCourtOracle,
  type TruthCourtOracleResponse,
  type TruthCourtReplayBundle,
  type TruthCourtReplayReport,
  type TruthCourtScenarioName,
  type TruthCourtVerdict,
  verifyTruthCourtReplayBundle,
} from '../truth-court/index.js';
import { fileDispute } from './dispute.js';

export interface FileDisputeWithTruthCourtParams {
  transactionId: string;
  qualityScore: number;
  refundPercentage: number;
  claimant: string;
  respondent?: string;
  missionTag?: string;
  evidence: Record<string, unknown>;
  featureVector: Record<string, unknown>;
  context?: string;
  markOnChain?: boolean;
  minValidResponses?: number;
  includeGrok?: boolean;
  includeOpenClaw?: boolean;
  includeNanoClaw?: boolean;
  includeIronClaw?: boolean;
}

export interface FileDisputeWithTruthCourtOptions extends TruthCourtCommitteeOptions {
  oracles?: TruthCourtOracle[];
}

export interface RunTruthCourtGauntletParams {
  rounds?: number;
  seed?: number;
  scenarioMix?: TruthCourtScenarioName[];
  counterfactualsPerRound?: number;
  claimant?: string;
  respondent?: string;
  includeGrok?: boolean;
  includeOpenClaw?: boolean;
  includeNanoClaw?: boolean;
  includeIronClaw?: boolean;
  policyMode?: 'default' | 'strict';
  minValidResponses?: number;
}

export interface RunTruthCourtGauntletResult extends TruthCourtGauntletResult {}

export interface FileDisputeWithTruthCourtResult {
  success: boolean;
  disputeId?: string;
  committee?: {
    oracleCount: number;
    includesGrok: boolean;
    providers: string[];
    finalVerdict?: string;
    confidence?: number;
    caseHash: string;
    evidenceHash: string;
    featureHash: string;
    committeeHash?: string;
    replayBundle?: TruthCourtReplayBundle;
    voteBreakdown: Record<string, number>;
    summary?: string;
    slashingRecommendations: Array<{
      oracle: string;
      severity: string;
      reason: string;
    }>;
  };
  onChain?: {
    submitted: boolean;
    signature?: string;
    refundPercentage?: number;
    message?: string;
  };
  error?: string;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function computeCommitteeRefund(
  requested: number,
  qualityScore: number,
  verdict: TruthCourtVerdict
): number {
  if (verdict === 'provider_wins') {
    return 0;
  }

  if (verdict === 'insufficient_evidence') {
    return clamp(Math.round(requested * 0.25), 0, 25);
  }

  if (verdict === 'split') {
    return clamp(Math.round((requested + (100 - qualityScore)) / 2), 10, 70);
  }

  return clamp(Math.max(requested, 100 - qualityScore), 30, 100);
}

function toCaseInput(params: FileDisputeWithTruthCourtParams): TruthCourtCaseInput {
  return {
    transactionId: params.transactionId,
    claimant: params.claimant,
    respondent: params.respondent,
    missionTag: params.missionTag,
    qualityScore: params.qualityScore,
    requestedRefundPercentage: params.refundPercentage,
    evidence: params.evidence,
    featureVector: params.featureVector,
    context: params.context,
  };
}

export async function fileDisputeWithTruthCourt(
  params: FileDisputeWithTruthCourtParams,
  program?: X402Program,
  options: FileDisputeWithTruthCourtOptions = {}
): Promise<FileDisputeWithTruthCourtResult> {
  if (!params.transactionId) {
    return { success: false, error: 'transactionId is required' };
  }
  if (!params.claimant) {
    return { success: false, error: 'claimant is required' };
  }
  if (params.qualityScore < 0 || params.qualityScore > 100) {
    return { success: false, error: 'qualityScore must be between 0 and 100' };
  }
  if (params.refundPercentage < 0 || params.refundPercentage > 100) {
    return { success: false, error: 'refundPercentage must be between 0 and 100' };
  }
  if (!params.evidence || typeof params.evidence !== 'object') {
    return { success: false, error: 'evidence must be an object' };
  }
  if (!params.featureVector || typeof params.featureVector !== 'object') {
    return { success: false, error: 'featureVector must be an object' };
  }

  const caseInput = toCaseInput(params);
  const committee = options.oracles ?? buildTruthCourtCommittee({
    ...options,
    includeGrok: params.includeGrok ?? options.includeGrok,
    includeOpenClaw: params.includeOpenClaw ?? options.includeOpenClaw,
    includeNanoClaw: params.includeNanoClaw ?? options.includeNanoClaw,
    includeIronClaw: params.includeIronClaw ?? options.includeIronClaw,
  });
  const engine = new TruthCourtEngine(committee);
  const decision = await engine.evaluate(caseInput, {
    minValidResponses: params.minValidResponses,
  });

  const includesGrok = decision.acceptedResponses.some(
    (entry) => entry.provider === 'xai'
  );
  const providers = Array.from(
    new Set(decision.acceptedResponses.map((entry) => entry.provider))
  ).sort();

  const result: FileDisputeWithTruthCourtResult = {
    success: decision.success,
    disputeId: params.transactionId,
    committee: {
      oracleCount: committee.length,
      includesGrok,
      providers,
      finalVerdict: decision.finalVerdict,
      confidence: decision.confidence,
      caseHash: decision.caseHash,
      evidenceHash: decision.evidenceHash,
      featureHash: decision.featureHash,
      committeeHash: decision.committeeHash,
      replayBundle: decision.replayBundle,
      voteBreakdown: decision.voteBreakdown,
      summary: decision.summary,
      slashingRecommendations: decision.slashingRecommendations,
    },
  };

  if (!decision.success || !decision.finalVerdict) {
    return {
      ...result,
      success: false,
      error: decision.error ?? 'truth-court evaluation failed',
    };
  }

  const markOnChain = params.markOnChain !== false;
  if (!markOnChain) {
    return {
      ...result,
      success: true,
      onChain: {
        submitted: false,
        message: 'on-chain submission skipped',
      },
    };
  }

  if (!program) {
    return {
      ...result,
      success: false,
      error:
        'Escrow program not configured. Set markOnChain=false for evaluation-only mode.',
    };
  }

  const committeeRefund = computeCommitteeRefund(
    params.refundPercentage,
    params.qualityScore,
    decision.finalVerdict
  );

  const onChain = await fileDispute(
    {
      transactionId: params.transactionId,
      qualityScore: params.qualityScore,
      refundPercentage: committeeRefund,
      evidence: {
        ...params.evidence,
        truthCourt: {
          finalVerdict: decision.finalVerdict,
          confidence: decision.confidence,
          caseHash: decision.caseHash,
          evidenceHash: decision.evidenceHash,
          featureHash: decision.featureHash,
          committeeHash: decision.committeeHash,
        },
      },
    },
    program
  );

  if (!onChain.success) {
    return {
      ...result,
      success: false,
      onChain: {
        submitted: false,
        refundPercentage: committeeRefund,
        message: onChain.error,
      },
      error: onChain.error,
    };
  }

  return {
    ...result,
    success: true,
    onChain: {
      submitted: true,
      signature: onChain.signature,
      refundPercentage: committeeRefund,
      message: onChain.message,
    },
  };
}

export function verifyTruthCourtReplay(
  caseInput: TruthCourtCaseInput,
  replayBundle: TruthCourtReplayBundle,
  oracleResponses: TruthCourtOracleResponse[]
): TruthCourtReplayReport {
  return verifyTruthCourtReplayBundle(caseInput, replayBundle, oracleResponses);
}

export async function runTruthCourtGauntlet(
  params: RunTruthCourtGauntletParams = {},
  options: FileDisputeWithTruthCourtOptions = {}
): Promise<RunTruthCourtGauntletResult> {
  const committeeOptions: FileDisputeWithTruthCourtOptions = {
    ...options,
    includeGrok: params.includeGrok ?? options.includeGrok,
    includeOpenClaw: params.includeOpenClaw ?? options.includeOpenClaw,
    includeNanoClaw: params.includeNanoClaw ?? options.includeNanoClaw,
    includeIronClaw: params.includeIronClaw ?? options.includeIronClaw,
  };

  return executeTruthCourtGauntlet(
    {
      rounds: params.rounds,
      seed: params.seed,
      scenarioMix: params.scenarioMix,
      counterfactualsPerRound: params.counterfactualsPerRound,
      claimant: params.claimant,
      respondent: params.respondent,
      includeGrok: params.includeGrok,
      policyMode: params.policyMode,
      minValidResponses: params.minValidResponses,
    },
    committeeOptions
  );
}
