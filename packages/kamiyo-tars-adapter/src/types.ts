import { PublicKey } from '@solana/web3.js';
import BN from 'bn.js';

export const TARS_PROGRAM_ID = new PublicKey('GPd4z3N25UfjrkgfgSxsjoyG7gwYF8Fo7Emvp9TKsDeW');

export const USDC_DEVNET = new PublicKey('Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vn2KGtKJr');
export const USDC_MAINNET = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');

export interface TarsAgentAccount {
  wallet: PublicKey;
  metadataUri: string;
  createdAt: BN;
  active: boolean;
  autoCreated: boolean;
  totalWeightedRating: BN;
  totalWeight: BN;
  avgRating: number;
  lastUpdate: BN;
  jobCount: number;
  feedbackCount: number;
}

export interface TarsJobRecord {
  clientWallet: PublicKey;
  agentWallet: PublicKey;
  paymentAmount: number;
  createdAt: BN;
}

export interface TarsFeedbackRecord {
  jobId: PublicKey;
  rating: number;
  commentUri: string | null;
  timestamp: BN;
}

export interface LinkedPayment {
  kamiyoEscrowPda: PublicKey;
  tarsJobPda: PublicKey;
  paymentAmount: number;
  linkedAt: number;
}

export interface CombinedReputation {
  agentWallet: PublicKey;
  kamiyoReputation: number;
  tarsReputation: number;
  combinedScore: number;
  tarsRating: number;
  tarsJobCount: number;
  tarsFeedbackCount: number;
}

export interface TarsAdapterConfig {
  tarsProgramId?: PublicKey;
  mode: 'tars-only' | 'kamiyo-only' | 'unified';
  syncReputation: boolean;
  reputationWeight: {
    kamiyo: number;
    tars: number;
  };
  autoSubmitFeedback: boolean;
  feedbackDelay: number;
  linkJobsToEscrows: boolean;
}

export const DEFAULT_CONFIG: TarsAdapterConfig = {
  tarsProgramId: TARS_PROGRAM_ID,
  mode: 'unified',
  syncReputation: true,
  reputationWeight: {
    kamiyo: 0.7,
    tars: 0.3,
  },
  autoSubmitFeedback: true,
  feedbackDelay: 0,
  linkJobsToEscrows: true,
};

export type TarsRating = 1 | 2 | 3 | 4 | 5;

export const MAX_METADATA_URI_LENGTH = 200;
export const MAX_COMMENT_URI_LENGTH = 200;
export const MAX_PAYMENT_AMOUNT = 4_294_000_000;
export const MIN_RATING = 1;
export const MAX_RATING = 5;

export function isValidTarsRating(rating: number): rating is TarsRating {
  return Number.isInteger(rating) && rating >= MIN_RATING && rating <= MAX_RATING;
}

export function isValidReputationWeight(weight: { kamiyo: number; tars: number }): boolean {
  return (
    weight.kamiyo >= 0 &&
    weight.kamiyo <= 1 &&
    weight.tars >= 0 &&
    weight.tars <= 1 &&
    Math.abs(weight.kamiyo + weight.tars - 1) < 0.001
  );
}

export function isValidQualityScore(score: number): boolean {
  return Number.isFinite(score) && score >= 0 && score <= 100;
}

export interface PrepareRequest {
  paymentRequirements: {
    network: string;
    maxAmountRequired: string;
    payTo: string;
    asset: string;
    scheme: string;
    extra?: Record<string, unknown>;
  };
  walletAddress: string;
  enableTrustless?: boolean;
  enableKamiyoEscrow?: boolean;
}

export interface PrepareResponse {
  transaction: string;
  paymentRequirements: PrepareRequest['paymentRequirements'];
  tarsJobPda?: string;
  kamiyoEscrowPda?: string;
}

export interface VerifyRequest {
  paymentPayload: {
    x402Version: number;
    scheme: string;
    network: string;
    payload: {
      signature: string;
      transaction?: string;
    };
  };
  paymentRequirements: PrepareRequest['paymentRequirements'];
}

export interface VerifyResult {
  isValid: boolean;
  invalidReason?: string;
  payer?: string;
}

export interface SettleRequest extends VerifyRequest {}

export interface SettleResult {
  success: boolean;
  transaction?: string;
  errorReason?: string;
  tarsJobId?: string;
  kamiyoEscrowId?: string;
}

export interface FeedbackRequest {
  jobId: string;
  rating: TarsRating;
  commentUri?: string;
}

export interface FeedbackResult {
  success: boolean;
  transaction?: string;
  errorReason?: string;
}

export interface DisputeResolutionEvent {
  escrowPda: PublicKey;
  qualityScore: number;
  agentRefund: number;
  providerPayment: number;
  resolvedAt: number;
}

export interface UnifiedMiddlewareConfig {
  payTo: string;
  tarsEnabled: boolean;
  kamiyoEscrowEnabled: boolean;
  minReputation?: number;
  price: string | number;
  network: string;
  facilitatorUrl?: string;
}
