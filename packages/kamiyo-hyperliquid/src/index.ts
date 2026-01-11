// Client
export { HyperliquidClient, HyperliquidClientConfig } from './client';

// Exchange (L1 order execution)
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

// ZK Prover
export {
  ReputationProver,
  ProofInput,
  GeneratedProof,
  ProverConfig,
  getTierThreshold,
  getQualifyingTier,
} from './prover';

// Dispute Oracle
export {
  DisputeOracle,
  OracleConfig,
  PositionValueUpdate,
  DisputeEvaluation,
  createOracle,
} from './oracle';

// Types
export {
  // Network
  HyperliquidNetwork,
  NetworkConfig,
  NETWORKS,
  ContractAddresses,

  // Agent
  Agent,
  AgentWithAddress,
  AgentStats,
  RegisterAgentParams,

  // Position
  CopyPosition,
  PositionWithReturn,
  OpenPositionParams,

  // Dispute
  DisputeInfo,

  // Reputation Limits
  Tier,
  AgentTier,
  TierInfo,
  ProveReputationParams,
  CanAcceptDepositResult,
  TierVerifiedEvent,
  TIER_NAMES,

  // Transaction
  TransactionResult,
  PositionOpenedResult,
  DisputeFiledResult,

  // Query
  PaginationParams,
  AgentListResult,

  // Events
  AgentRegisteredEvent,
  PositionOpenedEvent,
  PositionClosedEvent,
  DisputeFiledEvent,
  DisputeResolvedEvent,
  EventFilter,
  EventCallback,

  // Errors
  KamiyoError,
  KamiyoErrorCode,

  // Constants
  CONSTANTS,
} from './types';
