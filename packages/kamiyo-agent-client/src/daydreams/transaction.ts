/**
 * Saga pattern with compensation for multi-step operations.
 */

export type TransactionStatus = 'pending' | 'committed' | 'rolled_back' | 'failed';

export interface TransactionStep<T = unknown> {
  name: string;
  execute: () => Promise<T>;
  compensate: (result: T) => Promise<void>;
  result?: T;
  error?: Error;
  startedAt?: number;
  completedAt?: number;
}

export interface TransactionOptions {
  timeout?: number;
  onStepComplete?: (step: TransactionStep, index: number) => void;
  onStepFailed?: (step: TransactionStep, index: number, error: Error) => void;
  onRollback?: (step: TransactionStep, index: number) => void;
}

export interface TransactionResult<T extends TransactionStep[]> {
  status: TransactionStatus;
  steps: T;
  completedSteps: number;
  totalMs: number;
  error?: Error;
  results: { [K in keyof T]: T[K] extends TransactionStep<infer R> ? R | undefined : unknown };
}

export class TransactionContext {
  private steps: TransactionStep[] = [];
  private options: TransactionOptions;
  private startTime?: number;
  private status: TransactionStatus = 'pending';

  constructor(options: TransactionOptions = {}) {
    this.options = {
      timeout: options.timeout ?? 30000,
      ...options,
    };
  }

  step<T>(
    name: string,
    execute: () => Promise<T>,
    compensate: (result: T) => Promise<void>
  ): TransactionContext {
    this.steps.push({ name, execute, compensate } as TransactionStep);
    return this;
  }

  async execute<T extends TransactionStep[]>(): Promise<TransactionResult<T>> {
    this.startTime = Date.now();
    const completedSteps: TransactionStep[] = [];
    const results: unknown[] = [];

    try {
      for (let i = 0; i < this.steps.length; i++) {
        const step = this.steps[i];
        step.startedAt = Date.now();

        // Check timeout
        if (this.options.timeout && Date.now() - this.startTime > this.options.timeout) {
          throw new Error(`Transaction timeout after ${this.options.timeout}ms`);
        }

        try {
          step.result = await step.execute();
          step.completedAt = Date.now();
          completedSteps.push(step);
          results.push(step.result);
          this.options.onStepComplete?.(step, i);
        } catch (err) {
          step.error = err instanceof Error ? err : new Error(String(err));
          this.options.onStepFailed?.(step, i, step.error);
          throw step.error;
        }
      }

      this.status = 'committed';
      return {
        status: 'committed',
        steps: this.steps as T,
        completedSteps: completedSteps.length,
        totalMs: Date.now() - this.startTime,
        results: results as TransactionResult<T>['results'],
      };
    } catch (err) {
      // Rollback completed steps in reverse order
      for (let i = completedSteps.length - 1; i >= 0; i--) {
        const step = completedSteps[i];
        try {
          await step.compensate(step.result);
          this.options.onRollback?.(step, i);
        } catch (compensateErr) {
          // Log but continue rolling back
          console.error(`Compensation failed for step ${step.name}:`, compensateErr);
        }
      }

      this.status = 'rolled_back';
      return {
        status: 'rolled_back',
        steps: this.steps as T,
        completedSteps: completedSteps.length,
        totalMs: Date.now() - this.startTime!,
        error: err instanceof Error ? err : new Error(String(err)),
        results: results as TransactionResult<T>['results'],
      };
    }
  }

  getStatus(): TransactionStatus {
    return this.status;
  }
}

// Transaction builder for fluent API
export function transaction(options?: TransactionOptions): TransactionContext {
  return new TransactionContext(options);
}

// Outbox pattern for reliable event publishing
export interface OutboxEntry {
  id: string;
  eventType: string;
  payload: unknown;
  createdAt: number;
  processedAt?: number;
  retries: number;
  lastError?: string;
}

export interface OutboxConfig {
  storage: {
    save: (entry: OutboxEntry) => Promise<void>;
    getPending: () => Promise<OutboxEntry[]>;
    markProcessed: (id: string) => Promise<void>;
    markFailed: (id: string, error: string) => Promise<void>;
  };
  processor: (entry: OutboxEntry) => Promise<void>;
  pollIntervalMs?: number;
  maxRetries?: number;
  retryDelayMs?: number;
}

export class Outbox {
  private config: Required<OutboxConfig>;
  private intervalId?: ReturnType<typeof setInterval>;
  private processing = false;

  constructor(config: OutboxConfig) {
    this.config = {
      ...config,
      pollIntervalMs: config.pollIntervalMs ?? 5000,
      maxRetries: config.maxRetries ?? 3,
      retryDelayMs: config.retryDelayMs ?? 1000,
    };
  }

  async publish(eventType: string, payload: unknown): Promise<string> {
    const id = crypto.randomUUID();
    const entry: OutboxEntry = {
      id,
      eventType,
      payload,
      createdAt: Date.now(),
      retries: 0,
    };
    await this.config.storage.save(entry);
    return id;
  }

