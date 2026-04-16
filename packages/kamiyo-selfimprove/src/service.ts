import { randomUUID } from 'crypto';
import { getContext } from './context';
import {
  type AgentGenome,
  type GenomeMutation,
  hashGenome,
  mutateGenome,
  validateGenome,
} from './genome';
import { sampleNormal, sampleStats, welchPTwoSided, welchT, type SampleStats } from './stats';

export type VariantStatus = 'active' | 'archived' | 'promoted';

export type AgentVariant = {
  id: string;
  parentId: string | null;
  agentId: string;
  taskType: string;
  genomeHash: string;
  genome: AgentGenome;
  status: VariantStatus;
  sampleCount: number;
  repScore: number;
  notes: string | null;
  createdAt: number;
  promotedAt: number | null;
  archivedAt: number | null;
};

type VariantRow = {
  id: string;
  parent_id: string | null;
  agent_id: string;
  task_type: string;
  genome_hash: string;
  genome_json: string;
  status: VariantStatus;
  sample_count: number;
  rep_score: number;
  notes: string | null;
  created_at: number;
  promoted_at: number | null;
  archived_at: number | null;
};

function rowToVariant(row: VariantRow): AgentVariant {
  return {
    id: row.id,
    parentId: row.parent_id,
    agentId: row.agent_id,
    taskType: row.task_type,
    genomeHash: row.genome_hash,
    genome: JSON.parse(row.genome_json) as AgentGenome,
    status: row.status,
    sampleCount: row.sample_count,
    repScore: row.rep_score,
    notes: row.notes,
    createdAt: row.created_at,
    promotedAt: row.promoted_at,
    archivedAt: row.archived_at,
  };
}

export type CreateVariantInput = {
  agentId: string;
  taskType: string;
  genome: AgentGenome | unknown;
  parentId?: string | null;
  notes?: string | null;
};

export function createVariant(input: CreateVariantInput): AgentVariant {
  const { db, metrics } = getContext();
  const genome = validateGenome(input.genome);
  const hash = hashGenome(genome);
  const id = randomUUID();

  const existing = db
    .prepare(
      'SELECT * FROM agent_variants WHERE agent_id = ? AND task_type = ? AND genome_hash = ?'
    )
    .get(input.agentId, input.taskType, hash) as VariantRow | undefined;

  if (existing) return rowToVariant(existing);

  db.prepare(
    `INSERT INTO agent_variants (id, parent_id, agent_id, task_type, genome_hash, genome_json, status, notes)
     VALUES (?, ?, ?, ?, ?, ?, 'active', ?)`
  ).run(
    id,
    input.parentId ?? null,
    input.agentId,
    input.taskType,
    hash,
    JSON.stringify(genome),
    input.notes ?? null
  );

  const row = db.prepare('SELECT * FROM agent_variants WHERE id = ?').get(id) as VariantRow;
  metrics.variantsCreated.inc({
    task_type: input.taskType,
    kind: input.parentId ? 'fork' : 'root',
  });
  return rowToVariant(row);
}

export function forkVariant(parentId: string, patch: GenomeMutation, notes?: string): AgentVariant {
  const parent = getVariant(parentId);
  if (!parent) throw new Error('parent variant not found');
  const genome = mutateGenome(parent.genome, patch);
  return createVariant({
    agentId: parent.agentId,
    taskType: parent.taskType,
    genome,
    parentId: parent.id,
    notes: notes ?? null,
  });
}

export function getVariant(id: string): AgentVariant | null {
  const { db } = getContext();
  const row = db.prepare('SELECT * FROM agent_variants WHERE id = ?').get(id) as
    | VariantRow
    | undefined;
  return row ? rowToVariant(row) : null;
}

export function listActiveVariants(taskType: string, agentId?: string): AgentVariant[] {
  const { db } = getContext();
  const rows = agentId
    ? (db
        .prepare(
          `SELECT * FROM agent_variants WHERE task_type = ? AND agent_id = ? AND status = 'active' ORDER BY rep_score DESC`
        )
        .all(taskType, agentId) as VariantRow[])
    : (db
        .prepare(
          `SELECT * FROM agent_variants WHERE task_type = ? AND status = 'active' ORDER BY rep_score DESC`
        )
        .all(taskType) as VariantRow[]);
  return rows.map(rowToVariant);
}

export type LeaderboardEntry = {
  variantId: string;
  agentId: string;
  status: VariantStatus;
  genomeHash: string;
  sampleCount: number;
  mean: number;
  ci95: [number, number];
  createdAt: number;
  promotedAt: number | null;
  notes: string | null;
};

export function getLeaderboard(taskType: string, limit = 20): LeaderboardEntry[] {
  const { db } = getContext();
  const variants = db
    .prepare(
      `SELECT * FROM agent_variants WHERE task_type = ? AND status IN ('active','promoted') ORDER BY rep_score DESC LIMIT ?`
    )
    .all(taskType, limit) as VariantRow[];

  return variants.map(row => {
    const scores = getVariantScores(row.id);
    const stats = sampleStats(scores);
    return {
      variantId: row.id,
      agentId: row.agent_id,
      status: row.status,
      genomeHash: row.genome_hash,
      sampleCount: stats.n,
      mean: stats.mean,
      ci95: ci95FromStats(stats),
      createdAt: row.created_at,
      promotedAt: row.promoted_at,
      notes: row.notes,
    };
  });
}

