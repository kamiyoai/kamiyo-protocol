import { createHash, randomUUID } from 'crypto';
import { Router, Request, Response } from 'express';
import db from '../db';
import { READONLY_TASK_EXECUTOR_ALLOWED_TOOLS } from '../task-executor';
import { executeSwarmRun, getTeamMembers, type ExecuteSwarmRunResult } from '../swarm/service';
import type { SwarmDagPlan } from '../swarm/types';
import { adjudicateBranches } from './adjudication';
import { loadControlRoomCaseDetail } from './detail';
import { appendCaseEvent } from './events';
import { buildControlRoomBranchPlans } from './policies';
import { computeReuseKey, dependencyHash, findReusableReadonlyNode } from './reuse';
import { scoreBranches } from './scoring';
import { captureCounterfactualSnapshot } from './snapshot';
import type {
  BranchExecutionSummary,
  ControlRoomBranchPlan,
  ControlRoomCaseStatus,
  ControlRoomDecisionMode,
  ControlRoomSource,
} from './types';

function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

function isTeamOwner(teamId: string, wallet: string): boolean {
  const team = db.prepare('SELECT owner_wallet FROM swarm_teams WHERE id = ?').get(teamId) as
    | { owner_wallet: string | null }
    | undefined;
  if (!team) return false;
  if (!team.owner_wallet) return true;
  return team.owner_wallet === wallet;
}

function requireTeamOwner(req: Request, res: Response, next: () => void): void {
  const wallet = req.auth?.wallet;
  if (!wallet) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  if (!isTeamOwner(req.params.id, wallet)) {
    res.status(403).json({ error: 'Not authorized to modify this team' });
    return;
  }
  next();
}

