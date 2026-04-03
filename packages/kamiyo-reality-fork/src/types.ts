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

export type RealityForkProjectStatus =
  | 'draft'
  | 'queued'
  | 'processing'
  | 'ready'
  | 'publishing'
  | 'published'
  | 'failed';

export type RealityForkJobKind = 'full' | 'publish';

export type RealityForkJobStatus = 'queued' | 'running' | 'completed' | 'failed';

export type RealityForkJobStage =
  | 'queued'
  | 'ingest'
  | 'extract'
  | 'simulate'
  | 'report'
  | 'publish'
  | 'complete'
  | 'failed';

export type RealityForkEvidenceKind =
  | 'upload'
  | 'document'
  | 'source'
  | 'pasted_text'
  | 'note'
  | 'dataset';

export type RealityForkSourceType =
  | 'pdf'
  | 'docx'
  | 'text'
  | 'markdown'
  | 'html'
  | 'url'
  | 'x_thread'
  | 'reddit_thread'
  | 'polymarket_market';

export type RealityForkLaneId = 'x_lane' | 'reddit_lane' | 'market_lane';

export type RealityForkHypothesisId = 'status_quo' | 'accelerant' | 'backlash' | 'market_shock';

export type RealityForkSimulationStance =
  | RealityForkHypothesisId
  | 'baseline'
  | 'upside'
  | 'downside';

export type RealityForkFactType = 'supporting' | 'risk' | 'neutral';

export type RealityForkSimulationConfig = {
  representedPopulation: number;
  activeAgents: number;
  rounds: number;
  lanes: RealityForkLaneId[];
};

export type RealityForkFact = {
  id: string;
  type: RealityForkFactType;
  statement: string;
  weight: number;
  evidenceRefs?: string[];
  entityIds?: string[];
};

export type RealityForkUpload = {
  id: string;
  fileName: string;
  mimeType: string | null;
  sizeBytes: number;
  sourceType: RealityForkSourceType;
  blobId: string;
  createdAt: number;
};

export type RealityForkProjectEvent = {
  id: string;
  projectId: string;
  jobId: string | null;
  eventType: string;
  payload: Record<string, unknown>;
  createdAt: number;
};

export type RealityForkProjectEvidence = {
  id: string;
  projectId: string;
  title: string;
  kind: RealityForkEvidenceKind;
  sourceType: RealityForkSourceType;
  sourceLabel: string | null;
  sourceUrl: string | null;
  mimeType: string | null;
  blobId: string | null;
  uploadId: string | null;
  sizeBytes: number | null;
  textPreview: string | null;
  status: 'uploaded' | 'parsing' | 'ready_for_extraction' | 'failed';
  warning: string | null;
  metadata: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
};

export type RealityForkChunk = {
  id: string;
  projectId: string;
  evidenceId: string;
  chunkIndex: number;
  content: string;
  charStart: number;
  charEnd: number;
  createdAt: number;
};

export type RealityForkEntity = {
  id: string;
  projectId: string;
  label: string;
  category: 'person' | 'organization' | 'market' | 'location' | 'topic' | 'unknown';
  aliases: string[];
  mentionCount: number;
  evidenceRefs: string[];
  createdAt: number;
};

export type RealityForkClaim = {
  id: string;
  projectId: string;
  text: string;
  topic: string;
  sentiment: number;
  confidence: number;
  evidenceRefs: string[];
  entityIds: string[];
  createdAt: number;
};

export type RealityForkScenarioInput = {
  id: string;
  projectId: string;
  topic: string;
  summary: string;
  evidenceRefs: string[];
  weight: number;
  createdAt: number;
};

export type RealityForkProjectExtraction = {
  id: string;
  projectId: string;
  evidenceId: string;
  summary: string;
  keywords: string[];
  facts: RealityForkFact[];
  artifactBlobId: string | null;
  createdAt: number;
};

export type RealityForkLaneRound = {
  id: string;
  projectId: string;
  lane: RealityForkLaneId;
  round: number;
  sentiment: number;
  conviction: number;
  salience: number;
  summary: string;
  evidenceRefs: string[];
  createdAt: number;
};

export type RealityForkProjectSimulation = {
  id: string;
  projectId: string;
  slug: string;
  title: string;
  hypothesisId: RealityForkHypothesisId;
  stance: RealityForkSimulationStance;
  outcome: string;
  probability: number;
  confidence: number;
  impactScore: number;
  laneOutlook: Record<RealityForkLaneId, number>;
  rationale: {
    score: number;
    evidenceIds: string[];
    drivers: string[];
  };
  scorecard: {
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
  } | null;
  artifactBlobId: string | null;
  createdAt: number;
};

