// Core types for the agent paranet credit score system

import { isValidGlobalId, scoreToTierIndex, TIER_THRESHOLDS as SHARED_THRESHOLDS } from './shared';

// Re-export shared utilities for convenience
export {
  GLOBAL_ID_REGEX,
  isValidGlobalId,
  escapeSparql,
  TASK_TYPES,
  TIER_NAMES,
  scoreToTierIndex,
  tierIndexToName,
  scoreToTierName,
  clamp,
  safeInt,
  SCORE_WEIGHTS,
  DISPUTE_OUTCOMES,
  ATTESTATION_TYPES,
  TRUST_TYPES,
  SCHEMA_CONTEXTS,
  LIMITS,
  extractGlobalId,
  extractTaskType,
  extractNumber,
} from './shared';

export type { TaskType, TierName, DisputeOutcome, AttestationType, TrustType } from './shared';

import type { TaskType, DisputeOutcome, AttestationType, TrustType } from './shared';

// Paranet configuration
export interface ParanetConfig {
  dkgEndpoint: string;
  dkgPort?: number;
  blockchain: 'base:8453' | 'base:84532' | 'gnosis:100' | 'otp:2043';
  privateKey?: string;
  rpc?: string;
  epochs?: number;
  paranetUAL?: string;
}

// KAMIYO tiers (numeric enum for backward compatibility)
export enum KamiyoTier {
  Unverified = 0,
  Bronze = 1,
  Silver = 2,
  Gold = 3,
  Platinum = 4,
}

// Tier thresholds (using enum keys for backward compatibility)
export const TIER_THRESHOLDS = {
  [KamiyoTier.Bronze]: SHARED_THRESHOLDS.Bronze,
  [KamiyoTier.Silver]: SHARED_THRESHOLDS.Silver,
  [KamiyoTier.Gold]: SHARED_THRESHOLDS.Gold,
  [KamiyoTier.Platinum]: SHARED_THRESHOLDS.Platinum,
} as const;

// Helper to determine tier from score
export function scoreToTier(score: number): KamiyoTier {
  return scoreToTierIndex(score) as KamiyoTier;
}

// Task completion record
export interface TaskCompletion {
  id?: string;
  providerGlobalId: string;
  clientGlobalId: string;
  taskType: TaskType;
  taskDescription: string;
  startTime: string;
  endTime: string;
  qualityScore: number;
  responseTimeMs: number;
  payment: {
    amount: number;
    currency: string;
    chain?: string;
  };
  escrowId?: string;
  disputeOutcome: DisputeOutcome;
  evidenceUAL?: string;
  tags?: string[];
}

// Capability attestation
export interface CapabilityAttestation {
  id?: string;
  agentGlobalId: string;
  capability: string;
  attestorGlobalId: string;
  attestationType: AttestationType;
  confidence: number;
  evidenceUALs?: string[];
  validUntil?: string;
  context?: string;
}

// Trust relationship
export interface TrustRelationship {
  id?: string;
  trustorGlobalId: string;
  trusteeGlobalId: string;
  trustLevel: number;
  trustType: TrustType;
  capability?: string;
  stakeAmount?: number;
  stakeCurrency?: string;
  since: string;
  until?: string;
  evidenceUALs?: string[];
  reason?: string;
}

export const POCH_CONTRIBUTION_TYPES = [
  'knowledge_artifact',
  'creative_work',
  'attested_action',
  'research_note',
  'custom',
] as const;

export type PoCHContributionType = (typeof POCH_CONTRIBUTION_TYPES)[number];
export type PoCHChain = 'solana' | 'base';
export type PoCHEnforcementMode = 'observe' | 'soft' | 'gate_high_impact';
export type PoCHSlashingMode = 'none' | 'progressive' | 'hard';

export interface PoCHChainAnchors {
  solanaTxId?: string;
  baseTxHash?: string;
}

export interface PoCHContribution {
  assetDid?: string;
  identityDid: string;
  contentHash: string;
  createdAt: string;
  contributionType: PoCHContributionType;
  provenanceRefs?: string[];
  contextMetadata?: Record<string, unknown>;
  scoreBundleCommitment?: string;
  oracleRoundId?: string;
  proofStatementId?: string;
  chainAnchors?: PoCHChainAnchors;
}

export interface PoCHScoreBundle {
  policyId: string;
  uniquenessScore: number;
  graphDivergence: number;
  clusterOverlapRisk: number;
  nonMembershipSignal: boolean;
  evaluatedAt: string;
}

export interface PoCHChallengeRequest {
  assetDid: string;
  identityDid: string;
  chain: PoCHChain;
  policyId: string;
}

export interface PoCHChallenge {
  challengeId: string;
  assetDid: string;
  identityDid: string;
  chain: PoCHChain;
  policyId: string;
  scoreBundle: PoCHScoreBundle;
  scoreBundleCommitment: string;
  createdAt: string;
}

export interface PoCHProofSubmission {
  challengeId: string;
  assetDid: string;
  identityDid: string;
  chain: PoCHChain;
  zkProof: string;
  identityNullifier: string;
}

export type PoCHStatusReason =
  | 'proof_missing'
  | 'oracle_quorum_pending'
  | 'oracle_timeout'
  | 'blocking_dispute'
  | 'policy_failed'
  | 'oracle_rejected'
  | 'verified';

