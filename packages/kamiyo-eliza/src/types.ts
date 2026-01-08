export interface IAgentRuntime {
  agentId: string;
  getSetting(key: string): string | undefined;
  getState?(key: string): Promise<unknown>;
  setState?(key: string, value: unknown): Promise<void>;
  composeState?(message: Memory): Promise<State>;
  messageManager: {
    getMemories(opts: { roomId: string; count: number }): Promise<Memory[]>;
  };
  descriptionManager?: {
    getMemories(opts: { roomId: string; count: number }): Promise<Memory[]>;
  };
}

export interface Memory {
  id?: string;
  userId: string;
  agentId: string;
  roomId: string;
  content: {
    text: string;
    [key: string]: unknown;
  };
  embedding?: number[];
  createdAt?: number;
}

export interface State {
  bio?: string;
  lore?: string;
  recentMessages?: string;
  recentMessagesData?: Memory[];
  [key: string]: unknown;
}

export interface Action {
  name: string;
  description: string;
  similes?: string[];
  examples?: MessageExample[][];
  validate: (runtime: IAgentRuntime, message: Memory) => Promise<boolean>;
  handler: (
    runtime: IAgentRuntime,
    message: Memory,
    state?: State,
    options?: { [key: string]: unknown },
    callback?: HandlerCallback
  ) => Promise<unknown>;
}

export interface Provider {
  get: (runtime: IAgentRuntime, message: Memory, state?: State) => Promise<string>;
}

export interface Evaluator {
  name: string;
  description: string;
  similes?: string[];
  examples?: EvaluatorExample[];
  validate: (runtime: IAgentRuntime, message: Memory) => Promise<boolean>;
  handler: (runtime: IAgentRuntime, message: Memory, state?: State) => Promise<unknown>;
}

export interface Plugin {
  name: string;
  description: string;
  actions?: Action[];
  providers?: Provider[];
  evaluators?: Evaluator[];
  services?: Service[];
}

export interface Service {
  name: string;
  description?: string;
  start?: (runtime: IAgentRuntime) => Promise<void>;
  stop?: () => Promise<void>;
}

export interface MessageExample {
  user: string;
  content: { text: string; action?: string };
}

export interface EvaluatorExample {
  context: string;
  messages: MessageExample[];
  outcome: string;
}

export type HandlerCallback = (response: {
  text: string;
  content?: { [key: string]: unknown };
  action?: string;
}) => Promise<Memory[]>;

export type KamiyoNetwork = 'mainnet' | 'devnet' | 'localnet';

export interface KamiyoPluginConfig {
  network?: KamiyoNetwork;
  programId?: string;
  rpcUrl?: string;
  qualityThreshold?: number;
  maxPricePerRequest?: number;
  autoDispute?: boolean;
}

export interface PaymentRecord {
  id: string;
  endpoint: string;
  amount: number;
  quality: number;
  timestamp: number;
  disputed: boolean;
  transactionId?: string;
  refundAmount?: number;
}

export interface DisputeRecord {
  id: string;
  paymentId: string;
  reason: string;
  evidence?: Record<string, unknown>;
  status: 'pending' | 'resolved' | 'rejected';
  resolution?: number;
  filedAt: number;
  resolvedAt?: number;
}

export interface EscrowAccount {
  address: string;
  agent: string;
  provider: string;
  amount: number;
  timeLockSeconds: number;
  status: 'active' | 'released' | 'disputed' | 'refunded';
  createdAt: number;
  expiresAt: number;
}

export interface AgentIdentity {
  address: string;
  owner: string;
  name: string;
  stake: number;
  reputation: number;
  totalAgreements: number;
  successfulAgreements: number;
  createdAt: number;
}

export const NETWORKS: Record<KamiyoNetwork, { rpcUrl: string; programId: string }> = {
  mainnet: {
    rpcUrl: 'https://api.mainnet-beta.solana.com',
    programId: '8sUnNU6WBD2SYapCE12S7LwH1b8zWoniytze7ifWwXCM',
  },
  devnet: {
    rpcUrl: 'https://api.devnet.solana.com',
    programId: '8sUnNU6WBD2SYapCE12S7LwH1b8zWoniytze7ifWwXCM',
  },
  localnet: {
    rpcUrl: 'http://127.0.0.1:8899',
    programId: '8sUnNU6WBD2SYapCE12S7LwH1b8zWoniytze7ifWwXCM',
  },
};

export const DEFAULT_CONFIG: Required<KamiyoPluginConfig> = {
  network: 'devnet',
  programId: NETWORKS.devnet.programId,
  rpcUrl: NETWORKS.devnet.rpcUrl,
  qualityThreshold: 80,
  maxPricePerRequest: 0.01,
  autoDispute: true,
};
