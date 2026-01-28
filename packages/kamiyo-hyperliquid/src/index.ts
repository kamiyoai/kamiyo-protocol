export { HyperliquidClient, HyperliquidClientConfig } from './client';

export {
  configure,
  getNetworkConfig,
  getAllNetworkConfigs,
  isNetworkConfigured,
  validateConfig,
  resetConfig,
  getConfigHints,
  ConfigOverrides,
  ConfigError,
} from './config';

export {
  HyperliquidExchange,
  ExchangeConfig,
  OrderRequest,
  OrderType,
  OrderResult,
  OrderStatus,
  CancelRequest,
  Position as ExchangePosition,
  AccountState as ExchangeAccountState,
  MetaInfo,
  Network as ExchangeNetwork,
} from './exchange';

export {
  ReputationProver,
  DarkForestProver,
  getTierThreshold,
  getQualifyingTier,
} from './prover';
export type { ProofInput, GeneratedProof, ProverConfig, TierLevel } from './prover';

export {
  DisputeOracle,
  OracleConfig,
  PositionValueUpdate,
  DisputeEvaluation,
  SignedValueUpdate,
  createOracle,
} from './oracle';

export {
  NonceManager,
  createNonceManager,
} from './nonce-manager';

export {
  Logger,
  setLogger,
  getLogger,
  enableConsoleLogging,
  disableLogging,
  createConsoleLogger,
} from './logger';

export {
  ReputationClient,
  Tier as ReputationTier,
  TIER_THRESHOLDS,
  DEPLOYED_CONTRACTS,
  createSepoliaClient,
} from './reputation';
export type { ReputationConfig } from './reputation';

export {
  CopyTradingGuard,
  TIER_LIMITS,
} from './copy-trading';
export type { CopyLimits, CopyTradeRequest, CopyTradeResult } from './copy-trading';

export {
  EventListener,
  EventSubscription,
  EventType,
} from './events';

export {
  HyperliquidNetwork,
  NetworkConfig,
  NETWORKS,
  ContractAddresses,
  Agent,
  AgentWithAddress,
  AgentStats,
  RegisterAgentParams,
  CopyPosition,
  PositionWithReturn,
  OpenPositionParams,
  DisputeInfo,
  Tier,
  AgentTier,
  TierInfo,
  ProveReputationParams,
  CanAcceptDepositResult,
  TierVerifiedEvent,
  TIER_NAMES,
  TransactionResult,
  PositionOpenedResult,
  DisputeFiledResult,
  PaginationParams,
  AgentListResult,
  AgentRegisteredEvent,
  PositionOpenedEvent,
  PositionClosedEvent,
  DisputeFiledEvent,
  DisputeResolvedEvent,
  EventFilter,
  EventCallback,
  KamiyoError,
  KamiyoErrorCode,
  CONSTANTS,
} from './types';

// Vibe Trading - AI-powered natural language thesis execution
export { VibeTrader } from './vibe-trader';
export type { VibeTraderConfig } from './vibe-trader';
export { ThesisParser } from './vibe-parser';
export type { ThesisParserConfig } from './vibe-parser';
export { PriceFeed, ConditionMonitor } from './vibe-monitor';
export type { PriceFeedConfig, ConditionMonitorConfig } from './vibe-monitor';
export {
  Strategy,
  VibePosition,
  VibeEvent,
  VibeEventHandler,
  RiskLimits,
  DEFAULT_RISK_LIMITS,
  Direction,
  Trigger,
  PriceTrigger,
  RiskParams,
  ExecutionResult,
  SUPPORTED_ASSETS,
  VibeError,
  ValidationError,
  ExecutionError,
  ParseError,
  validateStrategy,
  isValidAsset,
} from './vibe-types';
export type { SupportedAsset, VibeEventType, StrategyStatus, TriggerOperator, PersistedState } from './vibe-types';
export {
  Logger as VibeLogger,
  nullLogger,
  createConsoleLogger as createVibeLogger,
  withRetry,
  withTimeout,
  CircuitBreaker,
  Mutex,
  createMetrics,
  TimeoutError,
  RetryExhaustedError,
  CircuitState,
} from './vibe-utils';
export type { RetryOptions, CircuitBreakerOptions, Metrics } from './vibe-utils';
