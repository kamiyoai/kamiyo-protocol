import { randomUUID } from 'crypto';
import db from '../db';
import {
  type AgentVariant,
  type RecordEntryResult,
  listActiveVariants,
  recordTournamentEntry,
  thompsonSample,
} from './service';
import { variantTournamentsTotal } from '../metrics';

export type TournamentStatus = 'pending' | 'running' | 'completed' | 'failed';

export type TournamentOptions = {
  taskType: string;
  maxParticipants: number;
  budgetCap: number;
  policy?: Record<string, unknown>;
  receiptId?: string | null;
};

export type Tournament = {
  id: string;
  taskType: string;
  status: TournamentStatus;
  maxParticipants: number;
  budgetCap: number;
  participants: AgentVariant[];
  startedAt: number;
  completedAt: number | null;
  winnerVariantId: string | null;
};

export function createTournament(opts: TournamentOptions): Tournament {
  const id = randomUUID();
  const max = Math.max(2, Math.min(16, Math.trunc(opts.maxParticipants)));
  const budget = Math.max(0, Number(opts.budgetCap));

  db.prepare(
    `INSERT INTO variant_tournaments
       (id, task_type, status, max_participants, budget_cap, policy_json, receipt_id)
     VALUES (?, ?, 'pending', ?, ?, ?, ?)`
  ).run(
    id,
    opts.taskType,
    max,
    budget,
    opts.policy ? JSON.stringify(opts.policy) : null,
    opts.receiptId ?? null
  );

  const candidates = listActiveVariants(opts.taskType);
  const participants: AgentVariant[] = [];
  const pool = [...candidates];
  while (participants.length < Math.min(max, candidates.length) && pool.length > 0) {
    const picked = thompsonSample(pool);
    if (!picked) break;
    participants.push(picked);
    const idx = pool.findIndex(p => p.id === picked.id);
    if (idx >= 0) pool.splice(idx, 1);
  }

  variantTournamentsTotal.inc({ task_type: opts.taskType });

  return {
    id,
    taskType: opts.taskType,
    status: 'pending',
    maxParticipants: max,
    budgetCap: budget,
    participants,
    startedAt: Math.trunc(Date.now() / 1000),
    completedAt: null,
    winnerVariantId: null,
  };
}

const ALLOWED_TRANSITIONS: Record<TournamentStatus, TournamentStatus[]> = {
  pending: ['running', 'failed'],
  running: ['completed', 'failed'],
  completed: [],
  failed: [],
};

export type MarkStatusResult = { ok: true } | { ok: false; error: string };

export function markTournamentStatus(
  id: string,
  status: TournamentStatus,
  winnerVariantId?: string | null
): MarkStatusResult {
  const row = db.prepare(`SELECT status FROM variant_tournaments WHERE id = ?`).get(id) as
    | { status: TournamentStatus }
    | undefined;
  if (!row) return { ok: false, error: 'tournament not found' };
  if (!ALLOWED_TRANSITIONS[row.status].includes(status)) {
    return { ok: false, error: `invalid transition ${row.status} → ${status}` };
  }
  const completedAt =
    status === 'completed' || status === 'failed' ? Math.trunc(Date.now() / 1000) : null;
  db.prepare(
    `UPDATE variant_tournaments
       SET status = ?,
           winner_variant_id = COALESCE(?, winner_variant_id),
           completed_at = COALESCE(?, completed_at)
     WHERE id = ? AND status = ?`
  ).run(status, winnerVariantId ?? null, completedAt, id, row.status);
  return { ok: true };
}

export function recordParticipantResult(params: {
  tournamentId: string;
  variantId: string;
  performanceEventId?: string | null;
  qualityScore?: number | null;
  cost?: number | null;
  latencyMs?: number | null;
  outcome?: string | null;
}): RecordEntryResult {
  return recordTournamentEntry(params);
}

export function getTournament(id: string): Tournament | null {
  const row = db.prepare('SELECT * FROM variant_tournaments WHERE id = ?').get(id) as
    | {
        id: string;
        task_type: string;
        status: TournamentStatus;
        max_participants: number;
        budget_cap: number;
        started_at: number;
        completed_at: number | null;
        winner_variant_id: string | null;
      }
    | undefined;
  if (!row) return null;

  const entries = db
    .prepare(
      `SELECT v.* FROM variant_tournament_entries e
       JOIN agent_variants v ON v.id = e.variant_id
       WHERE e.tournament_id = ?`
    )
    .all(id) as Array<Record<string, unknown>>;

  const participants: AgentVariant[] = entries.map(r => ({
    id: r.id as string,
    parentId: (r.parent_id as string) ?? null,
    agentId: r.agent_id as string,
    taskType: r.task_type as string,
    genomeHash: r.genome_hash as string,
    genome: JSON.parse(r.genome_json as string),
    status: r.status as AgentVariant['status'],
    sampleCount: r.sample_count as number,
    repScore: r.rep_score as number,
    notes: (r.notes as string) ?? null,
    createdAt: r.created_at as number,
    promotedAt: (r.promoted_at as number) ?? null,
    archivedAt: (r.archived_at as number) ?? null,
  }));

  return {
    id: row.id,
    taskType: row.task_type,
    status: row.status,
    maxParticipants: row.max_participants,
    budgetCap: row.budget_cap,
    participants,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    winnerVariantId: row.winner_variant_id,
  };
}

export function totalTournamentCost(tournamentId: string): number {
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(cost), 0) AS total FROM variant_tournament_entries WHERE tournament_id = ?`
    )
    .get(tournamentId) as { total: number };
  return row.total;
}
