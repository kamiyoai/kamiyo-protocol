import { createHash } from 'crypto';
import { Router, Request, Response } from 'express';
import db from '../../db';
import { planDag, sanitizeDagPlan } from '../../swarm/planner';
import type { SwarmDagPlan } from '../../swarm/types';
import {
  cancelSwarmRun,
  executeSwarmRun,
  findExistingRunByIdempotency,
  getSwarmRunDetail,
  getSwarmRunProgress,
  getTeamMembers,
  listSwarmRuns,
  type SeededNode,
} from '../../swarm/service';
import { clampMaxParallel, swarmRuntimeConfig } from '../../swarm/runtime';

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

const router = Router({ mergeParams: true });

router.use(requireTeamOwner);

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
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'planning failed' });
  }
});

router.post('/run', async (req: Request, res: Response) => {
  const teamId = req.params.id;
  const wallet = req.auth?.wallet ?? null;
  const mission = typeof req.body?.mission === 'string' ? req.body.mission.trim() : '';
  const maxParallelRequested = typeof req.body?.maxParallel === 'number' ? req.body.maxParallel : 4;
  const maxParallel = clampMaxParallel(maxParallelRequested);
  const failFast = req.body?.failFast === undefined ? true : !!req.body.failFast;
  const idempotencyKeyRaw =
    typeof req.body?.idempotencyKey === 'string'
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
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'invalid plan' });
    return;
  }

  if (idempotencyKey) {
    const existingRunId = findExistingRunByIdempotency(teamId, idempotencyKey);
    if (existingRunId) {
      const detail = getSwarmRunDetail(teamId, existingRunId);
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
      executionMode: 'execute',
    });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'run failed' });
  }
});

router.post('/runs/:runId/cancel', (req: Request, res: Response) => {
  const result = cancelSwarmRun(req.params.id, req.params.runId);
  if (!result.ok) {
    res.status(result.error === 'Run not found' ? 404 : 400).json({ error: result.error });
    return;
  }

  res.json({ ok: true, runId: req.params.runId });
});

router.post('/runs/:runId/retry', async (req: Request, res: Response) => {
  const teamId = req.params.id;
  const runId = req.params.runId;
  const mode = (typeof req.body?.mode === 'string' ? req.body.mode : '').trim();
  const retryMode = mode === 'all' ? 'all' : 'incomplete';

  const previous = db.prepare(`
    SELECT id, team_id, requested_by_wallet, mission, plan_json, status, max_parallel, fail_fast
    FROM swarm_runs
    WHERE id = ? AND team_id = ?
  `).get(runId, teamId) as any;

  if (!previous) {
    res.status(404).json({ error: 'Run not found' });
    return;
  }
  if (previous.status === 'running') {
    res.status(400).json({ error: 'Run is still running' });
    return;
  }

  const members = getTeamMembers(teamId);
  if (members.length === 0) {
    res.status(400).json({ error: 'team has no members' });
    return;
  }

  const plan = sanitizeDagPlan(JSON.parse(previous.plan_json), members, previous.mission, { maxNodes: 24 });
  const previousNodes = db.prepare(`
    SELECT node_id, status, output_json, amount_drawn
    FROM swarm_run_nodes
    WHERE run_id = ?
  `).all(runId) as Array<{ node_id: string; status: string; output_json: string | null; amount_drawn: number }>;

  const seededNodes: SeededNode[] = [];
  if (retryMode === 'incomplete') {
    for (const node of previousNodes) {
      if (node.status !== 'completed') continue;
      seededNodes.push({
        nodeId: node.node_id,
        fromRunId: runId,
        output: node.output_json ? JSON.parse(node.output_json) : null,
      });
    }
  }

  const maxParallelRequested =
    typeof req.body?.maxParallel === 'number' ? req.body.maxParallel : previous.max_parallel ?? 4;
  const maxParallel = clampMaxParallel(maxParallelRequested);
  const failFast = req.body?.failFast === undefined ? !!previous.fail_fast : !!req.body.failFast;

  try {
    const result = await executeSwarmRun({
      teamId,
      wallet: req.auth?.wallet ?? null,
      mission: previous.mission,
      plan,
      members,
      maxParallel,
      failFast,
      idempotencyKey: null,
      seededNodes,
      executionMode: 'execute',
    });

    res.json({
      ...result,
      retry: { fromRunId: runId, mode: retryMode, seeded: seededNodes.length },
    });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'retry failed' });
  }
});

router.get('/runs', (req: Request, res: Response) => {
  const teamId = req.params.id;
  const limit = Math.min(parseInt(req.query.limit as string, 10) || 20, 100);
  const offset = parseInt(req.query.offset as string, 10) || 0;

  res.json({
    runs: listSwarmRuns(teamId, limit, offset),
    limit,
    offset,
  });
});

router.get('/runs/:runId', (req: Request, res: Response) => {
  const detail = getSwarmRunDetail(req.params.id, req.params.runId);
  if (!detail) {
    res.status(404).json({ error: 'Run not found' });
    return;
  }

  res.json(detail);
});

router.get('/runs/:runId/stream', (req: Request, res: Response) => {
  const teamId = req.params.id;
  const runId = req.params.runId;

  res.status(200);
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');

  const flushHeaders = (res as any).flushHeaders;
  if (typeof flushHeaders === 'function') flushHeaders.call(res);

  let closed = false;
  const pollInterval = setInterval(tick, 1000);
  const heartbeatInterval = setInterval(() => {
    if (closed) return;
    res.write(`event: ping\ndata: ${Date.now()}\n\n`);
  }, 15_000);
  const hardTimeout = setTimeout(() => {
    send('error', { error: 'Stream timeout' });
    close();
  }, swarmRuntimeConfig.runTimeoutMs + 60_000);
  let lastSha = '';

  const send = (event: string, data: unknown) => {
    if (closed) return;
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  const close = () => {
    if (closed) return;
    closed = true;
    if (pollInterval) clearInterval(pollInterval);
    if (heartbeatInterval) clearInterval(heartbeatInterval);
    if (hardTimeout) clearTimeout(hardTimeout);
    res.end();
  };
  const closeSoon = () => {
    setTimeout(close, 0);
  };

  req.on('aborted', close);
  res.on('close', close);

  const tick = () => {
    const progress = getSwarmRunProgress(teamId, runId);
    if (!progress) {
      send('error', { error: 'Run not found' });
      closeSoon();
      return;
    }

    const sha = sha256Hex(canonicalize(progress));
    if (sha !== lastSha) {
      lastSha = sha;
      send('update', progress);
    }

    if (progress.status !== 'running') {
      send('done', progress);
      closeSoon();
    }
  };

  tick();
});

export default router;
