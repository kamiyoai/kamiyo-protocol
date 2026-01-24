import { sendMessage, getTask, subscribeTask } from '@lucid-agents/a2a';
import type { AgentCard, Task } from '@lucid-agents/types/a2a';
import type {
  SwarmTeamConfig,
  SwarmMember,
  SwarmAgent,
  TaskInput,
  TaskResult,
  TaskStatusCallback,
} from './types.js';
import { createSwarmAgent, type TaskHandler } from './agent-factory.js';

export interface OrchestratorConfig {
  team: SwarmTeamConfig;
  /** Custom fetch implementation (e.g., with auth headers) */
  fetchImpl?: typeof fetch;
  /** Called when a task completes — use this to record draws */
  onTaskComplete?: (result: TaskResult & { memberId: string }) => void | Promise<void>;
  /** Called when a task fails */
  onTaskFailed?: (result: TaskResult & { memberId: string }) => void | Promise<void>;
}

/**
 * Manages a team of Lucid Agents: spawning, task assignment, and lifecycle.
 */
export class SwarmOrchestrator {
  private agents = new Map<string, SwarmAgent>();
  private config: OrchestratorConfig;
  private fetchImpl: typeof fetch;

  constructor(config: OrchestratorConfig) {
    this.config = config;
    this.fetchImpl = config.fetchImpl || fetch;
  }

  /**
   * Spawn a new agent for a team member.
   * If the agent already exists, returns the existing instance.
   */
  async addAgent(
    member: SwarmMember,
    taskHandler?: TaskHandler
  ): Promise<SwarmAgent> {
    if (this.agents.has(member.id)) {
      return this.agents.get(member.id)!;
    }

    const agent = await createSwarmAgent({
      team: this.config.team,
      member,
      taskHandler,
      storageType: 'in-memory',
    });

    this.agents.set(member.id, agent);
    return agent;
  }

  /**
   * Remove and stop an agent.
   */
  async removeAgent(memberId: string): Promise<void> {
    const agent = this.agents.get(memberId);
    if (agent) {
      await agent.stop();
      this.agents.delete(memberId);
    }
  }

  /**
   * Get a running agent by member ID.
   */
  getAgent(memberId: string): SwarmAgent | undefined {
    return this.agents.get(memberId);
  }

  /**
   * List all active agents.
   */
  listAgents(): Array<{ memberId: string; agent: SwarmAgent }> {
    return Array.from(this.agents.entries()).map(([memberId, agent]) => ({
      memberId,
      agent,
    }));
  }

  /**
   * Assign a task to a specific agent by member ID.
   * Executes the task directly if agent is local (same process).
   */
  async assignTask(memberId: string, task: TaskInput): Promise<TaskResult> {
    const agent = this.agents.get(memberId);
    if (!agent) {
      throw new Error(`No agent found for member ${memberId}`);
    }

    try {
      const result = await agent.executeTask(task);

      if (result.status === 'completed' && this.config.onTaskComplete) {
        await this.config.onTaskComplete({ ...result, memberId });
      } else if (result.status === 'failed' && this.config.onTaskFailed) {
        await this.config.onTaskFailed({ ...result, memberId });
      }

      return result;
    } catch (err) {
      const failResult: TaskResult = {
        taskId: task.taskId,
        status: 'failed',
        error: err instanceof Error ? err.message : 'Unknown error',
      };

      if (this.config.onTaskFailed) {
        await this.config.onTaskFailed({ ...failResult, memberId });
      }

      return failResult;
    }
  }

  /**
   * Assign a task to a remote agent via A2A protocol.
   * Use this when agents are hosted externally.
   */
  async assignTaskRemote(
    agentCard: AgentCard,
    task: TaskInput,
    contextId?: string
  ): Promise<{ taskId: string }> {
    const response = await sendMessage(
      agentCard,
      'execute-task',
      task,
      this.fetchImpl as any,
      { contextId: contextId || `team-${this.config.team.teamId}` }
    );

    return { taskId: response.taskId };
  }

  /**
   * Poll a remote task for completion.
   */
  async getRemoteTaskStatus(agentCard: AgentCard, taskId: string): Promise<Task> {
    return getTask(agentCard, taskId, this.fetchImpl as any);
  }

  /**
   * Subscribe to remote task updates via SSE.
   */
  async subscribeRemoteTask(
    agentCard: AgentCard,
    taskId: string,
    callback: TaskStatusCallback
  ): Promise<void> {
    await subscribeTask(
      agentCard,
      taskId,
      async (event) => {
        callback({
          taskId,
          status: event.data?.status || 'unknown',
          data: event.data,
        });
      },
      this.fetchImpl as any
    );
  }

  /**
   * Stop all agents and clean up.
   */
  async shutdown(): Promise<void> {
    const stops = Array.from(this.agents.values()).map((a) => a.stop());
    await Promise.all(stops);
    this.agents.clear();
  }

  /**
   * Get the team config.
   */
  get team(): SwarmTeamConfig {
    return this.config.team;
  }

  /**
   * Number of active agents.
   */
  get agentCount(): number {
    return this.agents.size;
  }
}

/**
 * Create a new SwarmOrchestrator instance.
 */
export function createOrchestrator(config: OrchestratorConfig): SwarmOrchestrator {
  return new SwarmOrchestrator(config);
}
