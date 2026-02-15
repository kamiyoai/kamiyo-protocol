import { Router, Request, Response } from 'express';
import { createHash, randomUUID } from 'crypto';
import db from '../../db';
import { createTaskExecutor } from '../../task-executor';
import { planDag, sanitizeDagPlan } from '../../swarm/planner';
import { runDag } from '../../swarm/dag';
import type { SwarmDagPlan, SwarmTeamMember } from '../../swarm/types';
import { reserveTeamBudget, settleTeamBudget } from '../../swarm/pool';
import { publishKirokuDrop } from '../../kiroku';

const taskExecutor = process.env.ANTHROPIC_API_KEY
  ? createTaskExecutor({ anthropicApiKey: process.env.ANTHROPIC_API_KEY })
  : undefined;

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
  const maxParallel = typeof maxParallelRaw === 'number' ? Math.max(1, Math.min(10, Math.floor(maxParallelRaw))) : 4;
  const failFast = req.body?.failFast === undefined ? true : !!req.body.failFast;

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

  const runId = `run_${randomUUID().slice(0, 12)}`;
  const now = Math.floor(Date.now() / 1000);

  db.prepare(`
    INSERT INTO swarm_runs (id, team_id, requested_by_wallet, mission, plan_json, status, max_parallel, fail_fast, started_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 'running', ?, ?, ?, ?, ?)
  `).run(runId, teamId, wallet, mission, JSON.stringify(plan), maxParallel, failFast ? 1 : 0, now, now, now);

  const insertNode = db.prepare(`
    INSERT INTO swarm_run_nodes (
      id, run_id, node_id, member_id, agent_id,
      depends_on_json, description, budget_reserved,
      status, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)
  `);

  const memberById = new Map(members.map((m) => [m.id, m]));
  for (const n of plan.nodes) {
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

  let totalReserved = 0;
  let totalSpent = 0;

  const dagNodes = plan.nodes.map((n) => ({ id: n.id, dependsOn: n.dependsOn, data: n }));
  const startedAtMs = Date.now();

  const dagResult = await runDag(dagNodes, {
    maxParallel,
    failFast,
    runNode: async (node, deps) => {
      const n = node.data;
      const member = memberById.get(n.memberId);
      if (!member) {
        updateNodeDone.run('failed', 0, null, 'member not found', runId, n.id);
        return { status: 'failed' as const, error: 'member not found' };
      }

      updateNodeRunning.run(runId, n.id);

      if (!taskExecutor) {
        updateNodeDone.run('failed', 0, null, 'Task execution not available (missing ANTHROPIC_API_KEY)', runId, n.id);
        return { status: 'failed' as const, error: 'Task execution not available (missing ANTHROPIC_API_KEY)' };
      }

      const reserve = reserveTeamBudget(teamId, n.budget);
      if (!reserve.ok) {
        updateNodeDone.run('failed', 0, null, reserve.error, runId, n.id);
        return { status: 'failed' as const, error: reserve.error };
      }

      totalReserved += reserve.reserved;

      const taskId = `swarm_${runId}_${n.id}_${randomUUID().slice(0, 6)}`;
      const withContext = [
        n.description,
        '',
        'Context (direct dependencies):',
        formatDepsContext(deps.map((d) => ({ id: d.id, result: d.result }))),
      ].join('\n');

      const purpose = `swarm:${runId}:${n.id}`;

      try {
        const result = await taskExecutor({
          taskId,
          description: withContext,
          budget: reserve.reserved,
          teamId,
          metadata: {
            agentId: member.agentId,
            memberId: member.id,
            runId,
            nodeId: n.id,
          },
        });

        const amountDrawn = result.status === 'completed' ? (result.amountDrawn ?? 0) : 0;
        const settle = settleTeamBudget({
          teamId,
          agentId: member.agentId,
          reserved: reserve.reserved,
          amountDrawn,
          purpose,
        });

        if (settle.ok) {
          totalSpent += settle.amountDrawn;
        }

        const outputJson = result.output ? JSON.stringify(result.output) : null;
        if (result.status === 'completed') {
          updateNodeDone.run('completed', amountDrawn, outputJson, null, runId, n.id);
          return { status: 'completed' as const, output: result };
        }

        updateNodeDone.run('failed', 0, outputJson, result.error ?? 'task failed', runId, n.id);
        return { status: 'failed' as const, error: result.error ?? 'task failed' };
      } catch (err) {
        try {
          settleTeamBudget({
            teamId,
            agentId: member.agentId,
            reserved: reserve.reserved,
            amountDrawn: 0,
            purpose,
          });
        } catch {
          // Best-effort refund.
        }

        const msg = err instanceof Error ? err.message : 'task execution failed';
        updateNodeDone.run('failed', 0, null, msg, runId, n.id);
        return { status: 'failed' as const, error: msg };
      }
    },
  });

  const endedAtMs = Date.now();

  const updateSkipped = db.prepare(`
    UPDATE swarm_run_nodes
    SET status = 'skipped', error = ?, started_at = COALESCE(started_at, unixepoch()), completed_at = unixepoch(), updated_at = unixepoch()
    WHERE run_id = ? AND node_id = ? AND status = 'pending'
  `);

  for (const [nodeId, r] of Object.entries(dagResult.nodes)) {
    if (r.status !== 'skipped') continue;
    updateSkipped.run(r.error ?? 'skipped', runId, nodeId);
  }

  const status = dagResult.status === 'completed' ? 'completed' : 'failed';
  const runError = status === 'failed' ? 'one or more nodes failed' : null;

  db.prepare(`
    UPDATE swarm_runs
    SET status = ?, total_reserved = ?, total_spent = ?, error = ?, completed_at = ?, updated_at = unixepoch()
    WHERE id = ?
  `).run(status, totalReserved, totalSpent, runError, Math.floor(Date.now() / 1000), runId);

  const resultSummary = plan.nodes.map((n) => {
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

  const planSha = sha256Hex(canonicalize(plan));
  const resultsSha = sha256Hex(canonicalize(resultSummary));

  const kirokuText = [
    `Hive swarm run ${status}`,
    `run: ${runId}`,
    `team: ${teamId}`,
    `nodes: ${plan.nodes.length}`,
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

  res.json({
    runId,
    status,
    mission,
    plan,
    timingMs: { startedAt: startedAtMs, completedAt: endedAtMs, duration: endedAtMs - startedAtMs },
    totals: { reserved: totalReserved, spent: totalSpent },
    hashes: { planSha256: planSha, resultsSha256: resultsSha },
    kiroku: kiroku.ok ? { receipt: kiroku.receipt, url: kiroku.url } : { skipped: !!kiroku.skipped, error: kiroku.error },
    nodes: dagResult.nodes,
  });
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

  const run = db.prepare(`
    SELECT *
    FROM swarm_runs
    WHERE id = ? AND team_id = ?
  `).get(runId, teamId) as any;

  if (!run) {
    res.status(404).json({ error: 'Run not found' });
    return;
  }

  const nodes = db.prepare(`
    SELECT node_id, member_id, agent_id, depends_on_json, description, budget_reserved, amount_drawn, status, output_json, error, started_at, completed_at
    FROM swarm_run_nodes
    WHERE run_id = ?
    ORDER BY created_at ASC
  `).all(runId) as Array<any>;

  res.json({
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
  });
});

export default router;
