import { randomUUID } from 'crypto';
import { createLogger } from '../lib';
import type { AutonomyStatus, AutonomyTask, AutonomyTaskInput, MeishiDecision, OpenClawDispatchReceipt } from './types';

const log = createLogger('nika:autonomy:runner');

export interface AutonomyRunnerConfig {
  enabled: boolean;
  dryRun: boolean;
  tickIntervalMs: number;
  maxQueueSize: number;
  maxTaskHistory: number;
  objectiveMaxLength: number;
}

export interface MeishiGateClient {
  evaluate(task: AutonomyTask): Promise<MeishiDecision>;
}

export interface OpenClawExecutorClient {
  dispatch(task: AutonomyTask): Promise<OpenClawDispatchReceipt>;
}

export interface AutonomyRunnerDeps {
  meishiGate: MeishiGateClient;
  executor: OpenClawExecutorClient;
}

function now(): number {
  return Date.now();
}

export function createAutonomyStatus(config: Pick<AutonomyRunnerConfig, 'enabled' | 'dryRun'>): AutonomyStatus {
  return {
    enabled: config.enabled,
    running: false,
    dryRun: config.dryRun,
    queueSize: 0,
    inFlightTaskId: null,
    totals: { queued: 0, completed: 0, blocked: 0, failed: 0 },
    lastRunAt: null,
    lastError: null,
  };
}

export class AutonomyRunner {
  private config: AutonomyRunnerConfig;
  private deps: AutonomyRunnerDeps;
  private tasks = new Map<string, AutonomyTask>();
  private queue: string[] = [];
  private idempotencyIndex = new Map<string, string>();
  private timer: NodeJS.Timeout | null = null;
  private inFlightTaskId: string | null = null;
  private status: AutonomyStatus;

  constructor(config: AutonomyRunnerConfig, deps: AutonomyRunnerDeps) {
    this.config = config;
    this.deps = deps;
    this.status = createAutonomyStatus({ enabled: config.enabled, dryRun: config.dryRun });
  }

  async start(): Promise<void> {
    if (!this.config.enabled) return;
    if (this.timer) return;

    this.status.running = true;
    this.timer = setInterval(() => {
      void this.runNext();
    }, this.config.tickIntervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.status.running = false;
  }

  async enqueue(input: AutonomyTaskInput): Promise<AutonomyTask> {
    const objective = input.objective.trim();
    if (!objective) throw new Error('objective_required');
    if (objective.length > this.config.objectiveMaxLength) {
      throw new Error(`objective_too_long:max_${this.config.objectiveMaxLength}`);
    }

    const idempotencyKey = input.idempotencyKey?.trim() || undefined;
    if (idempotencyKey) {
      const existingId = this.idempotencyIndex.get(idempotencyKey);
      if (existingId) {
        const existing = this.tasks.get(existingId);
        if (existing) return this.snapshot(existing);
        this.idempotencyIndex.delete(idempotencyKey);
      }
    }

    if (this.queue.length >= this.config.maxQueueSize) throw new Error('autonomy_queue_full');

    const task: AutonomyTask = {
      id: randomUUID(),
      source: input.source,
      objective,
      requestor: input.requestor?.trim() || undefined,
      priority: clampPriority(input.priority),
      context: input.context,
      idempotencyKey,
      status: 'queued',
      createdAt: now(),
      updatedAt: now(),
      attempts: 0,
    };

    this.tasks.set(task.id, task);
    this.queue.push(task.id);
    this.status.queueSize = this.queue.length;
    this.status.totals.queued += 1;

    if (idempotencyKey) {
      this.idempotencyIndex.set(idempotencyKey, task.id);
    }

    this.trimTaskHistory();

    log.info('Autonomy task queued', {
      taskId: task.id,
      source: task.source,
      priority: task.priority,
      queueSize: this.queue.length,
    });

    return this.snapshot(task);
  }

  async runNext(): Promise<boolean> {
    if (!this.status.running || this.inFlightTaskId) return false;
    const taskId = this.queue.shift();
    if (!taskId) return false;

    const task = this.tasks.get(taskId);
    if (!task) {
      this.status.queueSize = this.queue.length;
      return false;
    }

    await this.runTaskInternal(taskId, task);
    return true;
  }

  async runTask(taskId: string): Promise<AutonomyTask | null> {
    if (!this.status.running || this.inFlightTaskId) return null;
    const task = this.tasks.get(taskId);
    if (!task) return null;
    if (task.status !== 'queued') return this.snapshot(task);

    const idx = this.queue.indexOf(taskId);
    if (idx === -1) {
      return this.snapshot(task);
    }
    this.queue.splice(idx, 1);
    this.status.queueSize = this.queue.length;

    await this.runTaskInternal(taskId, task);
    return this.snapshot(task);
  }

  getTask(taskId: string): AutonomyTask | null {
    const task = this.tasks.get(taskId);
    return task ? this.snapshot(task) : null;
  }

  listTasks(limit = 20): AutonomyTask[] {
    const safeLimit = Number.isFinite(limit) ? Math.min(Math.max(1, Math.floor(limit)), 200) : 20;
    return [...this.tasks.values()]
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, safeLimit)
      .map((task) => this.snapshot(task));
  }

