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

export type RealityForkBlob = {
  id: string;
  sha256: string;
  storageKey: string;
  mimeType: string | null;
  fileName: string | null;
  sizeBytes: number;
  createdAt: number;
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

export type RealityForkEvidence = {
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
  snippet: string;
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

export type RealityForkExtraction = {
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

export type RealityForkSimulation = {
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

export type RealityForkReportClaim = {
  id: string;
  topic: string;
  text: string;
  confidence: number;
  sentiment: number;
  snippet: string;
  evidenceRefs: string[];
  citations: string[];
  entityLabels: string[];
};

export type RealityForkReportLaneSummary = {
  lane: RealityForkLaneId;
  label: string;
  narrative: string;
  openingSentiment: number;
  closingSentiment: number;
  conviction: number;
  salience: number;
  citations: string[];
};

export type RealityForkReportScenarioComparison = {
  simulationId: string;
  hypothesisId: RealityForkHypothesisId;
  title: string;
  stance: RealityForkSimulationStance;
  outcome: string;
  probability: number;
  confidence: number;
  impactScore: number;
  evidenceCount: number;
  drivers: string[];
  riskFlags: string[];
  isWinner: boolean;
};

export type RealityForkReportQuality = {
  citedClaimCount: number;
  distinctEntityCount: number;
  laneDivergence: number;
  launchReady: boolean;
  blockers: string[];
};

export type RealityForkReportSocialCard = {
  title: string;
  winningScenario: string | null;
  summary: string;
  evidenceCount: number;
  laneCount: number;
  rounds: number;
  publishedAt: string | null;
};

export type RealityForkReport = {
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
  executiveSummary: {
    body: string;
    citations: string[];
  };
  evidenceSummary: {
    body: string;
    sourceCount: number;
    chunkCount: number;
    entityCount: number;
    claimCount: number;
    degradedSourceCount: number;
    citations: string[];
  };
  claims: RealityForkReportClaim[];
  laneSummaries: RealityForkReportLaneSummary[];
  scenarioComparison: RealityForkReportScenarioComparison[];
  winningRationale: {
    title: string;
    body: string;
    citations: string[];
    runnerUpTitle: string | null;
  };
  socialCard: RealityForkReportSocialCard;
  quality: RealityForkReportQuality;
  createdAt: number;
};

export type RealityForkPublication = {
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

export type RealityForkPublishedReport = {
  publication: RealityForkPublication;
  project: RealityForkProject;
  report: RealityForkReport;
  evidence: RealityForkEvidence[];
  entities: RealityForkEntity[];
  claims: RealityForkClaim[];
  scenarioInputs: RealityForkScenarioInput[];
  laneRounds: RealityForkLaneRound[];
  simulations: RealityForkSimulation[];
};

export type RealityForkJob = {
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

export type RealityForkProjectEvent = {
  id: string;
  projectId: string;
  jobId: string | null;
  eventType: string;
  payload: Record<string, unknown>;
  createdAt: number;
};

export type RealityForkProject = {
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

export type RealityForkProjectDetail = RealityForkProject & {
  uploads: RealityForkUpload[];
  evidence: RealityForkEvidence[];
  chunks: RealityForkChunk[];
  entities: RealityForkEntity[];
  claims: RealityForkClaim[];
  scenarioInputs: RealityForkScenarioInput[];
  extractions: RealityForkExtraction[];
  laneRounds: RealityForkLaneRound[];
  simulations: RealityForkSimulation[];
  decision: RealityForkDecision | null;
  report: RealityForkReport | null;
  publication: RealityForkPublication | null;
  jobs: RealityForkJob[];
  events: RealityForkProjectEvent[];
};

export type RealityForkProjectListResponse = {
  projects: RealityForkProject[];
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
