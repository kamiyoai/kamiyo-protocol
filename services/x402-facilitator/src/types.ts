import { PublicKey } from '@solana/web3.js';

export interface VerifyRequest {
  paymentHeader: string;
  resource: string;
  maxAmount?: number;
}

export interface VerifyResponse {
  valid: boolean;
  payer: string;
  amount: string;
  resource: string;
  balance: number;
  sufficient: boolean;
  error?: string;
}

export interface SettleRequest {
  paymentHeader: string;
  merchantWallet: string;
  amount: number;
  asset: string;
}

export interface SettleResponse {
  success: boolean;
  txHash: string;
  amount: number;
  fee: number;
  net: number;
  error?: string;
}

export interface EscrowCreateRequest {
  paymentHeader: string;
  merchantWallet: string;
  amount: number;
  asset: string;
  sessionId: string;
  timeLockSeconds?: number;
}

export interface EscrowCreateResponse {
  success: boolean;
  escrowAddress: string;
  txHash: string;
  amount: number;
  fee: number;
  expiresAt: number;
  error?: string;
}

export interface EscrowReleaseRequest {
  escrowAddress: string;
  qualityScore?: number;
}

export interface EscrowReleaseResponse {
  success: boolean;
  txHash: string;
  qualityScore: number;
  refundPercentage: number;
  merchantReceived: number;
  payerRefunded: number;
  error?: string;
}

export interface DecodedPayment {
  signature: string;
  payer: string;
  timestamp: number;
  nonce: string;
  resource: string;
  amount: string;
  authSignature: string;
}

export type SettlementStatus = 'pending' | 'confirmed' | 'failed';
export type EscrowStatus = 'active' | 'disputed' | 'released' | 'refunded' | 'expired';

export interface Settlement {
  id: string;
  merchantWallet: string;
  payerWallet: string;
  amount: number;
  feeAmount: number;
  asset: string;
  txHash: string;
  status: SettlementStatus;
  network: string;
  createdAt: Date;
}

export interface EscrowRecord {
  id: string;
  settlementId: string | null;
  escrowAddress: string;
  payerWallet: string;
  merchantWallet: string;
  amount: number;
  feeAmount: number;
  qualityScore: number | null;
  releaseTx: string | null;
  disputeId: string | null;
  status: EscrowStatus;
  sessionId: string;
  createdAt: Date;
  releasedAt: Date | null;
  expiresAt: Date;
}
