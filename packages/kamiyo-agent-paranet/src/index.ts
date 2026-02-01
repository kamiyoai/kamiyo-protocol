export * from './types';

export {
  isValidGlobalId,
  escapeSparql,
  GLOBAL_ID_REGEX,
  TASK_TYPES,
  TIER_NAMES,
  TIER_THRESHOLDS,
  LIMITS,
  scoreToTierIndex,
  tierIndexToName,
  scoreToTierName,
  clamp,
  safeInt,
} from './shared';

export {
  createLogger,
  setDefaultLogger,
  getLogger,
  nullLogger,
  generateCorrelationId,
  createTimer,
} from './logger';
export type { Logger, LogLevel, LogContext, LoggerConfig, LoggerType } from './logger';

export {
  withRetry,
  CircuitBreaker,
  CircuitOpenError,
  ResilientExecutor,
  getDefaultExecutor,
  setDefaultExecutor,
  DEFAULT_RETRY_CONFIG,
  DEFAULT_CIRCUIT_BREAKER_CONFIG,
} from './resilience';
export type { RetryConfig, CircuitBreakerConfig } from './resilience';

export {
  LRUCache,
  CacheInvalidator,
  MemoryCacheAdapter,
  RedisCacheAdapter,
  createCacheWithInvalidation,
  createRedisCache,
  DEFAULT_CACHE_CONFIG,
} from './cache';
export type { CacheEntry, CacheConfig, CacheStats, CacheAdapter, RedisCacheConfig } from './cache';

export {
  checkHealth,
  checkLiveness,
  checkReadiness,
  HealthCheckRegistry,
} from './health';
export type { HealthStatus, HealthCheckResult, HealthCheckOptions } from './health';

export {
  EIP712_DOMAIN,
  EIP712_TYPES,
  extractAddressFromGlobalId,
  verifyTaskCompletionSignature,
  verifyCapabilityAttestationSignature,
  verifyTrustRelationshipSignature,
  createSignatureVerifier,
  createTaskCompletionTypedData,
  createCapabilityAttestationTypedData,
  createTrustRelationshipTypedData,
  hashTaskCompletion,
  hashCapabilityAttestation,
  hashTrustRelationship,
} from './signatures';
export type {
  SignedTaskCompletion,
  SignedCapabilityAttestation,
  SignedTrustRelationship,
  SignatureVerificationResult,
  SignatureConfig,
} from './signatures';

export {
  initializeMetrics,
  getMetrics,
  resetMetrics,
  recordQuery,
  recordPublish,
  recordCacheAccess,
  recordScoreCalculation,
  recordSignatureVerification,
  updateCacheSize,
  updateDkgConnections,
  updateCircuitBreakerState,
  createMetricsTimer,
} from './metrics';
export type { ParanetMetrics, ParanetMetricLabels, MetricAttributes } from './metrics';

export {
  TaskCompletionSchema,
  CapabilityAttestationSchema,
  TrustRelationshipSchema,
  buildTaskCompletionAsset,
  buildCapabilityAttestationAsset,
  buildTrustRelationshipAsset,
  parseTaskCompletionResult,
  parseCapabilityAttestationResult,
  parseTrustRelationshipResult,
  SCHEMA_VERSION,
  CURRENT_VERSION,
  isCompatibleVersion,
  extractSchemaVersion,
  validateSchemaVersion,
} from './schemas/index';
export type { SchemaVersion } from './schemas/index';

export {
  ShutdownManager,
  getDefaultShutdownManager,
  setDefaultShutdownManager,
  registerShutdownHandler,
  installProcessShutdownHandlers,
  gracefulShutdown,
  createCacheShutdownHandler,
  createRedisShutdownHandler,
  createMetricsShutdownHandler,
  createCircuitBreakerShutdownHandler,
} from './shutdown';
export type { ShutdownHandler, ShutdownManagerConfig } from './shutdown';

export * as sparqlQueries from './queries/index';

export {
  CreditScoreCalculator,
  getQuickScore,
  compareAgents,
} from './scoring/index';

export {
  ParanetPublisher,
  createDKGClient,
  quickPublishTask,
} from './publishing/index';

export {
  ProviderDiscovery,
  findBestProvider,
} from './discovery/index';

import type {
  DKGClient,
  ParanetConfig,
  TaskCompletion,
  CapabilityAttestation,
  TrustRelationship,
  ProviderSearchCriteria,
  ProviderSearchResult,
  CreditScore,
  PublishResult,
  QueryResult,
} from './types';
import { ParanetPublisher, createDKGClient } from './publishing/index';
import { ProviderDiscovery } from './discovery/index';
import { CreditScoreCalculator } from './scoring/index';

export class AgentParanetClient {
  private dkg: DKGClient;
  private publisher: ParanetPublisher;
  private discovery: ProviderDiscovery;
  private scorer: CreditScoreCalculator;
  private config: ParanetConfig;

  constructor(dkg: DKGClient, config: ParanetConfig) {
    this.dkg = dkg;
    this.config = config;
    this.publisher = new ParanetPublisher(dkg, config);
    this.discovery = new ProviderDiscovery(dkg);
    this.scorer = new CreditScoreCalculator(dkg);
  }

  /**
   * Create a new client from config
   */
  static async create(config: ParanetConfig): Promise<AgentParanetClient> {
    const dkg = await createDKGClient(config);
    return new AgentParanetClient(dkg, config);
  }

  // Publishing

  async publishTaskCompletion(task: TaskCompletion): Promise<PublishResult> {
    return this.publisher.publishTaskCompletion(task);
  }

  async publishCapabilityAttestation(attestation: CapabilityAttestation): Promise<PublishResult> {
    return this.publisher.publishCapabilityAttestation(attestation);
  }

  async publishTrustRelationship(trust: TrustRelationship): Promise<PublishResult> {
    return this.publisher.publishTrustRelationship(trust);
  }

  async publishTaskWithQuality(task: TaskCompletion, autoAttest = true) {
    return this.publisher.publishTaskWithQuality(task, autoAttest);
  }

  // Discovery

  async findProviders(criteria: ProviderSearchCriteria): Promise<QueryResult<ProviderSearchResult[]>> {
    return this.discovery.findProviders(criteria);
  }

  async getProviderScore(globalId: string): Promise<QueryResult<CreditScore>> {
    return this.discovery.getProviderScore(globalId);
  }

  async meetsRequirements(globalId: string, requirements: {
    minScore?: number;
    minTier?: number;
    minTasks?: number;
    taskType?: string;
  }) {
    return this.discovery.meetsRequirements(globalId, requirements as Parameters<typeof this.discovery.meetsRequirements>[1]);
  }

  async getAgentCapabilities(globalId: string): Promise<string[]> {
    return this.discovery.getAgentCapabilities(globalId);
  }

  async checkTrust(trustorGlobalId: string, trusteeGlobalId: string) {
    return this.discovery.checkTrust(trustorGlobalId, trusteeGlobalId);
  }

  // Scoring

  async calculateCreditScore(globalId: string): Promise<QueryResult<CreditScore>> {
    return this.scorer.calculateScore(globalId);
  }

  clearScoreCache(globalId?: string): void {
    this.scorer.clearCache(globalId);
  }

  // Raw DKG access for advanced use cases
  get rawDKG(): DKGClient {
    return this.dkg;
  }
}

// Default export
export default AgentParanetClient;
