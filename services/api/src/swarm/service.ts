import { createHash, randomUUID } from 'crypto';
import db from '../db';
import {
  createTaskExecutor,
  hasTaskExecutorProviders,
  TASK_EXECUTOR_UNAVAILABLE_REASON,
} from '../task-executor';
import { runDag } from './dag';
import { publishKirokuDrop } from '../kiroku';
import { emitFairscaleFusionEvent } from '../fairscale-fusion-emitter';
import {
  acquireSwarmNodeSlot,
  clampMaxParallel,
  getSwarmGlobalActiveNodes,
  swarmRuntimeConfig,
} from './runtime';
import { reserveTeamBudget, settleTeamBudget } from './pool';
import {
  swarmActiveNodes,
  swarmNodeDuration,
  swarmNodesTotal,
  swarmRunDuration,
  swarmRunsTotal,
} from '../metrics';
import type { SwarmDagPlan, SwarmTeamMember } from './types';
import { recordAgentPerformance } from '../agent-performance';
import { scheduleGradeSwarmRun } from '../agent-grader';
import { logger } from '../logger';

const taskExecutorConfig = {
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  openaiApiKey: process.env.OPENAI_API_KEY,
  openclawApiKey: process.env.OPENCLAW_API_KEY,
  openclawBaseUrl: process.env.OPENCLAW_BASE_URL,
  nanoclawApiKey: process.env.NANOCLAW_API_KEY,
  nanoclawBaseUrl: process.env.NANOCLAW_BASE_URL,
  ironclawApiKey: process.env.IRONCLAW_API_KEY,
  ironclawBaseUrl: process.env.IRONCLAW_BASE_URL,
};

const taskExecutor = hasTaskExecutorProviders(taskExecutorConfig)
  ? createTaskExecutor(taskExecutorConfig)
  : undefined;
let taskExecutorOverride: ReturnType<typeof createTaskExecutor> | null = null;

const CANCEL_TTL_MS = 24 * 60 * 60 * 1000;
const cancelledRuns = new Map<string, { reason: string; atMs: number }>();

export type SwarmExecutionMode = 'execute' | 'readonly';

export type SeededNode = {
  nodeId: string;
  fromRunId: string;
  output: unknown;
};

export type SwarmRunNodeView = {
  id: string;
  memberId: string;
  agentId: string;
  dependsOn: string[];
  description: string;
  budgetReserved: number;
  amountDrawn: number;
  reuseKey: string | null;
  status: string;
  output: unknown;
  error: string | null;
  startedAt: number | null;
  completedAt: number | null;
};

export type SwarmRunDetail = {
  runId: string;
  id: string;
  teamId: string;
  mission: string;
  status: string;
  executionMode: SwarmExecutionMode;
  snapshotHash: string | null;
  counterfactualCaseId: string | null;
  counterfactualBranchId: string | null;
  plan: SwarmDagPlan;
  totals: { reserved: number; spent: number };
  error: string | null;
  kiroku: { receipt: string | null; url: string | null; error: string | null };
  startedAt: number;
  completedAt: number | null;
  nodes: SwarmRunNodeView[];
};

export type SwarmRunProgress = {
  runId: string;
  teamId: string;
  mission: string;
  status: string;
  executionMode: SwarmExecutionMode;
  snapshotHash: string | null;
  counterfactualCaseId: string | null;
  counterfactualBranchId: string | null;
  totals: { reserved: number; spent: number };
  error: string | null;
  kiroku: { receipt: string | null; url: string | null; error: string | null };
  startedAt: number;
  completedAt: number | null;
  nodes: Array<{
    id: string;
    status: string;
    error: string | null;
    startedAt: number | null;
    completedAt: number | null;
  }>;
};

