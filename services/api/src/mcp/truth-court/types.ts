export const TRUTH_COURT_VERDICTS = [
  'client_wins',
  'provider_wins',
  'split',
  'insufficient_evidence',
] as const;

export type TruthCourtVerdict = (typeof TRUTH_COURT_VERDICTS)[number];

export interface TruthCourtFactor {
  name: string;
  impact: number;
  evidence: string;
}

export interface TruthCourtCaseInput {
  caseType?: 'dispute' | 'branch_comparison';
  transactionId: string;
  claimant: string;
  respondent?: string;
  missionTag?: string;
  qualityScore: number;
  requestedRefundPercentage: number;
  evidence: Record<string, unknown>;
  featureVector: Record<string, unknown>;
  context?: string;
}

export interface TruthCourtOracleRequest {
  caseHash: string;
  evidenceHash: string;
  featureHash: string;
  input: TruthCourtCaseInput;
}

export type TruthCourtOracleProvider =
  | 'xai'
  | 'openclaw'
  | 'nanoclaw'
  | 'ironclaw'
  | 'local'
  | 'openai'
  | 'anthropic'
  | 'custom';

export interface TruthCourtOracleResponse {
  oracle: string;
  provider: TruthCourtOracleProvider;
  model: string;
  modelHash: string;
  verdict: TruthCourtVerdict;
  confidence: number;
  factors: TruthCourtFactor[];
  evidenceHash: string;
  featureHash: string;
  reasoningRef: string;
  generatedAt: number;
  rawOutput?: string;
}

export interface TruthCourtRejectedResponse {
  oracle: string;
  reason: 'runtime_error' | 'schema_invalid' | 'hash_mismatch';
  detail: string;
}

export interface TruthCourtSlashingRecommendation {
  oracle: string;
  severity: 'low' | 'medium' | 'high';
  reason: string;
}

export interface TruthCourtOracleMetric {
  oracle: string;
  provider: TruthCourtOracleProvider;
  status: 'accepted' | 'rejected';
  reason?: TruthCourtRejectedResponse['reason'];
  latencyMs: number;
}

export interface TruthCourtReplayDigest {
  oracle: string;
  responseHash: string;
  modelHash: string;
}

export interface TruthCourtReplayBundle {
  caseHash: string;
  evidenceHash: string;
  featureHash: string;
  committeeHash: string;
  finalVerdict: TruthCourtVerdict;
  confidence: number;
  issuedAt: number;
  oracleDigests: TruthCourtReplayDigest[];
}

export interface TruthCourtDecision {
  success: boolean;
  caseHash: string;
  evidenceHash: string;
  featureHash: string;
  committeeHash?: string;
  quorumMet: boolean;
  finalVerdict?: TruthCourtVerdict;
  confidence?: number;
  voteBreakdown: Record<TruthCourtVerdict, number>;
  acceptedResponses: TruthCourtOracleResponse[];
  rejectedResponses: TruthCourtRejectedResponse[];
  oracleMetrics: TruthCourtOracleMetric[];
  slashingRecommendations: TruthCourtSlashingRecommendation[];
  replayBundle?: TruthCourtReplayBundle;
  summary?: string;
  error?: string;
}

export interface TruthCourtReplayReport {
  success: boolean;
  replayable: boolean;
  caseHashMatches: boolean;
  evidenceHashMatches: boolean;
  featureHashMatches: boolean;
  committeeHashMatches: boolean;
  missingOracles: string[];
  mismatchedOracles: string[];
  unexpectedOracles: string[];
}

export interface TruthCourtRunOptions {
  minValidResponses?: number;
}

export interface TruthCourtOracle {
  readonly name: string;
  evaluate(request: TruthCourtOracleRequest): Promise<TruthCourtOracleResponse>;
}
