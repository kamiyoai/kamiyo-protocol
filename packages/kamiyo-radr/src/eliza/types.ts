/**
 * ElizaOS Plugin Types
 *
 * Compatible with @elizaos/core types for seamless integration.
 */

export interface IAgentRuntime {
  agentId: string;
  getSetting(key: string): string | undefined;
  getState?(key: string): Promise<unknown>;
  setState?(key: string, value: unknown): Promise<void>;
  composeState?(message: Memory): Promise<State>;
  messageManager: {
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
}) => Promise<Memory[]> | void;

export type RadrNetwork = 'mainnet' | 'devnet';

export interface RadrPluginConfig {
  network?: RadrNetwork;
  rpcUrl?: string;
  kamiyoProgramId?: string;
  defaultToken?: string;
  qualityThreshold?: number;
  autoDispute?: boolean;
}
