import type { SwarmOrchestrator } from './orchestrator.js';
import type { SwarmMember, TaskInput, TaskResult } from './types.js';

/**
 * Bridges the existing SwarmTeam REST API with the Lucid Agents orchestrator.
 * Use this to wire up agent lifecycle events from API route handlers.
 */
export class SwarmApiBridge {
  private orchestrator: SwarmOrchestrator;
  private drawRecorder: DrawRecorder;

  constructor(orchestrator: SwarmOrchestrator, drawRecorder: DrawRecorder) {
    this.orchestrator = orchestrator;
    this.drawRecorder = drawRecorder;
  }

  /**
   * Call when a member is added to a team via POST /api/swarm-teams/:id/members.
   * Spawns a Lucid Agent for the new member.
   */
  async onMemberAdded(member: SwarmMember): Promise<void> {
    await this.orchestrator.addAgent(member);
  }

  /**
   * Call when a member is removed via DELETE /api/swarm-teams/:id/members/:memberId.
   * Stops the agent and cleans up.
   */
  async onMemberRemoved(memberId: string): Promise<void> {
    await this.orchestrator.removeAgent(memberId);
  }

  /**
   * Submit a task for execution by a specific agent.
   * Records a draw on completion.
   */
  async submitTask(memberId: string, task: TaskInput): Promise<TaskResult> {
    const result = await this.orchestrator.assignTask(memberId, task);

    if (result.status === 'completed' && result.amountDrawn && result.amountDrawn > 0) {
      await this.drawRecorder.recordDraw({
        teamId: task.teamId,
        agentId: this.orchestrator.getAgent(memberId)?.config.member.agentId || memberId,
        amount: result.amountDrawn,
        purpose: task.description,
        taskId: task.taskId,
      });
    }

    return result;
  }

  /**
   * Get the current state of all agents in the team.
   */
  getAgentStates(): Array<{
    memberId: string;
    agentId: string;
    role: string;
    drawLimit: number;
  }> {
    return this.orchestrator.listAgents().map(({ memberId, agent }) => ({
      memberId,
      agentId: agent.config.member.agentId,
      role: agent.config.member.role,
      drawLimit: agent.config.member.drawLimit,
    }));
  }
}

/**
 * Interface for recording draws in the database.
 * Implement this with your actual DB layer (SQLite, Postgres, etc.)
 */
export interface DrawRecorder {
  recordDraw(draw: {
    teamId: string;
    agentId: string;
    amount: number;
    purpose: string;
    taskId: string;
  }): Promise<{ drawId: string }>;
}

/**
 * Create a bridge instance.
 */
export function createApiBridge(
  orchestrator: SwarmOrchestrator,
  drawRecorder: DrawRecorder
): SwarmApiBridge {
  return new SwarmApiBridge(orchestrator, drawRecorder);
}
