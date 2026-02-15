import { Router, Request, Response } from 'express';
import { createHash, randomUUID } from 'crypto';
import db from '../../db';
import { createTaskExecutor } from '../../task-executor';
import { planDag, sanitizeDagPlan } from '../../swarm/planner';
import { runDag } from '../../swarm/dag';
import type { SwarmDagPlan, SwarmTeamMember } from '../../swarm/types';
import { reserveTeamBudget, settleTeamBudget } from '../../swarm/pool';
import { publishKirokuDrop } from '../../kiroku';
import { acquireSwarmNodeSlot, clampMaxParallel, getSwarmGlobalActiveNodes, swarmRuntimeConfig } from '../../swarm/runtime';
import { swarmActiveNodes, swarmNodeDuration, swarmNodesTotal, swarmRunDuration, swarmRunsTotal } from '../../metrics';

const taskExecutor = (process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY)
  ? createTaskExecutor({
      anthropicApiKey: process.env.ANTHROPIC_API_KEY,
      openaiApiKey: process.env.OPENAI_API_KEY,
    })
  : undefined;

const CANCEL_TTL_MS = 24 * 60 * 60 * 1000;
const cancelledRuns = new Map<string, { reason: string; atMs: number }>();

function getCancelReason(runId: string): string | null {
  const now = Date.now();
  for (const [id, entry] of cancelledRuns) {
    if (entry.atMs + CANCEL_TTL_MS < now) cancelledRuns.delete(id);
  }
  return cancelledRuns.get(runId)?.reason ?? null;
}

function cancelRun(runId: string, reason: string) {
  cancelledRuns.set(runId, { reason, atMs: Date.now() });
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

function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

function canonicalize(value: unknown): string {
  const sort = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(sort);
    if (!v || typeof v !== 'object') return v;
    const o = v as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(o).sort()) out[k] = sort(o[k]);
    return out;
  };
  return JSON.stringify(sort(value));
}

function isTeamOwner(teamId: string, wallet: string): boolean {
  const team = db.prepare('SELECT owner_wallet FROM swarm_teams WHERE id = ?').get(teamId) as { owner_wallet: string | null } | undefined;
  if (!team) return false;
  if (!team.owner_wallet) return true;
  return team.owner_wallet === wallet;
}

function requireTeamOwner(req: Request, res: Response, next: () => void): void {
  const teamId = req.params.id;
  const wallet = req.auth?.wallet;
  if (!wallet) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  if (!isTeamOwner(teamId, wallet)) {
    res.status(403).json({ error: 'Not authorized to modify this team' });
    return;
  }
  next();
}

function getTeamMembers(teamId: string): SwarmTeamMember[] {
  const rows = db.prepare(`
    SELECT id, agent_id, role, draw_limit
    FROM swarm_team_members
    WHERE team_id = ?
    ORDER BY added_at ASC
  `).all(teamId) as Array<{ id: string; agent_id: string; role: string; draw_limit: number }>;

  return rows.map((r) => ({
    id: r.id,
    agentId: r.agent_id,
    role: r.role,
    drawLimit: r.draw_limit,
  }));
}

function formatDepsContext(deps: Array<{ id: string; result: { status: string; output?: unknown; error?: string } }>): string {
  const compact = deps.map((d) => ({
    id: d.id,
    status: d.result.status,
    error: d.result.status !== 'completed' ? d.result.error : undefined,
    output: d.result.status === 'completed' ? d.result.output : undefined,
  }));

  const text = JSON.stringify(compact, null, 2);
  if (text.length <= 12_000) return text;
  return text.slice(0, 11_997) + '...';
}

const router = Router({ mergeParams: true });

router.use(requireTeamOwner);

function loadRunDetail(teamId: string, runId: string) {
  const run = db.prepare(`
    SELECT *
    FROM swarm_runs
    WHERE id = ? AND team_id = ?
  `).get(runId, teamId) as any;

  if (!run) return null;

  const nodes = db.prepare(`
    SELECT node_id, member_id, agent_id, depends_on_json, description, budget_reserved, amount_drawn, status, output_json, error, started_at, completed_at
    FROM swarm_run_nodes
    WHERE run_id = ?
    ORDER BY created_at ASC
  `).all(runId) as Array<any>;

  return {
    runId: run.id,
    id: run.id,
    teamId: run.team_id,
    mission: run.mission,
    status: run.status,
    plan: JSON.parse(run.plan_json),
    totals: { reserved: run.total_reserved, spent: run.total_spent },
    error: run.error,
    kiroku: { receipt: run.kiroku_receipt, url: run.kiroku_url, error: run.kiroku_error },
    startedAt: run.started_at * 1000,
    completedAt: run.completed_at ? run.completed_at * 1000 : null,
    nodes: nodes.map((n) => ({
      id: n.node_id,
      memberId: n.member_id,
      agentId: n.agent_id,
      dependsOn: JSON.parse(n.depends_on_json),
      description: n.description,
      budgetReserved: n.budget_reserved,
      amountDrawn: n.amount_drawn,
      status: n.status,
      output: n.output_json ? JSON.parse(n.output_json) : null,
      error: n.error,
      startedAt: n.started_at ? n.started_at * 1000 : null,
      completedAt: n.completed_at ? n.completed_at * 1000 : null,
    })),
  };
}

