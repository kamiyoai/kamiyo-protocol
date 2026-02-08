import type { Keypair, Connection } from '@solana/web3.js';
import type { FacilitatorPolicy } from '@kamiyo/x402-client';

export interface PaykitConfig {
  /** Solana keypair for signing transactions */
  keypair: Keypair;
  /** Solana RPC connection */
  connection: Connection;
  /** KAMIYO program ID */
  programId?: string;
  /** Maximum price per x402 request in USD */
  maxPriceUsd?: number;
  /** Preferred network for payments */
  preferredNetwork?: string;
  /** Facilitator routing policy */
  facilitatorPolicy?: FacilitatorPolicy;
  /** Auto-dispute threshold (0-100). Below this quality score, auto-dispute. */
  autoDisputeThreshold?: number;
  /** Time lock for escrows in seconds */
  defaultTimeLockSeconds?: number;
}

export interface PaymentOptions {
  /** Maximum price in USD to pay */
  maxPriceUsd?: number;
  /** Expected response fields for quality assessment */
  expectedFields?: string[];
  /** Minimum quality score (0-100) */
  minQuality?: number;
  /** Request timeout in ms */
  timeoutMs?: number;
  /** HTTP method */
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  /** Request body */
  body?: unknown;
  /** Additional headers */
  headers?: Record<string, string>;
}

export interface PaymentResult {
  success: boolean;
  /** Response data if successful */
  data?: unknown;
  /** Whether payment was required */
  paid: boolean;
  /** Payment details if paid */
  payment?: {
    amountUsd: number;
    network: string;
    signature?: string;
  };
  /** Quality assessment if escrow was used */
  quality?: {
    score: number;
    rationale: string;
  };
  /** Error message if failed */
  error?: string;
}

export interface EscrowOptions {
  /** Amount in SOL */
  amountSol: number;
  /** Time lock in seconds */
  timeLockSeconds?: number;
  /** Job/transaction identifier */
  jobId: string;
  /** Quality threshold for auto-release (0-100) */
  qualityThreshold?: number;
}

export interface EscrowResult {
  success: boolean;
  escrowAddress?: string;
  signature?: string;
  error?: string;
}

export type EscrowStatus = 'pending' | 'funded' | 'released' | 'disputed' | 'resolved' | 'expired';

export interface EscrowState {
  address: string;
  status: EscrowStatus;
  amountSol: number;
  provider: string;
  requester: string;
  createdAt: Date;
  expiresAt: Date;
}

export interface DisputeOptions {
  escrowAddress: string;
  qualityScore: number;
  evidence: string;
  requestedRefundPercent: number;
}

export interface DisputeResult {
  success: boolean;
  disputeId?: string;
  signature?: string;
  error?: string;
}

export interface ReputationInfo {
  address: string;
  score: number;
  tier: 'trusted' | 'standard' | 'caution' | 'avoid';
  totalTransactions: number;
  disputeRate: number;
  avgResponseTime?: number;
}

export interface WalletBalance {
  sol: number;
  usdc?: number;
  kamiyo?: number;
}

export interface JobContext {
  jobId: string;
  description: string;
  requester: string;
  amountSol: number;
  escrowAddress?: string;
  status: 'pending' | 'accepted' | 'in_progress' | 'delivered' | 'completed' | 'disputed';
  deliverable?: string;
  qualityScore?: number;
}

// Backward compat alias
export type AgentWalletConfig = PaykitConfig;
