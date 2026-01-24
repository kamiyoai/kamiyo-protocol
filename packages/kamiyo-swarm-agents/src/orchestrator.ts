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
import { createLogger } from './logger.js';

const log = createLogger('orchestrator');

export interface OrchestratorConfig {
  team: SwarmTeamConfig;
  /** Custom fetch implementation (e.g., with auth headers) */
  fetchImpl?: typeof fetch;
  /** Task execution timeout in ms (default: 60000) */
  taskTimeoutMs?: number;
  /** Called when a task completes — use this to record draws */
  onTaskComplete?: (result: TaskResult & { memberId: string }) => void | Promise<void>;
  /** Called when a task fails */
  onTaskFailed?: (result: TaskResult & { memberId: string }) => void | Promise<void>;
}

const DEFAULT_TASK_TIMEOUT_MS = 60_000;

export class SwarmOrchestrator {
  private agents = new Map<string, SwarmAgent>();
  private config: OrchestratorConfig;
  private fetchImpl: typeof fetch;

  constructor(config: OrchestratorConfig) {
    this.config = config;
    this.fetchImpl = config.fetchImpl || fetch;
  }

  async addAgent(
    member: SwarmMember,
    taskHandler?: TaskHandler
  ): Promise<SwarmAgent> {
    if (this.agents.has(member.id)) {
      return this.agents.get(member.id)!;
    }

    log.info('Spawning agent', { memberId: member.id, agentId: member.agentId, role: member.role });
    const agent = await createSwarmAgent({
      team: this.config.team,
      member,
      taskHandler,
      storageType: 'in-memory',
    });

    this.agents.set(member.id, agent);
    log.info('Agent spawned', { memberId: member.id, totalAgents: this.agents.size });
    return agent;
  }

  async removeAgent(memberId: string): Promise<void> {
    const agent = this.agents.get(memberId);
    if (agent) {
      log.info('Removing agent', { memberId });
      await agent.stop();
      this.agents.delete(memberId);
    }
  }

  getAgent(memberId: string): SwarmAgent | undefined {
    return this.agents.get(memberId);
  }

  listAgents(): Array<{ memberId: string; agent: SwarmAgent }> {
    return Array.from(this.agents.entries()).map(([memberId, agent]) => ({
      memberId,
      agent,
    }));
  }

  async assignTask(memberId: string, task: TaskInput): Promise<TaskResult> {
    const agent = this.agents.get(memberId);
    if (!agent) {
      throw new Error(`No agent found for member ${memberId}`);
    }

    const timeoutMs = this.config.taskTimeoutMs ?? DEFAULT_TASK_TIMEOUT_MS;
    log.info('Task assigned', { taskId: task.taskId, memberId, budget: task.budget, timeoutMs });

    try {
      const result = await Promise.race([
        agent.executeTask(task),
        new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error(`Task timed out after ${timeoutMs}ms`)), timeoutMs);
        }),
      ]);

      if (result.status === 'completed') {
        log.info('Task completed', { taskId: task.taskId, memberId, amountDrawn: result.amountDrawn });
        if (this.config.onTaskComplete) {
          await this.config.onTaskComplete({ ...result, memberId });
        }
      } else if (result.status === 'failed') {
        log.warn('Task failed', { taskId: task.taskId, memberId, error: result.error });
        if (this.config.onTaskFailed) {
          await this.config.onTaskFailed({ ...result, memberId });
        }
      }

      return result;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      log.error('Task execution error', { taskId: task.taskId, memberId, error: errorMsg });

      const failResult: TaskResult = {
        taskId: task.taskId,
        status: 'failed',
        error: errorMsg,
      };

      if (this.config.onTaskFailed) {
        await this.config.onTaskFailed({ ...failResult, memberId });
      }

      return failResult;
    }
  }

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

  async getRemoteTaskStatus(agentCard: AgentCard, taskId: string): Promise<Task> {
    return getTask(agentCard, taskId, this.fetchImpl as any);
  }

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

  async shutdown(): Promise<void> {
    log.info('Shutting down', { agentCount: this.agents.size });
    const stops = Array.from(this.agents.values()).map((a) => a.stop());
    await Promise.all(stops);
    this.agents.clear();
    log.info('Shutdown complete');
  }

  get team(): SwarmTeamConfig {
    return this.config.team;
  }

  get agentCount(): number {
    return this.agents.size;
  }
}

export function createOrchestrator(config: OrchestratorConfig): SwarmOrchestrator {
  return new SwarmOrchestrator(config);
}
