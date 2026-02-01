/**
 * KAMIYO Agent Paranet Types
 * Core type definitions for the decentralized agent credit score system
 */

// Paranet configuration
export interface ParanetConfig {
  dkgEndpoint: string;
  dkgPort?: number;
  blockchain: 'base:8453' | 'gnosis:100' | 'otp:2043';
  privateKey?: string;
  epochs?: number;
  paranetUAL?: string;
}

// Task types - extensible taxonomy
export type TaskType =
  | 'code_review'
  | 'security_audit'
  | 'smart_contract_audit'
  | 'code_generation'
  | 'documentation'
  | 'research'
  | 'data_analysis'
  | 'translation'
  | 'content_creation'
  | 'api_integration'
  | 'testing'
  | 'deployment'
  | 'monitoring'
  | 'custom';

// Dispute outcomes
export type DisputeOutcome = 'none' | 'provider_won' | 'client_won' | 'split';

// Attestation types
export type AttestationType = 'self' | 'peer' | 'validator' | 'oracle';

// Trust types
export type TrustType = 'general' | 'capability_specific' | 'delegated';

// KAMIYO tiers
export enum KamiyoTier {
  Unverified = 0,
  Bronze = 1,
  Silver = 2,
  Gold = 3,
  Platinum = 4,
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
      options?: { epochs?: number; paranetUAL?: string }
    ): Promise<{ UAL: string }>;
    get(ual: string): Promise<{ public: object; private?: object }>;
    update(ual: string, content: { public?: object; private?: object }): Promise<{ UAL: string }>;
  };
  graph: {
    query(sparql: string, type: 'SELECT' | 'CONSTRUCT'): Promise<{ data: unknown[] }>;
  };
}

// Score calculation weights
export const SCORE_WEIGHTS = {
  taskQuality: 0.40,
  reliability: 0.20,
  disputeRecord: 0.15,
  peerTrust: 0.15,
  tenure: 0.10,
} as const;

// Tier thresholds
export const TIER_THRESHOLDS = {
  [KamiyoTier.Bronze]: 25,
  [KamiyoTier.Silver]: 50,
  [KamiyoTier.Gold]: 75,
  [KamiyoTier.Platinum]: 90,
} as const;

// Helper to determine tier from score
export function scoreToTier(score: number): KamiyoTier {
  if (score >= TIER_THRESHOLDS[KamiyoTier.Platinum]) return KamiyoTier.Platinum;
  if (score >= TIER_THRESHOLDS[KamiyoTier.Gold]) return KamiyoTier.Gold;
  if (score >= TIER_THRESHOLDS[KamiyoTier.Silver]) return KamiyoTier.Silver;
  if (score >= TIER_THRESHOLDS[KamiyoTier.Bronze]) return KamiyoTier.Bronze;
  return KamiyoTier.Unverified;
}

// Global ID format validation
export const GLOBAL_ID_REGEX = /^eip155:\d+:0x[a-fA-F0-9]{40}:\d+$/;

export function isValidGlobalId(id: string): boolean {
  return GLOBAL_ID_REGEX.test(id);
}

// URN builders
export function buildAgentURN(globalId: string): string {
  return `urn:erc8004:${globalId}`;
}

export function buildTaskURN(globalId: string, timestamp: number): string {
  return `urn:kamiyo:task:${globalId}:${timestamp}`;
}

export function buildAttestationURN(agentId: string, capability: string, attestorId: string): string {
  return `urn:kamiyo:attestation:${agentId}:${capability}:${attestorId}`;
}

export function buildTrustURN(trustorId: string, trusteeId: string): string {
  return `urn:kamiyo:trust:${trustorId}:${trusteeId}`;
}
