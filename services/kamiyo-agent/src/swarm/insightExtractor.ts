/**
 * Observation Extraction Before Pruning
 *
 * Extracts aggregate insights from swarm job history before retention
 * prunes the raw data. Compounding intelligence over time — agents learn
 * from patterns that would otherwise be deleted.
 *
 * @module swarm/insightExtractor
 */

export type AgentInsight = {
  agentId: string;
  successRate: number;
  preferredSources: string[];
  avgMarginSol: number;
  bestTimeOfDayUtcHour: number | null;
  totalJobs: number;
  extractedAt: string;
};

export type SourceInsight = {
  source: string;
  reliability: number;
  avgPayoutSol: number;
  avgResponseTimeMs: number | null;
  totalJobs: number;
  extractedAt: string;
};

export type InsightSnapshot = {
  agents: AgentInsight[];
  sources: SourceInsight[];
  extractedAt: string;
};

type SwarmJobLike = {
  id: string;
  agentId: string;
  source: string;
  status: 'executed' | 'failed' | 'skipped';
  revenueSol: number;
  revenueUsd: number;
  executedAt: string;
};

export function extractAgentInsights(jobs: SwarmJobLike[], nowIso: string): AgentInsight[] {
  if (jobs.length === 0) return [];

  const groups = new Map<
    string,
    {
      total: number;
      succeeded: number;
      totalRevenueSol: number;
      sources: Map<string, number>;
      hourBuckets: Map<number, number>;
    }
  >();

  for (const job of jobs) {
    const g = groups.get(job.agentId) ?? {
      total: 0,
      succeeded: 0,
      totalRevenueSol: 0,
      sources: new Map<string, number>(),
      hourBuckets: new Map<number, number>(),
    };

    g.total += 1;
    if (job.status === 'executed') g.succeeded += 1;
    g.totalRevenueSol += job.revenueSol;

    const srcCount = g.sources.get(job.source) ?? 0;
    g.sources.set(job.source, srcCount + 1);

    const hour = parseHourUtc(job.executedAt);
    if (hour !== null) {
      const hCount = g.hourBuckets.get(hour) ?? 0;
      g.hourBuckets.set(hour, hCount + 1);
    }

    groups.set(job.agentId, g);
  }

  const insights: AgentInsight[] = [];

  for (const [agentId, g] of groups) {
    const preferredSources = topNKeys(g.sources, 3);
    const bestHour = topNKeys(g.hourBuckets, 1);

    insights.push({
      agentId,
      successRate: g.total > 0 ? g.succeeded / g.total : 0,
      preferredSources,
      avgMarginSol: g.total > 0 ? g.totalRevenueSol / g.total : 0,
      bestTimeOfDayUtcHour: bestHour.length > 0 ? Number(bestHour[0]) : null,
      totalJobs: g.total,
      extractedAt: nowIso,
    });
  }

  return insights.sort((a, b) => a.agentId.localeCompare(b.agentId));
}

export function extractSourceInsights(jobs: SwarmJobLike[], nowIso: string): SourceInsight[] {
  if (jobs.length === 0) return [];

  const groups = new Map<string, { total: number; succeeded: number; totalRevenueSol: number }>();

  for (const job of jobs) {
    const g = groups.get(job.source) ?? { total: 0, succeeded: 0, totalRevenueSol: 0 };
    g.total += 1;
    if (job.status === 'executed') g.succeeded += 1;
    g.totalRevenueSol += job.revenueSol;
    groups.set(job.source, g);
  }

  const insights: SourceInsight[] = [];

  for (const [source, g] of groups) {
    insights.push({
      source,
      reliability: g.total > 0 ? g.succeeded / g.total : 0,
      avgPayoutSol: g.total > 0 ? g.totalRevenueSol / g.total : 0,
      avgResponseTimeMs: null, // not tracked in current schema
      totalJobs: g.total,
      extractedAt: nowIso,
    });
  }

  return insights.sort((a, b) => a.source.localeCompare(b.source));
}

export function mergeInsightSnapshots(
  existing: InsightSnapshot | null,
  fresh: InsightSnapshot
): InsightSnapshot {
  if (!existing) return fresh;

  const mergedAgents = mergeByKey(existing.agents, fresh.agents, a => a.agentId, mergeAgentInsight);

  const mergedSources = mergeByKey(
    existing.sources,
    fresh.sources,
    s => s.source,
    mergeSourceInsight
  );

  return {
    agents: mergedAgents,
    sources: mergedSources,
    extractedAt: fresh.extractedAt,
  };
}

export function parseInsightSnapshot(raw: string | undefined): InsightSnapshot | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    if (!Array.isArray(parsed.agents) || !Array.isArray(parsed.sources)) return null;
    return parsed as InsightSnapshot;
  } catch {
    return null;
  }
}

// ── Helpers ────────────────────────────────────────────────────────────

function parseHourUtc(iso: string): number | null {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return null;
  return d.getUTCHours();
}

function topNKeys<V extends number>(map: Map<string | number, V>, n: number): string[] {
  return Array.from(map.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([k]) => String(k));
}

function mergeByKey<T>(
  existing: T[],
  fresh: T[],
  keyFn: (item: T) => string,
  mergeFn: (existing: T, fresh: T) => T
): T[] {
  const map = new Map<string, T>();
  for (const item of existing) map.set(keyFn(item), item);
  for (const item of fresh) {
    const prev = map.get(keyFn(item));
    map.set(keyFn(item), prev ? mergeFn(prev, item) : item);
  }
  return Array.from(map.values()).sort((a, b) => keyFn(a).localeCompare(keyFn(b)));
}

function mergeAgentInsight(existing: AgentInsight, fresh: AgentInsight): AgentInsight {
  const totalJobs = existing.totalJobs + fresh.totalJobs;
  const totalSucceeded =
    existing.successRate * existing.totalJobs + fresh.successRate * fresh.totalJobs;

  // Deduplicate preferred sources, keeping order from fresh first
  const sources = [...new Set([...fresh.preferredSources, ...existing.preferredSources])].slice(
    0,
    3
  );

  return {
    agentId: fresh.agentId,
    successRate: totalJobs > 0 ? totalSucceeded / totalJobs : 0,
    preferredSources: sources,
    avgMarginSol:
      totalJobs > 0
        ? (existing.avgMarginSol * existing.totalJobs + fresh.avgMarginSol * fresh.totalJobs) /
          totalJobs
        : 0,
    bestTimeOfDayUtcHour: fresh.bestTimeOfDayUtcHour ?? existing.bestTimeOfDayUtcHour,
    totalJobs,
    extractedAt: fresh.extractedAt,
  };
}

function mergeSourceInsight(existing: SourceInsight, fresh: SourceInsight): SourceInsight {
  const totalJobs = existing.totalJobs + fresh.totalJobs;
  const totalSucceeded =
    existing.reliability * existing.totalJobs + fresh.reliability * fresh.totalJobs;

  return {
    source: fresh.source,
    reliability: totalJobs > 0 ? totalSucceeded / totalJobs : 0,
    avgPayoutSol:
      totalJobs > 0
        ? (existing.avgPayoutSol * existing.totalJobs + fresh.avgPayoutSol * fresh.totalJobs) /
          totalJobs
        : 0,
    avgResponseTimeMs: fresh.avgResponseTimeMs ?? existing.avgResponseTimeMs,
    totalJobs,
    extractedAt: fresh.extractedAt,
  };
}