export type ExecuteSwarmRunOptions = {
  teamId: string;
  wallet: string | null;
  mission: string;
  plan: SwarmDagPlan;
  members: SwarmTeamMember[];
  maxParallel: number;
  failFast: boolean;
  idempotencyKey: string | null;
  seededNodes?: SeededNode[];
  reuseKeys?: Record<string, string | undefined>;
  executionMode?: SwarmExecutionMode;
  caseId?: string | null;
  branchId?: string | null;
  snapshotHash?: string | null;
  allowedTools?: string[];
  resolveExecutionContext?: (params: {
    runId: string;
    node: SwarmDagPlan['nodes'][number];
    deps: Array<{ id: string; result: { status: string; output?: unknown; error?: string } }>;
    executionMode: SwarmExecutionMode;
    snapshotHash: string | null;
    caseId: string | null;
    branchId: string | null;
  }) => Promise<{
    reuseKey?: string | null;
    reused?: {
      fromRunId: string;
      output: unknown;
    };
  } | null>;
  onNodeReused?: (params: {
    runId: string;
    nodeId: string;
    fromRunId: string;
    reuseKey: string | null;
  }) => Promise<void> | void;
};

export type ExecuteSwarmRunResult = {
  runId: string;
  status: string;
  executionMode: SwarmExecutionMode;
  mission: string;
  plan: SwarmDagPlan;
  timingMs: { startedAt: number; completedAt: number; duration: number };
  totals: { reserved: number; spent: number };
  hashes: { planSha256: string; resultsSha256: string };
  kiroku: { receipt: string; url: string } | { skipped: boolean; error?: string };
  nodes: Record<string, unknown>;
  seeded: number;
  snapshotHash: string | null;
  counterfactualCaseId: string | null;
  counterfactualBranchId: string | null;
};

export function __setSwarmTaskExecutorForTests(
  executor: ReturnType<typeof createTaskExecutor> | null
): void {
  taskExecutorOverride = executor;
}

function resolveTaskExecutor() {
  return taskExecutorOverride ?? taskExecutor;
}

function getCancelReason(runId: string): string | null {
  const now = Date.now();
  for (const [id, entry] of cancelledRuns) {
    if (entry.atMs + CANCEL_TTL_MS < now) cancelledRuns.delete(id);
  }
  return cancelledRuns.get(runId)?.reason ?? null;
}

function markRunCancelled(runId: string, reason: string) {
  cancelledRuns.set(runId, { reason, atMs: Date.now() });
}

function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

function canonicalize(value: unknown): string {
  const sort = (entry: unknown): unknown => {
    if (Array.isArray(entry)) return entry.map(sort);
    if (!entry || typeof entry !== 'object') return entry;

    const out: Record<string, unknown> = {};
    for (const key of Object.keys(entry as Record<string, unknown>).sort()) {
      out[key] = sort((entry as Record<string, unknown>)[key]);
    }
    return out;
  };

  return JSON.stringify(sort(value));
}

