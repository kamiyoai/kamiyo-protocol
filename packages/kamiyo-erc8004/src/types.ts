/**
 * ERC-8004 Type Definitions
 * Based on EIP-8004 Trustless Agents specification
 */

// ============ Enums ============

export enum KamiyoTier {
  Unverified = 0,
  Bronze = 1,
  Silver = 2,
  Gold = 3,
  Platinum = 4,
}

export enum AgentType {
  Trading = 'trading',
  Service = 'service',
  Oracle = 'oracle',
  Custom = 'custom',
}

// ============ Constants ============

export const TIER_THRESHOLDS = {
  [KamiyoTier.Bronze]: 25,
  [KamiyoTier.Silver]: 50,
  [KamiyoTier.Gold]: 75,
  [KamiyoTier.Platinum]: 90,
} as const;

export const TIER_TO_RESPONSE: Record<KamiyoTier, number> = {
  [KamiyoTier.Unverified]: 20,
  [KamiyoTier.Bronze]: 40,
  [KamiyoTier.Silver]: 60,
  [KamiyoTier.Gold]: 80,
  [KamiyoTier.Platinum]: 95,
};

export const RESPONSE_TO_TIER = (response: number): KamiyoTier => {
  if (response >= 90) return KamiyoTier.Platinum;
  if (response >= 75) return KamiyoTier.Gold;
  if (response >= 50) return KamiyoTier.Silver;
  if (response >= 25) return KamiyoTier.Bronze;
  return KamiyoTier.Unverified;
};

// ============ Chain Configuration ============

export interface ChainConfig {
  chainId: number;
  name: string;
  rpcUrl: string;
  identityRegistry?: string;
  reputationRegistry?: string;
  validationRegistry?: string;
  zkReputationBridge?: string;
  agentRegistry?: string;
  agentRegistryAdapter?: string;
  identityMirror?: string;
  // Hyperliquid vault modules
  vaultCore?: string;
  positionModule?: string;
  disputeModule?: string;
  valueUpdateModule?: string;
  reputationLimits?: string;
}

export const CHAIN_CONFIGS: Record<string, ChainConfig> = {
  'base-mainnet': {
    chainId: 8453,
    name: 'Base',
    rpcUrl: 'https://mainnet.base.org',
    identityRegistry: '0x935D0CE617fb3123842fE739eD6FB8c0472dBD80',
    reputationRegistry: '0x8b85c8ae0BFF344d4e7F36999C4Aae3Beb80F10E',
    validationRegistry: '0xA30C2DEDCEBD1FE03486632ec8Ed4cC263aCB8B8',
    zkReputationBridge: undefined, // Deploy after ZK infrastructure ready
  },
  'base-sepolia': {
    chainId: 84532,
    name: 'Base Sepolia',
    rpcUrl: 'https://sepolia.base.org',
  },
  'hyperliquid-mainnet': {
    chainId: 999,
    name: 'Hyperliquid',
    rpcUrl: 'https://rpc.hyperliquid.xyz/evm',
    agentRegistry: '0x77433163F73Ba066CdBdffB5F09e61979bedd2E7',
    agentRegistryAdapter: '0x9034dA1dab98cf239a106333DED7438A3E691146',
    vaultCore: '0x64305f9223D346f7AE4ffC87Da333a401707A7a7',
    positionModule: '0xfB71D6D1aE69Aa1c81f977b9bedF30932a8f0052',
    disputeModule: '0x545a506bc4e6d18742D8A7ceb7b206787F13916e',
    valueUpdateModule: '0xffdEfD6b84c217F17e0d6aABC2CF3922e641cdfe',
    reputationLimits: '0xf016868dd05a685393f5cf358dfa6ee71a7e4502',
  },
  'hyperliquid-testnet': {
    chainId: 998,
    name: 'Hyperliquid Testnet',
    rpcUrl: 'https://rpc.hyperliquid-testnet.xyz/evm',
  },
  'monad-mainnet': {
    chainId: 143,
    name: 'Monad',
    rpcUrl: 'https://monad-mainnet.drpc.org',
  },
  'monad-testnet': {
    chainId: 10143,
    name: 'Monad Testnet',
    rpcUrl: 'https://monad-testnet.drpc.org',
  },
};

// ============ Global ID ============

export interface GlobalAgentId {
  namespace: string; // "eip155"
  chainId: number;
  registry: string;
  agentId: bigint;
  raw: string;
}

export function parseGlobalId(globalId: string): GlobalAgentId {
  const parts = globalId.split(':');
  if (parts.length !== 4 || parts[0] !== 'eip155') {
    throw new Error(`Invalid global ID format: ${globalId}`);
  }
  return {
    namespace: parts[0],
    chainId: parseInt(parts[1], 10),
    registry: parts[2],
    agentId: BigInt(parts[3]),
    raw: globalId,
  };
}

