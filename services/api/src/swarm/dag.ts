export type DagNode<T> = {
  id: string;
  dependsOn: string[];
  data: T;
};

export type DagNodeStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';

export type DagRunNodeResult<Out> = {
  status: DagNodeStatus;
  startedAtMs?: number;
  completedAtMs?: number;
  output?: Out;
  error?: string;
};

export type DagRunResult<Out> = {
  status: 'completed' | 'failed';
  startedAtMs: number;
  completedAtMs: number;
  nodes: Record<string, DagRunNodeResult<Out>>;
};

export type DagValidationOk = { ok: true; order: string[] };
export type DagValidationErr = { ok: false; error: string };

export function validateDag(nodes: Array<{ id: string; dependsOn: string[] }>): DagValidationOk | DagValidationErr {
  const byId = new Map<string, { id: string; dependsOn: string[] }>();
  for (const n of nodes) {
    const id = (n.id || '').trim();
    if (!id) return { ok: false, error: 'node id is required' };
    if (byId.has(id)) return { ok: false, error: `duplicate node id: ${id}` };
    byId.set(id, { id, dependsOn: Array.from(new Set(n.dependsOn ?? [])) });
  }

  for (const n of byId.values()) {
    for (const dep of n.dependsOn) {
      if (dep === n.id) return { ok: false, error: `node ${n.id} depends on itself` };
      if (!byId.has(dep)) return { ok: false, error: `node ${n.id} depends on missing node: ${dep}` };
    }
  }

  const indegree = new Map<string, number>();
  const dependents = new Map<string, string[]>();
  for (const id of byId.keys()) indegree.set(id, 0);

  for (const n of byId.values()) {
    for (const dep of n.dependsOn) {
      indegree.set(n.id, (indegree.get(n.id) ?? 0) + 1);
      const arr = dependents.get(dep) ?? [];
      arr.push(n.id);
      dependents.set(dep, arr);
    }
  }

  const queue: string[] = [];
  for (const [id, d] of indegree) {
    if (d === 0) queue.push(id);
  }

  const order: string[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    order.push(id);
    for (const child of dependents.get(id) ?? []) {
      const next = (indegree.get(child) ?? 0) - 1;
      indegree.set(child, next);
      if (next === 0) queue.push(child);
    }
  }

  if (order.length !== byId.size) {
    return { ok: false, error: 'dag contains a cycle' };
  }

  return { ok: true, order };
}

type RunNodeResult<Out> = { status: 'completed'; output?: Out } | { status: 'failed'; error: string };

export async function runDag<T, Out>(
  nodes: Array<DagNode<T>>,
  options: {
    maxParallel: number;
    failFast: boolean;
    runNode: (node: DagNode<T>, deps: Array<{ id: string; result: DagRunNodeResult<Out> }>) => Promise<RunNodeResult<Out>>;
  }
): Promise<DagRunResult<Out>> {
  const startedAtMs = Date.now();

  const byId = new Map<string, DagNode<T>>();
  for (const n of nodes) {
    byId.set(n.id, n);
  }

  const validation = validateDag(nodes.map((n) => ({ id: n.id, dependsOn: n.dependsOn })));
  if (!validation.ok) {
    const completedAtMs = Date.now();
    return {
      status: 'failed',
      startedAtMs,
      completedAtMs,
      nodes: Object.fromEntries(nodes.map((n) => [n.id, { status: 'failed', error: validation.error }])),
    };
  }

  const dependents = new Map<string, string[]>();
  const remainingDeps = new Map<string, number>();

  for (const n of nodes) {
    remainingDeps.set(n.id, n.dependsOn.length);
    for (const dep of n.dependsOn) {
      const arr = dependents.get(dep) ?? [];
      arr.push(n.id);
      dependents.set(dep, arr);
    }
  }

  const results: Record<string, DagRunNodeResult<Out>> = {};
  for (const n of nodes) results[n.id] = { status: 'pending' };

  const ready: string[] = [];
  for (const n of nodes) {
    if (n.dependsOn.length === 0) ready.push(n.id);
  }

  const inFlight = new Map<string, Promise<{ nodeId: string; result: RunNodeResult<Out> }>>();
  let abortScheduling = false;
  let anyFailed = false;

  const startNode = (nodeId: string) => {
    const node = byId.get(nodeId);
    if (!node) return;
    const now = Date.now();
    results[nodeId] = { status: 'running', startedAtMs: now };

    const deps = node.dependsOn.map((id) => ({ id, result: results[id] }));

    const p = options
      .runNode(node, deps)
      .then((r) => ({ nodeId, result: r }))
      .catch((err: unknown) => ({
        nodeId,
        result: { status: 'failed' as const, error: err instanceof Error ? err.message : 'node execution failed' },
      }));

    inFlight.set(nodeId, p);
  };

  const finalizePending = (status: DagNodeStatus, error?: string) => {
    const now = Date.now();
    for (const nodeId of Object.keys(results)) {
      if (results[nodeId].status !== 'pending') continue;
      results[nodeId] = {
        status,
        error,
        startedAtMs: now,
        completedAtMs: now,
      };
    }
  };

  while (true) {
    while (!abortScheduling && inFlight.size < options.maxParallel && ready.length) {
      startNode(ready.shift()!);
    }

    if (inFlight.size === 0) break;

    const finished = await Promise.race(Array.from(inFlight.values()));
    inFlight.delete(finished.nodeId);

    const doneAt = Date.now();
    if (finished.result.status === 'completed') {
      results[finished.nodeId] = {
        status: 'completed',
        startedAtMs: results[finished.nodeId].startedAtMs,
        completedAtMs: doneAt,
        output: finished.result.output,
      };
    } else {
      anyFailed = true;
      results[finished.nodeId] = {
        status: 'failed',
        startedAtMs: results[finished.nodeId].startedAtMs,
        completedAtMs: doneAt,
        error: finished.result.error,
      };

      if (options.failFast) {
        abortScheduling = true;
      }
    }

    const terminalQueue: string[] = [finished.nodeId];
    while (terminalQueue.length) {
      const terminalId = terminalQueue.shift()!;
      for (const childId of dependents.get(terminalId) ?? []) {
        const remaining = (remainingDeps.get(childId) ?? 0) - 1;
        remainingDeps.set(childId, remaining);
        if (remaining !== 0) continue;

        if (abortScheduling) continue;

        const child = byId.get(childId);
        if (!child) continue;

        const depsOk = child.dependsOn.every((depId) => results[depId]?.status === 'completed');
        if (!depsOk) {
          if (results[childId]?.status === 'pending') {
            results[childId] = {
              status: 'skipped',
              startedAtMs: doneAt,
              completedAtMs: doneAt,
              error: 'skipped: dependency failed',
            };
            terminalQueue.push(childId);
          }
          continue;
        }

        ready.push(childId);
      }
    }
  }

  if (abortScheduling) {
    finalizePending('skipped', 'skipped: fail-fast');
  }

  const completedAtMs = Date.now();
  return {
    status: anyFailed ? 'failed' : 'completed',
    startedAtMs,
    completedAtMs,
    nodes: results,
  };
}
