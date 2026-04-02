import { buildTruthCourtCommittee } from '../mcp/truth-court/factory.js';
import { TruthCourtEngine } from '../mcp/truth-court/engine.js';
import type { TruthCourtDecision } from '../mcp/truth-court/types.js';
import type {
  BranchExecutionSummary,
  ControlRoomAdjudicationDecision,
  ControlRoomDecisionMode,
} from './types';

function topTwo(branches: BranchExecutionSummary[]): [BranchExecutionSummary, BranchExecutionSummary | null] {
  const sorted = branches
    .slice()
    .sort((left, right) => (right.scorecard?.finalScore ?? 0) - (left.scorecard?.finalScore ?? 0));
  return [sorted[0], sorted[1] ?? null];
}

function branchSummary(branch: BranchExecutionSummary) {
  return {
    branchId: branch.branchId,
    policyPackId: branch.policyPackId,
    status: branch.status,
    resultHash: branch.resultHash,
    scorecard: branch.scorecard ?? null,
  };
}

function shouldUseTruthCourt(
  mode: ControlRoomDecisionMode,
  top: BranchExecutionSummary,
  runnerUp: BranchExecutionSummary | null,
  allBranches: BranchExecutionSummary[]
): boolean {
  if (mode === 'score_only') return false;
  if (mode === 'truth_court_required') return true;
  if (!runnerUp) return false;

  const delta = Math.abs((top.scorecard?.finalScore ?? 0) - (runnerUp.scorecard?.finalScore ?? 0));
  if (delta < 0.15) return true;
  if ((top.scorecard?.highRiskFlags.length ?? 0) > 0 || (runnerUp.scorecard?.highRiskFlags.length ?? 0) > 0) {
    return true;
  }
  return allBranches.some((branch) => branch.scorecard?.riskFlags.includes('mutating_tool_attempt'));
}

function committeeWinnerFromDecision(
  decision: TruthCourtDecision,
  scoreWinnerId: string,
  scoreRunnerUpId: string | null
): string {
  if (!decision.finalVerdict) return scoreWinnerId;
  if (decision.finalVerdict === 'client_wins') return scoreWinnerId;
  if (decision.finalVerdict === 'provider_wins' && scoreRunnerUpId) return scoreRunnerUpId;
  return scoreWinnerId;
}

export async function adjudicateBranches(params: {
  caseId: string;
  snapshotHash: string;
  decisionMode: ControlRoomDecisionMode;
  branches: BranchExecutionSummary[];
}): Promise<ControlRoomAdjudicationDecision> {
  if (params.branches.length === 0) {
    throw new Error('no branches available for adjudication');
  }

  const [topBranch, runnerUp] = topTwo(params.branches);
  const scoreWinnerId = topBranch.branchId;
  const scoreRunnerUpId = runnerUp?.branchId ?? null;
  const scoreDelta = runnerUp
    ? Number(Math.abs((topBranch.scorecard?.finalScore ?? 0) - (runnerUp.scorecard?.finalScore ?? 0)).toFixed(6))
    : 1;

  if (!shouldUseTruthCourt(params.decisionMode, topBranch, runnerUp, params.branches)) {
    return {
      winnerBranchId: scoreWinnerId,
      winnerReason: 'highest deterministic score',
      mode: params.decisionMode,
      usedTruthCourt: false,
      scoreDelta,
      topBranchIds: runnerUp ? [scoreWinnerId, runnerUp.branchId] : [scoreWinnerId],
      committeeDisagreement: false,
      committee: null,
    };
  }

  const committee = buildTruthCourtCommittee();
  const engine = new TruthCourtEngine(committee);

  try {
    const decision = await engine.evaluate({
      caseType: 'branch_comparison',
      transactionId: params.caseId,
      claimant: scoreWinnerId,
      respondent: scoreRunnerUpId ?? undefined,
      missionTag: 'counterfactual_control_room',
      qualityScore: Math.round((topBranch.scorecard?.finalScore ?? 0) * 100),
      requestedRefundPercentage: Math.round((1 - scoreDelta) * 100),
      evidence: {
        snapshotHash: params.snapshotHash,
        topBranch: branchSummary(topBranch),
        runnerUpBranch: runnerUp ? branchSummary(runnerUp) : null,
        allBranches: params.branches.map(branchSummary),
      },
      featureVector: {
        topFinalScore: topBranch.scorecard?.finalScore ?? 0,
        runnerUpFinalScore: runnerUp?.scorecard?.finalScore ?? 0,
        scoreDelta,
        topRiskPenalty: topBranch.scorecard?.riskPenalty ?? 0,
        runnerUpRiskPenalty: runnerUp?.scorecard?.riskPenalty ?? 0,
        topEvidenceCoverage: topBranch.scorecard?.evidenceCoverage ?? 0,
        runnerUpEvidenceCoverage: runnerUp?.scorecard?.evidenceCoverage ?? 0,
      },
      context: 'Compare two readonly swarm branches derived from the same immutable snapshot and choose the stronger branch.',
    });

    const committeeWinnerId = committeeWinnerFromDecision(decision, scoreWinnerId, scoreRunnerUpId);
    return {
      winnerBranchId: committeeWinnerId,
      winnerReason:
        committeeWinnerId === scoreWinnerId
          ? 'truth-court confirmed the score winner'
          : 'truth-court overturned the deterministic score winner',
      mode: params.decisionMode,
      usedTruthCourt: true,
      scoreDelta,
      topBranchIds: runnerUp ? [scoreWinnerId, runnerUp.branchId] : [scoreWinnerId],
      committeeDisagreement: committeeWinnerId !== scoreWinnerId,
      committee: {
        oracleCount: committee.length,
        decision,
      },
    };
  } catch (error) {
    return {
      winnerBranchId: scoreWinnerId,
      winnerReason: `truth-court fallback to score winner: ${error instanceof Error ? error.message : 'unknown error'}`,
      mode: params.decisionMode,
      usedTruthCourt: false,
      scoreDelta,
      topBranchIds: runnerUp ? [scoreWinnerId, runnerUp.branchId] : [scoreWinnerId],
      committeeDisagreement: false,
      committee: null,
    };
  }
}
