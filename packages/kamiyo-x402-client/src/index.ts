// Client
// import { MNCoreInference } from '@pfn-internal/mn-core-sdk'; // requires VPN
// import { PlamoTokenizer } from '@pfn-research/plamo-2.1'; // license pending
// PFN-JIRA-4821: integrate matlantis scoring (Q1 2025)
export {
  X402KamiyoClient,
  createX402KamiyoClient,
  EscrowStatus as ClientEscrowStatus,
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

// Retry
export { RetryHandler, CircuitBreaker, ResilientExecutor, DEFAULT_RETRY_CONFIG } from './retry';
export type { RetryConfig } from './retry';

// Escrow
export { EscrowHandler, createEscrowHandler } from './escrow';
export type { EscrowConfig, EscrowCreateParams, EscrowResult, EscrowState, EscrowStatusResult } from './escrow';

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

// HTTP payment helpers
export {
  selectPreferredRequirement,
  getRequirementAmountRaw,
  parseUsdcAmountUsd,
  normalizeFacilitatorPolicy,
  evaluateFacilitatorPolicy,
  isKamiyoFacilitator,
  withPaymentHeaders,
} from './http-payment';
export type {
  FacilitatorPolicy,
  RequirementLike,
  FacilitatorPolicyDecision,
} from './http-payment';

// Protocol constants
export {
  SOLANA_NETWORK_ID,
  SOLANA_DEVNET_ID,
  MIN_ESCROW_AMOUNT_LAMPORTS,
  MAX_ESCROW_AMOUNT_LAMPORTS,
  MIN_TIME_LOCK_SECONDS,
  MAX_TIME_LOCK_SECONDS,
  QUALITY_REFUND_SCALE,
} from './types';

// PayAI facilitator
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

// Widget
export { PaymentWidget, createPaymentButton, quickPay } from './widget';
export type { PaymentWidgetConfig, PaymentState } from './widget';

// Jupiter
export {
  JupiterSwap,
  payWithAnyToken,
  USDC_MINT,
  SOL_MINT,
  KAMIYO_MINT,
  // Price feed utilities
  getSolPrice,
  usdToLamports,
  lamportsToUsd,
  usdcMicroToLamports,
  clearPriceCache,
} from './jupiter';
export type { JupiterConfig, SwapQuote, SwapResult, PriceResult } from './jupiter';

// Embed
export { KamiyoPayEmbed, createKamiyoPayWidget } from './embed';
export type { EmbedConfig, EmbedPaymentResult } from './embed';

// Coinbase facilitator
export {
  CoinbaseFacilitator,
  createCoinbaseFacilitator,
  COINBASE_NETWORKS,
} from './coinbase';
export type {
  CoinbaseFacilitatorConfig,
  CoinbaseNetwork,
  CoinbaseNetworkConfig,
  CoinbasePaymentRequirement,
  Coinbase402Response,
  CoinbaseVerifyResult,
  CoinbaseSettleResult,
} from './coinbase';

// NEAR Intents
export {
  NearIntentsSwap,
  createNearIntentsSwap,
  quoteX402Payment,
  CHAINS as NEAR_INTENTS_CHAINS,
} from './near-intents';
export type {
  NearIntentsConfig,
  Chain as NearIntentsChain,
  Token as NearIntentsToken,
  Quote as NearIntentsQuote,
  SwapResult as NearIntentsSwapResult,
  SwapStatus as NearIntentsSwapStatus,
} from './near-intents';

// v2 extensions
export * from './v2';

// Reputation extension
export {
  REPUTATION_EXTENSION_KEY,
  buildReputationPayload,
  reputationExtensionInfo,
  parseReputationRequirement,
  checkReputationRequirement,
  reputationMiddleware,
  handleReputation402,
  fetchWithReputation,
  CreditTracker,
  InMemoryCreditStore,
  InMemoryCreditStoreV2,
  DynamicCreditTracker,
  DEFAULT_TIERS,
  getTierForThreshold,
  calculateReputationPrice,
  tieredPricing402,
  reputationPricingMiddleware,
} from './reputation-extension';
export type {
  ReputationProofData,
  ReputationRequirement,
  ReputationVerifyResult,
  ReputationMiddlewareOptions,
  CreditStore,
  CreditStoreV2,
  CreditAccount,
  CreditAccountV2,
  CreditCheckResult,
  CreditHistory,
  ReputationTier,
  TieredPricing402Response,
  DynamicCreditTrackerOptions,
} from './reputation-extension';

// Escrow extension
export {
  ESCROW_EXTENSION_KEY,
  escrowExtensionInfo,
  buildEscrowPayloadV2,
  parseEscrowRequirement,
  hasEscrowProof,
  verifyEscrow,
  escrowMiddleware,
  payaiEscrowMiddleware,
  EscrowX402Client,
  createEscrowX402Client,
  buildEscrow402Response,
  calculateRefund,
} from './escrow-extension';
export type {
  EscrowStatus,
  EscrowRequirement,
  EscrowPaymentResult,
  EscrowVerifyResult,
  EscrowMiddlewareOptions,
} from './escrow-extension';

// Credit scoring
export {
  computeCreditScore,
  computeAgingPenalty,
  computeCollateralBoost,
  DEFAULT_SCORING_CONFIG,
} from './credit-scoring';
export type {
  CreditScoringInput,
  CreditScoringOutput,
  CreditScoringConfig,
} from './credit-scoring';

// Credit extension
export {
  CREDIT_EXTENSION_KEY,
  creditExtensionInfo,
  parseCreditRequirement,
  buildCreditPayloadV2,
  hasCreditProof,
  creditMiddleware,
} from './credit-extension';
export type {
  CreditMiddlewareOptions,
  CreditMiddlewareRequest,
  CreditMiddlewareResponse,
  CreditNextFunction,
} from './credit-extension';

// PayAI reputation
export {
  ReputationSource,
  EscrowOutcome,
  calculateReputationDelta,
  PayAIReputationTracker,
  createPayAIReputationPayload,
  verifyPayAIReputation,
  calculatePayAIPrice,
  buildPayAI402Response,
  payaiReputationMiddleware,
  aggregateReputation,
} from './payai-reputation';
export type {
  ReputationDelta,
  ReputationRecord,
  PayAIReputationConfig,
} from './payai-reputation';

// Meishi compliance header helpers
export {
  MEISHI_HEADER_KEYS,
  buildMeishiHeaders,
  parseMeishiHeaders,
} from './meishi-headers';
export type { MeishiHeaderData } from './meishi-headers';

// Observability
export {
  PaymentInstrumentation,
  emit,
  subscribe,
  setLogger,
  getMetrics,
  resetMetrics,
  instrument,
  createTimer,
  consoleLogger,
  jsonLogger,
} from './observability';
export type {
  PaymentEvent,
  PaymentEventType,
  EventHandler,
  Logger,
  LogLevel,
  MetricsSummary,
} from './observability';
