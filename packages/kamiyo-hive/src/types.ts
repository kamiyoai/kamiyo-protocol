import type { PublicKey, Connection, Keypair } from '@solana/web3.js';

export type Capability =
  | 'code-review'
  | 'code-generation'
  | 'image-generation'
  | 'data-analysis'
  | 'text-generation'
  | 'translation'
  | 'summarization'
  | 'research'
  | 'audio-transcription'
  | 'video-analysis'
  | string;

export type AgentStatus = 'active' | 'inactive' | 'suspended';

export interface AgentPricing {
  perTask?: number;
  perToken?: number;
  currency: 'USD' | 'SOL';
}

export interface AgentInfo {
  id: string;
  address: string;
  capabilities: Capability[];
  pricing: AgentPricing;
  endpoint: string;
  reputation: number;
  totalJobs: number;
  successRate: number;
  avgResponseTime: number;
  status: AgentStatus;
  registeredAt: number;
  lastActiveAt?: number;
  metadata?: Record<string, unknown>;
  reputationTier?: string;
  tierDiscount?: number;
}

export interface DiscoveryQuery {
  capability?: Capability;
  capabilities?: Capability[];
  minReputation?: number;
  maxPrice?: number;
  priceCurrency?: 'USD' | 'SOL';
  status?: AgentStatus;
  limit?: number;
  offset?: number;
}

export interface DiscoveryResult {
  agents: AgentInfo[];
  total: number;
  hasMore: boolean;
}

export interface HireOptions {
  capability: Capability;
  spec: string | Record<string, unknown>;
  budget: number;
  budgetCurrency?: 'USD' | 'SOL';
  deadline?: number;
  qualityThreshold?: number;
  preferredAgents?: string[];
  excludeAgents?: string[];
  paymentProtocol?: 'x402' | 'direct';
}

export interface HiredAgent {
  agentId: string;
  escrowAddress: string;
  spec: string | Record<string, unknown>;
  budget: number;
  deadline: number;
  status: 'pending' | 'in_progress' | 'delivered' | 'verified' | 'disputed' | 'completed';
  x402TransactionId?: string;
  awaitDelivery(): Promise<DeliveryResult>;
  checkStatus(): Promise<HiredAgent>;
  cancel(): Promise<void>;
}

export interface DeliveryResult {
  success: boolean;
  deliverable?: unknown;
  qualityScore?: number;
  qualityRationale?: string;
  paid: boolean;
  error?: string;
}

export interface QualityAssessment {
  score: number;
  rationale: string;
  passed: boolean;
  details?: Record<string, unknown>;
}

export interface EscrowConfig {
  requesterType: 'human' | 'agent';
  providerType: 'human' | 'agent';
  autoVerify: boolean;
  qualityThreshold: number;
  timeLockSeconds: number;
}

export interface HiveConfig {
  keypair: Keypair;
  connection: Connection;
  programId?: string;
  apiEndpoint?: string;
  defaultQualityThreshold?: number;
  defaultTimeLockSeconds?: number;
  oracleEndpoint?: string;
  x402Client?: any;
  enableReputationPricing?: boolean;
}

export interface RegisterOptions {
  capabilities: Capability[];
  pricing: AgentPricing;
  endpoint: string;
  metadata?: Record<string, unknown>;
}

export interface RegistrationResult {
  success: boolean;
  agentId?: string;
  address?: string;
  signature?: string;
  error?: string;
}

export interface OracleRequest {
  specHash: string;
  spec: string | Record<string, unknown>;
  deliverable: unknown;
  escrowAddress: string;
}

export interface OracleResponse {
  score: number;
  rationale: string;
  passed: boolean;
  signature: string;
  timestamp: number;
}
