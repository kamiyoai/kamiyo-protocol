import { describe, expect, it } from 'vitest';
import { Channel } from '../channel';
import { DelegationManager } from '../delegation';
import { Orchestrator } from '../orchestrator';

describe('Channel', () => {
  it('sends messages to subscribers', async () => {
    const ch = new Channel('test');
    const received: unknown[] = [];

    ch.subscribe('agent-b', msg => {
      received.push(msg.payload);
    });
    await ch.send('agent-a', 'agent-b', 'greeting', 'hello');

    expect(received).toEqual(['hello']);
  });

  it('broadcasts to all except sender', async () => {
    const ch = new Channel('test');
    const receivedA: string[] = [];
    const receivedB: string[] = [];

    ch.subscribe('agent-a', msg => {
      receivedA.push(msg.payload as string);
    });
    ch.subscribe('agent-b', msg => {
      receivedB.push(msg.payload as string);
    });

    await ch.broadcast('agent-a', 'announce', 'news');

    expect(receivedA).toEqual([]);
    expect(receivedB).toEqual(['news']);
  });

  it('tracks message history', async () => {
    const ch = new Channel('test');
    ch.subscribe('b', () => {});
    await ch.send('a', 'b', 'topic1', 'msg1');
    await ch.send('a', 'b', 'topic2', 'msg2');

    const history = ch.getHistory();
    expect(history).toHaveLength(2);

    const filtered = ch.getHistory({ topic: 'topic1' });
    expect(filtered).toHaveLength(1);
  });

  it('unsubscribe stops delivery', async () => {
    const ch = new Channel('test');
    const received: string[] = [];

    const unsub = ch.subscribe('b', msg => {
      received.push(msg.payload as string);
    });
    await ch.send('a', 'b', 't', 'first');
    unsub();
    await ch.send('a', 'b', 't', 'second');

    expect(received).toEqual(['first']);
  });

  it('limits history size', async () => {
    const ch = new Channel('test', { maxHistory: 3 });
    ch.subscribe('b', () => {});
    for (let i = 0; i < 10; i++) await ch.send('a', 'b', 't', i);

    expect(ch.getHistory().length).toBeLessThanOrEqual(3);
  });

  it('handler error does not break send', async () => {
    const ch = new Channel('test');
    const received: string[] = [];

    ch.subscribe('b', () => {
      throw new Error('handler crash');
    });
    ch.subscribe('b', msg => {
      received.push(msg.payload as string);
    });

    const msg = await ch.send('a', 'b', 't', 'payload');
    expect(msg.id).toBeTruthy();
    // second handler still gets called despite first throwing
    expect(received).toEqual(['payload']);
  });

  it('unsubscribe during iteration is safe', async () => {
    const ch = new Channel('test');
    let unsub: (() => void) | null = null;
    const received: string[] = [];

    unsub = ch.subscribe('b', () => {
      unsub?.();
    });
    ch.subscribe('b', msg => {
      received.push(msg.payload as string);
    });

    await ch.send('a', 'b', 't', 'test');
    expect(received).toEqual(['test']);
  });
});