function asObject(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

function controlRoomSourceFromBody(body: unknown): ControlRoomSource {
  const record = asObject(body) ?? {};
  const rawType = typeof record.type === 'string' ? record.type.trim() : '';
  if (
    rawType !== 'observatory_session' &&
    rawType !== 'observatory_escrow' &&
    rawType !== 'manual_evidence'
  ) {
    throw new Error(
      'source.type must be observatory_session, observatory_escrow, or manual_evidence'
    );
  }

  return {
    type: rawType,
    ref: typeof record.ref === 'string' ? record.ref.trim() || undefined : undefined,
  };
}

function controlRoomDecisionModeFromBody(value: unknown): ControlRoomDecisionMode {
  if (value === 'score_only' || value === 'truth_court_required') return value;
  return 'score_then_truth_court';
}

function nowUnix(): number {
  return Math.floor(Date.now() / 1000);
}

function syntheticFailedRun(params: {
  mission: string;
  plan: SwarmDagPlan;
  error: string;
}): ExecuteSwarmRunResult {
  const nodes = Object.fromEntries(
    params.plan.nodes.map(node => [
      node.id,
      {
        status: 'failed',
        error: params.error,
      },
    ])
  );

  const resultsSha256 = sha256Hex(JSON.stringify(nodes));
  return {
    runId: `failed_${randomUUID().slice(0, 12)}`,
    status: 'failed',
    executionMode: 'readonly',
    mission: params.mission,
    plan: params.plan,
    timingMs: { startedAt: Date.now(), completedAt: Date.now(), duration: 0 },
    totals: { reserved: 0, spent: 0 },
    hashes: {
      planSha256: sha256Hex(JSON.stringify(params.plan)),
      resultsSha256,
    },
    kiroku: { skipped: true, error: params.error },
    nodes,
    seeded: 0,
    snapshotHash: null,
    counterfactualCaseId: null,
    counterfactualBranchId: null,
  };
}

function loadCaseRow(teamId: string, caseId: string) {
  return db
    .prepare(
      `
    SELECT *
    FROM counterfactual_cases
    WHERE id = ? AND team_id = ?
  `
    )
    .get(caseId, teamId) as any;
}

function loadBranches(caseId: string) {
  return db
    .prepare(
      `
    SELECT *
    FROM counterfactual_branches
    WHERE case_id = ?
    ORDER BY created_at ASC, id ASC
  `
    )
    .all(caseId) as any[];
}

function updateCaseStatus(
  caseId: string,
  status: ControlRoomCaseStatus,
  fields: {
    winnerBranchId?: string | null;
    promotedRunId?: string | null;
    error?: string | null;
    completedAt?: boolean;
  } = {}
): void {
  db.prepare(
    `
    UPDATE counterfactual_cases
    SET
      status = ?,
      winner_branch_id = COALESCE(?, winner_branch_id),
      promoted_run_id = COALESCE(?, promoted_run_id),
      error = ?,
      completed_at = CASE WHEN ? = 1 THEN unixepoch() ELSE completed_at END,
      updated_at = unixepoch()
    WHERE id = ?
  `
  ).run(
    status,
    fields.winnerBranchId ?? null,
    fields.promotedRunId ?? null,
    fields.error ?? null,
    fields.completedAt ? 1 : 0,
    caseId
  );
}

const router = Router({ mergeParams: true });

router.use(requireTeamOwner);

router.post('/cases', async (req: Request, res: Response) => {
  const teamId = req.params.id;
  const mission = typeof req.body?.mission === 'string' ? req.body.mission.trim() : '';
  const manualEvidence = asObject(req.body?.manualEvidence);

  if (!mission) {
    res.status(400).json({ error: 'mission required' });
    return;
  }

  let source: ControlRoomSource;
  try {
    source = controlRoomSourceFromBody(req.body?.snapshotSource);
  } catch (error) {
    res
      .status(400)
      .json({ error: error instanceof Error ? error.message : 'invalid snapshot source' });
    return;
  }

  const members = getTeamMembers(teamId);
  if (members.length === 0) {
    res.status(400).json({ error: 'team has no members' });
    return;
  }

  try {
    const { snapshot, snapshotHash } = await captureCounterfactualSnapshot({
      teamId,
      mission,
      source,
      members,
      manualEvidence,
    });

    const caseId = `cf_case_${randomUUID().slice(0, 12)}`;
    db.prepare(
      `
      INSERT INTO counterfactual_cases (
        id, team_id, mission, snapshot_json, snapshot_hash,
        snapshot_source_type, snapshot_source_ref, decision_mode, status,
        created_by_wallet, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'captured', ?, ?, ?)
    `
    ).run(
      caseId,
      teamId,
      mission,
      JSON.stringify(snapshot),
      snapshotHash,
      source.type,
      source.ref ?? null,
      controlRoomDecisionModeFromBody(req.body?.decisionMode),
      req.auth?.wallet ?? null,
      nowUnix(),
      nowUnix()
    );

    appendCaseEvent({
      caseId,
      eventType: 'case_created',
      payload: {
        mission,
        source,
      },
    });
    appendCaseEvent({
      caseId,
      eventType: 'snapshot_captured',
      payload: {
        snapshotHash,
        source,
      },
    });

    res.status(201).json(loadControlRoomCaseDetail(teamId, caseId));
  } catch (error) {
    res
      .status(500)
      .json({ error: error instanceof Error ? error.message : 'snapshot capture failed' });
  }
});

router.get('/cases', (req: Request, res: Response) => {
  const teamId = req.params.id;
  const limit = Math.max(1, Math.min(parseInt(req.query.limit as string, 10) || 20, 100));
  const offset = Math.max(0, parseInt(req.query.offset as string, 10) || 0);
  const rows = db
    .prepare(
      `
    SELECT id, mission, status, decision_mode, snapshot_hash, snapshot_source_type, snapshot_source_ref, winner_branch_id, promoted_run_id, error, created_at, completed_at
    FROM counterfactual_cases
    WHERE team_id = ?
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `
    )
    .all(teamId, limit, offset) as Array<any>;

  res.json({
    cases: rows.map(row => ({
      caseId: row.id,
      id: row.id,
      mission: row.mission,
      status: row.status,
      decisionMode: row.decision_mode,
      snapshotHash: row.snapshot_hash,
      source: { type: row.snapshot_source_type, ref: row.snapshot_source_ref ?? null },
      winnerBranchId: row.winner_branch_id ?? null,
      promotedRunId: row.promoted_run_id ?? null,
      error: row.error ?? null,
      createdAt: row.created_at * 1000,
      completedAt: row.completed_at ? row.completed_at * 1000 : null,
    })),
    limit,
    offset,
  });
});

router.get('/cases/:caseId', (req: Request, res: Response) => {
  const detail = loadControlRoomCaseDetail(req.params.id, req.params.caseId);
  if (!detail) {
    res.status(404).json({ error: 'Case not found' });
    return;
  }
  res.json(detail);
});

router.get('/cases/:caseId/stream', (req: Request, res: Response) => {
  const teamId = req.params.id;
  const caseId = req.params.caseId;

  res.status(200);
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');

  const flushHeaders = (res as any).flushHeaders;
  if (typeof flushHeaders === 'function') flushHeaders.call(res);

  let closed = false;
  const seenIds = new Set<string>();

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
    res.end();
  };
  const closeSoon = () => {
    setTimeout(close, 0);
  };

  req.on('aborted', close);
  res.on('close', close);

  const tick = () => {
    const detail = loadControlRoomCaseDetail(teamId, caseId);
    if (!detail) {
      send('error', { error: 'Case not found' });
      closeSoon();
      return;
    }

    for (const event of detail.events) {
      if (seenIds.has(event.id)) continue;
      seenIds.add(event.id);
      send(event.eventType, event);
    }

    if (detail.status === 'ready' || detail.status === 'promoted' || detail.status === 'failed') {
      send('done', { caseId: detail.caseId, status: detail.status });
      closeSoon();
    }
  };

  const pollInterval = setInterval(tick, 1000);
  const heartbeatInterval = setInterval(() => {
    if (closed) return;
    res.write(`event: ping\ndata: ${Date.now()}\n\n`);
  }, 15_000);

  tick();
});

