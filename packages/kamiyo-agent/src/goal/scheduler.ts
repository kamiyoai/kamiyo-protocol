import type { GoalTracker } from './tracker';
import type { Task } from './types';
import type { EventEmitter } from '../events';

export interface SchedulerConfig {
  tickIntervalMs?: number;
  maxConcurrent?: number;
}

export type TaskExecutor = (task: Task) => Promise<{ result?: string; error?: string }>;

export class GoalScheduler {
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private activeTasks = 0;
  private readonly tickInterval: number;
  private readonly maxConcurrent: number;

  constructor(
    private tracker: GoalTracker,
    private executor: TaskExecutor,
    private events: EventEmitter,
    config: SchedulerConfig = {}
  ) {
    this.tickInterval = config.tickIntervalMs ?? 60_000;
    this.maxConcurrent = config.maxConcurrent ?? 1;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.timer = setInterval(() => this.tick(), this.tickInterval);
    this.timer.unref();
    this.tick();
  }

  stop(): void {
    this.running = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async tick(): Promise<void> {
    const pending: Promise<void>[] = [];
    const goals = this.tracker.listGoals('active');

    for (const goal of goals) {
      if (this.activeTasks >= this.maxConcurrent) break;

      const task = this.tracker.nextPendingTask(goal.id);
      if (!task) {
        const progress = this.tracker.computeProgress(goal.id);
        const tasks = this.tracker.listTasks(goal.id);
        const hasInProgress = tasks.some(t => t.state === 'in_progress');
        if (progress >= 1 && !hasInProgress) {
          this.tracker.updateGoalState(goal.id, 'completed');
          this.tracker.updateProgress(goal.id, 1);
          this.events.emit('run:end', {
            runId: goal.id,
            text: `Goal completed: ${goal.description}`,
            turns: 0,
            durationMs: 0,
          });
        }
        continue;
      }

      this.activeTasks++;
      const p = this.executeTask(goal.id, task).finally(() => {
        this.activeTasks--;
      });
      pending.push(p);
    }

    await Promise.all(pending);
  }

  private async executeTask(goalId: string, task: Task): Promise<void> {
    this.tracker.updateTaskState(task.id, 'in_progress');

    try {
      const { result, error } = await this.executor(task);
      if (error) {
        this.tracker.updateTaskState(task.id, 'failed', undefined, error);
      } else {
        this.tracker.updateTaskState(task.id, 'completed', result);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.tracker.updateTaskState(task.id, 'failed', undefined, msg);
    }

    const progress = this.tracker.computeProgress(goalId);
    this.tracker.updateProgress(goalId, progress);
  }
}