export interface PoCHSubmissionReceipt {
  accepted: boolean;
  challengeId: string;
  assetDid: string;
  identityDid: string;
  chain: PoCHChain;
  verifiedAt: string;
  proofStatementId: string;
  pending?: boolean;
  finalizeReason?: string;
  oracleRoundId?: string;
  statusReason?: PoCHStatusReason;
}

export interface PoCHStatus {
  identityDid: string;
  chain: PoCHChain;
  status: 'pending' | 'verified' | 'rejected' | 'disputed';
  statusReason?: PoCHStatusReason;
  scoreBundleCommitment?: string;
  oracleRoundId?: string;
  proofStatementId?: string;
  updatedAt: string;
}

export interface PoCHActionCheck {
  identityDid: string;
  chain: PoCHChain;
  action: 'stake_amplification' | 'premium_attestation' | 'high_trust_agent_action';
}

export interface PoCHGateDecision {
  allowed: boolean;
  mode: PoCHEnforcementMode;
  reason?: string;
  status?: PoCHStatus;
}

// Credit score components
export interface CreditScoreComponents {
  taskQuality: number;
  reliability: number;
  disputeRecord: number;
  peerTrust: number;
  tenure: number;
}

// Task breakdown by type
export interface TaskBreakdown {
  taskType: TaskType;
  count: number;
  avgQuality: number;
  avgResponseTimeMs: number;
  disputeRate: number;
  totalPaymentUSD: number;
}

// Full credit score
export interface CreditScore {
  globalId: string;
  overallScore: number;
  tier: KamiyoTier;
  components: CreditScoreComponents;
  taskBreakdown: TaskBreakdown[];
  totalTasks: number;
  totalDisputes: number;
  disputeWinRate: number;
  avgQuality: number;
  avgResponseTimeMs: number;
  tenureDays: number;
  firstTaskDate?: string;
  lastTaskDate?: string;
  lastUpdated: string;
  evidenceUALs: string[];
}

// Provider search criteria
export interface ProviderSearchCriteria {
  taskType?: TaskType;
  minQuality?: number;
  minTasks?: number;
  maxResponseTimeMs?: number;
  minTier?: KamiyoTier;
  trustedBy?: string;
  capabilities?: string[];
  limit?: number;
}

// Provider search result
export interface ProviderSearchResult {
  globalId: string;
  name?: string;
  creditScore: number;
  tier: KamiyoTier;
  taskCount: number;
  avgQuality: number;
  avgResponseTimeMs: number;
  capabilities: string[];
  trustLevel?: number;
}

// Publishing result
export interface PublishResult {
  success: boolean;
  ual?: string;
  error?: string;
  txHash?: string;
}

// Query result wrapper
export interface QueryResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  cached?: boolean;
  timestamp: string;
}

// DKG client interface (matches dkg.js)
export interface DKGClient {
  asset: {
    create(
      content: { public: object; private?: object },
      options?: { epochsNum?: number; paranetUAL?: string }
    ): Promise<{ UAL: string }>;
    get(ual: string): Promise<{ public: object; private?: object }>;
    update(ual: string, content: { public?: object; private?: object }): Promise<{ UAL: string }>;
  };
  graph: {
    query(
      sparql: string,
      type: 'SELECT' | 'CONSTRUCT',
      options?: { repository?: string; paranetUAL?: string }
    ): Promise<{ data: unknown[] }>;
  };
}

// URN builders with validation
export function buildAgentURN(globalId: string): string {
  if (!isValidGlobalId(globalId)) throw new Error('Invalid global ID');
  return `urn:erc8004:${globalId}`;
}

export function buildTaskURN(globalId: string, timestamp: number): string {
  if (!isValidGlobalId(globalId)) throw new Error('Invalid global ID');
  if (!Number.isFinite(timestamp) || timestamp < 0) throw new Error('Invalid timestamp');
  return `urn:kamiyo:task:${globalId}:${timestamp}`;
}

export function buildAttestationURN(
  agentId: string,
  capability: string,
  attestorId: string
): string {
  if (!isValidGlobalId(agentId) || !isValidGlobalId(attestorId))
    throw new Error('Invalid global ID');
  if (typeof capability !== 'string' || capability.length === 0 || capability.length > 128) {
    throw new Error('Invalid capability');
  }
  const safeCapability = capability.replace(/[^a-zA-Z0-9_-]/g, '_');
  return `urn:kamiyo:attestation:${agentId}:${safeCapability}:${attestorId}`;
}

export function buildTrustURN(trustorId: string, trusteeId: string): string {
  if (!isValidGlobalId(trustorId) || !isValidGlobalId(trusteeId))
    throw new Error('Invalid global ID');
  return `urn:kamiyo:trust:${trustorId}:${trusteeId}`;
}

export function buildPoCHURN(identityDid: string, contentHash: string, createdAt: string): string {
  if (typeof identityDid !== 'string' || identityDid.length === 0)
    throw new Error('Invalid identity DID');
  if (typeof contentHash !== 'string' || contentHash.length < 8 || contentHash.length > 128) {
    throw new Error('Invalid content hash');
  }
  if (typeof createdAt !== 'string' || Number.isNaN(Date.parse(createdAt))) {
    throw new Error('Invalid createdAt');
  }
  const safeDid = identityDid.replace(/[^a-zA-Z0-9:_-]/g, '_');
  const safeHash = contentHash.replace(/[^a-zA-Z0-9]/g, '').slice(0, 32);
  const ts = Date.parse(createdAt);
  return `urn:kamiyo:poch:${safeDid}:${safeHash}:${ts}`;
}