router.post('/cases/:caseId/run', async (req: Request, res: Response) => {
  const teamId = req.params.id;
  const caseId = req.params.caseId;
  const row = loadCaseRow(teamId, caseId);

  if (!row) {
    res.status(404).json({ error: 'Case not found' });
    return;
  }
  if (row.status !== 'captured') {
    res.status(400).json({ error: `Case is not runnable from status ${row.status}` });
    return;
  }
  if (loadBranches(caseId).length > 0) {
    res.status(400).json({ error: 'Case already has branch history' });
    return;
  }

  const members = getTeamMembers(teamId);
  if (members.length === 0) {
    res.status(400).json({ error: 'team has no members' });
    return;
  }

  const snapshot = JSON.parse(row.snapshot_json);
  const snapshotHash = row.snapshot_hash as string;
  const decisionMode = row.decision_mode as ControlRoomDecisionMode;
  const mission = row.mission as string;

  try {
    updateCaseStatus(caseId, 'running', { error: null });

    const branchPlans = await buildControlRoomBranchPlans({
      mission,
      members,
      baselinePlan: req.body?.baselinePlan,
      baselineMaxParallel: typeof req.body?.maxParallel === 'number' ? req.body.maxParallel : 3,
      baselineFailFast: req.body?.failFast === undefined ? true : !!req.body.failFast,
    });

    for (const branchPlan of branchPlans) {
      const branchId = `cf_branch_${randomUUID().slice(0, 12)}`;
      db.prepare(
        `
        INSERT INTO counterfactual_branches (
          id, case_id, policy_pack_id, branch_kind, status, plan_json, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, 'planned', ?, ?, ?)
      `
      ).run(
        branchId,
        caseId,
        branchPlan.policyPackId,
        branchPlan.branchKind,
        JSON.stringify(branchPlan),
        nowUnix(),
        nowUnix()
      );

      appendCaseEvent({
        caseId,
        branchId,
        eventType: 'branch_planned',
        payload: {
          policyPackId: branchPlan.policyPackId,
          maxParallel: branchPlan.maxParallel,
          failFast: branchPlan.failFast,
          nodeCount: branchPlan.plan.nodes.length,
        },
      });
    }

    const branchRows = loadBranches(caseId);
    const branchSummaries: BranchExecutionSummary[] = [];

    for (const branchRow of branchRows) {
      const branchPlan = JSON.parse(branchRow.plan_json) as ControlRoomBranchPlan;
      const branchId = branchRow.id as string;

      db.prepare(
        `
        UPDATE counterfactual_branches
        SET status = 'running', updated_at = unixepoch()
        WHERE id = ?
      `
      ).run(branchId);

      appendCaseEvent({
        caseId,
        branchId,
        eventType: 'branch_started',
        payload: {
          policyPackId: branchPlan.policyPackId,
        },
      });

      try {
        const result = await executeSwarmRun({
          teamId,
          wallet: req.auth?.wallet ?? null,
          mission,
          plan: branchPlan.plan,
          members,
          maxParallel: branchPlan.maxParallel,
          failFast: branchPlan.failFast,
          idempotencyKey: null,
          executionMode: 'readonly',
          caseId,
          branchId,
          snapshotHash,
          allowedTools: Array.from(READONLY_TASK_EXECUTOR_ALLOWED_TOOLS),
          resolveExecutionContext: async ({ node, deps }) => {
            const reuseKey = computeReuseKey({
              snapshotHash,
              memberId: node.memberId,
              description: node.description,
              dependencyHash: dependencyHash(deps),
            });
            const reused = findReusableReadonlyNode({
              caseId,
              branchId,
              snapshotHash,
              reuseKey,
            });

            return reused
              ? {
                  reuseKey,
                  reused,
                }
              : { reuseKey };
          },
          onNodeReused: async ({ nodeId, fromRunId, reuseKey }) => {
            appendCaseEvent({
              caseId,
              branchId,
              eventType: 'node_reused',
              payload: {
                nodeId,
                fromRunId,
                reuseKey,
              },
            });
          },
        });

        const branchStatus = result.status === 'completed' ? 'completed' : 'failed';
        db.prepare(
          `
          UPDATE counterfactual_branches
          SET swarm_run_id = ?, status = ?, result_hash = ?, completed_at = unixepoch(), updated_at = unixepoch()
          WHERE id = ?
        `
        ).run(branchId, result.runId, branchStatus, result.hashes.resultsSha256, branchId);

        appendCaseEvent({
          caseId,
          branchId,
          eventType: 'branch_completed',
          payload: {
            policyPackId: branchPlan.policyPackId,
            swarmRunId: result.runId,
            status: branchStatus,
            totals: result.totals,
            timingMs: result.timingMs,
          },
        });

        branchSummaries.push({
          branchId,
          policyPackId: branchPlan.policyPackId,
          branchKind: branchPlan.branchKind,
          swarmRunId: result.runId,
          status: branchStatus,
          resultHash: result.hashes.resultsSha256,
          result,
        });
      } catch (error) {
        const synthetic = syntheticFailedRun({
          mission,
          plan: branchPlan.plan,
          error: error instanceof Error ? error.message : 'readonly branch failed',
        });

        db.prepare(
          `
          UPDATE counterfactual_branches
          SET status = 'failed', result_hash = ?, completed_at = unixepoch(), updated_at = unixepoch()
          WHERE id = ?
        `
        ).run(synthetic.hashes.resultsSha256, branchId);

        appendCaseEvent({
          caseId,
          branchId,
          eventType: 'branch_completed',
          payload: {
            policyPackId: branchPlan.policyPackId,
            swarmRunId: null,
            status: 'failed',
            error: error instanceof Error ? error.message : 'readonly branch failed',
          },
        });

        branchSummaries.push({
          branchId,
          policyPackId: branchPlan.policyPackId,
          branchKind: branchPlan.branchKind,
          swarmRunId: synthetic.runId,
          status: 'failed',
          resultHash: synthetic.hashes.resultsSha256,
          result: synthetic,
        });
      }
    }

    const scorecards = scoreBranches({ snapshot, branches: branchSummaries });
    const scorecardByBranchId = new Map(
      scorecards.map(scorecard => [scorecard.branchId, scorecard])
    );

    for (const scorecard of scorecards) {
      db.prepare(
        `
        UPDATE counterfactual_branches
        SET scorecard_json = ?, updated_at = unixepoch()
        WHERE id = ?
      `
      ).run(JSON.stringify(scorecard), scorecard.branchId);
    }

    appendCaseEvent({
      caseId,
      eventType: 'scoring_completed',
      payload: {
        branches: scorecards.map(scorecard => ({
          branchId: scorecard.branchId,
          finalScore: scorecard.finalScore,
        })),
      },
    });

    for (const branch of branchSummaries) {
      branch.scorecard = scorecardByBranchId.get(branch.branchId);
    }

    appendCaseEvent({
      caseId,
      eventType: 'adjudication_started',
      payload: {
        decisionMode,
      },
    });

    const adjudication = await adjudicateBranches({
      caseId,
      snapshotHash,
      decisionMode,
      branches: branchSummaries,
    });

    if (adjudication.committee) {
      db.prepare(
        `
        UPDATE counterfactual_branches
        SET committee_json = ?, updated_at = unixepoch()
        WHERE id = ?
      `
      ).run(JSON.stringify(adjudication.committee), adjudication.winnerBranchId);
    }

    appendCaseEvent({
      caseId,
      eventType: 'adjudication_completed',
      payload: adjudication as unknown as Record<string, unknown>,
    });

    updateCaseStatus(caseId, 'ready', {
      winnerBranchId: adjudication.winnerBranchId,
      completedAt: true,
      error: null,
    });

    res.json(loadControlRoomCaseDetail(teamId, caseId));
  } catch (error) {
    updateCaseStatus(caseId, 'failed', {
      completedAt: true,
      error: error instanceof Error ? error.message : 'case execution failed',
    });
    appendCaseEvent({
      caseId,
      eventType: 'case_failed',
      payload: {
        error: error instanceof Error ? error.message : 'case execution failed',
      },
    });
    res
      .status(500)
      .json({ error: error instanceof Error ? error.message : 'case execution failed' });
  }
});

