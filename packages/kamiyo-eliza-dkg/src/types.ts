// Re-export types from @kamiyo/eliza
export type {
  IAgentRuntime,
  Memory,
  State,
  Action,
  Provider,
  Evaluator,
  Plugin,
  Service,
  MessageExample,
  HandlerCallback,
  KamiyoNetwork,
  KamiyoPluginConfig,
  PaymentRecord as KamiyoPaymentRecord,
  DisputeRecord,
  EscrowAccount,
} from '@kamiyo/eliza';

// DKG-specific types
export type UAL = string; // Uniform Asset Locator (DID format)

export type DKGBlockchain =
  | 'base:8453'
  | 'base:84532'
  | 'gnosis:100'
  | 'gnosis:10200'
  | 'otp:2043'
  | 'otp:20430';

export interface DKGConfig {
  endpoint: string;
  port?: number;
  blockchain: DKGBlockchain;
  privateKey?: string;
  publicKey?: string;
  maxRetries?: number;
  epochs?: number;
}

export interface ElizaDKGConfig {
  // DKG settings
  dkg: DKGConfig;
  // KAMIYO settings
  kamiyo: {
    network: 'mainnet' | 'devnet' | 'localnet';
    programId?: string;
    rpcUrl?: string;
    qualityThreshold?: number;
    maxPricePerRequest?: number;
    autoDispute?: boolean;
  };
  // Bridge settings
  autoPublishQuality?: boolean;
  autoPublishDisputes?: boolean;
  autoPublishPayments?: boolean;
  autoPublishReputation?: boolean;
}

export interface DKGPublishResult {
  ual: UAL;
  datasetRoot: string;
  transactionHash?: string;
  blockchain: DKGBlockchain;
  epochs: number;
}

export interface DKGQueryResult<T = unknown> {
  data: T[];
  sparql: string;
  executionTimeMs: number;
}

export interface QualityAttestationInput {
  providerId: string;
  providerName?: string;
  qualityScore: number;
  explanation?: string;
  escrowId?: string;
  evidenceHash?: string;
  transactionHash?: string;
}

export interface DisputeOutcomeInput {
  escrowId: string;
  clientId: string;
  providerId: string;
  amount: number;
  currency: string;
  outcome: 'provider_wins' | 'client_wins' | 'split' | 'no_consensus';
  qualityScore: number;
  refundPercentage: number;
  oracleVotes: Array<{
    oracleId: string;
    vote: number;
    commitment?: string;
  }>;
  evidenceHash?: string;
  transactionHash?: string;
}

export interface ReputationCommitmentInput {
  agentId: string;
  commitment: string; // Poseidon hash
  validDays?: number;
}

export interface PaymentRecordInput {
  payerId: string;
  providerId: string;
  providerName?: string;
  amount: number;
  currency: string;
  paymentMethod: 'x402' | 'escrow' | 'direct';
  status: 'completed' | 'disputed' | 'refunded' | 'pending';
  qualityScore?: number;
  responseTime?: number;
  success: boolean;
  escrowId?: string;
  transactionHash?: string;
}

export interface ProviderQualityStats {
  providerId: string;
  avgRating: number;
  reviewCount: number;
  recentRatings: Array<{
    rating: number;
    date: string;
    reviewer: string;
  }>;
}

export interface AgentDisputeStats {
  agentId: string;
  totalDisputes: number;
  wins: number;
  losses: number;
  splits: number;
  avgQualityInDisputes: number;
}

// Bridge context for sharing state between KAMIYO and DKG plugins
export interface KamiyoDKGBridgeContext {
  // DKG client instance
  dkgClient: DKGClientInterface;

  // Published asset tracking
  publishedAssets: Map<string, UAL>; // key -> UAL

  // Quality cache
  qualityCache: Map<string, ProviderQualityStats>;
  qualityCacheTTL: number;

  // Config
  config: ElizaDKGConfig;
}

export interface DKGClientInterface {
  query(sparql: string): Promise<unknown[]>;
  get(ual: UAL): Promise<{ content: unknown; metadata?: Record<string, unknown> }>;
  update(ual: UAL, data: Record<string, unknown>): Promise<void>;
  publish(content: object, options?: { epochs?: number }): Promise<string>;
  healthCheck?(): Promise<boolean>;
}

// Event types for the bridge
export type BridgeEventType =
  | 'quality_attestation_published'
  | 'dispute_outcome_published'
  | 'reputation_commitment_published'
  | 'payment_record_published'
  | 'quality_query_completed'
  | 'reputation_query_completed'
  | 'trust_edge_published'
  | 'hub_entity_published';

export interface BridgeEvent {
  type: BridgeEventType;
  timestamp: number;
  data: Record<string, unknown>;
  ual?: UAL;
  error?: string;
}

export type BridgeEventListener = (event: BridgeEvent) => void;

// Trust edge input for publishing trust relationships
export interface TrustEdgeInput {
  trustorId: string;
  trusteeId: string;
  trustLevel: number; // 0-100
  trustType: 'vouches' | 'delegates' | 'endorses';
  stakeAmount: number; // SOL backing this trust edge
  expiresAt?: string; // ISO 8601
  evidenceUal?: string; // UAL of supporting evidence
}

// Hub entity input for registering stake-backed entities
export interface HubEntityInput {
  identifier: string; // Public key or DID
  name: string;
  description?: string;
  stakeAmount: number; // SOL staked
  stakePda: string; // Escrow PDA address
  hubType: 'oracle' | 'provider' | 'aggregator';
  qualityScore?: number; // Initial quality score
  trustDepth?: number; // Max hops for trust propagation (default 3)
  parentHubId?: string; // Parent hub if hierarchical
}

// Trust chain query result
export interface TrustChainResult {
  sourceId: string;
  targetId: string;
  hops: number;
  minTrustLevel: number;
  totalStake: number;
  path?: string[]; // Intermediate entity IDs
}

// Entity in trust network
export interface TrustedEntity {
  entityId: string;
  hops: number;
  aggregateTrust: number;
}

// Hub verification result
export interface HubEntityVerification {
  verified: boolean;
  entityId?: string;
  name?: string;
  stakeAmount?: number;
  hubType?: string;
  qualityScore?: number;
  ual?: string;
  reason?: string;
}
