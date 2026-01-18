// ElizaOS types (minimal interface)
export interface Plugin {
  name: string;
  description: string;
  actions?: Action[];
  providers?: Provider[];
  evaluators?: Evaluator[];
  services?: Service[];
}

export interface Action {
  name: string;
  description: string;
  similes?: string[];
  examples?: ActionExample[][];
  validate: (runtime: IAgentRuntime, message: Memory, state?: State) => Promise<boolean>;
  handler: (
    runtime: IAgentRuntime,
    message: Memory,
    state?: State,
    options?: Record<string, unknown>,
    callback?: HandlerCallback
  ) => Promise<unknown>;
}

export interface Provider {
  name: string;
  description?: string;
  get: (runtime: IAgentRuntime, message: Memory, state?: State) => Promise<string>;
}

export interface Evaluator {
  name: string;
  description: string;
  validate: (runtime: IAgentRuntime, message: Memory, state?: State) => Promise<boolean>;
  handler: (runtime: IAgentRuntime, message: Memory, state?: State) => Promise<unknown>;
}

export interface Service {
  name: string;
  description?: string;
  start?: (runtime: IAgentRuntime) => Promise<void>;
  stop?: () => Promise<void>;
}

export interface IAgentRuntime {
  getSetting: (key: string) => string | undefined;
  getState?: (key: string) => Promise<unknown>;
  setState?: (key: string, value: unknown) => Promise<void>;
  agentId: string;
}

export interface Memory {
  id?: string;
  userId: string;
  agentId: string;
  roomId: string;
  content: {
    text?: string;
    [key: string]: unknown;
  };
  createdAt?: number;
}

export interface State {
  [key: string]: unknown;
}

export interface ActionExample {
  user: string;
  content: { text: string; action?: string };
}

export type HandlerCallback = (response: { text: string; content?: unknown }) => Promise<Memory[]>;

// Oracle Agent specific types

export interface DisputeEvent {
  escrowPda: string;
  agent: string;
  provider: string;
  amount: number;
  transactionId: string;
  disputedAt: number;
  expiresAt: number;
  metadata?: {
    serviceType?: string;
    slaTerms?: string;
    deliveryProof?: string;
  };
}

export interface EvaluationContext {
  escrow: {
    pda: string;
    amount: number;
    createdAt: number;
    expiresAt: number;
    transactionId: string;
    status: string;
  };

  agent: {
    pubkey: string;
    reputation: number;
    totalEscrows: number;
    disputeRate: number;
  };

  provider: {
    pubkey: string;
    reputation: number;
    totalEscrows: number;
    disputeRate: number;
    averageQualityScore: number;
  };

  service: {
    type: string;
    description: string;
    slaTerms: string[];
    deliveryProof?: string;
    responseTime?: number;
    errorRate?: number;
  };

  evidence: {
    agentClaim: string;
    providerClaim?: string;
    thirdPartyData?: string[];
  };
}

export interface QualityAssessment {
  score: number;
  confidence: 'low' | 'medium' | 'high';
  reasoning: string;
  factors: {
    deliveryComplete: boolean;
    slaCompliant: boolean;
    evidenceStrength: 'weak' | 'moderate' | 'strong';
    providerHistory: 'poor' | 'average' | 'good';
    agentHistory: 'frivolous' | 'average' | 'legitimate';
  };
}

export interface VotingStrategy {
  shouldVote: boolean;
  adjustedScore: number;
  riskLevel: 'low' | 'medium' | 'high';
  expectedReward: number;
  maxLoss: number;
  reasoning: string;
}

export interface OraclePerformance {
  totalVotes: number;
  accurateVotes: number;
  slashEvents: number;
  totalRewardsEarned: number;
  totalSlashLoss: number;
  currentStake: number;
  violationCount: number;
  accuracyRate: number;
  profitLoss: number;
}

export interface OracleConfig {
  network: 'mainnet' | 'devnet';
  rpcUrl: string;
  heliusApiKey?: string;
  privateKey: string;
  minConfidenceToVote: 'low' | 'medium' | 'high';
  maxPendingDisputes: number;
  evaluationModel: string;
  riskTolerance: 'low' | 'medium' | 'high';
  autoVoteEnabled: boolean;
  pollIntervalMs: number;
}

export interface PendingDispute extends DisputeEvent {
  addedAt: number;
  evaluationAttempts: number;
  lastError?: string;
}

export interface OracleState {
  pendingDisputes: PendingDispute[];
  votedDisputes: string[];
  performance: OraclePerformance;
  lastSync: number;
}
