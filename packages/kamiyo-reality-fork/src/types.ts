export type CompanionControlRoomSnapshotSourceType =
  | 'observatory_session'
  | 'observatory_escrow'
  | 'manual_evidence';

export type CompanionControlRoomDecisionMode =
  | 'score_only'
  | 'score_then_truth_court'
  | 'truth_court_required';

export type CompanionControlRoomCaseStatus =
  | 'captured'
  | 'running'
  | 'ready'
  | 'promoted'
  | 'failed';

export type CompanionControlRoomPolicyPackId =
  | 'baseline'
  | 'aggressive'
  | 'verify_first'
  | 'safe_exit';

export type CompanionControlRoomEventType =
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

export type CompanionControlRoomScorecard = {
  branchId: string;
  policyPackId: CompanionControlRoomPolicyPackId;
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

export type CompanionSwarmRunNode = {
  id: string;
  memberId: string;
  agentId: string;
  dependsOn: string[];
  description: string;
  budgetReserved: number;
  amountDrawn: number;
  reuseKey: string | null;
  status: string;
  output: unknown;
  error: string | null;
  startedAt: number | null;
  completedAt: number | null;
};

export type CompanionSwarmRunDetail = {
  runId: string;
  id: string;
  teamId: string;
  mission: string;
  status: string;
  executionMode: 'execute' | 'readonly';
  snapshotHash: string | null;
  counterfactualCaseId: string | null;
  counterfactualBranchId: string | null;
  plan: {
    mode: string;
    nodes: Array<{
      id: string;
      memberId: string;
      description: string;
      budget: number;
      dependsOn: string[];
    }>;
  };
  totals: { reserved: number; spent: number };
  error: string | null;
  kiroku: { receipt: string | null; url: string | null; error: string | null };
  startedAt: number;
  completedAt: number | null;
  nodes: CompanionSwarmRunNode[];
};

export type CompanionControlRoomBranch = {
  branchId: string;
  policyPackId: CompanionControlRoomPolicyPackId;
  branchKind: CompanionControlRoomPolicyPackId;
  status: string;
  swarmRunId: string | null;
  resultHash: string | null;
  plan: CompanionSwarmRunDetail['plan'];
  maxParallel: number;
  failFast: boolean;
  scorecard: CompanionControlRoomScorecard | null;
  committee: Record<string, unknown> | null;
  run: CompanionSwarmRunDetail | null;
  createdAt: number;
  completedAt: number | null;
};

export type CompanionControlRoomCaseEvent = {
  id: string;
  caseId: string;
  branchId: string | null;
  eventType: CompanionControlRoomEventType;
  payload: Record<string, unknown>;
  createdAt: number;
};

export type CompanionControlRoomCaseDetail = {
  caseId: string;
  id: string;
  teamId: string;
  mission: string;
  status: CompanionControlRoomCaseStatus;
  decisionMode: CompanionControlRoomDecisionMode;
  snapshotHash: string;
  source: {
    type: CompanionControlRoomSnapshotSourceType;
    ref: string | null;
  };
  winnerBranchId: string | null;
  promotedRunId: string | null;
  error: string | null;
  createdByWallet: string | null;
  createdAt: number;
  completedAt: number | null;
  snapshot: {
    mission: string;
    team: {
      id: string;
      members: Array<{
        id: string;
        agentId: string;
        role: string;
        drawLimit: number;
      }>;
    };
    source: {
      type: CompanionControlRoomSnapshotSourceType;
      ref?: string;
    };
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
  branches: CompanionControlRoomBranch[];
  events: CompanionControlRoomCaseEvent[];
};

export type CompanionControlRoomCaseListItem = {
  caseId: string;
  id: string;
  mission: string;
  status: CompanionControlRoomCaseStatus;
  decisionMode: CompanionControlRoomDecisionMode;
  snapshotHash: string;
  source: {
    type: CompanionControlRoomSnapshotSourceType;
    ref: string | null;
  };
  winnerBranchId: string | null;
  promotedRunId: string | null;
  error: string | null;
  createdAt: number;
  completedAt: number | null;
};

export type CompanionControlRoomCaseListResponse = {
  cases: CompanionControlRoomCaseListItem[];
  limit: number;
  offset: number;
};

export type RealityForkReplayPhase =
  | 'capture'
  | 'planning'
  | 'execution'
  | 'scoring'
  | 'adjudication'
  | 'promotion'
  | 'terminal';

export type RealityForkReplayEvent = {
  id: string;
  eventType: CompanionControlRoomEventType;
  phase: RealityForkReplayPhase;
  title: string;
  description: string;
  branchId: string | null;
  branchLabel: string | null;
  createdAt: number;
  offsetMs: number;
  tone: 'neutral' | 'success' | 'warning' | 'critical';
};

export type RealityForkSnapshot = {
  sourceType: CompanionControlRoomSnapshotSourceType;
  sourceRef: string | null;
  capturedAt: string;
  teamId: string;
  teamMembers: Array<{
    id: string;
    role: string;
    drawLimit: number;
  }>;
  artifactCount: number;
  artifactRefs: string[];
  escrows: Array<{
    escrowPda: string | null;
    sessionId: string | null;
    lastSignature: string | null;
  }>;
  events: Array<{
    id: string | null;
    signature: string | null;
    sessionId: string | null;
    escrowPda: string | null;
  }>;
  highlights: string[];
};

export type RealityForkBranch = {
  branchId: string;
  policyPackId: CompanionControlRoomPolicyPackId;
  label: string;
  status: string;
  verdict: 'winner' | 'runner_up' | 'contender';
  summary: string;
  nodeCount: number;
  completedNodes: number;
  failedNodes: number;
  latencyMs: number;
  totalSpent: number;
  evidenceRefs: string[];
  riskFlags: string[];
  highRiskFlags: string[];
  score: number;
  completionScore: number;
  evidenceCoverage: number;
  latencyScore: number;
  costScore: number;
  riskPenalty: number;
  outputHighlights: string[];
};

export type RealityForkDecision = {
  winnerBranchId: string | null;
  winnerLabel: string | null;
  winnerReason: string;
  mode: CompanionControlRoomDecisionMode;
  usedTruthCourt: boolean;
  committeeDisagreement: boolean;
  scoreDelta: number;
  promotedRunId: string | null;
  topBranchIds: string[];
};

export type RealityForkShareCard = {
  headline: string;
  kicker: string;
  body: string;
  scoreline: string;
  bullets: string[];
  xPost: string;
};

export type RealityForkScenario = {
  id: string;
  slug: string;
  title: string;
  tagline: string;
  summary: string;
  tags: string[];
  sourceLabel: string;
  mission: string;
  createdAt: string;
  completedAt: string | null;
  snapshotHash: string;
  status: CompanionControlRoomCaseStatus;
  snapshot: RealityForkSnapshot;
  branches: RealityForkBranch[];
  decision: RealityForkDecision;
  replay: {
    events: RealityForkReplayEvent[];
  };
  shareCard: RealityForkShareCard;
};

export type RealityForkFixtureBundle = {
  version: 1;
  generatedAt: string;
  generator: {
    source: 'control-room-export';
    teamId: string;
    caseId: string;
  };
  scenario: RealityForkScenario;
};

export type RealityForkScenarioListItem = {
  id: string;
  slug: string;
  title: string;
  tagline: string;
  summary: string;
  tags: string[];
  sourceLabel: string;
  winnerLabel: string | null;
  status: CompanionControlRoomCaseStatus;
};

export type RealityForkScenarioMetadata = {
  id?: string;
  slug?: string;
  title?: string;
  tagline?: string;
  summary?: string;
  tags?: string[];
  sourceLabel?: string;
};

export type ReplayScenarioOptions = {
  stepMs?: number;
};
