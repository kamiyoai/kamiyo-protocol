import { describe, it, expect } from 'vitest';
import { runDag, validateDag, type DagNode } from '../swarm/dag';

describe('swarm dag', () => {
  it('validateDag detects cycles', () => {
    const ok = validateDag([
      { id: 'a', dependsOn: [] },
      { id: 'b', dependsOn: ['a'] },
    ]);
    expect(ok.ok).toBe(true);

    const cycle = validateDag([
      { id: 'a', dependsOn: ['b'] },
      { id: 'b', dependsOn: ['a'] },
    ]);
    expect(cycle.ok).toBe(false);
  });

  it('runDag enforces maxParallel', async () => {
    const nodes: Array<DagNode<{ ms: number }>> = Array.from({ length: 6 }, (_, i) => ({
      id: `n${i + 1}`,
      dependsOn: [],
      data: { ms: 25 },
    }));

    let active = 0;
    let maxActive = 0;

    const result = await runDag(nodes, {
      maxParallel: 2,
      failFast: false,
      runNode: async (n) => {
        active++;
        maxActive = Math.max(maxActive, active);
        await new Promise((r) => setTimeout(r, n.data.ms));
        active--;
        return { status: 'completed' as const, output: n.id };
      },
    });

    expect(result.status).toBe('completed');
    expect(maxActive).toBeLessThanOrEqual(2);
  });

  it('runDag propagates dependency-failure skips', async () => {
    const nodes: Array<DagNode<{}>> = [
      { id: 'a', dependsOn: [], data: {} },
      { id: 'b', dependsOn: ['a'], data: {} },
      { id: 'c', dependsOn: ['b'], data: {} },
    ];

    const result = await runDag(nodes, {
      maxParallel: 3,
      failFast: false,
      runNode: async (n) => {
        if (n.id === 'a') return { status: 'failed' as const, error: 'boom' };
        return { status: 'completed' as const };
      },
    });

    expect(result.status).toBe('failed');
    expect(result.nodes.a.status).toBe('failed');
    expect(result.nodes.b.status).toBe('skipped');
    expect(result.nodes.c.status).toBe('skipped');
  });

  it('runDag marks pending nodes skipped on failFast', async () => {
    const nodes: Array<DagNode<{}>> = [
      { id: 'a', dependsOn: [], data: {} },
      { id: 'b', dependsOn: [], data: {} },
      { id: 'c', dependsOn: ['a'], data: {} },
    ];

    const result = await runDag(nodes, {
      maxParallel: 2,
      failFast: true,
      runNode: async (n) => {
        if (n.id === 'b') return { status: 'failed' as const, error: 'nope' };
        await new Promise((r) => setTimeout(r, 20));
        return { status: 'completed' as const };
      },
    });

    expect(result.status).toBe('failed');
    expect(result.nodes.b.status).toBe('failed');
    expect(result.nodes.c.status).toBe('skipped');
  });
});

