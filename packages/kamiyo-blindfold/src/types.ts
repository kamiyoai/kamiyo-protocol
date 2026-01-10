import { PublicKey } from '@solana/web3.js';

export const BLINDFOLD_PROGRAM_ID = new PublicKey(
  '4VBEvYSEFBr7B3b6ahgUdMnR9hPZLnZJy6rHVM8kcMsn'
);

export const NATIVE_SOL_MINT = new PublicKey(
  'So11111111111111111111111111111111111111112'
);
export const USDC_MINT = new PublicKey(
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
);
export const USDT_MINT = new PublicKey(
  'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB'
);

export interface UserBalance {
  wallet: PublicKey;
  tokenMint: PublicKey;
  available: bigint;
  deposited: bigint;
  withdrawn: bigint;
  bump: number;
}

export interface Pool {
  tokenMint: PublicKey;
  totalDeposited: bigint;
  bump: number;
}

export interface Proof {
  sender: PublicKey;
  nonce: bigint;
  amount: bigint;
  tokenMint: PublicKey;
  used: boolean;
  bump: number;
  proofBytes: Uint8Array;
  commitmentBytes: Uint8Array;
  blindingFactorBytes: Uint8Array;
}

export interface PaymentRequest {
  amount: number;
  currency: 'SOL' | 'USDC' | 'USDT';
  recipientEmail: string;
  recipientName?: string;
  useZkProof?: boolean;
  agentPk?: string;
  reputationCommitment?: string;
  reputationProof?: string;
  requestedTier?: CardTier;
}

export interface PaymentResponse {
  paymentId: string;
  cryptoAddress: string;
  cryptoAmount: string;
  cryptoCurrency: string;
  usdAmount: number;
  totalUsdAmount: number;
  feeAmount: number;
  expiresAt: string;
  status: PaymentStatus;
}

export interface HoldingWalletRequest {
  paymentId: string;
  amount: string;
  tokenMint: string;
}

export interface HoldingWalletResponse {
  paymentId: string;
  holdingWalletAddress: string;
  amount: string;
  tokenMint: string;
  status: HoldingWalletStatus;
}

export interface FundsCheckResponse {
  success: boolean;
  message: string;
  holdingWalletAddress: string;
  expectedAmount: string;
  actualAmount: string;
  shortfall?: string;
}

export interface PaymentStatusResponse {
  paymentId: string;
  status: PaymentStatus;
  transactionHash?: string;
  confirmedAt?: string;
  giftCardCreated: boolean;
  emailSent: boolean;
}

export type PaymentStatus =
  | 'pending'
  | 'processing'
  | 'confirmed'
  | 'failed'
  | 'expired'
  | 'manual_processing_required';

export type HoldingWalletStatus =
  | 'pending'
  | 'processing'
  | 'completed'
  | 'failed';

export type CardTier = 'basic' | 'standard' | 'premium' | 'elite';

export interface CardTierConfig {
  tier: CardTier;
  reputationThreshold: number;
  limit: number;
}

export const CARD_TIERS: CardTierConfig[] = [
  { tier: 'basic', reputationThreshold: 0, limit: 100 },
  { tier: 'standard', reputationThreshold: 70, limit: 500 },
  { tier: 'premium', reputationThreshold: 85, limit: 2000 },
  { tier: 'elite', reputationThreshold: 95, limit: 10000 },
];

export interface BlindfoldEscrowMetadata {
  blindfoldCard: boolean;
  recipientEmail: string;
  requestedTier?: CardTier;
}
