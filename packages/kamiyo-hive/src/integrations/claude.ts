import type { Capability, AgentInfo, HireOptions, DeliveryResult } from '../types.js';

export interface ClaudeTool {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export const hiveTools: ClaudeTool[] = [
  {
    name: 'hive_discover_agents',
    description:
      'Find available AI agents that can perform a specific capability. Returns agents sorted by reputation.',
    input_schema: {
      type: 'object',
      properties: {
        capability: {
          type: 'string',
          description:
            'The capability to search for (e.g., "code-review", "image-generation", "data-analysis")',
        },
        min_reputation: {
          type: 'number',
          description: 'Minimum reputation score (0-1000). Default: 500',
        },
        max_price: {
          type: 'number',
          description: 'Maximum price in USD per task',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of agents to return. Default: 5',
        },
      },
      required: ['capability'],
    },
  },
  {
    name: 'hive_hire_agent',
    description:
      'Hire an AI agent to perform a task. Creates an escrow to protect payment until delivery is verified.',
    input_schema: {
      type: 'object',
      properties: {
        agent_id: {
          type: 'string',
          description: 'The ID of the agent to hire (from discover_agents)',
        },
        spec: {
          type: 'string',
          description: 'Detailed specification of what you need the agent to do',
        },
        budget: {
          type: 'number',
          description: 'Maximum budget in USD for this task',
        },
        deadline_seconds: {
          type: 'number',
          description: 'Deadline in seconds. Default: 300 (5 minutes)',
        },
        quality_threshold: {
          type: 'number',
          description: 'Minimum quality score (0-100) to auto-release payment. Default: 70',
        },
      },
      required: ['agent_id', 'spec', 'budget'],
    },
  },
  {
    name: 'hive_check_delivery',
    description: 'Check the status of a hired agent and retrieve the deliverable if ready.',
    input_schema: {
      type: 'object',
      properties: {
        escrow_address: {
          type: 'string',
          description: 'The escrow address returned from hive_hire_agent',
        },
      },
      required: ['escrow_address'],
    },
  },
  {
    name: 'hive_await_delivery',
    description:
      'Wait for a hired agent to deliver their work. Blocks until delivery or timeout.',
    input_schema: {
      type: 'object',
      properties: {
        escrow_address: {
          type: 'string',
          description: 'The escrow address returned from hive_hire_agent',
        },
        timeout_seconds: {
          type: 'number',
          description: 'Maximum time to wait in seconds. Default: 300',
        },
      },
      required: ['escrow_address'],
    },
  },
  {
    name: 'hive_get_reputation',
    description: 'Get detailed reputation information for an agent.',
    input_schema: {
      type: 'object',
      properties: {
        agent_id: {
          type: 'string',
          description: 'The agent ID to look up',
        },
      },
      required: ['agent_id'],
    },
  },
];

export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

export type HiveToolHandler = (input: Record<string, unknown>) => Promise<ToolResult>;

export interface HiveToolHandlers {
  hive_discover_agents: HiveToolHandler;
  hive_hire_agent: HiveToolHandler;
  hive_check_delivery: HiveToolHandler;
  hive_await_delivery: HiveToolHandler;
  hive_get_reputation: HiveToolHandler;
}

export function createToolHandlers(hive: {
  discover: (query: { capability?: Capability; minReputation?: number; maxPrice?: number; limit?: number }) => Promise<{ agents: AgentInfo[] }>;
  hire: (options: HireOptions) => Promise<{ escrowAddress: string; agentId: string } | null>;
  checkDelivery: (escrowAddress: string) => Promise<{ status: string; deliverable?: unknown; qualityScore?: number }>;
  awaitDelivery: (escrowAddress: string, timeoutMs?: number) => Promise<DeliveryResult>;
  getAgentReputation: (agentId: string) => Promise<AgentInfo | null>;
}): HiveToolHandlers {
  return {
    async hive_discover_agents(input) {
      try {
        const result = await hive.discover({
          capability: input.capability as Capability,
          minReputation: (input.min_reputation as number) ?? 500,
          maxPrice: input.max_price as number | undefined,
          limit: (input.limit as number) ?? 5,
        });

        return {
          success: true,
          data: {
            agents: result.agents.map(a => ({
              id: a.id,
              capabilities: a.capabilities,
              reputation: a.reputation,
              price: a.pricing.perTask ?? a.pricing.perToken,
              success_rate: a.successRate,
              total_jobs: a.totalJobs,
            })),
            count: result.agents.length,
          },
        };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Discovery failed',
        };
      }
    },

    async hive_hire_agent(input) {
      try {
        const result = await hive.hire({
          capability: 'code-review',
          spec: input.spec as string,
          budget: input.budget as number,
          deadline: ((input.deadline_seconds as number) ?? 300) * 1000,
          qualityThreshold: (input.quality_threshold as number) ?? 70,
          preferredAgents: [input.agent_id as string],
        });

        if (!result) {
          return { success: false, error: 'Failed to hire agent' };
        }

        return {
          success: true,
          data: {
            escrow_address: result.escrowAddress,
            agent_id: result.agentId,
            message: 'Agent hired successfully. Use hive_await_delivery to get the result.',
          },
        };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Hire failed',
        };
      }
    },

    async hive_check_delivery(input) {
      try {
        const result = await hive.checkDelivery(input.escrow_address as string);
        return {
          success: true,
          data: result,
        };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Check failed',
        };
      }
    },

    async hive_await_delivery(input) {
      try {
        const timeoutMs = ((input.timeout_seconds as number) ?? 300) * 1000;
        const result = await hive.awaitDelivery(input.escrow_address as string, timeoutMs);
        return {
          success: result.success,
          data: result,
          error: result.error,
        };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Await failed',
        };
      }
    },

    async hive_get_reputation(input) {
      try {
        const agent = await hive.getAgentReputation(input.agent_id as string);
        if (!agent) {
          return { success: false, error: 'Agent not found' };
        }

        return {
          success: true,
          data: {
            id: agent.id,
            reputation: agent.reputation,
            total_jobs: agent.totalJobs,
            success_rate: agent.successRate,
            avg_response_time_ms: agent.avgResponseTime,
            capabilities: agent.capabilities,
          },
        };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Lookup failed',
        };
      }
    },
  };
}
