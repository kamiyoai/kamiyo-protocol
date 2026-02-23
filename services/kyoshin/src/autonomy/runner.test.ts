import { describe, expect, it, vi } from 'vitest';
import { AutonomyRunner } from './runner';
import type { MeishiDecision, OpenClawDispatchReceipt } from './types';

describe('AutonomyRunner', () => {
  it('blocks when Meishi gate denies', async () => {
    const gate = {
      evaluate: vi.fn(async (): Promise<MeishiDecision> => ({
        allowed: false,
        reason: 'passport_not_compliant',
      })),
    };
    const executor = {
      dispatch: vi.fn(async (): Promise<OpenClawDispatchReceipt> => {
        throw new Error('should_not_run');
      }),
    };

    const runner = new AutonomyRunner(
      {
        enabled: true,
        dryRun: false,
        tickIntervalMs: 1000,
        maxQueueSize: 10,
        maxTaskHistory: 50,
        objectiveMaxLength: 500,
      },
      { meishiGate: gate, executor }
    );

    await runner.start();
    const task = await runner.enqueue({ source: 'manual', objective: 'do work' });
    const progressed = await runner.runNext();
    expect(progressed).toBe(true);

    const updated = runner.getTask(task.id);
    expect(updated?.status).toBe('blocked');
    expect(executor.dispatch).not.toHaveBeenCalled();
    runner.stop();
  });

  it('completes in dry-run mode without dispatching', async () => {
    const gate = {
      evaluate: vi.fn(async (): Promise<MeishiDecision> => ({
        allowed: true,
        reason: 'ok',
      })),
    };
    const executor = {
      dispatch: vi.fn(async (): Promise<OpenClawDispatchReceipt> => {
        throw new Error('should_not_run');
      }),
    };

    const runner = new AutonomyRunner(
      {
        enabled: true,
        dryRun: true,
        tickIntervalMs: 1000,
        maxQueueSize: 10,
        maxTaskHistory: 50,
        objectiveMaxLength: 500,
      },
      { meishiGate: gate, executor }
    );

    await runner.start();
    const task = await runner.enqueue({ source: 'api', objective: 'draft a response' });
    await runner.runNext();

    const updated = runner.getTask(task.id);
    expect(updated?.status).toBe('completed');
    expect(updated?.receipt?.response).toEqual({ mode: 'dry-run' });
    expect(executor.dispatch).not.toHaveBeenCalled();
    runner.stop();
  });

  it('dispatches to executor when enabled and authorized', async () => {
    const gate = {
      evaluate: vi.fn(async (): Promise<MeishiDecision> => ({
        allowed: true,
        reason: 'ok',
      })),
    };
    const executor = {
      dispatch: vi.fn(async (): Promise<OpenClawDispatchReceipt> => ({
        accepted: true,
        statusCode: 202,
        sessionKey: 'kyoshin:x:abc',
        dispatchedAt: Date.now(),
      })),
    };

    const runner = new AutonomyRunner(
      {
        enabled: true,
        dryRun: false,
        tickIntervalMs: 1000,
        maxQueueSize: 10,
        maxTaskHistory: 50,
        objectiveMaxLength: 500,
      },
      { meishiGate: gate, executor }
    );

    await runner.start();
    const task = await runner.enqueue({ source: 'x', objective: 'post a reply' });
    await runner.runNext();

    const updated = runner.getTask(task.id);
    expect(updated?.status).toBe('completed');
    expect(executor.dispatch).toHaveBeenCalledTimes(1);
    runner.stop();
  });

  it('can run a specific queued task out of order', async () => {
    const gate = {
      evaluate: vi.fn(async (): Promise<MeishiDecision> => ({
        allowed: true,
        reason: 'ok',
      })),
    };
    const executor = {
      dispatch: vi.fn(async (taskId: unknown): Promise<OpenClawDispatchReceipt> => ({
        accepted: true,
        statusCode: 202,
        sessionKey: `kyoshin:x:${String((taskId as { id?: string } | null)?.id ?? 'unknown')}`,
        dispatchedAt: Date.now(),
      })),
    };

    const runner = new AutonomyRunner(
      {
        enabled: true,
        dryRun: false,
        tickIntervalMs: 1000,
        maxQueueSize: 10,
        maxTaskHistory: 50,
        objectiveMaxLength: 500,
      },
      { meishiGate: gate, executor }
    );

    await runner.start();
    const t1 = await runner.enqueue({ source: 'api', objective: 'first' });
    const t2 = await runner.enqueue({ source: 'x', objective: 'second' });

    const ran = await runner.runTask(t2.id);
    expect(ran?.id).toBe(t2.id);
    expect(runner.getTask(t2.id)?.status).toBe('completed');
    expect(runner.getTask(t1.id)?.status).toBe('queued');
    runner.stop();
  });

  it('deduplicates tasks by idempotencyKey', async () => {
    const gate = {
      evaluate: vi.fn(async (): Promise<MeishiDecision> => ({
        allowed: true,
        reason: 'ok',
      })),
    };
    const executor = {
      dispatch: vi.fn(async (): Promise<OpenClawDispatchReceipt> => ({
        accepted: true,
        statusCode: 202,
        sessionKey: 'kyoshin:x:abc',
        dispatchedAt: Date.now(),
      })),
    };

    const runner = new AutonomyRunner(
      {
        enabled: true,
        dryRun: false,
        tickIntervalMs: 1000,
        maxQueueSize: 10,
        maxTaskHistory: 50,
        objectiveMaxLength: 500,
      },
      { meishiGate: gate, executor }
    );

    await runner.start();
    const first = await runner.enqueue({ source: 'x', objective: 'do it', idempotencyKey: 'mention:123' });
    expect(runner.getStatus().queueSize).toBe(1);

    const second = await runner.enqueue({ source: 'x', objective: 'do it again', idempotencyKey: 'mention:123' });
    expect(second.id).toBe(first.id);
    expect(runner.getStatus().queueSize).toBe(1);
    runner.stop();
  });

  it('returns the idempotent task even when the queue is full', async () => {
    const gate = {
      evaluate: vi.fn(async (): Promise<MeishiDecision> => ({
        allowed: true,
        reason: 'ok',
      })),
    };
    const executor = {
      dispatch: vi.fn(async (): Promise<OpenClawDispatchReceipt> => ({
        accepted: true,
        statusCode: 202,
        sessionKey: 'kyoshin:x:abc',
        dispatchedAt: Date.now(),
      })),
    };

    const runner = new AutonomyRunner(
      {
        enabled: true,
        dryRun: false,
        tickIntervalMs: 1000,
        maxQueueSize: 1,
        maxTaskHistory: 50,
        objectiveMaxLength: 500,
      },
      { meishiGate: gate, executor }
    );

    await runner.start();
    const first = await runner.enqueue({ source: 'x', objective: 'do it', idempotencyKey: 'mention:123' });

    const second = await runner.enqueue({ source: 'x', objective: 'do it again', idempotencyKey: 'mention:123' });
    expect(second.id).toBe(first.id);
    expect(runner.getStatus().queueSize).toBe(1);
    runner.stop();
  });

  it('prunes terminal tasks beyond maxTaskHistory', async () => {
    const gate = {
      evaluate: vi.fn(async (): Promise<MeishiDecision> => ({
        allowed: true,
        reason: 'ok',
      })),
    };
    const executor = {
      dispatch: vi.fn(async (): Promise<OpenClawDispatchReceipt> => {
        throw new Error('should_not_run');
      }),
    };

    const runner = new AutonomyRunner(
      {
        enabled: true,
        dryRun: true,
        tickIntervalMs: 1000,
        maxQueueSize: 10,
        maxTaskHistory: 3,
        objectiveMaxLength: 500,
      },
      { meishiGate: gate, executor }
    );

    await runner.start();

    const tasks = [
      await runner.enqueue({ source: 'api', objective: 't1' }),
      await runner.enqueue({ source: 'api', objective: 't2' }),
      await runner.enqueue({ source: 'api', objective: 't3' }),
      await runner.enqueue({ source: 'api', objective: 't4' }),
      await runner.enqueue({ source: 'api', objective: 't5' }),
    ];

    for (let i = 0; i < tasks.length; i++) {
      await runner.runNext();
    }

    expect(runner.listTasks(200)).toHaveLength(3);
    expect(runner.getTask(tasks[0].id)).toBeNull();
    expect(executor.dispatch).not.toHaveBeenCalled();
    runner.stop();
  });
});
