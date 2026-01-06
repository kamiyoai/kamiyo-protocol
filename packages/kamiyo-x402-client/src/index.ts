/**
 * @kamiyo/x402-client
 *
 * x402 payment client with Kamiyo escrow protection and SLA enforcement.
 * Enables autonomous agents to make protected payments with dispute resolution.
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
