import type { ExecuteSwarmRunResult } from '../swarm/service';
import type { SwarmDagPlan, SwarmTeamMember } from '../swarm/types';

export type ControlRoomSnapshotSourceType =
  | 'observatory_session'
  | 'observatory_escrow'
  | 'manual_evidence';

export type ControlRoomDecisionMode =
  | 'score_only'
  | 'score_then_truth_court'
  | 'truth_court_required';

export type ControlRoomCaseStatus =
  | 'captured'
  | 'running'
  | 'ready'
  | 'promoted'
  | 'failed';

export type ControlRoomBranchStatus =
  | 'planned'
  | 'running'
  | 'completed'
  | 'failed';

export type ControlRoomPolicyPackId =
  | 'baseline'
  | 'aggressive'
  | 'verify_first'
  | 'safe_exit';

export type ControlRoomCaseEventType =
  | 'case_created'
  | 'snapshot_captured'
  | 'branch_planned'
  | 'branch_started'
  | 'node_reused'
  | 'branch_completed'
  | 'scoring_completed'
  | 'adjudication_started'
  | 'adjudication_completed'
  | 'promotion_started'
  | 'promotion_completed'
  | 'case_failed';

export type ControlRoomSource = {
  type: ControlRoomSnapshotSourceType;
  ref?: string;
};

export type CounterfactualSnapshot = {
  mission: string;
  team: {
    id: string;
    members: SwarmTeamMember[];
  };
  source: ControlRoomSource;
  capturedAt: string;
  observatory: {
    escrows: unknown[];
    events: Array<Record<string, unknown>>;
  };
  manualEvidence: Record<string, unknown> | null;
  runtimeContext: {
    planner: Record<string, boolean>;
    truthCourt: Record<string, boolean | number>;
    flags: Record<string, boolean | string | number | null>;
  };
};

export type ControlRoomBranchPlan = {
  policyPackId: ControlRoomPolicyPackId;
  branchKind: ControlRoomPolicyPackId;
  plan: SwarmDagPlan;
  maxParallel: number;
  failFast: boolean;
};

export type BranchRiskSummary = {
  flags: string[];
  highRiskFlags: string[];
};

export type CounterfactualScorecard = {
  branchId: string;
  policyPackId: ControlRoomPolicyPackId;
  completionScore: number;
  evidenceCoverage: number;
  riskPenalty: number;
  latencyScore: number;
  costScore: number;
  finalScore: number;
  metrics: {
    completedNodes: number;
    failedNodes: number;
    totalNodes: number;
    latencyMs: number;
    totalSpent: number;
    distinctEvidenceRefs: string[];
    totalSnapshotArtifacts: number;
  };
  riskFlags: string[];
  highRiskFlags: string[];
};

export type BranchExecutionSummary = {
  branchId: string;
  policyPackId: ControlRoomPolicyPackId;
  branchKind: ControlRoomPolicyPackId;
  swarmRunId: string;
  status: ControlRoomBranchStatus;
  resultHash: string;
  result: ExecuteSwarmRunResult;
  scorecard?: CounterfactualScorecard;
  committee?: Record<string, unknown> | null;
};

export type ControlRoomAdjudicationDecision = {
  winnerBranchId: string;
  winnerReason: string;
  mode: ControlRoomDecisionMode;
  usedTruthCourt: boolean;
  scoreDelta: number;
  topBranchIds: string[];
  committeeDisagreement: boolean;
  committee: Record<string, unknown> | null;
};
