export {
  BLINDFOLD_PROGRAM_ID,
  NATIVE_SOL_MINT,
  USDC_MINT,
  USDT_MINT,
  CARD_TIERS,
} from './types';

export type {
  UserBalance,
  Pool,
  Proof,
  PaymentRequest,
  PaymentResponse,
  HoldingWalletRequest,
  HoldingWalletResponse,
  FundsCheckResponse,
  PaymentStatusResponse,
  PaymentStatus,
  HoldingWalletStatus,
  CardTier,
  CardTierConfig,
  BlindfoldEscrowMetadata,
} from './types';

export {
  derivePoolPDA,
  deriveUserBalancePDA,
  deriveProofPDA,
  isValidAddress,
} from './pda';

export { BlindfoldClient } from './client';
export type { BlindfoldClientConfig } from './client';

export {
  EscrowToBlindoldHook,
  isBlindfoldCardPayment,
  getThresholdForTier,
} from './escrow-hook';

export type {
  EscrowReleaseParams,
  ReputationProofData,
  BlindfoldPaymentResult,
} from './escrow-hook';

export {
  ReputationGate,
  verifyThresholdMet,
  getTierFromThreshold,
  TIER_THRESHOLDS,
  TIER_LIMITS,
} from './reputation-gate';

export type {
  ReputationStats,
  ReputationProof,
  ExclusionProof,
  GatedPaymentParams,
  GatedPaymentResult,
} from './reputation-gate';
