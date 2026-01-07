/**
 * Daydreams Integration Types
 *
 * Type definitions for Kamiyo x Daydreams agent framework integration.
 * Compatible with @daydreamsai/core context and action patterns.
 *
 * @see https://docs.dreams.fun
 * @see https://github.com/daydreamsai/daydreams
 */

import { PublicKey } from '@solana/web3.js';

export interface KamiyoMemory {
  payments: PaymentRecord[];
  disputes: DisputeRecord[];
  balance: number;
  totalSpent: number;
  totalRefunded: number;
  qualityStats: QualityStats;
}

export interface PaymentRecord {
  id: string;
  endpoint: string;
  amount: number;
  quality: number;
  timestamp: number;
  disputed: boolean;
  refundAmount?: number;
  escrowAddress?: string;
  transactionId?: string;
}

export interface DisputeRecord {
  id: string;
  paymentId: string;
  expectedQuality: number;
  actualQuality: number;
  evidence: Record<string, unknown>;
  status: DisputeStatus;
  resolution?: DisputeResolution;
  filedAt: number;
  resolvedAt?: number;
}

export type DisputeStatus = 'pending' | 'reviewing' | 'resolved' | 'rejected';

export interface DisputeResolution {
  outcome: 'full_refund' | 'partial_refund' | 'no_refund';
  refundPercentage: number;
  reason: string;
}

export interface QualityStats {
  totalCalls: number;
  avgQuality: number;
  disputeRate: number;
  successRate: number;
  byEndpoint: Record<string, EndpointStats>;
}

export interface EndpointStats {
  calls: number;
  avgQuality: number;
  avgCost: number;
  disputes: number;
  lastCall: number;
}

export interface PaymentContextInput {
  agentId: string;
  network?: KamiyoNetwork;
}

export type KamiyoNetwork = 'mainnet' | 'devnet' | 'localnet';

export interface KamiyoExtensionConfig {
  rpcUrl?: string;
  programId?: string;
  network?: KamiyoNetwork;
  qualityThreshold?: number;
  maxPrice?: number;
  autoDispute?: boolean;
  privateKey?: string;
  onPayment?: (payment: PaymentRecord) => void;
  onDispute?: (dispute: DisputeRecord) => void;
  onQualityCheck?: (result: QualityCheckResult) => void;
}

export interface QualityCheckResult {
  score: number;
  completeness: number;
  accuracy: number;
  freshness: number;
  passesThreshold: boolean;
}

export interface ConsumeAPIInput {
  endpoint: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  query?: Record<string, unknown>;
  headers?: Record<string, string>;
  expectedSchema?: Record<string, unknown>;
  maxPrice?: number;
  qualityThreshold?: number;
}

export interface ConsumeAPIOutput {
  data: unknown;
  quality: number;
  cost: number;
  disputed: boolean;
  paymentId: string;
  transactionId?: string;
}

export interface CreateEscrowInput {
  provider: string;
  amount: number;
  timeLockHours?: number;
  transactionId?: string;
}

export interface CreateEscrowOutput {
  escrowAddress: string;
  transactionId: string;
  amount: number;
  expiresAt: number;
}

export interface FileDisputeInput {
  paymentId: string;
  reason: string;
  evidence?: Record<string, unknown>;
}

export interface FileDisputeOutput {
  disputeId: string;
  status: DisputeStatus;
  estimatedResolution: number;
}

export interface CheckBalanceInput {
  address?: string;
}

export interface CheckBalanceOutput {
  balance: number;
  pending: number;
  available: number;
}

export interface DiscoverAPIsInput {
  endpoints?: string[];
  category?: string;
}

export interface DiscoverAPIsOutput {
  apis: DiscoveredAPI[];
  total: number;
}

export interface DiscoveredAPI {
  endpoint: string;
  name: string;
  description?: string;
  cost: number;
  qualityGuarantee: number;
  paymentMethods: string[];
  categories: string[];
}

export interface MCPToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export interface MCPServerConfig {
  name: string;
  version: string;
  tools: MCPToolDefinition[];
}

export const KAMIYO_NETWORKS: Record<KamiyoNetwork, NetworkConfig> = {
  mainnet: {
    rpcUrl: 'https://api.mainnet-beta.solana.com',
    programId: '8sUnNU6WBD2SYapCE12S7LwH1b8zWoniytze7ifWwXCM',
    explorer: 'https://solscan.io',
  },
  devnet: {
    rpcUrl: 'https://api.devnet.solana.com',
    programId: 'E5EiaJhbg6Bav1v3P211LNv1tAqa4fHVeuGgRBHsEu6n',
    explorer: 'https://solscan.io?cluster=devnet',
  },
  localnet: {
    rpcUrl: 'http://localhost:8899',
    programId: 'E5EiaJhbg6Bav1v3P211LNv1tAqa4fHVeuGgRBHsEu6n',
    explorer: 'http://localhost:8899',
  },
};

interface NetworkConfig {
  rpcUrl: string;
  programId: string;
  explorer: string;
}

export const DEFAULT_CONFIG: Required<Omit<KamiyoExtensionConfig, 'privateKey' | 'onPayment' | 'onDispute' | 'onQualityCheck'>> = {
  rpcUrl: KAMIYO_NETWORKS.devnet.rpcUrl,
  programId: KAMIYO_NETWORKS.devnet.programId,
  network: 'devnet',
  qualityThreshold: 85,
  maxPrice: 0.01,
  autoDispute: true,
};

export class KamiyoError extends Error {
  constructor(
    message: string,
    public readonly code: KamiyoErrorCode,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'KamiyoError';
  }
}

export type KamiyoErrorCode =
  | 'INSUFFICIENT_FUNDS'
  | 'QUALITY_BELOW_THRESHOLD'
  | 'ESCROW_CREATION_FAILED'
  | 'DISPUTE_FAILED'
  | 'PAYMENT_FAILED'
  | 'API_UNAVAILABLE'
  | 'INVALID_CONFIG'
  | 'WALLET_NOT_INITIALIZED'
  | 'TIMEOUT'
  | 'NETWORK_ERROR';