function ci95FromStats(stats: SampleStats): [number, number] {
  if (stats.n < 2) return [stats.mean, stats.mean];
  const sem = Math.sqrt(stats.variance / stats.n);
  const margin = 1.96 * sem;
  return [Math.max(0, stats.mean - margin), Math.min(1, stats.mean + margin)];
}

export function getVariantScores(variantId: string): number[] {
  const { db } = getContext();
  const rows = db
    .prepare(
      `SELECT quality_score FROM variant_tournament_entries
       WHERE variant_id = ? AND quality_score IS NOT NULL`
    )
    .all(variantId) as Array<{ quality_score: number | null }>;
  return rows.map(r => r.quality_score).filter((s): s is number => typeof s === 'number');
}

function beta(alpha: number, beta: number): number {
  return sampleGamma(alpha) / (sampleGamma(alpha) + sampleGamma(beta));
}

function sampleGamma(shape: number): number {
  if (shape < 1) return sampleGamma(shape + 1) * Math.pow(Math.random() || 1e-9, 1 / shape);
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (let attempt = 0; attempt < 1000; attempt++) {
    let x: number;
    let v: number;
    do {
      x = sampleNormal(0, 1);
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    const u = Math.random();
    if (u < 1 - 0.0331 * x * x * x * x) return d * v;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
  return d;
}

export function thompsonSample(variants: AgentVariant[]): AgentVariant | null {
  if (variants.length === 0) return null;
  let best: { v: AgentVariant; draw: number } | null = null;
  for (const v of variants) {
    const scores = getVariantScores(v.id);
    const stats = sampleStats(scores);
    const successes = Math.max(0, stats.mean * stats.n);
    const failures = Math.max(0, stats.n - successes);
    const alpha = 1 + successes;
    const betaParam = 1 + failures;
    let draw = beta(alpha, betaParam);
    if (!Number.isFinite(draw)) draw = Math.random();
    if (!best || draw > best.draw) best = { v, draw };
  }
  return best ? best.v : null;
}

export type PromotionResult =
  | { promoted: false; reason: string }
  | {
      promoted: true;
      variantId: string;
      previousDefaultId: string | null;
      pValue: number;
      uplift: number;
      sampleCount: number;
      eventId: string;
    };

export function evaluateAndPromote(
  taskType: string,
  options: { minSamples?: number; pThreshold?: number; receiptId?: string | null } = {}
): PromotionResult {
  const { db, metrics } = getContext();
  const minSamples = options.minSamples ?? 50;
  const pThreshold = options.pThreshold ?? 0.05;

  const candidates = listActiveVariants(taskType);
  if (candidates.length < 2) return { promoted: false, reason: 'need ≥2 active variants' };

  let currentDefault: AgentVariant | null = null;
  const promoted = db
    .prepare(
      `SELECT * FROM agent_variants WHERE task_type = ? AND status = 'promoted' ORDER BY promoted_at DESC LIMIT 1`
    )
    .get(taskType) as VariantRow | undefined;
  if (promoted) currentDefault = rowToVariant(promoted);

  const baseline = currentDefault ?? candidates[candidates.length - 1];
  const baselineScores = getVariantScores(baseline.id);
  const baselineStats = sampleStats(baselineScores);

  let best: { variant: AgentVariant; stats: SampleStats; p: number } | null = null;

  for (const candidate of candidates) {
    if (candidate.id === baseline.id) continue;
    const scores = getVariantScores(candidate.id);
    if (scores.length < minSamples) continue;
    const stats = sampleStats(scores);
    if (stats.mean <= baselineStats.mean) continue;
    const tw = welchT(stats, baselineStats);
    if (!tw) continue;
    const p = welchPTwoSided(tw.t, tw.df);
    if (p > pThreshold) continue;
    if (!best || stats.mean > best.stats.mean) best = { variant: candidate, stats, p };
  }

  if (!best) {
    metrics.variantPromotions.inc({ task_type: taskType, result: 'skipped' });
    return { promoted: false, reason: 'no candidate meets threshold' };
  }

  const now = Math.trunc(Date.now() / 1000);
  const eventId = randomUUID();

  type PromoteTx = { ok: true } | { ok: false; reason: string };

  const tx = db.transaction<PromoteTx>(() => {
    const raceCheck = db
      .prepare(
        `SELECT id FROM agent_variants WHERE task_type = ? AND status = 'promoted' ORDER BY promoted_at DESC LIMIT 1`
      )
      .get(taskType) as { id: string } | undefined;
    if ((raceCheck?.id ?? null) !== (currentDefault?.id ?? null)) {
      return { ok: false, reason: 'baseline changed during evaluation' };
    }
    const candidateRow = db
      .prepare(`SELECT status FROM agent_variants WHERE id = ?`)
      .get(best!.variant.id) as { status: VariantStatus } | undefined;
    if (candidateRow?.status !== 'active') {
      return { ok: false, reason: 'candidate no longer active' };
    }

    if (currentDefault) {
      db.prepare(
        `UPDATE agent_variants SET status = 'archived', archived_at = ? WHERE id = ? AND status = 'promoted'`
      ).run(now, currentDefault.id);
    }
    db.prepare(
      `UPDATE agent_variants SET status = 'promoted', promoted_at = ?, sample_count = ?, rep_score = ? WHERE id = ? AND status = 'active'`
    ).run(now, best!.stats.n, best!.stats.mean, best!.variant.id);

    db.prepare(
      `INSERT INTO variant_events (id, variant_id, kind, payload_json, receipt_id)
       VALUES (?, ?, 'promoted', ?, ?)`
    ).run(
      eventId,
      best!.variant.id,
      JSON.stringify({
        previousDefaultId: currentDefault?.id ?? null,
        pValue: best!.p,
        uplift: best!.stats.mean - baselineStats.mean,
        sampleCount: best!.stats.n,
      }),
      options.receiptId ?? null
    );
    return { ok: true };
  });

  const result = tx();
  if (!result.ok) {
    metrics.variantPromotions.inc({ task_type: taskType, result: 'race' });
    return { promoted: false, reason: result.reason };
  }

  metrics.variantPromotions.inc({ task_type: taskType, result: 'promoted' });
  return {
    promoted: true,
    variantId: best.variant.id,
    previousDefaultId: currentDefault?.id ?? null,
    pValue: best.p,
    uplift: best.stats.mean - baselineStats.mean,
    sampleCount: best.stats.n,
    eventId,
  };
}

export type RecordEntryResult = { ok: true; totalCost: number } | { ok: false; error: string };

export function recordTournamentEntry(params: {
  tournamentId: string;
  variantId: string;
  performanceEventId?: string | null;
  qualityScore?: number | null;
  cost?: number | null;
  latencyMs?: number | null;
  outcome?: string | null;
}): RecordEntryResult {
  const { db, metrics } = getContext();
  if (typeof params.qualityScore === 'number') {
    if (!Number.isFinite(params.qualityScore)) {
      metrics.variantEntries.inc({ result: 'invalid' });
      return { ok: false, error: 'qualityScore must be finite' };
    }
    if (params.qualityScore < 0 || params.qualityScore > 1) {
      metrics.variantEntries.inc({ result: 'invalid' });
      return { ok: false, error: 'qualityScore out of [0,1]' };
    }
  }
  const cost =
    typeof params.cost === 'number' && Number.isFinite(params.cost) ? Math.max(0, params.cost) : 0;

  const tx = db.transaction<RecordEntryResult>(() => {
    const tournament = db
      .prepare(`SELECT status, budget_cap FROM variant_tournaments WHERE id = ?`)
      .get(params.tournamentId) as { status: string; budget_cap: number } | undefined;
    if (!tournament) return { ok: false, error: 'tournament not found' };
    if (tournament.status === 'completed' || tournament.status === 'failed') {
      return { ok: false, error: 'tournament already finalized' };
    }

    const variant = db.prepare(`SELECT id FROM agent_variants WHERE id = ?`).get(params.variantId);
    if (!variant) return { ok: false, error: 'variant not found' };

    const totalsRow = db
      .prepare(
        `SELECT COALESCE(SUM(cost), 0) AS total FROM variant_tournament_entries WHERE tournament_id = ?`
      )
      .get(params.tournamentId) as { total: number };
    const projected = totalsRow.total + cost;
    if (tournament.budget_cap > 0 && projected > tournament.budget_cap) {
      return { ok: false, error: 'budget cap exceeded' };
    }

    db.prepare(
      `INSERT INTO variant_tournament_entries
        (tournament_id, variant_id, performance_event_id, quality_score, cost, latency_ms, outcome)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      params.tournamentId,
      params.variantId,
      params.performanceEventId ?? null,
      typeof params.qualityScore === 'number' ? params.qualityScore : null,
      cost,
      typeof params.latencyMs === 'number' && Number.isFinite(params.latencyMs)
        ? Math.max(0, Math.trunc(params.latencyMs))
        : null,
      typeof params.outcome === 'string' ? params.outcome : null
    );

    if (typeof params.qualityScore === 'number') {
      const scores = getVariantScores(params.variantId);
      const stats = sampleStats(scores);
      db.prepare(`UPDATE agent_variants SET sample_count = ?, rep_score = ? WHERE id = ?`).run(
        stats.n,
        stats.mean,
        params.variantId
      );
    }

    return { ok: true, totalCost: projected };
  });

  const out = tx();
  metrics.variantEntries.inc({ result: out.ok ? 'ok' : 'rejected' });
  return out;
}