  getStatus(): AutonomyStatus {
    return {
      ...this.status,
      totals: { ...this.status.totals },
      queueSize: this.queue.length,
      inFlightTaskId: this.inFlightTaskId,
    };
  }

  private async process(task: AutonomyTask): Promise<void> {
    task.status = 'running';
    task.startedAt = now();
    task.updatedAt = now();
    task.attempts += 1;

    try {
      const gate = await this.deps.meishiGate.evaluate(this.snapshot(task));
      task.gate = gate;
      task.updatedAt = now();

      if (!gate.allowed) {
        task.status = 'blocked';
        task.completedAt = now();
        task.updatedAt = now();
        this.status.totals.blocked += 1;
        return;
      }

      if (this.config.dryRun) {
        task.receipt = {
          accepted: true,
          statusCode: 200,
          sessionKey: `dry-run:${task.source}:${task.id}`,
          dispatchedAt: now(),
          response: { mode: 'dry-run' },
        };
        task.status = 'completed';
        task.completedAt = now();
        task.updatedAt = now();
        this.status.totals.completed += 1;
        return;
      }

      const receipt = await this.deps.executor.dispatch(this.snapshot(task));
      task.receipt = receipt;
      task.status = 'completed';
      task.completedAt = now();
      task.updatedAt = now();
      this.status.totals.completed += 1;
    } catch (error) {
      task.status = 'failed';
      task.error = error instanceof Error ? error.message : String(error);
      task.completedAt = now();
      task.updatedAt = now();
      this.status.totals.failed += 1;
      this.status.lastError = task.error;
      log.error('Autonomy task failed', { taskId: task.id, error: task.error });
    }
  }

  private async runTaskInternal(taskId: string, task: AutonomyTask): Promise<void> {
    this.status.queueSize = this.queue.length;
    this.inFlightTaskId = taskId;
    this.status.inFlightTaskId = taskId;

    try {
      await this.process(task);
    } finally {
      this.inFlightTaskId = null;
      this.status.inFlightTaskId = null;
      this.status.lastRunAt = now();
      this.trimTaskHistory();
    }
  }

  private snapshot(task: AutonomyTask): AutonomyTask {
    return {
      ...task,
      context: task.context ? { ...task.context } : undefined,
      gate: task.gate ? { ...task.gate, errors: task.gate.errors ? [...task.gate.errors] : undefined } : undefined,
      receipt: task.receipt ? { ...task.receipt } : undefined,
    };
  }

  private trimTaskHistory(): void {
    const maxHistory = Math.max(0, Math.floor(this.config.maxTaskHistory));
    if (maxHistory === 0) return;
    if (this.tasks.size <= maxHistory) return;

    const queued = new Set(this.queue);
    const inFlight = this.inFlightTaskId;

    const removable = [...this.tasks.values()]
      .filter((task) => {
        if (task.id === inFlight) return false;
        if (queued.has(task.id)) return false;
        return task.status === 'completed' || task.status === 'failed' || task.status === 'blocked';
      })
      .sort((a, b) => a.updatedAt - b.updatedAt);

    for (const task of removable) {
      if (this.tasks.size <= maxHistory) break;
      this.tasks.delete(task.id);
      if (task.idempotencyKey && this.idempotencyIndex.get(task.idempotencyKey) === task.id) {
        this.idempotencyIndex.delete(task.idempotencyKey);
      }
    }
  }
}

function clampPriority(value: number | undefined): number {
  if (typeof value !== 'number' || Number.isNaN(value)) return 3;
  return Math.min(5, Math.max(1, Math.round(value)));
}
