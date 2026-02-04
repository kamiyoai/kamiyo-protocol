import type { PublicKey } from '@solana/web3.js';

// Re-export agent types
export type {
  Agent,
  AgentPersonality,
  AgentSkill,
  AgentTier,
} from '../stores/agent';

// Job Types
export interface Job {
  id: string;
  title: string;
  description: string;
  taskType: string;
  budget: number;
  currency: 'SOL' | 'USDC';
  estimatedDuration: number; // in minutes
  deadline: string;
  client: {
    id: string;
    reputation: number;
    totalJobs: number;
  };
  status: 'open' | 'accepted' | 'in_progress' | 'completed' | 'disputed';
  createdAt: string;
}

// Transaction Types
export interface Transaction {
  id: string;
  type: 'earning' | 'expense' | 'deposit' | 'withdrawal';
  amount: number;
  currency: 'SOL' | 'USDC';
  description: string;
  jobId?: string;
  timestamp: string;
  status: 'pending' | 'confirmed' | 'failed';
  signature?: string;
}

// Escrow Types
export interface Escrow {
  id: string;
  jobId: string;
  amount: number;
  currency: 'SOL' | 'USDC';
  client: PublicKey;
  provider: PublicKey;
  status: 'active' | 'released' | 'disputed' | 'refunded';
  deadline: string;
  qualityScore?: number;
  createdAt: string;
}

// Credit Score Types
export interface CreditScore {
  globalId: string;
  overallScore: number;
  tier: 'unverified' | 'bronze' | 'silver' | 'gold' | 'platinum';
  components: {
    taskQuality: number;
    reliability: number;
    disputeRecord: number;
    peerTrust: number;
    tenure: number;
  };
  totalTasks: number;
  totalDisputes: number;
  disputeWinRate: number;
  avgQuality: number;
  avgResponseTimeMs: number;
  tenureDays: number;
  lastUpdated: string;
}

// DKG Types
export interface KnowledgeAsset {
  ual: string;
  type: 'TaskCompletion' | 'CapabilityAttestation' | 'TrustRelationship';
  timestamp: string;
  data: Record<string, unknown>;
}

// API Response Types
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}
