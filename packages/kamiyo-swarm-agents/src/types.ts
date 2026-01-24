import type { PaymentPolicyGroup } from '@lucid-agents/types/payments';
import type { AgentRuntime } from '@lucid-agents/types/core';
import type { AgentCard } from '@lucid-agents/types/a2a';

export interface SwarmMember {
  id: string;
  agentId: string;
  role: string;
  drawLimit: number;
  walletAddress?: string;
}

export interface SwarmTeamConfig {
  teamId: string;
  name: string;
  currency: string;
  dailyLimit: number;
  poolWalletAddress: string;
  facilitatorUrl: string;
  network: string;
}

export interface SwarmAgentConfig {
  team: SwarmTeamConfig;
  member: SwarmMember;
  /** Max single draw amount (defaults to member.drawLimit) */
  maxSingleDraw?: number;
  /** Max draws per 24h window (defaults to 20) */
  maxDrawsPerDay?: number;
  /** Storage type for payment tracking */
  storageType?: 'sqlite' | 'in-memory';
  /** SQLite db path (defaults to .data/swarm-{teamId}-{agentId}.db) */
  dbPath?: string;
}

export interface SwarmAgent {
  runtime: AgentRuntime;
  config: SwarmAgentConfig;
  card: AgentCard;
  /** Invoke the execute-task entrypoint directly */
  executeTask: (task: TaskInput) => Promise<TaskResult>;
  /** Stop the agent */
  stop: () => Promise<void>;
}

export interface TaskInput {
  taskId: string;
  description: string;
  budget: number;
  teamId: string;
  metadata?: Record<string, unknown>;
}

export interface TaskResult {
  taskId: string;
  status: 'completed' | 'failed' | 'rejected';
  output?: unknown;
  amountDrawn?: number;
  error?: string;
}

export interface TaskAssignment {
  agentCard: AgentCard;
  taskInput: TaskInput;
  contextId?: string;
}

export type TaskStatusCallback = (event: {
  taskId: string;
  status: string;
  data?: unknown;
}) => void;

export function buildPolicyGroups(config: SwarmAgentConfig): PaymentPolicyGroup[] {
  const { member, team, maxSingleDraw, maxDrawsPerDay } = config;

  return [
    {
      name: 'Agent Draw Limit',
      outgoingLimits: {
        global: {
          maxPaymentUsd: maxSingleDraw ?? member.drawLimit,
          maxTotalUsd: member.drawLimit,
          windowMs: 86_400_000,
        },
      },
      rateLimits: {
        maxPayments: maxDrawsPerDay ?? 20,
        windowMs: 86_400_000,
      },
    },
    {
      name: 'Allowed Recipients',
      allowedRecipients: [team.poolWalletAddress],
    },
  ];
}
