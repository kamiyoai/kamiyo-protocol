import type { SwarmOrchestrator } from './orchestrator.js';
import type { SwarmMember, TaskInput, TaskResult } from './types.js';

export class SwarmApiBridge {
  private orchestrator: SwarmOrchestrator;
  private drawRecorder: DrawRecorder;

  constructor(orchestrator: SwarmOrchestrator, drawRecorder: DrawRecorder) {
    this.orchestrator = orchestrator;
    this.drawRecorder = drawRecorder;
  }

  async onMemberAdded(member: SwarmMember): Promise<void> {
    await this.orchestrator.addAgent(member);
  }

  async onMemberRemoved(memberId: string): Promise<void> {
    await this.orchestrator.removeAgent(memberId);
  }

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
