/**
 * Radr integration types for ShadowWire/ShadowPay/ShadowID.
 */

import { PublicKey } from '@solana/web3.js';

// ShadowWire tokens
export const SHADOW_TOKENS = [
  'SOL', 'RADR', 'USDC', 'USDT', 'ORE', 'BONK', 'GODL', 'ZEC',
  'JUP', 'PYTH', 'WIF', 'POPCAT', 'FARTCOIN', 'AI16Z', 'GRIFFAIN',
  'PENGU', 'USD1',
] as const;

export type ShadowToken = typeof SHADOW_TOKENS[number];

export interface ShadowWireConfig {
  debug?: boolean;
  apiKey?: string;
  baseUrl?: string;
}

export type TransferType = 'internal' | 'external';

export interface ShieldedBalance {
  token: ShadowToken;
  available: number;
  poolAddress: string;
}

export interface TransferRequest {
  sender: string;
  recipient: string;
  amount: number;
  token: ShadowToken;
  type: TransferType;
}

export interface TransferResult {
  success: boolean;
  signature?: string;
  relayerFee?: number;
  error?: string;
}

// ShadowID
export interface ShadowIdentity {
  commitment: string;
  tier: 'lite' | 'active';
  rateLimit: number;
  epoch: number;
}

export interface ShadowIdProof {
  commitment: string;
  nullifier: string;
  proof: Uint8Array;
  epoch: number;
}

// Escrow
export interface PrivateEscrowConfig {
  privateDeposit: boolean;
  privateSettlement: boolean;
  reputationGate?: number;
  timeLockSeconds: number;
  qualityThreshold?: number;
}

export interface PrivateEscrowResult {
  success: boolean;
  escrowPda?: string;
  transactionId?: string;
  depositSignature?: string;
  shadowProof?: {
    commitment: string;
    nullifier: string;
  };
  error?: string;
}

export interface ReputationGateResult {
  eligible: boolean;
  meetsThreshold: boolean;
  tier: 'none' | 'bronze' | 'silver' | 'gold' | 'platinum';
  proof?: {
    commitment: string;
    threshold: number;
    proofBytes: Uint8Array;
  };
  error?: string;
}

// Disputes
export interface PrivateDisputeParams {
  escrowPda: string;
  transactionId: string;
  reason: string;
  evidenceHash?: string;
  revealAmount?: boolean;
}

export interface PrivateDisputeResult {
  success: boolean;
  disputeId?: string;
  oracleCommitDeadline?: number;
  error?: string;
}

export interface DisputeSettlement {
  qualityScore: number;
  refundPercentage: number;
  agentRefund: number;
  providerPayout: number;
  privateSettlement: boolean;
}

// Client config
export interface RadrClientConfig {
  rpcUrl: string;
  walletPubkey: string;
  shadowWire?: ShadowWireConfig;
  kamiyoProgramId?: string;
  defaultEscrowConfig?: Partial<PrivateEscrowConfig>;
  debug?: boolean;
}

// x402 payment requirements
export interface PrivateX402Requirement {
  required: boolean;
  amount: number;
  token: ShadowToken;
  provider: string;
  privatePaymentSupported: boolean;
  reputationGate?: number;
  escrowAvailable: boolean;
}

export interface PrivateX402Response<T = unknown> {
  success: boolean;
  data?: T;
  paymentProof?: {
    type: 'shadow' | 'escrow' | 'direct';
    commitment?: string;
    escrowPda?: string;
    signature?: string;
  };
  error?: string;
}

// Wallet adapter (compatible with @solana/wallet-adapter)
export interface WalletAdapter {
  publicKey: PublicKey | null;
  signMessage?(message: Uint8Array): Promise<Uint8Array>;
  signTransaction?<T>(transaction: T): Promise<T>;
  signAllTransactions?<T>(transactions: T[]): Promise<T[]>;
}

// Constants
export const RADR_TOKEN_MINT = 'CzFvsLdUazabdiu9TYXujj4EY495fG7VgJJ3vQs6bonk';
export const SHADOWPAY_RELAYER_FEE_BPS = 100;
export const SHADOWID_LITE_RATE_LIMIT = 1;
export const SHADOWID_ACTIVE_RATE_LIMIT = 10;

// Token decimals
export const TOKEN_DECIMALS: Record<ShadowToken, number> = {
  SOL: 9,
  RADR: 9,
  USDC: 6,
  USDT: 6,
  ORE: 11,
  BONK: 5,
  GODL: 9,
  ZEC: 8,
  JUP: 6,
  PYTH: 6,
  WIF: 6,
  POPCAT: 9,
  FARTCOIN: 6,
  AI16Z: 9,
  GRIFFAIN: 6,
  PENGU: 6,
  USD1: 6,
};
