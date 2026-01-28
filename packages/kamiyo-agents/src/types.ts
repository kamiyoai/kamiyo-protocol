import { Connection, Keypair, PublicKey } from '@solana/web3.js';

export interface AgentConfig {
  name: string;
  apiKey: string;
  model?: string;
  solana?: {
    connection: Connection;
    wallet: Keypair;
    programId?: PublicKey;
  };
  tools?: ToolConfig[];
  systemPrompt?: string;
  maxTurns?: number;
  timeoutMs?: number;
}

export interface ToolConfig {
  name: string;
  description: string;
  parameters: Record<string, ToolParameter>;
  handler: ToolHandler;
}

export interface ToolParameter {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description: string;
  required?: boolean;
  enum?: string[];
}

export type ToolHandler = (params: Record<string, unknown>) => Promise<ToolResult>;

export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

export interface AgentMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  toolCalls?: ToolCall[];
  toolResults?: ToolCallResult[];
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolCallResult {
  toolCallId: string;
  result: ToolResult;
}

export interface AgentRunResult {
  messages: AgentMessage[];
  finalResponse: string;
  toolsUsed: string[];
  tokenUsage: {
    input: number;
    output: number;
  };
}

export interface EscrowParams {
  provider: PublicKey;
  amount: number;
  slaUri: string;
  expirySeconds?: number;
}

export interface DisputeParams {
  escrowId: PublicKey;
  reason: string;
  evidence?: string;
}

export interface ReputationQuery {
  entity: PublicKey;
  category?: string;
}

export interface PaymentParams {
  recipient: PublicKey;
  amount: number;
  memo?: string;
}
