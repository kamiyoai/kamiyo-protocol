import { randomUUID } from 'crypto';
import db from './db';
import { logger } from './logger';

const EWMA_ALPHA = 0.2;

export type PerformanceOutcome = 'completed' | 'failed' | 'skipped';

export type RecordPerformanceInput = {
  agentId: string;
  runId?: string | null;
  nodeId?: string | null;
  taskType: string;
  cost: number;
  latencyMs: number;
  outcome: PerformanceOutcome;
  qualityScore?: number | null;
  qualityRationale?: string | null;
  gradedBy?: string | null;
  receiptId?: string | null;
  metadata?: Record<string, unknown>;
};

export type PerformanceEvent = {
  id: string;
  agentId: string;
  runId: string | null;
  nodeId: string | null;
  taskType: string;
  cost: number;
  latencyMs: number;
  qualityScore: number | null;
  qualityRationale: string | null;
  gradedBy: string | null;
  receiptId: string | null;
  reputationDelta: number | null;
  outcome: PerformanceOutcome;
  metadata: Record<string, unknown> | null;
  createdAt: number;
};

type RepRow = {
  agent_id: string;
  task_type: string;
  sample_count: number;
  ewma_score: number;
  ewma_cost: number;
  ewma_latency_ms: number;
  last_event_id: string | null;
  updated_at: number;
};

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function ewma(prev: number, sample: number, alpha: number): number {
  return alpha * sample + (1 - alpha) * prev;
}