  async processOnce(): Promise<number> {
    if (this.processing) return 0;
    this.processing = true;

    try {
      const pending = await this.config.storage.getPending();
      let processed = 0;

      for (const entry of pending) {
        if (entry.retries >= this.config.maxRetries) {
          continue;
        }

        try {
          await this.config.processor(entry);
          await this.config.storage.markProcessed(entry.id);
          processed++;
        } catch (err) {
          const error = err instanceof Error ? err.message : String(err);
          await this.config.storage.markFailed(entry.id, error);
        }
      }

      return processed;
    } finally {
      this.processing = false;
    }
  }

  start(): void {
    if (this.intervalId) return;
    this.intervalId = setInterval(() => {
      this.processOnce().catch(console.error);
    }, this.config.pollIntervalMs);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
  }
}

// Idempotency key management
export interface IdempotencyRecord {
  key: string;
  result: unknown;
  createdAt: number;
  expiresAt: number;
}

export interface IdempotencyConfig {
  storage: {
    get: (key: string) => Promise<IdempotencyRecord | null>;
    set: (record: IdempotencyRecord) => Promise<void>;
    delete: (key: string) => Promise<void>;
  };
  ttlMs?: number;
}

export class IdempotencyManager {
  private config: Required<IdempotencyConfig>;

  constructor(config: IdempotencyConfig) {
    this.config = {
      ...config,
      ttlMs: config.ttlMs ?? 24 * 60 * 60 * 1000, // 24 hours
    };
  }

  async execute<T>(key: string, operation: () => Promise<T>): Promise<T> {
    const existing = await this.config.storage.get(key);
    if (existing && existing.expiresAt > Date.now()) {
      return existing.result as T;
    }

    const result = await operation();
    await this.config.storage.set({
      key,
      result,
      createdAt: Date.now(),
      expiresAt: Date.now() + this.config.ttlMs,
    });

    return result;
  }

  async invalidate(key: string): Promise<void> {
    await this.config.storage.delete(key);
  }
}

// Two-phase commit coordinator
export type TwoPhaseStatus = 'preparing' | 'prepared' | 'committing' | 'committed' | 'aborting' | 'aborted';

export interface Participant {
  id: string;
  prepare: () => Promise<boolean>;
  commit: () => Promise<void>;
  abort: () => Promise<void>;
}

export interface TwoPhaseResult {
  status: TwoPhaseStatus;
  participants: Array<{ id: string; prepared: boolean; committed: boolean }>;
  error?: Error;
}

export class TwoPhaseCoordinator {
  private participants: Participant[] = [];
  private status: TwoPhaseStatus = 'preparing';
  private prepareResults = new Map<string, boolean>();

  addParticipant(participant: Participant): void {
    this.participants.push(participant);
  }

  async execute(): Promise<TwoPhaseResult> {
    // Phase 1: Prepare
    this.status = 'preparing';
    const preparePromises = this.participants.map(async (p) => {
      try {
        const ready = await p.prepare();
        this.prepareResults.set(p.id, ready);
        return { id: p.id, ready };
      } catch {
        this.prepareResults.set(p.id, false);
        return { id: p.id, ready: false };
      }
    });

    const prepareResults = await Promise.all(preparePromises);
    const allPrepared = prepareResults.every((r) => r.ready);

    if (!allPrepared) {
      // Abort all participants
      this.status = 'aborting';
      await Promise.all(this.participants.map((p) => p.abort().catch(() => {})));
      this.status = 'aborted';

      return {
        status: 'aborted',
        participants: this.participants.map((p) => ({
          id: p.id,
          prepared: this.prepareResults.get(p.id) ?? false,
          committed: false,
        })),
        error: new Error('Not all participants prepared successfully'),
      };
    }

    this.status = 'prepared';

    // Phase 2: Commit
    this.status = 'committing';
    const commitResults = new Map<string, boolean>();

    for (const participant of this.participants) {
      try {
        await participant.commit();
        commitResults.set(participant.id, true);
      } catch (err) {
        commitResults.set(participant.id, false);
        // Continue committing others even if one fails
        console.error(`Commit failed for participant ${participant.id}:`, err);
      }
    }

    this.status = 'committed';

    return {
      status: 'committed',
      participants: this.participants.map((p) => ({
        id: p.id,
        prepared: this.prepareResults.get(p.id) ?? false,
        committed: commitResults.get(p.id) ?? false,
      })),
    };
  }

  getStatus(): TwoPhaseStatus {
    return this.status;
  }
}

// In-memory storage for testing
export function createInMemoryTransactionStorage(): {
  idempotency: IdempotencyConfig['storage'];
  outbox: OutboxConfig['storage'];
} {
  const idempotencyStore = new Map<string, IdempotencyRecord>();
  const outboxStore = new Map<string, OutboxEntry>();

  return {
    idempotency: {
      get: async (key) => idempotencyStore.get(key) ?? null,
      set: async (record) => {
        idempotencyStore.set(record.key, record);
      },
      delete: async (key) => {
        idempotencyStore.delete(key);
      },
    },
    outbox: {
      save: async (entry) => {
        outboxStore.set(entry.id, entry);
      },
      getPending: async () => {
        return Array.from(outboxStore.values()).filter((e) => !e.processedAt);
      },
      markProcessed: async (id) => {
        const entry = outboxStore.get(id);
        if (entry) {
          entry.processedAt = Date.now();
        }
      },
      markFailed: async (id, error) => {
        const entry = outboxStore.get(id);
        if (entry) {
          entry.retries++;
          entry.lastError = error;
        }
      },
    },
  };
}