type SeededNode = {
  nodeId: string;
  fromRunId: string;
  output: unknown;
};

async function executeSwarmRun(options: {
  teamId: string;
  wallet: string | null;
  mission: string;
  plan: SwarmDagPlan;
  members: SwarmTeamMember[];
  maxParallel: number;
  failFast: boolean;
  idempotencyKey: string | null;
  seededNodes?: SeededNode[];
}) {
  const runId = `run_${randomUUID().slice(0, 12)}`;
  const now = Math.floor(Date.now() / 1000);

  db.prepare(`
    INSERT INTO swarm_runs (id, team_id, requested_by_wallet, mission, plan_json, status, max_parallel, fail_fast, idempotency_key, started_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 'running', ?, ?, ?, ?, ?, ?)
  `).run(
    runId,
    options.teamId,
    options.wallet,
    options.mission,
    JSON.stringify(options.plan),
    options.maxParallel,
    options.failFast ? 1 : 0,
    options.idempotencyKey,
    now,
    now,
    now
  );

  const insertNode = db.prepare(`
    INSERT INTO swarm_run_nodes (
      id, run_id, node_id, member_id, agent_id,
      depends_on_json, description, budget_reserved,
      status, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)
  `);

  const memberById = new Map(options.members.map((m) => [m.id, m]));
  for (const n of options.plan.nodes) {
    const m = memberById.get(n.memberId);
    if (!m) continue;
    insertNode.run(
      `${runId}:${n.id}`,
      runId,
      n.id,
      n.memberId,
      m.agentId,
      JSON.stringify(n.dependsOn),
      n.description,
      n.budget,
      now,
      now
    );
  }

  const seed = new Map<string, { wrapped: unknown; fromRunId: string }>();
  for (const s of options.seededNodes ?? []) {
    const nodeId = (s.nodeId || '').trim();
    if (!nodeId || seed.has(nodeId)) continue;
    const fromRunId = (s.fromRunId || '').trim();
    const wrapped = { reused: true, fromRunId, output: s.output };
    seed.set(nodeId, { wrapped, fromRunId });
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

  const dagNodes = options.plan.nodes.map((n) => ({ id: n.id, dependsOn: n.dependsOn, data: n }));
  const startedAtMs = Date.now();
  const deadlineAtMs = startedAtMs + swarmRuntimeConfig.runTimeoutMs;

  const dagResult = await runDag(dagNodes, {
    maxParallel: options.maxParallel,
    failFast: options.failFast,
    initialResults,
    shouldAbort: () => {
      const cancelReason = getCancelReason(runId);
      if (cancelReason) return { status: 'cancelled', reason: cancelReason };
      if (Date.now() > deadlineAtMs) return { status: 'failed', reason: 'run timeout' };
      return null;
    },
    runNode: async (node, deps) => {
      const n = node.data;
      const member = memberById.get(n.memberId);
      if (!member) {
        updateNodeDone.run('failed', 0, null, 'member not found', runId, n.id);
        return { status: 'failed' as const, error: 'member not found' };
      }

      const cancelReason = getCancelReason(runId);
      if (cancelReason) {
        updateNodeDone.run('skipped', 0, null, `skipped: ${cancelReason}`, runId, n.id);
        return { status: 'failed' as const, error: 'cancelled' };
      }

      const releaseSlot = await acquireSwarmNodeSlot(options.teamId);
      swarmActiveNodes.set(getSwarmGlobalActiveNodes());

      const nodeStartedAt = Date.now();
      const purpose = `swarm:${runId}:${n.id}`;
      let reserved = 0;

      try {
        updateNodeRunning.run(runId, n.id);

        if (!taskExecutor) {
          updateNodeDone.run('failed', 0, null, 'Task execution not available (missing ANTHROPIC_API_KEY)', runId, n.id);
          return { status: 'failed' as const, error: 'Task execution not available (missing ANTHROPIC_API_KEY)' };
        }

        const reserve = reserveTeamBudget(options.teamId, n.budget);
        if (!reserve.ok) {
          updateNodeDone.run('failed', 0, null, reserve.error, runId, n.id);
          return { status: 'failed' as const, error: reserve.error };
        }

        reserved = reserve.reserved;
        totalReserved += reserved;

        const taskId = `swarm_${runId}_${n.id}_${randomUUID().slice(0, 6)}`;
        const withContext = [
          n.description,
          '',
          'Context (direct dependencies):',
          formatDepsContext(deps.map((d) => ({ id: d.id, result: d.result }))),
        ].join('\n');

        const result = await withTimeout(
          taskExecutor({
            taskId,
            description: withContext,
            budget: reserved,
            teamId: options.teamId,
            metadata: {
              agentId: member.agentId,
              memberId: member.id,
              runId,
              nodeId: n.id,
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

        const outputJson = result.output ? JSON.stringify(result.output) : null;
        if (result.status === 'completed') {
          updateNodeDone.run('completed', amountDrawn, outputJson, null, runId, n.id);
          swarmNodesTotal.inc({ status: 'completed' });
          swarmNodeDuration.observe({ status: 'completed' }, (Date.now() - nodeStartedAt) / 1000);
          return { status: 'completed' as const, output: result };
        }

        updateNodeDone.run('failed', 0, outputJson, result.error ?? 'task failed', runId, n.id);
        swarmNodesTotal.inc({ status: 'failed' });
        swarmNodeDuration.observe({ status: 'failed' }, (Date.now() - nodeStartedAt) / 1000);
        return { status: 'failed' as const, error: result.error ?? 'task failed' };
      } catch (err) {
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

        const msg = err instanceof Error ? err.message : 'task execution failed';
        updateNodeDone.run('failed', 0, null, msg, runId, n.id);
        swarmNodesTotal.inc({ status: 'failed' });
        swarmNodeDuration.observe({ status: 'failed' }, (Date.now() - nodeStartedAt) / 1000);
        return { status: 'failed' as const, error: msg };
      } finally {
        releaseSlot();
        swarmActiveNodes.set(getSwarmGlobalActiveNodes());
      }
    },
  });

  const endedAtMs = Date.now();

  for (const [nodeId, r] of Object.entries(dagResult.nodes)) {
    if (r.status !== 'skipped') continue;
    updateSkipped.run(r.error ?? 'skipped', runId, nodeId);
    swarmNodesTotal.inc({ status: 'skipped' });
  }

  const status =
    dagResult.status === 'cancelled'
      ? 'cancelled'
      : dagResult.status === 'completed'
        ? 'completed'
        : 'failed';
  const runError =
    status === 'failed' ? (dagResult.abortReason ?? 'one or more nodes failed')
      : status === 'cancelled' ? (dagResult.abortReason ?? 'cancelled')
        : null;

  db.prepare(`
    UPDATE swarm_runs
    SET
      status = CASE WHEN status = 'running' THEN ? ELSE status END,
      total_reserved = ?,
      total_spent = ?,
      error = CASE WHEN status = 'running' THEN ? ELSE error END,
      completed_at = ?,
      updated_at = unixepoch()
    WHERE id = ?
  `).run(status, totalReserved, totalSpent, runError, Math.floor(Date.now() / 1000), runId);

  swarmRunsTotal.inc({ status });
  swarmRunDuration.observe({ status }, (endedAtMs - startedAtMs) / 1000);

  const resultSummary = options.plan.nodes.map((n) => {
    const r = dagResult.nodes[n.id];
    const outputHash = r?.status === 'completed'
      ? sha256Hex(canonicalize((r.output as any)?.output ?? null))
      : null;
    const amount = r?.status === 'completed'
      ? ((r.output as any)?.amountDrawn ?? 0)
      : 0;
    return {
      id: n.id,
      status: r?.status ?? 'unknown',
      amountDrawn: amount,
      outputSha256: outputHash,
      error: r?.status !== 'completed' ? (r?.error ?? null) : null,
    };
  });

  const planSha = sha256Hex(canonicalize(options.plan));
  const resultsSha = sha256Hex(canonicalize(resultSummary));

  const kirokuText = [
    `Hive swarm run ${status}`,
    `run: ${runId}`,
    `team: ${options.teamId}`,
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
    db.prepare(`
      UPDATE swarm_runs
      SET kiroku_receipt = ?, kiroku_url = ?, kiroku_error = NULL, updated_at = unixepoch()
      WHERE id = ?
    `).run(kiroku.receipt, kiroku.url, runId);
  } else if (!kiroku.skipped) {
    db.prepare(`
      UPDATE swarm_runs
      SET kiroku_error = ?, updated_at = unixepoch()
      WHERE id = ?
    `).run(kiroku.error, runId);
  }

  return {
    runId,
    status,
    mission: options.mission,
    plan: options.plan,
    timingMs: { startedAt: startedAtMs, completedAt: endedAtMs, duration: endedAtMs - startedAtMs },
    totals: { reserved: totalReserved, spent: totalSpent },
    hashes: { planSha256: planSha, resultsSha256: resultsSha },
    kiroku: kiroku.ok ? { receipt: kiroku.receipt, url: kiroku.url } : { skipped: !!kiroku.skipped, error: kiroku.error },
    nodes: dagResult.nodes,
    seeded: seed.size,
  };
}

// POST /api/hive-teams/:id/swarm/plan
router.post('/plan', async (req: Request, res: Response) => {
  const teamId = req.params.id;
  const mission = typeof req.body?.mission === 'string' ? req.body.mission.trim() : '';
  const maxNodesRaw = req.body?.maxNodes;
  const maxNodes = typeof maxNodesRaw === 'number' ? maxNodesRaw : undefined;

  if (!mission) {
    res.status(400).json({ error: 'mission required' });
    return;
  }

  const members = getTeamMembers(teamId);
  if (members.length === 0) {
    res.status(400).json({ error: 'team has no members' });
    return;
  }

  try {
    const plan = await planDag(mission, members, { maxNodes });
    res.json(plan);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'planning failed' });
  }
});

// POST /api/hive-teams/:id/swarm/run
router.post('/run', async (req: Request, res: Response) => {
  const teamId = req.params.id;
  const wallet = req.auth?.wallet ?? null;

  const mission = typeof req.body?.mission === 'string' ? req.body.mission.trim() : '';
  const maxParallelRaw = req.body?.maxParallel;
  const maxParallelRequested = typeof maxParallelRaw === 'number' ? maxParallelRaw : 4;
  const maxParallel = clampMaxParallel(maxParallelRequested);
  const failFast = req.body?.failFast === undefined ? true : !!req.body.failFast;
  const idempotencyKeyRaw = typeof req.body?.idempotencyKey === 'string'
    ? req.body.idempotencyKey
    : (typeof req.headers['idempotency-key'] === 'string' ? req.headers['idempotency-key'] : '');
  const idempotencyKey = idempotencyKeyRaw.trim().slice(0, 128) || null;

  if (!mission) {
    res.status(400).json({ error: 'mission required' });
    return;
  }

  const members = getTeamMembers(teamId);
  if (members.length === 0) {
    res.status(400).json({ error: 'team has no members' });
    return;
  }

  let plan: SwarmDagPlan;
  try {
    if (req.body?.plan) {
      plan = sanitizeDagPlan(req.body.plan, members, mission, { maxNodes: 24 });
    } else {
      plan = await planDag(mission, members, { maxNodes: 24 });
    }
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'invalid plan' });
    return;
  }

  if (idempotencyKey) {
    const existing = db.prepare(`
      SELECT id
      FROM swarm_runs
      WHERE team_id = ? AND idempotency_key = ?
      LIMIT 1
    `).get(teamId, idempotencyKey) as { id: string } | undefined;

    if (existing?.id) {
      const detail = loadRunDetail(teamId, existing.id);
      if (detail) {
        res.json({ replay: true, ...detail });
        return;
      }
    }
  }

  try {
    const result = await executeSwarmRun({
      teamId,
      wallet,
      mission,
      plan,
      members,
      maxParallel,
      failFast,
      idempotencyKey,
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'run failed' });
  }
});

// POST /api/hive-teams/:id/swarm/runs/:runId/cancel
router.post('/runs/:runId/cancel', (req: Request, res: Response) => {
  const teamId = req.params.id;
  const runId = req.params.runId;

  const run = db.prepare('SELECT id, status FROM swarm_runs WHERE id = ? AND team_id = ?').get(runId, teamId) as { id: string; status: string } | undefined;
  if (!run) {
    res.status(404).json({ error: 'Run not found' });
    return;
  }

  cancelRun(runId, 'cancelled');

  db.prepare(`
    UPDATE swarm_runs
    SET status = 'cancelled', error = 'cancelled', updated_at = unixepoch()
    WHERE id = ? AND team_id = ? AND status = 'running'
  `).run(runId, teamId);

  db.prepare(`
    UPDATE swarm_run_nodes
    SET status = 'skipped', error = 'skipped: cancelled', started_at = COALESCE(started_at, unixepoch()), completed_at = unixepoch(), updated_at = unixepoch()
    WHERE run_id = ? AND status = 'pending'
  `).run(runId);

  res.json({ ok: true, runId });
});

// POST /api/hive-teams/:id/swarm/runs/:runId/retry
router.post('/runs/:runId/retry', async (req: Request, res: Response) => {
  const teamId = req.params.id;
  const runId = req.params.runId;
  const mode = (typeof req.body?.mode === 'string' ? req.body.mode : '').trim();
  const retryMode = mode === 'all' ? 'all' : 'incomplete';

  const prev = db.prepare(`
    SELECT id, team_id, requested_by_wallet, mission, plan_json, status, max_parallel, fail_fast
    FROM swarm_runs
    WHERE id = ? AND team_id = ?
  `).get(runId, teamId) as any;

  if (!prev) {
    res.status(404).json({ error: 'Run not found' });
    return;
  }
  if (prev.status === 'running') {
    res.status(400).json({ error: 'Run is still running' });
    return;
  }

  const members = getTeamMembers(teamId);
  if (members.length === 0) {
    res.status(400).json({ error: 'team has no members' });
    return;
  }

  const plan = sanitizeDagPlan(JSON.parse(prev.plan_json), members, prev.mission, { maxNodes: 24 });

  const prevNodes = db.prepare(`
    SELECT node_id, status, output_json, amount_drawn
    FROM swarm_run_nodes
    WHERE run_id = ?
  `).all(runId) as Array<{ node_id: string; status: string; output_json: string | null; amount_drawn: number }>;

  const reusable = new Map<string, { output: unknown; amountDrawn: number }>();
  if (retryMode === 'incomplete') {
    for (const n of prevNodes) {
      if (n.status !== 'completed') continue;
      reusable.set(n.node_id, {
        output: n.output_json ? JSON.parse(n.output_json) : null,
        amountDrawn: n.amount_drawn ?? 0,
      });
    }
  }

  const seededNodes: SeededNode[] = [];
  for (const [nodeId, reused] of reusable) {
    seededNodes.push({ nodeId, fromRunId: runId, output: reused.output });
  }

  const maxParallelRequested = typeof req.body?.maxParallel === 'number' ? req.body.maxParallel : prev.max_parallel ?? 4;
  const maxParallel = clampMaxParallel(maxParallelRequested);
  const failFast = req.body?.failFast === undefined ? !!prev.fail_fast : !!req.body.failFast;

  try {
    const result = await executeSwarmRun({
      teamId,
      wallet: req.auth?.wallet ?? null,
      mission: prev.mission,
      plan,
      members,
      maxParallel,
      failFast,
      idempotencyKey: null,
      seededNodes,
    });

    res.json({
      ...result,
      retry: { fromRunId: runId, mode: retryMode, seeded: reusable.size },
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'retry failed' });
  }
});

// GET /api/hive-teams/:id/swarm/runs
router.get('/runs', (req: Request, res: Response) => {
  const teamId = req.params.id;
  const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
  const offset = parseInt(req.query.offset as string) || 0;

  const rows = db.prepare(`
    SELECT id, mission, status, total_reserved, total_spent, error, kiroku_url, started_at, completed_at
    FROM swarm_runs
    WHERE team_id = ?
    ORDER BY started_at DESC
    LIMIT ? OFFSET ?
  `).all(teamId, limit, offset) as Array<{
    id: string;
    mission: string;
    status: string;
    total_reserved: number;
    total_spent: number;
    error: string | null;
    kiroku_url: string | null;
    started_at: number;
    completed_at: number | null;
  }>;

  res.json({
    runs: rows.map((r) => ({
      runId: r.id,
      id: r.id,
      mission: r.mission,
      status: r.status,
      totals: { reserved: r.total_reserved, spent: r.total_spent },
      error: r.error,
      kirokuUrl: r.kiroku_url,
      startedAt: r.started_at * 1000,
      completedAt: r.completed_at ? r.completed_at * 1000 : null,
    })),
    limit,
    offset,
  });
});

// GET /api/hive-teams/:id/swarm/runs/:runId
router.get('/runs/:runId', (req: Request, res: Response) => {
  const { id: teamId, runId } = req.params;

  const detail = loadRunDetail(teamId, runId);
  if (!detail) {
    res.status(404).json({ error: 'Run not found' });
    return;
  }
  res.json(detail);
});

export default router;