export function recordAgentPerformance(input: RecordPerformanceInput): PerformanceEvent {
  const id = `perf_${randomUUID().slice(0, 12)}`;
  const agentId = input.agentId.trim();
  const taskType = (input.taskType || 'unknown').trim();
  if (!agentId) throw new Error('agentId required');

  const qualityScore =
    input.qualityScore === null || input.qualityScore === undefined
      ? null
      : clamp01(input.qualityScore);
  const metadataJson = input.metadata ? JSON.stringify(input.metadata) : null;
  const createdAt = Math.floor(Date.now() / 1000);

  const tx = db.transaction(() => {
    let reputationDelta: number | null = null;

    if (qualityScore !== null) {
      const prev = db
        .prepare(
          `SELECT agent_id, task_type, sample_count, ewma_score, ewma_cost, ewma_latency_ms, last_event_id, updated_at
           FROM agent_reputation WHERE agent_id = ? AND task_type = ?`
        )
        .get(agentId, taskType) as RepRow | undefined;

      const prevScore = prev?.ewma_score ?? 0;
      const prevSampleCount = prev?.sample_count ?? 0;
      const nextScore = prevSampleCount === 0 ? qualityScore : ewma(prevScore, qualityScore, EWMA_ALPHA);
      const nextCost = prevSampleCount === 0 ? input.cost : ewma(prev?.ewma_cost ?? 0, input.cost, EWMA_ALPHA);
      const nextLatency =
        prevSampleCount === 0
          ? input.latencyMs
          : ewma(prev?.ewma_latency_ms ?? 0, input.latencyMs, EWMA_ALPHA);

      reputationDelta = nextScore - prevScore;

      db.prepare(
        `INSERT INTO agent_reputation (agent_id, task_type, sample_count, ewma_score, ewma_cost, ewma_latency_ms, last_event_id, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(agent_id, task_type) DO UPDATE SET
           sample_count = excluded.sample_count,
           ewma_score = excluded.ewma_score,
           ewma_cost = excluded.ewma_cost,
           ewma_latency_ms = excluded.ewma_latency_ms,
           last_event_id = excluded.last_event_id,
           updated_at = excluded.updated_at`
      ).run(agentId, taskType, prevSampleCount + 1, nextScore, nextCost, nextLatency, id, createdAt);
    }

    db.prepare(
      `INSERT INTO agent_performance_events
         (id, agent_id, run_id, node_id, task_type, cost, latency_ms, quality_score,
          quality_rationale, graded_by, receipt_id, reputation_delta, outcome, metadata_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      agentId,
      input.runId ?? null,
      input.nodeId ?? null,
      taskType,
      input.cost,
      Math.max(0, Math.floor(input.latencyMs)),
      qualityScore,
      input.qualityRationale ?? null,
      input.gradedBy ?? null,
      input.receiptId ?? null,
      reputationDelta,
      input.outcome,
      metadataJson,
      createdAt
    );

    return reputationDelta;
  });

  let reputationDelta: number | null = null;
  try {
    reputationDelta = tx();
  } catch (err) {
    logger.error('failed to record agent performance', {
      err: err instanceof Error ? err.message : String(err),
      agentId,
      taskType,
    });
    throw err;
  }

  return {
    id,
    agentId,
    runId: input.runId ?? null,
    nodeId: input.nodeId ?? null,
    taskType,
    cost: input.cost,
    latencyMs: Math.max(0, Math.floor(input.latencyMs)),
    qualityScore,
    qualityRationale: input.qualityRationale ?? null,
    gradedBy: input.gradedBy ?? null,
    receiptId: input.receiptId ?? null,
    reputationDelta,
    outcome: input.outcome,
    metadata: input.metadata ?? null,
    createdAt,
  };
}

export type ScoreNodeInput = {
  runId: string;
  nodeId: string;
  qualityScore: number;
  qualityRationale?: string;
  gradedBy: string;
};

export function applyQualityScoreToEvent(input: ScoreNodeInput): PerformanceEvent | null {
  const event = db
    .prepare(
      `SELECT id, agent_id, run_id, node_id, task_type, cost, latency_ms, quality_score,
              reputation_delta, outcome, metadata_json, receipt_id, created_at
       FROM agent_performance_events
       WHERE run_id = ? AND node_id = ?
       ORDER BY created_at DESC LIMIT 1`
    )
    .get(input.runId, input.nodeId) as
    | {
        id: string;
        agent_id: string;
        run_id: string;
        node_id: string;
        task_type: string;
        cost: number;
        latency_ms: number;
        quality_score: number | null;
        reputation_delta: number | null;
        outcome: PerformanceOutcome;
        metadata_json: string | null;
        receipt_id: string | null;
        created_at: number;
      }
    | undefined;

  if (!event) return null;

  const qualityScore = clamp01(input.qualityScore);

  const tx = db.transaction(() => {
    const prev = db
      .prepare(
        `SELECT agent_id, task_type, sample_count, ewma_score, ewma_cost, ewma_latency_ms
         FROM agent_reputation WHERE agent_id = ? AND task_type = ?`
      )
      .get(event.agent_id, event.task_type) as RepRow | undefined;

    const prevScore = prev?.ewma_score ?? 0;
    const prevSampleCount = prev?.sample_count ?? 0;
    const nextScore = prevSampleCount === 0 ? qualityScore : ewma(prevScore, qualityScore, EWMA_ALPHA);
    const reputationDelta = nextScore - prevScore;

    db.prepare(
      `INSERT INTO agent_reputation (agent_id, task_type, sample_count, ewma_score, ewma_cost, ewma_latency_ms, last_event_id, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, unixepoch())
       ON CONFLICT(agent_id, task_type) DO UPDATE SET
         sample_count = excluded.sample_count,
         ewma_score = excluded.ewma_score,
         last_event_id = excluded.last_event_id,
         updated_at = excluded.updated_at`
    ).run(
      event.agent_id,
      event.task_type,
      prevSampleCount + 1,
      nextScore,
      prev?.ewma_cost ?? event.cost,
      prev?.ewma_latency_ms ?? event.latency_ms,
      event.id
    );

    db.prepare(
      `UPDATE agent_performance_events
       SET quality_score = ?, quality_rationale = ?, graded_by = ?, reputation_delta = ?
       WHERE id = ?`
    ).run(qualityScore, input.qualityRationale ?? null, input.gradedBy, reputationDelta, event.id);

    return reputationDelta;
  });

  const reputationDelta = tx();

  return {
    id: event.id,
    agentId: event.agent_id,
    runId: event.run_id,
    nodeId: event.node_id,
    taskType: event.task_type,
    cost: event.cost,
    latencyMs: event.latency_ms,
    qualityScore,
    qualityRationale: input.qualityRationale ?? null,
    gradedBy: input.gradedBy,
    receiptId: event.receipt_id,
    reputationDelta,
    outcome: event.outcome,
    metadata: event.metadata_json ? safeJson(event.metadata_json) : null,
    createdAt: event.created_at,
  };
}

function safeJson(s: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(s);
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export type AgentPerformanceSummary = {
  agentId: string;
  byTaskType: Array<{
    taskType: string;
    sampleCount: number;
    ewmaScore: number;
    ewmaCost: number;
    ewmaLatencyMs: number;
    updatedAt: number;
  }>;
  recentEvents: PerformanceEvent[];
};

export function getAgentPerformance(agentId: string, limit = 50): AgentPerformanceSummary {
  const reps = db
    .prepare(
      `SELECT task_type, sample_count, ewma_score, ewma_cost, ewma_latency_ms, updated_at
       FROM agent_reputation WHERE agent_id = ? ORDER BY updated_at DESC`
    )
    .all(agentId) as Array<{
    task_type: string;
    sample_count: number;
    ewma_score: number;
    ewma_cost: number;
    ewma_latency_ms: number;
    updated_at: number;
  }>;

  const events = db
    .prepare(
      `SELECT id, agent_id, run_id, node_id, task_type, cost, latency_ms, quality_score,
              quality_rationale, graded_by, receipt_id, reputation_delta, outcome, metadata_json, created_at
       FROM agent_performance_events
       WHERE agent_id = ?
       ORDER BY created_at DESC
       LIMIT ?`
    )
    .all(agentId, Math.max(1, Math.min(500, limit))) as Array<{
    id: string;
    agent_id: string;
    run_id: string | null;
    node_id: string | null;
    task_type: string;
    cost: number;
    latency_ms: number;
    quality_score: number | null;
    quality_rationale: string | null;
    graded_by: string | null;
    receipt_id: string | null;
    reputation_delta: number | null;
    outcome: PerformanceOutcome;
    metadata_json: string | null;
    created_at: number;
  }>;

  return {
    agentId,
    byTaskType: reps.map((r) => ({
      taskType: r.task_type,
      sampleCount: r.sample_count,
      ewmaScore: r.ewma_score,
      ewmaCost: r.ewma_cost,
      ewmaLatencyMs: r.ewma_latency_ms,
      updatedAt: r.updated_at,
    })),
    recentEvents: events.map((e) => ({
      id: e.id,
      agentId: e.agent_id,
      runId: e.run_id,
      nodeId: e.node_id,
      taskType: e.task_type,
      cost: e.cost,
      latencyMs: e.latency_ms,
      qualityScore: e.quality_score,
      qualityRationale: e.quality_rationale,
      gradedBy: e.graded_by,
      receiptId: e.receipt_id,
      reputationDelta: e.reputation_delta,
      outcome: e.outcome,
      metadata: e.metadata_json ? safeJson(e.metadata_json) : null,
      createdAt: e.created_at,
    })),
  };
}

export function getAgentLeaderboard(taskType: string, minSamples = 5, limit = 50) {
  const rows = db
    .prepare(
      `SELECT agent_id, sample_count, ewma_score, ewma_cost, ewma_latency_ms, updated_at
       FROM agent_reputation
       WHERE task_type = ? AND sample_count >= ?
       ORDER BY ewma_score DESC
       LIMIT ?`
    )
    .all(taskType, minSamples, Math.max(1, Math.min(500, limit))) as Array<{
    agent_id: string;
    sample_count: number;
    ewma_score: number;
    ewma_cost: number;
    ewma_latency_ms: number;
    updated_at: number;
  }>;

  return rows.map((r, i) => ({
    rank: i + 1,
    agentId: r.agent_id,
    sampleCount: r.sample_count,
    ewmaScore: r.ewma_score,
    ewmaCost: r.ewma_cost,
    ewmaLatencyMs: r.ewma_latency_ms,
    updatedAt: r.updated_at,
  }));
}