describe('DelegationManager', () => {
  it('delegates task to registered worker', async () => {
    const dm = new DelegationManager();
    dm.registerWorker('worker-1', async d => ({ result: `done: ${d.task}` }));

    const result = await dm.delegate('boss', 'worker-1', 'analyze data');
    expect(result.state).toBe('completed');
    expect(result.result).toBe('done: analyze data');
  });

  it('records failure from worker error', async () => {
    const dm = new DelegationManager();
    dm.registerWorker('worker-1', async () => {
      throw new Error('crash');
    });

    const result = await dm.delegate('boss', 'worker-1', 'risky task');
    expect(result.state).toBe('failed');
    expect(result.error).toBe('crash');
  });

  it('records failure from returned error', async () => {
    const dm = new DelegationManager();
    dm.registerWorker('worker-1', async () => ({ error: 'nope' }));

    const result = await dm.delegate('boss', 'worker-1', 'task');
    expect(result.state).toBe('failed');
    expect(result.error).toBe('nope');
  });

  it('throws for unregistered worker', async () => {
    const dm = new DelegationManager();
    await expect(dm.delegate('boss', 'ghost', 'task')).rejects.toThrow('No worker registered');
  });

  it('lists delegations with filters', async () => {
    const dm = new DelegationManager();
    dm.registerWorker('w1', async () => ({ result: 'ok' }));
    dm.registerWorker('w2', async () => ({ result: 'ok' }));

    await dm.delegate('boss', 'w1', 'task-a');
    await dm.delegate('boss', 'w2', 'task-b');

    expect(dm.listDelegations({ to: 'w1' })).toHaveLength(1);
    expect(dm.listDelegations({ state: 'completed' })).toHaveLength(2);
  });

  it('unregister removes worker', () => {
    const dm = new DelegationManager();
    dm.registerWorker('w1', async () => ({ result: 'ok' }));
    expect(dm.workers).toContain('w1');
    dm.unregisterWorker('w1');
    expect(dm.workers).not.toContain('w1');
  });

  it('throws on empty task', async () => {
    const dm = new DelegationManager();
    dm.registerWorker('w1', async () => ({ result: 'ok' }));
    await expect(dm.delegate('boss', 'w1', '')).rejects.toThrow('task required');
  });

  it('prunes old completed delegations', async () => {
    const dm = new DelegationManager();
    dm.registerWorker('w1', async () => ({ result: 'ok' }));

    await dm.delegate('boss', 'w1', 'old task');
    expect(dm.listDelegations()).toHaveLength(1);

    // prune with 0ms maxAge removes all completed
    const pruned = dm.prune(0);
    expect(pruned).toBe(1);
    expect(dm.listDelegations()).toHaveLength(0);
  });

  it('delegation starts in in_progress state', async () => {
    const dm = new DelegationManager();
    let capturedState: string | undefined;
    dm.registerWorker('w1', async d => {
      capturedState = d.state;
      return { result: 'ok' };
    });
    await dm.delegate('boss', 'w1', 'task');
    expect(capturedState).toBe('in_progress');
  });
});

describe('Orchestrator', () => {
  it('assigns tasks round-robin', async () => {
    const ch = new Channel('ops');
    const dm = new DelegationManager();
    dm.registerWorker('w1', async d => ({ result: `w1:${d.task}` }));
    dm.registerWorker('w2', async d => ({ result: `w2:${d.task}` }));

    const orch = new Orchestrator({ id: 'boss', workers: ['w1', 'w2'] }, ch, dm);

    const r1 = await orch.assignTask('task-1');
    const r2 = await orch.assignTask('task-2');

    expect(r1.worker).toBe('w1');
    expect(r2.worker).toBe('w2');
    expect(r1.result).toBe('w1:task-1');
  });

  it('fan-out sends to all workers', async () => {
    const ch = new Channel('ops');
    const dm = new DelegationManager();
    dm.registerWorker('w1', async () => ({ result: 'a' }));
    dm.registerWorker('w2', async () => ({ result: 'b' }));

    const orch = new Orchestrator({ id: 'boss', workers: ['w1', 'w2'] }, ch, dm);

    const results = await orch.fanOut('analyze');
    expect(results).toHaveLength(2);
    expect(results.map(r => r.result).sort()).toEqual(['a', 'b']);
  });

  it('broadcasts via channel', async () => {
    const ch = new Channel('ops');
    const dm = new DelegationManager();
    const received: string[] = [];

    ch.subscribe('w1', msg => {
      received.push(msg.topic);
    });

    const orch = new Orchestrator({ id: 'boss', workers: ['w1'] }, ch, dm);

    await orch.broadcast('status', 'all clear');
    expect(received).toContain('status');
  });

  it('custom routing strategy', async () => {
    const ch = new Channel('ops');
    const dm = new DelegationManager();
    dm.registerWorker('specialist', async () => ({ result: 'done' }));

    const orch = new Orchestrator(
      {
        id: 'boss',
        workers: ['specialist'],
        routingStrategy: 'custom',
        customRouter: () => 'specialist',
      },
      ch,
      dm
    );

    const result = await orch.assignTask('specific task');
    expect(result.worker).toBe('specialist');
  });

  it('throws when no workers available', async () => {
    const ch = new Channel('ops');
    const dm = new DelegationManager();

    const orch = new Orchestrator({ id: 'boss', workers: ['w1'] }, ch, dm);

    await expect(orch.assignTask('task')).rejects.toThrow('No available workers');
  });
});
