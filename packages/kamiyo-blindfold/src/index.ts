// Types
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
  BlindoldEscrowMetadata,
} from './types';

// PDA helpers
export {
  derivePoolPDA,
  deriveUserBalancePDA,
  deriveProofPDA,
  isValidAddress,
} from './pda';

// Client
export { BlindfoldClient } from './client';
export type { BlindfoldClientConfig } from './client';

// Escrow hook
export {
  EscrowToBlindoldHook,
  isBlindoldCardPayment,
  getThresholdForTier,
} from './escrow-hook';

export type {
  EscrowReleaseParams,
  ReputationProofData,
  BlindofoldPaymentResult,
} from './escrow-hook';
