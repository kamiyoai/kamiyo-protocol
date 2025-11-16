/**
 * x402 SDK Type Definitions
 */

import { PublicKey, Transaction } from '@solana/web3.js';
import { TsudzukiConfig } from '../retry-handler';

export type Chain = 'solana' | 'ethereum' | 'base';

export interface KamiyoClientConfig {
  apiUrl: string;
  chain: Chain;
  verifierUrl?: string;
  enablex402Resolve?: boolean;
  walletPublicKey?: string | PublicKey;
  rpcUrl?: string;
  retryConfig?: Partial<TsudzukiConfig>;
}

export interface AccessToken {
  token: string;
  expiresAt: number;
  transactionId: string;
  escrowAddress?: string; // Present if x402Resolve enabled
}

export interface PaymentParams {
  amount: number;
  recipient: string;
  metadata?: Record<string, any>;
  enableEscrow?: boolean;
}

export interface DisputeParams {
  transactionId: string;
  reason: string;
  originalQuery: string;
  dataReceived: any;
  expectedCriteria: string[];
  expectedRecordCount?: number;
}

export interface DisputeResult {
  disputeId: string;
  status: 'pending' | 'resolved' | 'rejected';
  qualityScore?: number;
  recommendation?: 'release' | 'partial_refund' | 'full_refund';
  refundPercentage?: number;
  reasoning?: string;
  signature?: string;
}

export interface VerifierResponse {
  quality_score: number;
  recommendation: string;
  refund_percentage: number;
  reasoning: string;
  signature: string;
}

export interface EscrowDetails {
  escrowAddress: string;
  agent: string;
  api: string;
  amount: number;
  status: 'active' | 'released' | 'disputed' | 'resolved';
  createdAt: number;
  expiresAt: number;
}

export interface DisputeStatus {
  disputeId: string;
  transactionId: string;
  status: 'pending' | 'verifying' | 'resolved' | 'rejected';
  qualityScore?: number;
  refundPercentage?: number;
  refundAmount?: number;
  createdAt: number;
  resolvedAt?: number;
  reasoning?: string;
}

export class X402Error extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode?: number
  ) {
    super(message);
    this.name = 'X402Error';
  }
}
