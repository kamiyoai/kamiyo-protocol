export type HyperliquidNetwork = 'mainnet' | 'testnet';

export interface NetworkConfig {
  chainId: number;
  rpc: string;
  explorer: string;
  contracts: {
    agentRegistry: string;
    kamiyoVault: string;
    reputationLimits?: string;
  };
}

export const NETWORKS: Record<HyperliquidNetwork, NetworkConfig> = {
  mainnet: {
    chainId: 999,
    rpc: 'https://rpc.hyperliquid.xyz/evm',
    explorer: 'https://explorer.hyperliquid.xyz',
    contracts: {
      agentRegistry: '0x0000000000000000000000000000000000000000',
      kamiyoVault: '0x0000000000000000000000000000000000000000',
      reputationLimits: '0x0000000000000000000000000000000000000000',
    },
  },
  testnet: {
    chainId: 998,
    rpc: 'https://rpc.hyperliquid-testnet.xyz/evm',
    explorer: 'https://explorer.hyperliquid-testnet.xyz',
    contracts: {
      agentRegistry: '0x0000000000000000000000000000000000000000',
      kamiyoVault: '0x0000000000000000000000000000000000000000',
      reputationLimits: '0x0000000000000000000000000000000000000000',
    },
  },
};

export interface Agent {
  owner: string;
  name: string;
  stake: bigint;
  registeredAt: number;
  totalTrades: number;
  totalPnl: bigint;
  copiers: number;
  successfulTrades: number;
  active: boolean;
}

export interface AgentWithAddress extends Agent {
  address: string;
}

export interface AgentStats {
  successRate: number;
  avgPnlPerTrade: bigint;
  totalVolume: bigint;
  activeDays: number;
}

export interface CopyPosition {
  id: bigint;
  user: string;
  agent: string;
  deposit: bigint;
  currentValue: bigint;
  minReturnBps: number;
  startTime: number;
  lockPeriod: number;
  endTime: number;
  active: boolean;
  disputed: boolean;
}

export interface PositionWithReturn extends CopyPosition {
  returnBps: number;
  canClose: boolean;
  timeRemaining: number;
}

export interface DisputeInfo {
  id: bigint;
  positionId: bigint;
  user: string;
  agent: string;
  filedAt: number;
  actualReturnBps: number;
  expectedReturnBps: number;
  resolved: boolean;
  userWon: boolean;
}

export interface OpenPositionParams {
  agent: string;
  minReturnBps: number;
  lockPeriodSeconds: number;
  depositAmount: bigint;
}

export interface RegisterAgentParams {
  name: string;
  stakeAmount: bigint;
}

export interface TransactionResult {
  hash: string;
  blockNumber: number;
  gasUsed: bigint;
}

export interface PositionOpenedResult extends TransactionResult {
  positionId: bigint;
}

export interface DisputeFiledResult extends TransactionResult {
  disputeId: bigint;
}

export interface PaginationParams {
  offset: number;
  limit: number;
}

export interface AgentListResult {
  agents: AgentWithAddress[];
  total: number;
  hasMore: boolean;
}

export interface AgentRegisteredEvent {
  agent: string;
  name: string;
  stake: bigint;
  blockNumber: number;
  transactionHash: string;
}

export interface PositionOpenedEvent {
  positionId: bigint;
  user: string;
  agent: string;
  deposit: bigint;
  minReturnBps: number;
  lockPeriod: number;
  blockNumber: number;
  transactionHash: string;
}

export interface PositionClosedEvent {
  positionId: bigint;
  returnAmount: bigint;
  returnBps: number;
  blockNumber: number;
  transactionHash: string;
}

export interface DisputeFiledEvent {
  disputeId: bigint;
  positionId: bigint;
  user: string;
  blockNumber: number;
  transactionHash: string;
}

export interface DisputeResolvedEvent {
  disputeId: bigint;
  userWon: boolean;
  payout: bigint;
  blockNumber: number;
  transactionHash: string;
}

export class KamiyoError extends Error {
  constructor(
    message: string,
    public readonly code: KamiyoErrorCode,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'KamiyoError';
  }
}

export enum KamiyoErrorCode {
  // Contract errors
  AGENT_NOT_ACTIVE = 'AGENT_NOT_ACTIVE',
  INSUFFICIENT_STAKE = 'INSUFFICIENT_STAKE',
  INSUFFICIENT_DEPOSIT = 'INSUFFICIENT_DEPOSIT',
  POSITION_NOT_ACTIVE = 'POSITION_NOT_ACTIVE',
  POSITION_LOCKED = 'POSITION_LOCKED',
  ALREADY_REGISTERED = 'ALREADY_REGISTERED',
  NOT_REGISTERED = 'NOT_REGISTERED',
  NOT_AUTHORIZED = 'NOT_AUTHORIZED',
  DISPUTE_WINDOW_CLOSED = 'DISPUTE_WINDOW_CLOSED',
  ALREADY_DISPUTED = 'ALREADY_DISPUTED',
  INVALID_PARAMETERS = 'INVALID_PARAMETERS',

  // SDK errors
  NO_SIGNER = 'NO_SIGNER',
  TRANSACTION_FAILED = 'TRANSACTION_FAILED',
  NETWORK_ERROR = 'NETWORK_ERROR',
  INVALID_ADDRESS = 'INVALID_ADDRESS',
  TIMEOUT = 'TIMEOUT',
  UNKNOWN = 'UNKNOWN',
}

export const CONSTANTS = {
  MIN_STAKE: BigInt('100000000000000000000'), // 100 HYPE
  MIN_DEPOSIT: BigInt('10000000000000000'), // 0.01 HYPE
  MAX_DEPOSIT: BigInt('1000000000000000000000'), // 1000 HYPE
  MIN_LOCK_PERIOD: 86400, // 1 day in seconds
  MAX_LOCK_PERIOD: 31536000, // 365 days in seconds
  MIN_RETURN_BPS: -5000, // -50%
  MAX_RETURN_BPS: 10000, // +100%
  DISPUTE_WINDOW: 604800, // 7 days in seconds
  WITHDRAWAL_DELAY: 604800, // 7 days in seconds
  PROTOCOL_FEE_BPS: 100, // 1%
  SLASH_PERCENT: 10, // 10%
} as const;

export type EventFilter = {
  fromBlock?: number;
  toBlock?: number | 'latest';
};

export type EventCallback<T> = (event: T) => void;

export interface ContractAddresses {
  agentRegistry: string;
  kamiyoVault: string;
  reputationLimits?: string;
}

// ============ Reputation Limits Types ============

export interface Tier {
  threshold: number;
  maxCopyLimit: bigint;
  maxCopiers: number;
}

export interface AgentTier {
  tier: number;
  verifiedAt: number;
  commitment: string;
  tierInfo: Tier;
}

export interface TierInfo {
  tier: number;
  name: string;
  threshold: number;
  maxCopyLimit: bigint;
  maxCopiers: number;
}

export const TIER_NAMES = ['Default', 'Bronze', 'Silver', 'Gold', 'Platinum'] as const;

export interface ProveReputationParams {
  tier: number;
  commitment: string;
  proofA: [bigint, bigint];
  proofB: [[bigint, bigint], [bigint, bigint]];
  proofC: [bigint, bigint];
  pubInputs: bigint[];
}

export interface CanAcceptDepositResult {
  allowed: boolean;
  reason: string;
}

export interface TierVerifiedEvent {
  agent: string;
  tier: number;
  maxCopyLimit: bigint;
  blockNumber: number;
  transactionHash: string;
}
