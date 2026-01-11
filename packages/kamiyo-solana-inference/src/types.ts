import { PublicKey } from '@solana/web3.js';
import { BN } from '@coral-xyz/anchor';
export { KAMIYO_PROGRAM_ID, modelIdFromString } from '@kamiyo/solana-common';

export interface InferenceEscrow {
  user: PublicKey;
  modelOwner: PublicKey;
  modelId: Uint8Array;
  amount: BN;
  qualityThreshold: number;
  status: InferenceStatus;
  qualityScore: number | null;
  createdAt: BN;
  expiresAt: BN;
  bump: number;
}

export enum InferenceStatus {
  Pending = 0,
  Settled = 1,
  Refunded = 2,
  Expired = 3,
}

export interface CreateEscrowParams {
  model: string;
  amount: number | BN;
  qualityThreshold?: number;
  expiresIn?: number;
}

export interface EscrowResult {
  escrowPda: PublicKey;
  escrowId: string;
  signature: string;
}

export interface SettlementResult {
  qualityScore: number;
  userRefund: BN;
  providerPayment: BN;
  signature: string;
}
