import { createAgent } from '@lucid-agents/core';
import { payments } from '@lucid-agents/payments';
import { z } from 'zod';
import type { PaymentsConfig } from '@lucid-agents/types/payments';
import type { AgentCard } from '@lucid-agents/types/a2a';
import type { SwarmAgentConfig, SwarmAgent, TaskInput, TaskResult } from './types.js';
import { buildPolicyGroups } from './types.js';

const TaskInputSchema = z.object({
  taskId: z.string(),
  description: z.string(),
  budget: z.number(),
  teamId: z.string(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const TaskResultSchema = z.object({
  taskId: z.string(),
  status: z.enum(['completed', 'failed', 'rejected']),
  output: z.unknown().optional(),
  amountDrawn: z.number().optional(),
  error: z.string().optional(),
});

/**
 * Handler for the execute-task entrypoint.
 * Override this by providing a custom taskHandler in createSwarmAgent options.
 */
export type TaskHandler = (input: TaskInput) => Promise<TaskResult>;

const defaultTaskHandler: TaskHandler = async (input) => {
  return {
    taskId: input.taskId,
    status: 'completed',
    amountDrawn: 0,
  };
};

export interface CreateSwarmAgentOptions extends SwarmAgentConfig {
  taskHandler?: TaskHandler;
  /** Base URL where this agent will be hosted (for AgentCard) */
  baseUrl?: string;
}

/**
 * Creates a Lucid Agent configured for a SwarmTeam member.
 * Sets up x402 payment policies, A2A entrypoints, and task execution.
 */
export async function createSwarmAgent(options: CreateSwarmAgentOptions): Promise<SwarmAgent> {
  const { team, member, taskHandler = defaultTaskHandler, baseUrl } = options;

  const policyGroups = buildPolicyGroups(options);

  const paymentsConfig: PaymentsConfig = {
    payTo: member.walletAddress || team.poolWalletAddress,
    facilitatorUrl: team.facilitatorUrl as `${string}://${string}`,
    network: team.network as PaymentsConfig['network'],
    policyGroups,
    storage: {
      type: options.storageType || 'in-memory',
      ...(options.storageType === 'sqlite' && options.dbPath
        ? { sqlite: { dbPath: options.dbPath } }
        : {}),
    },
  };

  const builder = createAgent({
    name: `swarm-${team.teamId}-${member.agentId}`,
    version: '1.0.0',
    description: `SwarmTeam agent: ${member.role} in ${team.name}`,
  });

  builder.use(payments({ config: paymentsConfig }));

  builder.addEntrypoint({
    key: 'execute-task',
    description: 'Execute an assigned SwarmTeam task within budget constraints',
    input: TaskInputSchema,
    output: TaskResultSchema,
    handler: async (ctx) => {
      const input = ctx.input as TaskInput;

      if (input.budget > member.drawLimit) {
        return {
          output: {
            taskId: input.taskId,
            status: 'rejected' as const,
            error: `Budget ${input.budget} exceeds draw limit ${member.drawLimit}`,
          },
        };
      }

      const result = await taskHandler(input);
      return { output: result };
    },
  });

  const runtime = await builder.build();

  const card: AgentCard = {
    name: `swarm-${team.teamId}-${member.agentId}`,
    version: '1.0.0',
    url: baseUrl || `https://agents.kamiyo.ai/${team.teamId}/${member.agentId}`,
    capabilities: { streaming: true },
    skills: [
      {
        id: 'execute-task',
        name: 'Execute Task',
        description: 'Execute an assigned SwarmTeam task',
        inputModes: ['application/json'],
        outputModes: ['application/json'],
      },
    ],
    payments: [
      {
        network: team.network,
        currency: team.currency,
        payTo: member.walletAddress || team.poolWalletAddress,
      },
    ] as unknown as AgentCard['payments'],
  };

  const executeTask = async (task: TaskInput): Promise<TaskResult> => {
    return taskHandler(task);
  };

  const stop = async () => {};

  return {
    runtime,
    config: options,
    card,
    executeTask,
    stop,
  };
}
