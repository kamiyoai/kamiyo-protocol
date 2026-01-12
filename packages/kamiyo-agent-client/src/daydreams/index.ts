/**
 * Daydreams extension for Kamiyo payments and ZK reputation.
 *
 * @example
 * const agent = createDreams({
 *   model: openai('gpt-4o'),
 *   extensions: [kamiyoExtension({ network: 'devnet' })],
 * });
 */

// Extension
export {
  kamiyoExtension,
  createKamiyoExtension,
  KamiyoExtension,
} from './extension';

// Contexts
export {
  kamiyoPaymentContext,
  kamiyoServiceContext,
  kamiyoDisputeContext,
  kamiyoReputationContext,
  composeKamiyoContexts,
} from './context';
export type {
  ContextDefinition,
  ServiceProviderMemory,
  ReputationMemory,
  ProofRecord,
  PeerReputation,
} from './context';

// MCP
export {
  KAMIYO_MCP_TOOLS,
  KAMIYO_MCP_SERVER,
  createKamiyoMCPConfig,
  createKamiyoSSEConfig,
  createMCPHandler,
  KamiyoMCPHandler,
} from './mcp';
export type {
  MCPTransportConfig,
  KamiyoMCPConfig,
  MCPMessage,
  MCPToolCallRequest,
  MCPToolCallResponse,
} from './mcp';

// Types
export {
  KAMIYO_NETWORKS,
  DEFAULT_CONFIG,
  DEFAULT_CIRCUIT_BREAKER_CONFIG,
  KamiyoError,
} from './types';
export type {
  KamiyoMemory,
  PaymentRecord,
  DisputeRecord,
  DisputeStatus,
  DisputeResolution,
  QualityStats,
  EndpointStats,
  PaymentContextInput,
  KamiyoNetwork,
  KamiyoExtensionConfig,
  QualityCheckResult,
  QualityEvaluator,
  CircuitBreakerConfig,
  CircuitBreakerState,
  StorageProvider,
  AuthProvider,
  AuthResult,
  ConsumeAPIInput,
  ConsumeAPIOutput,
  CreateEscrowInput,
  CreateEscrowOutput,
  FileDisputeInput,
  FileDisputeOutput,
  CheckBalanceInput,
  CheckBalanceOutput,
  DiscoverAPIsInput,
  DiscoverAPIsOutput,
  DiscoveredAPI,
  MCPToolDefinition,
  MCPServerConfig,
  KamiyoErrorCode,
} from './types';

// Storage
export {
  MemoryStorage,
  FileStorage,
  createMemoryStorage,
  createFileStorage,
} from './storage';

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
} from './reputation';

// Agent Behaviors
export {
  composeBehaviors,
  reputationProverBehavior,
  qualityEnforcerBehavior,
  serviceDiscovererBehavior,
  paymentOptimizerBehavior,
  createReputationProverState,
  createQualityEnforcerState,
  createServiceDiscovererState,
  DEFAULT_REPUTATION_PROVER_CONFIG,
  DEFAULT_QUALITY_ENFORCER_CONFIG,
  DEFAULT_SERVICE_DISCOVERER_CONFIG,
  DEFAULT_PAYMENT_OPTIMIZER_CONFIG,
} from './behaviors';
export type {
  BehaviorConfig,
  BehaviorResult,
  BehaviorContext,
  BehaviorMemory,
  ComposedBehaviors,
  ReputationProverConfig,
  ReputationProverState,
  QualityEnforcerConfig,
  QualityEnforcerState,
  ServiceDiscovererConfig,
  ServiceDiscovererState,
  PaymentOptimizerConfig,
  ServiceScore,
  EndpointQualityStats,
} from './behaviors';

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
