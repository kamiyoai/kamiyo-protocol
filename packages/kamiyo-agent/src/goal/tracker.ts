import { randomUUID } from 'crypto';
import type { Goal, GoalInput, GoalState, Task, TaskInput, TaskState } from './types';
import type { DB } from '../db-types';

export class GoalTracker {
  constructor(
    private db: DB,
    private agentId: string
  ) {}

  createGoal(input: GoalInput): Goal {
    if (!input.description?.trim()) throw new Error('Goal description required');
    const id = randomUUID();
    const now = Math.floor(Date.now() / 1000);
    const priority = Math.max(0, Math.min(100, input.priority ?? 50));
    this.db
      .prepare(
        `
      INSERT INTO agent_goals (id, agent_id, description, success_criteria, priority, parent_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `
      )
      .run(
        id,
        this.agentId,
        input.description,
        input.successCriteria ?? null,
        priority,
        input.parentId ?? null,
        now,
        now
      );
    const goal = this.getGoal(id);
    if (!goal) throw new Error('Failed to create goal');
    return goal;
  }

  getGoal(id: string): Goal | null {
    const row = this.db
      .prepare(`SELECT * FROM agent_goals WHERE id = ? AND agent_id = ?`)
      .get(id, this.agentId) as Record<string, unknown> | undefined;
    return row ? mapGoal(row) : null;
  }

  listGoals(state?: GoalState): Goal[] {
    if (state) {
      return (
        this.db
          .prepare(
            `
        SELECT * FROM agent_goals WHERE agent_id = ? AND state = ? ORDER BY priority DESC
      `
          )
          .all(this.agentId, state) as Record<string, unknown>[]
      ).map(mapGoal);
    }
    return (
      this.db
        .prepare(
          `
      SELECT * FROM agent_goals WHERE agent_id = ? ORDER BY priority DESC
    `
        )
        .all(this.agentId) as Record<string, unknown>[]
    ).map(mapGoal);
  }

  updateGoalState(id: string, state: GoalState, reason?: string): void {
    const now = Math.floor(Date.now() / 1000);
    if (state === 'completed') {
      this.db
        .prepare(`UPDATE agent_goals SET state = ?, updated_at = ?, completed_at = ? WHERE id = ?`)
        .run(state, now, now, id);
    } else if (state === 'failed') {
      this.db
        .prepare(`UPDATE agent_goals SET state = ?, updated_at = ?, failed_reason = ? WHERE id = ?`)
        .run(state, now, reason ?? null, id);
    } else {
      this.db
        .prepare(`UPDATE agent_goals SET state = ?, updated_at = ? WHERE id = ?`)
        .run(state, now, id);
    }
  }

  updateProgress(id: string, progress: number): void {
    const now = Math.floor(Date.now() / 1000);
    this.db
      .prepare(`UPDATE agent_goals SET progress = ?, updated_at = ? WHERE id = ?`)
      .run(Math.min(1, Math.max(0, progress)), now, id);
  }

  savePlan(goalId: string, planJson: string): void {
    const now = Math.floor(Date.now() / 1000);
    this.db
      .prepare(`UPDATE agent_goals SET plan_json = ?, updated_at = ? WHERE id = ?`)
      .run(planJson, now, goalId);
  }

  addTask(goalId: string, input: TaskInput): Task {
    const id = randomUUID();
    this.db
      .prepare(
        `
      INSERT INTO agent_tasks (id, goal_id, description, tool, params_json, depends_on, ordering)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `
      )
      .run(
        id,
        goalId,
        input.description,
        input.tool ?? null,
        input.params ? JSON.stringify(input.params) : null,
        input.dependsOn ?? null,
        input.ordering ?? 0
      );
    const task = this.getTask(id);
    if (!task) throw new Error('Failed to create task');
    return task;
  }

  addTasks(goalId: string, inputs: TaskInput[]): Task[] {
    if (this.db.transaction) {
      return this.db.transaction(() => inputs.map(input => this.addTask(goalId, input)))();
    }
    return inputs.map(input => this.addTask(goalId, input));
  }

  getTask(id: string): Task | null {
    const row = this.db.prepare(`SELECT * FROM agent_tasks WHERE id = ?`).get(id) as
      | Record<string, unknown>
      | undefined;
    return row ? mapTask(row) : null;
  }

  listTasks(goalId: string): Task[] {
    return (
      this.db
        .prepare(
          `
      SELECT * FROM agent_tasks WHERE goal_id = ? ORDER BY ordering
    `
        )
        .all(goalId) as Record<string, unknown>[]
    ).map(mapTask);
  }

  updateTaskState(id: string, state: TaskState, result?: string, error?: string): void {
    const now = Math.floor(Date.now() / 1000);
    if (state === 'completed') {
      this.db
        .prepare(`UPDATE agent_tasks SET state = ?, result_json = ?, completed_at = ? WHERE id = ?`)
        .run(state, result ?? null, now, id);
    } else if (state === 'failed') {
      this.db
        .prepare(`UPDATE agent_tasks SET state = ?, error_text = ? WHERE id = ?`)
        .run(state, error ?? null, id);
    } else {
      this.db.prepare(`UPDATE agent_tasks SET state = ? WHERE id = ?`).run(state, id);
    }
  }

  nextPendingTask(goalId: string): Task | null {
    const tasks = this.listTasks(goalId);
    for (const task of tasks) {
      if (task.state !== 'pending') continue;
      if (task.dependsOn) {
        const dep = this.getTask(task.dependsOn);
        if (dep && dep.state !== 'completed') continue;
      }
      return task;
    }
    return null;
  }

  computeProgress(goalId: string): number {
    const tasks = this.listTasks(goalId);
    if (tasks.length === 0) return 0;
    const done = tasks.filter(t => t.state === 'completed' || t.state === 'skipped').length;
    return done / tasks.length;
  }
}

function mapGoal(row: Record<string, unknown>): Goal {
  const r = row;
  return {
    id: r.id as string,
    agentId: r.agent_id as string,
    description: r.description as string,
    successCriteria: r.success_criteria as string | null,
    state: r.state as GoalState,
    priority: r.priority as number,
    parentId: r.parent_id as string | null,
    progress: r.progress as number,
    planJson: r.plan_json as string | null,
    createdAt: r.created_at as number,
    updatedAt: r.updated_at as number,
    completedAt: r.completed_at as number | null,
    failedReason: r.failed_reason as string | null,
  };
}

function mapTask(row: Record<string, unknown>): Task {
  const r = row;
  return {
    id: r.id as string,
    goalId: r.goal_id as string,
    description: r.description as string,
    state: r.state as TaskState,
    tool: r.tool as string | null,
    paramsJson: r.params_json as string | null,
    resultJson: r.result_json as string | null,
    errorText: r.error_text as string | null,
    dependsOn: r.depends_on as string | null,
    ordering: r.ordering as number,
    createdAt: r.created_at as number,
    completedAt: r.completed_at as number | null,
  };
}
