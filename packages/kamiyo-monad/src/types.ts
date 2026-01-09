export type MonadNetwork = 'monad-testnet' | 'monad-mainnet';

export interface NetworkConfig {
  chainId: number;
  rpc: string;
  explorer: string;
  contracts: {
    agentFactory: string;
    reputationMirror: string;
    swarmSimulator: string;
  };
}

export const NETWORKS: Record<MonadNetwork, NetworkConfig> = {
  'monad-testnet': {
    chainId: 10143,
    rpc: process.env.MONAD_TESTNET_RPC || 'https://monad-testnet.drpc.org',
    explorer: 'https://testnet.explorer.monad.xyz',
    contracts: {
      agentFactory: '0x0000000000000000000000000000000000000000',
      reputationMirror: '0x0000000000000000000000000000000000000000',
      swarmSimulator: '0x0000000000000000000000000000000000000000',
    },
  },
  'monad-mainnet': {
    chainId: 143,
    rpc: process.env.MONAD_MAINNET_RPC || 'https://monad-mainnet.drpc.org',
    explorer: 'https://explorer.monad.xyz',
    contracts: {
      agentFactory: '0x87f9aC00D727A1Ee8d1C246b67e2D0eb1a2206b2',
      reputationMirror: '0x7f4C878E7B2B083878f0bA3d2De2c6DB995B1A11',
      swarmSimulator: '0xcAa2e2d77E09c4ec48830adA7ABC711607350EA5',
    },
  },
};

export enum AgentType {
  Trading = 0,
  Service = 1,
  Oracle = 2,
  Custom = 3,
}

export interface AgentIdentity {
  owner: string;
  name: string;
  agentType: AgentType;
  reputation: bigint;
  stakeAmount: bigint;
  isActive: boolean;
  createdAt: bigint;
  lastActive: bigint;
  totalEscrows: bigint;
  successfulEscrows: bigint;
  disputedEscrows: bigint;
}

export interface ReputationState {
  entity: string;
  totalTransactions: bigint;
  disputesFiled: bigint;
  disputesWon: bigint;
  disputesPartial: bigint;
  disputesLost: bigint;
  averageQualityReceived: number;
  reputationScore: number;
  lastUpdated: bigint;
}

export interface Groth16Proof {
  a: [bigint, bigint];
  b: [[bigint, bigint], [bigint, bigint]];
  c: [bigint, bigint];
  publicInputs: bigint[];
}

export interface SwarmConfig {
  agents: AgentConfig[];
  simulationRounds: number;
  parallelism: number;
  stateRoot?: string;
}

export interface AgentConfig {
  id: string;
  strategy: string;
  parameters: Record<string, unknown>;
  initialState?: Record<string, unknown>;
}

export interface SimulationResult {
  agentId: string;
  rounds: RoundResult[];
  finalState: Record<string, unknown>;
  metrics: SimulationMetrics;
}

export interface RoundResult {
  round: number;
  actions: Action[];
  stateChanges: Record<string, unknown>;
  gasUsed: bigint;
}

export interface Action {
  type: string;
  target?: string;
  value?: bigint;
  data?: string;
  result?: unknown;
}

export interface SimulationMetrics {
  totalGasUsed: bigint;
  successRate: number;
  averageLatency: number;
  reputationDelta: number;
}

export interface MonadProviderConfig {
  network: MonadNetwork;
  rpcUrl?: string;
  privateKey?: string;
  timeout?: number;
}

export type MonadErrorCode =
  | 'NETWORK_ERROR'
  | 'CONTRACT_ERROR'
  | 'PROOF_ERROR'
  | 'SIMULATION_ERROR'
  | 'BRIDGE_ERROR'
  | 'INVALID_CONFIG';

export class MonadError extends Error {
  constructor(
    message: string,
    public readonly code: MonadErrorCode,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'MonadError';
  }
}
