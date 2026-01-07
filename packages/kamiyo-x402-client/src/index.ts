/**
 * @kamiyo/x402-client
 *
 * x402 payment protocol client for AI agent micropayments.
 *
 * Payment Backends:
 *
 * 1. PayAI Network Facilitator (https://facilitator.payai.network)
 *    - Cross-chain USDC payments via x402 protocol
 *    - EVM: Base, Polygon, Arbitrum, Optimism, Avalanche, Sei, IoTeX, Peaq, XLayer
 *    - Non-EVM: Solana
 *    - EIP-712 signatures, verification caching, batch operations
 *    - Express/Next.js middleware for payment gating
 *
 * 2. Kamiyo Escrow (Solana)
 *    - On-chain escrow with dispute resolution
 *    - SLA monitoring with automatic refunds
 *    - Quality-based graduated refund calculations
 *
 * @see https://kamiyo.ai
 * @see https://payai.network
 * @see https://github.com/coinbase/x402
 */

// Client
export {
  X402KamiyoClient,
  createX402KamiyoClient,
  EscrowStatus,
} from './client';
export type {
  X402ClientConfig,
  SlaParams,
  SlaValidationResult,
  X402RequestOptions,
  X402Response,
  PaymentResult,
  EscrowInfo,
} from './client';

// Errors
export { X402Error, isX402Error, wrapError } from './errors';
export type { X402ErrorCode } from './errors';

// Retry/resilience
export { RetryHandler, CircuitBreaker, ResilientExecutor, DEFAULT_RETRY_CONFIG } from './retry';
export type { RetryConfig } from './retry';

// Escrow
export { EscrowHandler, createEscrowHandler } from './escrow';
export type { EscrowConfig, EscrowCreateParams, EscrowResult } from './escrow';

// Validation
export {
  validatePublicKey,
  validateAmountSol,
  validateAmountLamports,
  validateTimeLock,
  validateQualityThreshold,
  validateTransactionId,
  validateUrl,
  validateTimeout,
  assertValid,
  validateAll,
  sanitizeTransactionId,
  generateTransactionId,
  LIMITS,
} from './validation';
export type { ValidationResult } from './validation';

// Signing
export {
  PaymentSigner,
  createPaymentSigner,
  signPaymentMessage,
  verifyPaymentSignature,
  generateNonce,
  createSignedPayment,
  createPaymentHeader,
  parsePaymentHeader,
  decodePaymentHeader,
  verifyPaymentHeader,
  isPaymentFresh,
  createEscrowProofHeader,
} from './signing';
export type {
  SignedPayment,
  X402PaymentComponents,
} from './signing';

// Types from types.ts (protocol constants)
export {
  SOLANA_NETWORK_ID,
  SOLANA_DEVNET_ID,
  MIN_ESCROW_AMOUNT_LAMPORTS,
  MAX_ESCROW_AMOUNT_LAMPORTS,
  MIN_TIME_LOCK_SECONDS,
  MAX_TIME_LOCK_SECONDS,
  QUALITY_REFUND_SCALE,
} from './types';

// PayAI Network facilitator
export {
  PayAIFacilitator,
  PayAIError,
  createPayAIFacilitator,
  NETWORKS as PAYAI_NETWORKS,
  payaiMiddleware,
  withPayAI,
} from './payai';
export type {
  PayAIConfig,
  PayAINetwork,
  PayAIErrorCode,
  NetworkConfig,
  PaymentRequirement,
  VerifyRequest,
  SettleRequest,
  VerifyResult,
  SettleResult,
  PayAI402Response,
  ListResponse,
  HealthResponse,
  BatchVerifyResult,
  BatchSettleResult,
  PayAIMiddlewareRequest,
  PayAIMiddlewareResponse,
  PayAINextFunction,
  PayAIMiddlewareOptions,
} from './payai';
