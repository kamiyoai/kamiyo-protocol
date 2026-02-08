export interface VerifyRequest {
  paymentHeader: string;
  resource: string;
  maxAmount?: number;
  paymentPayload?: Record<string, unknown>;
  paymentRequirements?: Record<string, unknown>;
  x402Version?: number;
}

export interface VerifyResponse {
  valid: boolean;
  isValid?: boolean;
  invalidReason?: string;
  invalidMessage?: string;
  payer: string;
  amount: string;
  resource: string;
  balance: number;
  sufficient: boolean;
  extensions?: Record<string, unknown>;
  error?: string;
}

export interface SettleRequest {
  paymentHeader: string;
  merchantWallet: string;
  amount: number;
  asset: string;
  paymentPayload?: Record<string, unknown>;
  paymentRequirements?: Record<string, unknown>;
  x402Version?: number;
}

export interface SettleResponse {
  success: boolean;
  transaction?: string;
  errorReason?: string;
  errorMessage?: string;
  payer?: string;
  txHash: string;
  amount: number;
  fee: number;
  net: number;
  network: string;
  extensions?: Record<string, unknown>;
  feeDiscount?: { discountPct: number; effectiveFeeBps: number; reason: string };
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

export type DisputeStatus = 'commit_phase' | 'reveal_phase' | 'finalizing' | 'resolved' | 'timeout';

export interface DisputeRecord {
  id: string;
  escrowId: string;
  escrowAddress: string;
  openerWallet: string;
  reason: string;
  oracleVotes: OracleVoteRecord[];
  medianScore: number | null;
  refundPercentage: number | null;
  resolution: string | null;
  finalizeTx: string | null;
  status: DisputeStatus;
  commitPhaseEndsAt: Date;
  revealPhaseEndsAt: Date;
  createdAt: Date;
  resolvedAt: Date | null;
}

export interface OracleVoteRecord {
  oracle: string;
  commitmentHash: string;
  qualityScore: number | null;
  committedAt: Date;
  revealedAt: Date | null;
}

export interface DisputeOpenRequest {
  escrowAddress: string;
  reason: string;
}

export interface DisputeOpenResponse {
  success: boolean;
  disputeId: string;
  escrowAddress: string;
  commitPhaseEndsAt: number;
  revealPhaseEndsAt: number;
  error?: string;
}

export interface DisputeFinalizeRequest {
  disputeId: string;
}

export interface DisputeFinalizeResponse {
  success: boolean;
  txHash: string;
  medianScore: number;
  refundPercentage: number;
  merchantReceived: number;
  payerRefunded: number;
  outlierOracles: string[];
  error?: string;
}

export type TrustTier = 'untrusted' | 'new' | 'basic' | 'good' | 'excellent' | 'trusted';

export interface ReputationRecord {
  wallet: string;
  totalTransactions: number;
  disputesFiled: number;
  disputesWon: number;
  disputesLost: number;
  averageQuality: number;
  reputationScore: number;
  trustTier: TrustTier;
  monthlyVolume: number;
  volumeTier: string;
  feeDiscountPct: number;
  updatedAt: Date;
}

export interface VolumeTier {
  name: string;
  minMonthlyVolume: number;
  discountPct: number;
}

export type PrivacyTier = 'none' | 'basic' | 'full';

export interface PrivacyTierConfig {
  tier: PrivacyTier;
  minReputationScore: number;
  maxTransferAmount: number;
  relayerFeeBps: number;
}

export interface PrivateSettleRequest {
  paymentHeader: string;
  merchantWallet: string;
  amount: number;
  asset: string;
  privacyTier?: PrivacyTier;
}

export interface PrivateSettleResponse {
  success: boolean;
  shadowCommitment?: string;
  shadowNullifier?: string;
  relayerFee?: number;
  amount?: number;
  net?: number;
  fee?: number;
  privacyTier?: PrivacyTier;
  error?: string;
}

export interface ShadowProof {
  commitment: string;
  nullifier: string;
}
