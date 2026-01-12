/**
 * Core utilities for AI agent infrastructure.
 */

// Types
export {
  KamiyoNetwork,
  NetworkConfig,
  KAMIYO_NETWORKS,
  KamiyoErrorCode,
  KamiyoError,
  QualityCheckResult,
  QualityEvaluator,
  CircuitBreakerConfig,
  CircuitBreakerState,
  DEFAULT_CIRCUIT_BREAKER_CONFIG,
  StorageProvider,
  AuthProvider,
  AuthResult,
} from './types';

// Observability
export {
  createObservabilityContext,
  createKamiyoMetrics,
  ConsoleLogger,
  InMemoryTracer,
  InMemoryMetricsRegistry,
} from './observability';
export type {
  Logger,
  LogLevel,
  LogEntry,
  Tracer,
  Span,
  SpanEvent,
  MetricsRegistry,
  Counter,
  Gauge,
  Histogram,
  MetricValue,
  KamiyoMetrics,
  ObservabilityContext,
  SpanExporter,
  LogExporter,
} from './observability';

// Retry
export {
  retry,
  retryWithResult,
  retryWithDeadline,
  retryWithTimeout,
  retryConditions,
  Bulkhead,
  withTimeout,
  DeadlineContext,
  RetryError,
  DEFAULT_RETRY_CONFIG,
} from './retry';
export type { RetryConfig, RetryResult } from './retry';

// Events
export {
  KamiyoEventEmitter,
  KamiyoEventBus,
  createEventEmitter,
  loggingMiddleware,
  metricsMiddleware,
} from './events';
export type {
  KamiyoEvents,
  EventName,
  EventPayload,
  EventHandler,
  EventMiddleware,
} from './events';

// Rate Limiting
export {
  TokenBucket,
  SlidingWindowCounter,
  KeyedRateLimiter,
  CompositeRateLimiter,
  createRateLimitMiddleware,
  RATE_LIMIT_PRESETS,
} from './ratelimit';
export type {
  RateLimitConfig,
  RateLimitResult,
  RateLimiter,
  RateLimitMiddleware,
} from './ratelimit';

// Cache
export {
  LRUCache,
  ResponseCache,
  memoize,
  memoizeAsync,
} from './cache';
export type { Cache, CacheConfig, CacheEntry, CacheStats, ResponseCacheKey } from './cache';

// Health
export {
  HealthChecker,
  healthChecks,
  createHealthHandlers,
} from './health';
export type {
  HealthStatus,
  ComponentHealth,
  HealthReport,
  HealthCheck,
  HealthCheckerConfig,
} from './health';

// Batch Operations
export {
  parallelMap,
  batchExecute,
  batchWithProgress,
  batchReduce,
  sequentialBatch,
  chunk,
  RequestBatcher,
  pipeline,
  DEFAULT_BATCH_CONFIG,
} from './batch';
export type { BatchConfig, BatchResult } from './batch';

// Validation
export {
  validate,
  validateOrThrow,
  createValidator,
  validators,
  NetworkSchema,
  ExtensionConfigSchema,
  BatchConfigSchema,
  RetryConfigSchema,
  RateLimitConfigSchema,
  CacheConfigSchema,
  ConsumeAPIInputSchema,
  CreateEscrowInputSchema,
  FileDisputeInputSchema,
  CheckBalanceInputSchema,
  DiscoverAPIsInputSchema,
  GenerateCommitmentInputSchema,
  ProveReputationInputSchema,
  VerifyProofInputSchema,
  QualityCheckResultSchema,
  ConsumeAPIOutputSchema,
  CreateEscrowOutputSchema,
  FileDisputeOutputSchema,
  CheckBalanceOutputSchema,
  DiscoveredAPISchema,
  DiscoverAPIsOutputSchema,
  HealthStatusSchema,
  ComponentHealthSchema,
  HealthReportSchema,
  MCPToolCallRequestSchema,
  MCPToolCallResponseSchema,
} from './validation';
export type { ValidationResult } from './validation';

// Transaction
export {
  TransactionContext,
  transaction,
  Outbox,
  IdempotencyManager,
  TwoPhaseCoordinator,
  createInMemoryTransactionStorage,
} from './transaction';
export type {
  TransactionStatus,
  TransactionStep,
  TransactionOptions,
  TransactionResult,
  OutboxEntry,
  OutboxConfig,
  IdempotencyRecord,
  IdempotencyConfig,
  TwoPhaseStatus,
  Participant,
  TwoPhaseResult,
} from './transaction';

// Storage
export {
  MemoryStorage,
  FileStorage,
  createMemoryStorage,
  createFileStorage,
} from './storage';

// ZK Reputation
export {
  ReputationManager,
  reputationActions,
  getTierThreshold,
  getQualifyingTier,
  qualifiesForTier,
  TIER_NAMES,
  TIER_THRESHOLDS,
} from './reputation';
export type {
  GenerateCommitmentInput,
  GenerateCommitmentOutput,
  ProveReputationInput,
  ProveReputationOutput,
  VerifyProofInput,
  VerifyProofOutput,
  SerializedProof,
  TierLevel,
  TierName,
  PeerReputation,
} from './reputation';

