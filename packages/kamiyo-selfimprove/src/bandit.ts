import { randomUUID } from 'crypto';
import { getContext } from './context';
import { type AgentVariant, listActiveVariants, thompsonSample } from './service';
import { createTournament } from './tournament';

export type StandingTournament = {
  id: string;
  taskType: string;
  windowStart: number;
  windowEnd: number;
};

const DEFAULT_WINDOW_SECS = 7 * 24 * 3600;
const DEFAULT_BUDGET_USD = 25;
const DEFAULT_MAX_PARTICIPANTS = 8;

export function getOrCreateStandingTournament(
  taskType: string,
  opts: { windowSecs?: number; budgetUsd?: number; maxParticipants?: number } = {}
): StandingTournament {
  const { db } = getContext();
  const windowSecs = opts.windowSecs ?? DEFAULT_WINDOW_SECS;
  const now = Math.trunc(Date.now() / 1000);

  const existing = db
    .prepare(
      `SELECT id, started_at FROM variant_tournaments
       WHERE task_type = ? AND status IN ('pending','running')
         AND started_at >= ?
       ORDER BY started_at DESC LIMIT 1`
    )
    .get(taskType, now - windowSecs) as { id: string; started_at: number } | undefined;

  if (existing) {
    return {
      id: existing.id,
      taskType,
      windowStart: existing.started_at,
      windowEnd: existing.started_at + windowSecs,
    };
  }

  const tournament = createTournament({
    taskType,
    maxParticipants: opts.maxParticipants ?? DEFAULT_MAX_PARTICIPANTS,
    budgetCap: opts.budgetUsd ?? DEFAULT_BUDGET_USD,
    policy: { standing: true, windowSecs },
  });

  db.prepare(`UPDATE variant_tournaments SET status = 'running' WHERE id = ?`).run(tournament.id);

  return {
    id: tournament.id,
    taskType,
    windowStart: tournament.startedAt,
    windowEnd: tournament.startedAt + windowSecs,
  };
}

export type RouteDecision = {
  variant: AgentVariant;
  tournamentId: string;
  decisionId: string;
  strategy: 'thompson' | 'promoted' | 'fallback';
};

export function isBanditRoutingEnabled(): boolean {
  return (process.env.VARIANT_ROUTING_ENABLED ?? '').trim() === 'true';
}

export function routeVariant(
  taskType: string,
  opts: { agentId?: string; forceStrategy?: RouteDecision['strategy'] } = {}
): RouteDecision | null {
  const { db, metrics } = getContext();
  const active = listActiveVariants(taskType, opts.agentId);

  const promoted = db
    .prepare(
      `SELECT * FROM agent_variants
       WHERE task_type = ? AND status = 'promoted'
       ORDER BY promoted_at DESC LIMIT 1`
    )
    .get(taskType) as Record<string, unknown> | undefined;

  if (active.length === 0 && !promoted) {
    metrics.banditDecisions.inc({ task_type: taskType, strategy: 'none', result: 'empty' });
    return null;
  }

  if (opts.forceStrategy === 'promoted' && promoted) {
    return fromPromoted(taskType, promoted);
  }

  if (active.length === 0 && promoted) {
    return fromPromoted(taskType, promoted);
  }

  const picked = thompsonSample(active);
  if (!picked) {
    if (promoted) return fromPromoted(taskType, promoted);
    return null;
  }

  const tournament = getOrCreateStandingTournament(taskType);
  metrics.banditDecisions.inc({ task_type: taskType, strategy: 'thompson', result: 'ok' });
  return {
    variant: picked,
    tournamentId: tournament.id,
    decisionId: randomUUID(),
    strategy: 'thompson',
  };
}

function fromPromoted(taskType: string, row: Record<string, unknown>): RouteDecision {
  const { metrics } = getContext();
  const tournament = getOrCreateStandingTournament(taskType);
  metrics.banditDecisions.inc({ task_type: taskType, strategy: 'promoted', result: 'ok' });
  return {
    variant: {
      id: row.id as string,
      parentId: (row.parent_id as string) ?? null,
      agentId: row.agent_id as string,
      taskType: row.task_type as string,
      genomeHash: row.genome_hash as string,
      genome: JSON.parse(row.genome_json as string),
      status: row.status as AgentVariant['status'],
      sampleCount: row.sample_count as number,
      repScore: row.rep_score as number,
      notes: (row.notes as string) ?? null,
      createdAt: row.created_at as number,
      promotedAt: (row.promoted_at as number) ?? null,
      archivedAt: (row.archived_at as number) ?? null,
    },
    tournamentId: tournament.id,
    decisionId: randomUUID(),
    strategy: 'promoted',
  };
}

export function listTaskTypes(): string[] {
  const { db } = getContext();
  const rows = db
    .prepare(`SELECT DISTINCT task_type FROM agent_variants WHERE status IN ('active','promoted')`)
    .all() as Array<{ task_type: string }>;
  return rows.map(r => r.task_type);
}

export type SweepResult = {
  taskType: string;
  promoted: boolean;
  reason?: string;
  variantId?: string;
};

export async function sweepPromotions(
  opts: { minSamples?: number; pThreshold?: number } = {}
): Promise<SweepResult[]> {
  const { metrics } = getContext();
  const { evaluateAndPromote } = await import('./service');
  const results: SweepResult[] = [];
  for (const taskType of listTaskTypes()) {
    const r = evaluateAndPromote(taskType, opts);
    if (r.promoted) {
      metrics.banditSweepPromotions.inc({ task_type: taskType, result: 'promoted' });
      results.push({ taskType, promoted: true, variantId: r.variantId });
    } else {
      metrics.banditSweepPromotions.inc({ task_type: taskType, result: 'skipped' });
      results.push({ taskType, promoted: false, reason: r.reason });
    }
  }
  return results;
}