export function formatGlobalId(
  chainId: number,
  registry: string,
  agentId: bigint
): string {
  return `eip155:${chainId}:${registry}:${agentId}`;
}

// ============ Agent Profile ============

export interface AgentEndpoints {
  web?: string;
  a2a?: string;
  mcp?: string;
  oasf?: string;
  ens?: string;
  did?: string;
  email?: string;
}

export interface AgentReputationInfo {
  kamiyo_tier?: string;
  total_transactions?: number;
  verification?: {
    type: 'zk_proof' | 'oracle_attestation';
    commitment?: string;
  };
}

export interface AgentStakeInfo {
  amount: string;
  token: string;
  chain: string;
}

export interface AgentProfile {
  '@context': string;
  name: string;
  description?: string;
  agentWallet: string;
  owner: string;
  type: AgentType;
  metadata?: Record<string, unknown>;
  capabilities?: string[];
  endpoints?: AgentEndpoints;
  reputation?: AgentReputationInfo;
  stake?: AgentStakeInfo;
}

export const AGENT_PROFILE_CONTEXT = 'https://schema.kamiyo.ai/agent/v1';

export function createAgentProfile(params: {
  name: string;
  wallet: string;
  owner: string;
  type: AgentType;
  description?: string;
  endpoints?: AgentEndpoints;
  tier?: KamiyoTier;
  stake?: AgentStakeInfo;
}): AgentProfile {
  return {
    '@context': AGENT_PROFILE_CONTEXT,
    name: params.name,
    description: params.description,
    agentWallet: params.wallet,
    owner: params.owner,
    type: params.type,
    endpoints: params.endpoints,
    reputation: params.tier !== undefined
      ? {
          kamiyo_tier: KamiyoTier[params.tier].toLowerCase(),
          verification: { type: 'zk_proof' },
        }
      : undefined,
    stake: params.stake,
  };
}

// ============ Identity Types ============

export interface MetadataEntry {
  key: string;
  value: Uint8Array;
}

export interface RegisteredAgent {
  agentId: bigint;
  globalId: string;
  owner: string;
  wallet: string;
  uri: string;
  registeredAt: number;
}

// ============ Reputation Types ============

export interface Feedback {
  agentId: bigint;
  value: bigint;
  valueDecimals: number;
  tag1: string;
  tag2: string;
  endpoint: string;
  feedbackURI: string;
  feedbackHash: string;
  timestamp: number;
  client: string;
  isRevoked: boolean;
}

export interface FeedbackParams {
  agentId: bigint;
  value: number;
  tag1?: string;
  tag2?: string;
  endpoint?: string;
  feedbackURI?: string;
}

export interface ReputationSummary {
  count: number;
  totalValue: bigint;
  averageValue: number;
  decimals: number;
}

export interface FeedbackResponse {
  responder: string;
  responseURI: string;
  responseHash: string;
  timestamp: number;
}

// ============ Validation Types ============

export interface ValidationRequest {
  requestHash: string;
  validatorAddress: string;
  agentId: bigint;
  requestURI: string;
  timestamp: number;
}

export interface ValidationResponse {
  requestHash: string;
  response: number; // 0-100
  responseURI: string;
  responseHash: string;
  tag: string;
  validator: string;
  timestamp: number;
}

export interface ValidationSummary {
  count: number;
  averageResponse: number;
}

export interface ValidationStatus {
  validatorAddress: string;
  agentId: bigint;
  response: number;
  responseHash: string;
  tag: string;
  lastUpdate: number;
  responded: boolean;
}

// ============ Bridge Types ============

export interface AttestationRequest {
  requestHash: string;
  agentAddress: string;
  agentId: bigint;
  requestedTier: KamiyoTier;
  timestamp: number;
  fulfilled: boolean;
}

export interface AgentStatus {
  linked: boolean;
  agentId: bigint;
  tier: KamiyoTier;
  response: number;
}

// ============ Mirror Types ============

export interface MirroredIdentity {
  globalIdHash: string;
  globalId: string;
  owner: string;
  wallet: string;
  agentURI: string;
  timestamp: number;
  tier: KamiyoTier;
}

// ============ Transaction Results ============

export interface TxResult {
  txHash: string;
  blockNumber?: number;
  success: boolean;
}

export interface RegisterResult extends TxResult {
  agentId: bigint;
  globalId: string;
}

export interface FeedbackResult extends TxResult {
  feedbackIndex: bigint;
}

export interface ValidationRequestResult extends TxResult {
  requestHash: string;
}