router.post('/cases/:caseId/promote', async (req: Request, res: Response) => {
  const teamId = req.params.id;
  const caseId = req.params.caseId;
  const caseRow = loadCaseRow(teamId, caseId);

  if (!caseRow) {
    res.status(404).json({ error: 'Case not found' });
    return;
  }
  if (caseRow.status !== 'ready' && caseRow.status !== 'promoted') {
    res.status(400).json({ error: `Case is not promotable from status ${caseRow.status}` });
    return;
  }

  const branchId = typeof req.body?.branchId === 'string' ? req.body.branchId.trim() : '';
  if (!branchId) {
    res.status(400).json({ error: 'branchId required' });
    return;
  }

  const mode = req.body?.mode === 'manual' ? 'manual' : 'execute';
  const branchRow = db
    .prepare(
      `
    SELECT *
    FROM counterfactual_branches
    WHERE id = ? AND case_id = ?
  `
    )
    .get(branchId, caseId) as any;

  if (!branchRow) {
    res.status(404).json({ error: 'Branch not found' });
    return;
  }

  appendCaseEvent({
    caseId,
    branchId,
    eventType: 'promotion_started',
    payload: { mode },
  });

  if (mode === 'manual') {
    updateCaseStatus(caseId, 'ready', {
      winnerBranchId: branchId,
      error: null,
    });
    appendCaseEvent({
      caseId,
      branchId,
      eventType: 'promotion_completed',
      payload: { mode, promotedRunId: null },
    });
    res.json(loadControlRoomCaseDetail(teamId, caseId));
    return;
  }

  const members = getTeamMembers(teamId);
  if (members.length === 0) {
    res.status(400).json({ error: 'team has no members' });
    return;
  }

  try {
    const branchPlan = JSON.parse(branchRow.plan_json) as ControlRoomBranchPlan;
    const result = await executeSwarmRun({
      teamId,
      wallet: req.auth?.wallet ?? null,
      mission: caseRow.mission,
      plan: branchPlan.plan,
      members,
      maxParallel: branchPlan.maxParallel,
      failFast: branchPlan.failFast,
      idempotencyKey: null,
      executionMode: 'execute',
      caseId,
      branchId,
      snapshotHash: caseRow.snapshot_hash,
    });

    updateCaseStatus(caseId, 'promoted', {
      winnerBranchId: branchId,
      promotedRunId: result.runId,
      error: null,
    });

    appendCaseEvent({
      caseId,
      branchId,
      eventType: 'promotion_completed',
      payload: {
        mode,
        promotedRunId: result.runId,
      },
    });

    res.json(loadControlRoomCaseDetail(teamId, caseId));
  } catch (error) {
    updateCaseStatus(caseId, 'failed', {
      error: error instanceof Error ? error.message : 'promotion failed',
    });
    appendCaseEvent({
      caseId,
      branchId,
      eventType: 'case_failed',
      payload: {
        error: error instanceof Error ? error.message : 'promotion failed',
      },
    });
    res.status(500).json({ error: error instanceof Error ? error.message : 'promotion failed' });
  }
});

export default router;
