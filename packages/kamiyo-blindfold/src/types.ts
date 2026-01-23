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

// Swarm Payroll Types

export interface SwarmMember {
  agentPk: PublicKey;
  email: string;
  weight: number; // 0-100, percentage of swarm earnings
  tier?: CardTier;
}

export interface SwarmConfig {
  swarmId: string;
  name: string;
  members: SwarmMember[];
  createdAt: number;
  updatedAt: number;
}

export interface SwarmDistribution {
  member: SwarmMember;
  amount: bigint;
  percentage: number;
}

export interface SwarmPayoutResult {
  swarmId: string;
  totalAmount: bigint;
  distributions: Array<{
    agentPk: string;
    email: string;
    amount: bigint;
    paymentId: string;
    holdingWallet: string;
    transferSignature: string;
    tier: CardTier;
  }>;
  timestamp: number;
}

export interface BatchPaymentRequest {
  payments: Array<{
    amount: number;
    currency: 'SOL' | 'USDC' | 'USDT';
    recipientEmail: string;
    agentPk?: string;
    requestedTier?: CardTier;
  }>;
  swarmId?: string;
  taskId?: string;
}

export interface BatchPaymentResponse {
  success: boolean;
  batchId: string;
  payments: Array<{
    paymentId: string;
    recipientEmail: string;
    cryptoAddress?: string;
    cryptoAmount?: string;
    usdAmount: number;
    totalUsdAmount: number;
    feeAmount: number;
    expiresAt: string;
    status: PaymentStatus;
    error?: string;
  }>;
  totalUsdAmount: number;
  totalFees: number;
}

// Agent Card Types (Spending Side)

export interface AgentCard {
  agentPk: string;
  email: string;
  tier: CardTier;
  budgetLimit: number;
  totalFunded: number;
  lastFundedAt?: number;
  createdAt: number;
}

export interface AgentCardFunding {
  agentPk: string;
  amount: number;
  currency: 'SOL' | 'USDC' | 'USDT';
  paymentId: string;
  status: PaymentStatus;
  fundedAt: number;
}

export interface AgentBudget {
  agentPk: string;
  dailyLimit: number;
  monthlyLimit: number;
  totalLimit: number;
  usedToday: number;
  usedThisMonth: number;
  usedTotal: number;
  lastResetDay: number;
  lastResetMonth: number;
}

export interface FundAgentRequest {
  agentPk: string;
  amount: number;
  currency: 'SOL' | 'USDC' | 'USDT';
  email?: string;
  tier?: CardTier;
}

// SwarmTeam Types

export interface SwarmTeam {
  teamId: string;
  name: string;
  members: SwarmTeamMember[];
  budget: SwarmTeamBudget;
  createdAt: number;
  updatedAt: number;
}

export interface SwarmTeamMember {
  agentPk: string;
  role: 'leader' | 'member';
  drawLimit: number;
  drawn: number;
  lastDrawAt?: number;
}

export interface SwarmTeamBudget {
  total: number;
  available: number;
  currency: 'SOL' | 'USDC' | 'USDT';
  dailyLimit: number;
  usedToday: number;
  lastResetDay: number;
}

export interface SwarmTeamDraw {
  teamId: string;
  agentPk: string;
  amount: number;
  paymentId: string;
  purpose?: string;
  drawnAt: number;
}

export interface FundTeamRequest {
  teamId: string;
  amount: number;
  currency: 'SOL' | 'USDC' | 'USDT';
}

export interface DrawFromTeamRequest {
  teamId: string;
  agentPk: string;
  amount: number;
  purpose?: string;
}