export type RealityForkDecision = {
  winnerSimulationId: string | null;
  winnerHypothesisId: RealityForkHypothesisId | null;
  winnerReason: string | null;
  winnerLabel: string | null;
  mode: 'score_only' | 'score_then_truth_court' | 'truth_court_required';
  usedTruthCourt: boolean;
  committeeDisagreement: boolean;
  scoreDelta: number;
  topSimulationIds: string[];
};

export type RealityForkReportSection = {
  id: string;
  key: string;
  title: string;
  body: string;
  citations: string[];
};

export type RealityForkProjectReport = {
  id: string;
  projectId: string;
  jobId: string;
  headline: string;
  summary: string;
  markdown: string;
  html: string;
  markdownBlobId: string | null;
  htmlBlobId: string | null;
  sections: RealityForkReportSection[];
  metrics: Record<string, number>;
  decision: RealityForkDecision | null;
  createdAt: number;
};

export type RealityForkProjectPublication = {
  id: string;
  projectId: string;
  reportId: string;
  slug: string;
  title: string;
  summary: string;
  status: 'published';
  bundleBlobId: string | null;
  bundle: Record<string, unknown>;
  createdAt: number;
  publishedAt: number;
};

export type RealityForkProjectJob = {
  id: string;
  projectId: string;
  kind: RealityForkJobKind;
  status: RealityForkJobStatus;
  currentStage: RealityForkJobStage;
  progress: number;
  error: string | null;
  result: Record<string, unknown> | null;
  createdAt: number;
  startedAt: number | null;
  completedAt: number | null;
  updatedAt: number;
};

export type RealityForkProjectRecord = {
  id: string;
  slug: string;
  title: string;
  prompt: string;
  claim: string;
  description: string | null;
  tags: string[];
  decisionMode: 'score_only' | 'score_then_truth_court' | 'truth_court_required';
  status: RealityForkProjectStatus;
  currentJobId: string | null;
  latestReportId: string | null;
  latestPublicationId: string | null;
  createdByIp: string | null;
  simulationConfig: RealityForkSimulationConfig;
  warnings: string[];
  createdAt: number;
  updatedAt: number;
  publishedAt: number | null;
  stats: {
    evidenceCount: number;
    extractionCount: number;
    simulationCount: number;
    chunkCount: number;
    entityCount: number;
    claimCount: number;
  };
};

export type RealityForkProjectDetail = RealityForkProjectRecord & {
  uploads: RealityForkUpload[];
  evidence: RealityForkProjectEvidence[];
  chunks: RealityForkChunk[];
  entities: RealityForkEntity[];
  claims: RealityForkClaim[];
  scenarioInputs: RealityForkScenarioInput[];
  extractions: RealityForkProjectExtraction[];
  laneRounds: RealityForkLaneRound[];
  simulations: RealityForkProjectSimulation[];
  decision: RealityForkDecision | null;
  report: RealityForkProjectReport | null;
  publication: RealityForkProjectPublication | null;
  jobs: RealityForkProjectJob[];
  events: RealityForkProjectEvent[];
};

export type RealityForkProjectListResponse = {
  projects: RealityForkProjectRecord[];
};

export type RealityForkUploadResponse = {
  uploads: RealityForkUpload[];
};

export type RealityForkProjectCreateResponse = RealityForkProjectDetail & {
  initialJob: RealityForkProjectJob;
};

export type RealityForkJob = RealityForkProjectJob;
export type RealityForkPublication = RealityForkProjectPublication;
export type RealityForkEvidence = RealityForkProjectEvidence;
export type RealityForkExtraction = RealityForkProjectExtraction;
export type RealityForkSimulation = RealityForkProjectSimulation;
export type RealityForkReport = RealityForkProjectReport;
export type RealityForkPublishedReport = {
  publication: RealityForkProjectPublication;
  project: RealityForkProjectRecord;
  report: RealityForkProjectReport;
  evidence: RealityForkProjectEvidence[];
  entities: RealityForkEntity[];
  claims: RealityForkClaim[];
  scenarioInputs: RealityForkScenarioInput[];
  laneRounds: RealityForkLaneRound[];
  simulations: RealityForkProjectSimulation[];
};

export type CreateRealityForkEvidenceInput = {
  title: string;
  kind?: RealityForkEvidenceKind;
  sourceType?: RealityForkSourceType;
  sourceLabel?: string;
  sourceUrl?: string;
  mimeType?: string;
  text?: string;
  contentBase64?: string;
  fileName?: string;
  uploadId?: string;
  metadata?: Record<string, unknown>;
};

export type CreateRealityForkProjectInput = {
  title?: string;
  prompt?: string;
  claim?: string;
  description?: string;
  tags?: string[];
  uploadIds?: string[];
  pastedText?: string;
  urls?: string[];
  simulationConfig?: Partial<RealityForkSimulationConfig>;
  decisionMode?: 'score_only' | 'score_then_truth_court' | 'truth_court_required';
  evidence?: CreateRealityForkEvidenceInput[];
  clientIp?: string | null;
};
