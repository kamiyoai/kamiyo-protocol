import { getContext } from './context';

export type ParetoObjective = 'quality' | 'cost' | 'latency';

export type ParetoEntry = {
  variantId: string;
  agentId: string;
  status: string;
  meanQuality: number;
  meanCost: number;
  meanLatencyMs: number;
  sampleCount: number;
  dominatedBy: string[];
};

type AggregateRow = {
  variant_id: string;
  agent_id: string;
  status: string;
  n: number;
  mean_quality: number | null;
  mean_cost: number | null;
  mean_latency: number | null;
};

function dominates(a: ParetoEntry, b: ParetoEntry): boolean {
  const qualityOK = a.meanQuality >= b.meanQuality;
  const costOK = a.meanCost <= b.meanCost;
  const latencyOK = a.meanLatencyMs <= b.meanLatencyMs;
  const strictlyBetter =
    a.meanQuality > b.meanQuality || a.meanCost < b.meanCost || a.meanLatencyMs < b.meanLatencyMs;
  return qualityOK && costOK && latencyOK && strictlyBetter;
}

export type ParetoOptions = {
  minSamples?: number;
  includeArchived?: boolean;
};

export function getParetoFrontier(taskType: string, opts: ParetoOptions = {}): ParetoEntry[] {
  const { db } = getContext();
  const minSamples = opts.minSamples ?? 10;
  const statusFilter = opts.includeArchived
    ? "('active','promoted','archived')"
    : "('active','promoted')";

  const rows = db
    .prepare(
      `SELECT
         v.id AS variant_id,
         v.agent_id,
         v.status,
         COUNT(e.quality_score) AS n,
         AVG(e.quality_score) AS mean_quality,
         AVG(e.cost) AS mean_cost,
         AVG(e.latency_ms) AS mean_latency
       FROM agent_variants v
       LEFT JOIN variant_tournament_entries e ON e.variant_id = v.id
       WHERE v.task_type = ? AND v.status IN ${statusFilter}
       GROUP BY v.id
       HAVING n >= ?`
    )
    .all(taskType, minSamples) as AggregateRow[];

  const entries: ParetoEntry[] = rows
    .filter(r => r.mean_quality !== null)
    .map(r => ({
      variantId: r.variant_id,
      agentId: r.agent_id,
      status: r.status,
      meanQuality: r.mean_quality ?? 0,
      meanCost: r.mean_cost ?? 0,
      meanLatencyMs: r.mean_latency ?? 0,
      sampleCount: r.n,
      dominatedBy: [],
    }));

  for (const e of entries) {
    for (const other of entries) {
      if (other.variantId === e.variantId) continue;
      if (dominates(other, e)) e.dominatedBy.push(other.variantId);
    }
  }

  return entries
    .filter(e => e.dominatedBy.length === 0)
    .sort((a, b) => b.meanQuality - a.meanQuality);
}

export function getAllWithDomination(taskType: string, opts: ParetoOptions = {}): ParetoEntry[] {
  const { db } = getContext();
  const minSamples = opts.minSamples ?? 10;
  const statusFilter = opts.includeArchived
    ? "('active','promoted','archived')"
    : "('active','promoted')";

  const rows = db
    .prepare(
      `SELECT
         v.id AS variant_id,
         v.agent_id,
         v.status,
         COUNT(e.quality_score) AS n,
         AVG(e.quality_score) AS mean_quality,
         AVG(e.cost) AS mean_cost,
         AVG(e.latency_ms) AS mean_latency
       FROM agent_variants v
       LEFT JOIN variant_tournament_entries e ON e.variant_id = v.id
       WHERE v.task_type = ? AND v.status IN ${statusFilter}
       GROUP BY v.id
       HAVING n >= ?`
    )
    .all(taskType, minSamples) as AggregateRow[];

  const entries: ParetoEntry[] = rows
    .filter(r => r.mean_quality !== null)
    .map(r => ({
      variantId: r.variant_id,
      agentId: r.agent_id,
      status: r.status,
      meanQuality: r.mean_quality ?? 0,
      meanCost: r.mean_cost ?? 0,
      meanLatencyMs: r.mean_latency ?? 0,
      sampleCount: r.n,
      dominatedBy: [],
    }));

  for (const e of entries) {
    for (const other of entries) {
      if (other.variantId === e.variantId) continue;
      if (dominates(other, e)) e.dominatedBy.push(other.variantId);
    }
  }

  return entries.sort((a, b) => b.meanQuality - a.meanQuality);
}