function formatDepsContext(
  deps: Array<{ id: string; result: { status: string; output?: unknown; error?: string } }>
): string {
  const compact = deps.map(dep => ({
    id: dep.id,
    status: dep.result.status,
    error: dep.result.status !== 'completed' ? dep.result.error : undefined,
    output: dep.result.status === 'completed' ? dep.result.output : undefined,
  }));

  const text = JSON.stringify(compact, null, 2);
  if (text.length <= 12_000) return text;
  return `${text.slice(0, 11_997)}...`;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return promise;

  let timeoutId: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

export function getTeamMembers(teamId: string): SwarmTeamMember[] {
  const rows = db
    .prepare(
      `
    SELECT id, agent_id, role, draw_limit
    FROM swarm_team_members
    WHERE team_id = ?
    ORDER BY added_at ASC
  `
    )
    .all(teamId) as Array<{ id: string; agent_id: string; role: string; draw_limit: number }>;

  return rows.map(row => ({
    id: row.id,
    agentId: row.agent_id,
    role: row.role,
    drawLimit: row.draw_limit,
  }));
}

export function findExistingRunByIdempotency(
  teamId: string,
  idempotencyKey: string
): string | null {
  const existing = db
    .prepare(
      `
    SELECT id
    FROM swarm_runs
    WHERE team_id = ? AND idempotency_key = ?
    LIMIT 1
  `
    )
    .get(teamId, idempotencyKey) as { id: string } | undefined;

  return existing?.id ?? null;
}

export function getSwarmRunDetail(teamId: string, runId: string): SwarmRunDetail | null {
  const run = db
    .prepare(
      `
    SELECT *
    FROM swarm_runs
    WHERE id = ? AND team_id = ?
  `
    )
    .get(runId, teamId) as any;

  if (!run) return null;

  const nodes = db
    .prepare(
      `
    SELECT node_id, member_id, agent_id, depends_on_json, description, budget_reserved, amount_drawn, reuse_key, status, output_json, error, started_at, completed_at
    FROM swarm_run_nodes
    WHERE run_id = ?
    ORDER BY created_at ASC
  `
    )
    .all(runId) as Array<any>;

  return {
    runId: run.id,
    id: run.id,
    teamId: run.team_id,
    mission: run.mission,
    status: run.status,
    executionMode: (run.execution_mode ?? 'execute') as SwarmExecutionMode,
    snapshotHash: run.snapshot_hash ?? null,
    counterfactualCaseId: run.counterfactual_case_id ?? null,
    counterfactualBranchId: run.counterfactual_branch_id ?? null,
    plan: JSON.parse(run.plan_json),
    totals: { reserved: run.total_reserved, spent: run.total_spent },
    error: run.error,
    kiroku: { receipt: run.kiroku_receipt, url: run.kiroku_url, error: run.kiroku_error },
    startedAt: run.started_at * 1000,
    completedAt: run.completed_at ? run.completed_at * 1000 : null,
    nodes: nodes.map(node => ({
      id: node.node_id,
      memberId: node.member_id,
      agentId: node.agent_id,
      dependsOn: JSON.parse(node.depends_on_json),
      description: node.description,
      budgetReserved: node.budget_reserved,
      amountDrawn: node.amount_drawn,
      reuseKey: node.reuse_key ?? null,
      status: node.status,
      output: node.output_json ? JSON.parse(node.output_json) : null,
      error: node.error,
      startedAt: node.started_at ? node.started_at * 1000 : null,
      completedAt: node.completed_at ? node.completed_at * 1000 : null,
    })),
  };
}

export function getSwarmRunProgress(teamId: string, runId: string): SwarmRunProgress | null {
  const run = db
    .prepare(
      `
    SELECT id, team_id, mission, status, execution_mode, snapshot_hash, counterfactual_case_id, counterfactual_branch_id, total_reserved, total_spent, error, kiroku_receipt, kiroku_url, kiroku_error, started_at, completed_at
    FROM swarm_runs
    WHERE id = ? AND team_id = ?
  `
    )
    .get(runId, teamId) as any;

  if (!run) return null;

  const nodes = db
    .prepare(
      `
    SELECT node_id, status, error, started_at, completed_at
    FROM swarm_run_nodes
    WHERE run_id = ?
    ORDER BY created_at ASC
  `
    )
    .all(runId) as Array<any>;

  return {
    runId: run.id,
    teamId: run.team_id,
    mission: run.mission,
    status: run.status,
    executionMode: (run.execution_mode ?? 'execute') as SwarmExecutionMode,
    snapshotHash: run.snapshot_hash ?? null,
    counterfactualCaseId: run.counterfactual_case_id ?? null,
    counterfactualBranchId: run.counterfactual_branch_id ?? null,
    totals: { reserved: run.total_reserved, spent: run.total_spent },
    error: run.error,
    kiroku: { receipt: run.kiroku_receipt, url: run.kiroku_url, error: run.kiroku_error },
    startedAt: run.started_at * 1000,
    completedAt: run.completed_at ? run.completed_at * 1000 : null,
    nodes: nodes.map(node => ({
      id: node.node_id,
      status: node.status,
      error: node.error,
      startedAt: node.started_at ? node.started_at * 1000 : null,
      completedAt: node.completed_at ? node.completed_at * 1000 : null,
    })),
  };
}

export function listSwarmRuns(teamId: string, limit: number, offset: number) {
  const rows = db
    .prepare(
      `
    SELECT id, mission, status, execution_mode, snapshot_hash, counterfactual_case_id, counterfactual_branch_id, total_reserved, total_spent, error, kiroku_url, started_at, completed_at
    FROM swarm_runs
    WHERE team_id = ?
    ORDER BY started_at DESC
    LIMIT ? OFFSET ?
  `
    )
    .all(teamId, limit, offset) as Array<{
    id: string;
    mission: string;
    status: string;
    execution_mode: SwarmExecutionMode;
    snapshot_hash: string | null;
    counterfactual_case_id: string | null;
    counterfactual_branch_id: string | null;
    total_reserved: number;
    total_spent: number;
    error: string | null;
    kiroku_url: string | null;
    started_at: number;
    completed_at: number | null;
  }>;

  return rows.map(row => ({
    runId: row.id,
    id: row.id,
    mission: row.mission,
    status: row.status,
    executionMode: row.execution_mode ?? 'execute',
    snapshotHash: row.snapshot_hash ?? null,
    counterfactualCaseId: row.counterfactual_case_id ?? null,
    counterfactualBranchId: row.counterfactual_branch_id ?? null,
    totals: { reserved: row.total_reserved, spent: row.total_spent },
    error: row.error,
    kirokuUrl: row.kiroku_url,
    startedAt: row.started_at * 1000,
    completedAt: row.completed_at ? row.completed_at * 1000 : null,
  }));
}

export function cancelSwarmRun(
  teamId: string,
  runId: string
): { ok: true } | { ok: false; error: string } {
  const run = db
    .prepare(
      `
    SELECT id, status
    FROM swarm_runs
    WHERE id = ? AND team_id = ?
  `
    )
    .get(runId, teamId) as { id: string; status: string } | undefined;

  if (!run) return { ok: false, error: 'Run not found' };

  markRunCancelled(runId, 'cancelled');

  db.prepare(
    `
    UPDATE swarm_runs
    SET status = 'cancelled', error = 'cancelled', updated_at = unixepoch()
    WHERE id = ? AND team_id = ? AND status = 'running'
  `
  ).run(runId, teamId);

  db.prepare(
    `
    UPDATE swarm_run_nodes
    SET status = 'skipped', error = 'skipped: cancelled', started_at = COALESCE(started_at, unixepoch()), completed_at = unixepoch(), updated_at = unixepoch()
    WHERE run_id = ? AND status = 'pending'
  `
  ).run(runId);

  return { ok: true };
}

export async function executeSwarmRun(
  options: ExecuteSwarmRunOptions
): Promise<ExecuteSwarmRunResult> {
  const runId = `run_${randomUUID().slice(0, 12)}`;
  const now = Math.floor(Date.now() / 1000);
  const executionMode = options.executionMode ?? 'execute';
  const snapshotHash = options.snapshotHash?.trim() || null;
  const caseId = options.caseId?.trim() || null;
  const branchId = options.branchId?.trim() || null;

  db.prepare(
    `
    INSERT INTO swarm_runs (
      id, team_id, requested_by_wallet, mission, plan_json, status,
      max_parallel, fail_fast, execution_mode, idempotency_key, snapshot_hash,
      counterfactual_case_id, counterfactual_branch_id, started_at, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, 'running', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `
  ).run(
    runId,
    options.teamId,
    options.wallet,
    options.mission,
    JSON.stringify(options.plan),
    options.maxParallel,
    options.failFast ? 1 : 0,
    executionMode,
    options.idempotencyKey,
    snapshotHash,
    caseId,
    branchId,
    now,
    now,
    now
  );

  const insertNode = db.prepare(`
    INSERT INTO swarm_run_nodes (
      id, run_id, node_id, member_id, agent_id,
      depends_on_json, description, budget_reserved, reuse_key,
      status, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)
  `);

  const memberById = new Map(options.members.map(member => [member.id, member]));
  for (const node of options.plan.nodes) {
    const member = memberById.get(node.memberId);
    if (!member) continue;

    insertNode.run(
      `${runId}:${node.id}`,
      runId,
      node.id,
      node.memberId,
      member.agentId,
      JSON.stringify(node.dependsOn),
      node.description,
      node.budget,
      options.reuseKeys?.[node.id] ?? null,
      now,
      now
    );
  }

  const seed = new Map<string, { wrapped: unknown; fromRunId: string }>();
  for (const seededNode of options.seededNodes ?? []) {
    const nodeId = seededNode.nodeId.trim();
    if (!nodeId || seed.has(nodeId)) continue;

    seed.set(nodeId, {
      wrapped: { reused: true, fromRunId: seededNode.fromRunId.trim(), output: seededNode.output },
      fromRunId: seededNode.fromRunId.trim(),
    });
  }

  const initialResults: Record<string, any> = {};
  if (seed.size > 0) {
    const seedNode = db.prepare(`
      UPDATE swarm_run_nodes
      SET status = 'completed', budget_reserved = 0, amount_drawn = 0, output_json = ?, error = NULL,
        started_at = unixepoch(), completed_at = unixepoch(), updated_at = unixepoch()
      WHERE run_id = ? AND node_id = ?
    `);

    const nowMs = Date.now();
    for (const [nodeId, seeded] of seed) {
      seedNode.run(JSON.stringify(seeded.wrapped), runId, nodeId);
      initialResults[nodeId] = {
        status: 'completed',
        startedAtMs: nowMs,
        completedAtMs: nowMs,
        output: {
          taskId: `reused:${seeded.fromRunId || 'unknown'}:${nodeId}`,
          status: 'completed',
          output: seeded.wrapped,
          amountDrawn: 0,
        },
      };
    }
  }

  const updateNodeRunning = db.prepare(`
    UPDATE swarm_run_nodes
    SET status = 'running', started_at = unixepoch(), updated_at = unixepoch()
    WHERE run_id = ? AND node_id = ?
  `);

  const updateNodeReuseKey = db.prepare(`
    UPDATE swarm_run_nodes
    SET reuse_key = ?, updated_at = unixepoch()
    WHERE run_id = ? AND node_id = ?
  `);

  const updateNodeDone = db.prepare(`
    UPDATE swarm_run_nodes
    SET status = ?, amount_drawn = ?, output_json = ?, error = ?, completed_at = unixepoch(), updated_at = unixepoch()
    WHERE run_id = ? AND node_id = ?
  `);

  const updateSkipped = db.prepare(`
    UPDATE swarm_run_nodes
    SET status = 'skipped', error = ?, started_at = COALESCE(started_at, unixepoch()), completed_at = unixepoch(), updated_at = unixepoch()
    WHERE run_id = ? AND node_id = ? AND status = 'pending'
  `);

  let totalReserved = 0;
  let totalSpent = 0;

  const dagNodes = options.plan.nodes.map(node => ({
    id: node.id,
    dependsOn: node.dependsOn,
    data: node,
  }));
  const startedAtMs = Date.now();
  const deadlineAtMs = startedAtMs + swarmRuntimeConfig.runTimeoutMs;

  const dagResult = await runDag(dagNodes, {
    maxParallel: clampMaxParallel(options.maxParallel),
    failFast: options.failFast,
    initialResults,
    shouldAbort: () => {
      const cancelReason = getCancelReason(runId);
      if (cancelReason) return { status: 'cancelled' as const, reason: cancelReason };
      if (Date.now() > deadlineAtMs) return { status: 'failed' as const, reason: 'run timeout' };
      return null;
    },
    runNode: async (node, deps) => {
      const spec = node.data;
      const member = memberById.get(spec.memberId);
      if (!member) {
        updateNodeDone.run('failed', 0, null, 'member not found', runId, spec.id);
        return { status: 'failed' as const, error: 'member not found' };
      }

      const cancelReason = getCancelReason(runId);
      if (cancelReason) {
        updateNodeDone.run('skipped', 0, null, `skipped: ${cancelReason}`, runId, spec.id);
        return { status: 'failed' as const, error: 'cancelled' };
      }

      const executionContext =
        (await options.resolveExecutionContext?.({
          runId,
          node: spec,
          deps: deps.map(dep => ({ id: dep.id, result: dep.result })),
          executionMode,
          snapshotHash,
          caseId,
          branchId,
        })) ?? null;

      if (executionContext?.reuseKey) {
        updateNodeReuseKey.run(executionContext.reuseKey, runId, spec.id);
      }

      if (executionContext?.reused) {
        const wrapped = {
          reused: true,
          fromRunId: executionContext.reused.fromRunId,
          output: executionContext.reused.output,
        };
        updateNodeDone.run('completed', 0, JSON.stringify(wrapped), null, runId, spec.id);
        await options.onNodeReused?.({
          runId,
          nodeId: spec.id,
          fromRunId: executionContext.reused.fromRunId,
          reuseKey: executionContext.reuseKey ?? null,
        });
        swarmNodesTotal.inc({ status: 'completed' });
        swarmNodeDuration.observe({ status: 'completed' }, 0);
        return {
          status: 'completed' as const,
          output: {
            taskId: `reused:${executionContext.reused.fromRunId}:${spec.id}`,
            status: 'completed',
            output: wrapped,
            amountDrawn: 0,
          },
        };
      }

      const releaseSlot = await acquireSwarmNodeSlot(options.teamId);
      swarmActiveNodes.set(getSwarmGlobalActiveNodes());

      const nodeStartedAt = Date.now();
      const purpose = `swarm:${runId}:${spec.id}`;
      let reserved = 0;

      try {
        updateNodeRunning.run(runId, spec.id);

        const activeTaskExecutor = resolveTaskExecutor();
        if (!activeTaskExecutor) {
          updateNodeDone.run('failed', 0, null, TASK_EXECUTOR_UNAVAILABLE_REASON, runId, spec.id);
          return { status: 'failed' as const, error: TASK_EXECUTOR_UNAVAILABLE_REASON };
        }

        const reserve = reserveTeamBudget(options.teamId, spec.budget);
        if (!reserve.ok) {
          updateNodeDone.run('failed', 0, null, reserve.error, runId, spec.id);
          return { status: 'failed' as const, error: reserve.error };
        }

        reserved = reserve.reserved;
        totalReserved += reserved;

        const taskId = `swarm_${runId}_${spec.id}_${randomUUID().slice(0, 6)}`;
        const description = [
          spec.description,
          '',
          'Context (direct dependencies):',
          formatDepsContext(deps.map(dep => ({ id: dep.id, result: dep.result }))),
        ].join('\n');

        const result = await withTimeout(
          activeTaskExecutor({
            taskId,
            description,
            budget: reserved,
            teamId: options.teamId,
            executionMode,
            allowedTools: options.allowedTools,
            metadata: {
              agentId: member.agentId,
              memberId: member.id,
              runId,
              nodeId: spec.id,
              executionMode,
              snapshotHash,
              counterfactualCaseId: caseId,
              counterfactualBranchId: branchId,
            },
          }),
          swarmRuntimeConfig.nodeTimeoutMs,
          'node timeout'
        );

        const amountDrawn = result.status === 'completed' ? (result.amountDrawn ?? 0) : 0;
        const settle = settleTeamBudget({
          teamId: options.teamId,
          agentId: member.agentId,
          reserved,
          amountDrawn,
          purpose,
        });

        if (settle.ok) {
          totalSpent += settle.amountDrawn;
        }

        const outputJson = result.output === undefined ? null : JSON.stringify(result.output);
        if (result.status === 'completed') {
          updateNodeDone.run('completed', amountDrawn, outputJson, null, runId, spec.id);
          swarmNodesTotal.inc({ status: 'completed' });
          swarmNodeDuration.observe({ status: 'completed' }, (Date.now() - nodeStartedAt) / 1000);
          return { status: 'completed' as const, output: result };
        }

        updateNodeDone.run('failed', 0, outputJson, result.error ?? 'task failed', runId, spec.id);
        swarmNodesTotal.inc({ status: 'failed' });
        swarmNodeDuration.observe({ status: 'failed' }, (Date.now() - nodeStartedAt) / 1000);
        return { status: 'failed' as const, error: result.error ?? 'task failed' };
      } catch (error) {
        try {
          settleTeamBudget({
            teamId: options.teamId,
            agentId: member.agentId,
            reserved,
            amountDrawn: 0,
            purpose,
          });
        } catch {
          // Best-effort refund.
        }

        const message = error instanceof Error ? error.message : 'task execution failed';
        updateNodeDone.run('failed', 0, null, message, runId, spec.id);
        swarmNodesTotal.inc({ status: 'failed' });
        swarmNodeDuration.observe({ status: 'failed' }, (Date.now() - nodeStartedAt) / 1000);
        return { status: 'failed' as const, error: message };
      } finally {
        releaseSlot();
        swarmActiveNodes.set(getSwarmGlobalActiveNodes());
      }
    },
  });

  const endedAtMs = Date.now();

  for (const [nodeId, result] of Object.entries(dagResult.nodes)) {
    if (result.status !== 'skipped') continue;
    updateSkipped.run(result.error ?? 'skipped', runId, nodeId);
    swarmNodesTotal.inc({ status: 'skipped' });
  }

  const status =
    dagResult.status === 'cancelled'
      ? 'cancelled'
      : dagResult.status === 'completed'
        ? 'completed'
        : 'failed';
  const runError =
    status === 'failed'
      ? (dagResult.abortReason ?? 'one or more nodes failed')
      : status === 'cancelled'
        ? (dagResult.abortReason ?? 'cancelled')
        : null;

  db.prepare(
    `
    UPDATE swarm_runs
    SET
      status = CASE WHEN status = 'running' THEN ? ELSE status END,
      total_reserved = ?,
      total_spent = ?,
      error = CASE WHEN status = 'running' THEN ? ELSE error END,
      completed_at = ?,
      updated_at = unixepoch()
    WHERE id = ?
  `
  ).run(status, totalReserved, totalSpent, runError, Math.floor(Date.now() / 1000), runId);

  swarmRunsTotal.inc({ status });
  swarmRunDuration.observe({ status }, (endedAtMs - startedAtMs) / 1000);

  const resultSummary = options.plan.nodes.map(node => {
    const result = dagResult.nodes[node.id];
    const outputHash =
      result?.status === 'completed'
        ? sha256Hex(canonicalize((result.output as any)?.output ?? null))
        : null;
    const amount = result?.status === 'completed' ? ((result.output as any)?.amountDrawn ?? 0) : 0;

    return {
      id: node.id,
      status: result?.status ?? 'unknown',
      amountDrawn: amount,
      outputSha256: outputHash,
      error: result?.status !== 'completed' ? (result?.error ?? null) : null,
    };
  });

  const planSha = sha256Hex(canonicalize(options.plan));
  const resultsSha = sha256Hex(canonicalize(resultSummary));

  const kirokuText = [
    `Hive swarm run ${status}`,
    `run: ${runId}`,
    `team: ${options.teamId}`,
    `mode: ${executionMode}`,
    `nodes: ${options.plan.nodes.length}`,
    `spent: ${totalSpent}`,
    `plan_sha256: ${planSha}`,
    `results_sha256: ${resultsSha}`,
  ].join('\n');

  const kiroku = await publishKirokuDrop({
    text: kirokuText,
    idempotencyKey: `hive-swarm:${runId}`,
    evidence: [],
  });

  if (kiroku.ok) {
    db.prepare(
      `
      UPDATE swarm_runs
      SET kiroku_receipt = ?, kiroku_url = ?, kiroku_error = NULL, updated_at = unixepoch()
      WHERE id = ?
    `
    ).run(kiroku.receipt, kiroku.url, runId);
  } else if (!kiroku.skipped) {
    db.prepare(
      `
      UPDATE swarm_runs
      SET kiroku_error = ?, updated_at = unixepoch()
      WHERE id = ?
    `
    ).run(kiroku.error, runId);
  }

  if (executionMode === 'execute') {
    const kirokuReceiptId = kiroku.ok ? kiroku.receipt : null;
    for (const node of options.plan.nodes) {
      const nodeResult = dagResult.nodes[node.id];
      if (!nodeResult) continue;
      const member = memberById.get(node.memberId);
      if (!member) continue;
      const outcome: 'completed' | 'failed' | 'skipped' =
        nodeResult.status === 'completed'
          ? 'completed'
          : nodeResult.status === 'skipped'
            ? 'skipped'
            : 'failed';
      const nodeCost =
        nodeResult.status === 'completed'
          ? ((nodeResult.output as { amountDrawn?: number } | undefined)?.amountDrawn ?? 0)
          : 0;
      const latencyMs =
        nodeResult.startedAtMs && nodeResult.completedAtMs
          ? Math.max(0, nodeResult.completedAtMs - nodeResult.startedAtMs)
          : 0;
      try {
        recordAgentPerformance({
          agentId: member.agentId,
          runId,
          nodeId: node.id,
          taskType: member.role || 'swarm.node',
          cost: nodeCost,
          latencyMs,
          outcome,
          receiptId: kirokuReceiptId,
          metadata: {
            teamId: options.teamId,
            memberId: member.id,
            budget: node.budget,
          },
        });
      } catch (err) {
        logger.warn('recordAgentPerformance failed', {
          err: err instanceof Error ? err.message : String(err),
          runId,
          nodeId: node.id,
        });
      }
    }

    scheduleGradeSwarmRun(runId);

    const completedNodes = options.plan.nodes.filter(
      node => dagResult.nodes[node.id]?.status === 'completed'
    ).length;
    const failedNodes = options.plan.nodes.filter(
      node => dagResult.nodes[node.id]?.status === 'failed'
    ).length;
    const skippedNodes = options.plan.nodes.filter(
      node => dagResult.nodes[node.id]?.status === 'skipped'
    ).length;
    const totalNodes = options.plan.nodes.length;
    const qualityScore =
      totalNodes === 0
        ? status === 'completed'
          ? 100
          : 0
        : Math.round((completedNodes / totalNodes) * 10000) / 100;

    await emitFairscaleFusionEvent({
      wallet: options.wallet || '',
      serviceId: 'hive.swarm.run.v1',
      qualityScore,
      refundPct: 0,
      timestampMs: endedAtMs,
      proofHash: `swarm_run_${runId}_${resultsSha}`,
      metadata: {
        runId,
        teamId: options.teamId,
        status,
        totalNodes,
        completedNodes,
        failedNodes,
        skippedNodes,
        totalReserved,
        totalSpent,
        planSha256: planSha,
        resultsSha256: resultsSha,
        kirokuReceipt: kiroku.ok ? kiroku.receipt : null,
      },
    });
  }

  return {
    runId,
    status,
    executionMode,
    mission: options.mission,
    plan: options.plan,
    timingMs: { startedAt: startedAtMs, completedAt: endedAtMs, duration: endedAtMs - startedAtMs },
    totals: { reserved: totalReserved, spent: totalSpent },
    hashes: { planSha256: planSha, resultsSha256: resultsSha },
    kiroku: kiroku.ok
      ? { receipt: kiroku.receipt, url: kiroku.url }
      : { skipped: !!kiroku.skipped, error: kiroku.error },
    nodes: dagResult.nodes,
    seeded: seed.size,
    snapshotHash,
    counterfactualCaseId: caseId,
    counterfactualBranchId: branchId,
  };
}
