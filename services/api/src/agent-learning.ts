import db from './db';

export type AgentLearningReconcileStatus = 'not_required' | 'pending' | 'finalized';

export interface AgentLearningRunInput {
  service: string;
  runId: string;
  taskType: string;
  subjectType?: string | null;
  subjectId?: string | null;
  variantId?: string | null;
  variantStrategy?: string | null;
  immediateOutcome?: string | null;
  immediateQualityScore?: number | null;
  delayedOutcome?: string | null;
  delayedQualityScore?: number | null;
  reconcileStatus: AgentLearningReconcileStatus;
  summary: Record<string, unknown>;
  createdAt?: number | null;
  updatedAt?: number | null;
}

export interface AgentLearningPromotionInput {
  service: string;
  taskType: string;
  variantId: string;
  priorVariantId?: string | null;
  eventKind: string;
  payload?: Record<string, unknown>;
  createdAt?: number | null;
}

export interface AgentLearningSummaryService {
  service: string;
  taskType: string | null;
  immediateAvgScore7d: number | null;
  delayedAvgScore7d: number | null;
  pendingReconciliations: number;
  finalizedDelayedSamples: number;
  currentPromotedVariantId: string | null;
  activeCanary: {
    variantId: string;
    priorVariantId: string | null;
    trafficPct: number | null;
    eventKind: string;
    startedAt: string | null;
  } | null;
  lastPromotionAt: string | null;
}

export interface AgentLearningActivityItem {
  service: string;
  taskType: string;
  runId: string;
  reconcileStatus: AgentLearningReconcileStatus;
  immediateOutcome: string | null;
  delayedOutcome: string | null;
  updatedAt: string;
}

export interface AgentLearningSummary {
  services: AgentLearningSummaryService[];
  recentActivity: AgentLearningActivityItem[];
  lastUpdated: string;
}

export interface AgentLearningServiceDetail {
  service: string;
  recentRuns: Array<{
    service: string;
    runId: string;
    taskType: string;
    subjectType: string | null;
    subjectId: string | null;
    variantId: string | null;
    variantStrategy: string | null;
    immediateOutcome: string | null;
    immediateQualityScore: number | null;
    delayedOutcome: string | null;
    delayedQualityScore: number | null;
    reconcileStatus: AgentLearningReconcileStatus;
    summary: Record<string, unknown>;
    createdAt: string;
    updatedAt: string;
  }>;
  topVariants: Array<{
    variantId: string;
    taskType: string;
    runs: number;
    delayedSamples: number;
    avgImmediateScore: number | null;
    avgDelayedScore: number | null;
  }>;
  recentEvents: Array<{
    variantId: string;
    priorVariantId: string | null;
    taskType: string;
    eventKind: string;
    payload: Record<string, unknown>;
    createdAt: string;
  }>;
  pendingReconciliations: number;
  finalizedDelayedSamples: number;
  immediateAvgScore7d: number | null;
  delayedAvgScore7d: number | null;
  currentPromotedVariantId: string | null;
  activeCanary: AgentLearningSummaryService['activeCanary'];
}

type RunRow = {
  service: string;
  run_id: string;
  task_type: string;
  subject_type: string | null;
  subject_id: string | null;
  variant_id: string | null;
  variant_strategy: string | null;
  immediate_outcome: string | null;
  immediate_quality_score: number | null;
  delayed_outcome: string | null;
  delayed_quality_score: number | null;
  reconcile_status: AgentLearningReconcileStatus;
  summary_json: string;
  created_at: number;
  updated_at: number;
};

type PromotionRow = {
  service: string;
  task_type: string;
  variant_id: string;
  prior_variant_id: string | null;
  event_kind: string;
  payload_json: string;
  created_at: number;
};

export function upsertAgentLearningRun(input: AgentLearningRunInput): void {
  const now = Math.floor(Date.now() / 1000);
  const existing = db
    .prepare(
      `SELECT created_at FROM agent_learning_runs
       WHERE service = ? AND run_id = ?`
    )
    .get(input.service, input.runId) as { created_at: number } | undefined;

  const createdAt = normalizeEpoch(input.createdAt, existing?.created_at ?? now);
  const updatedAt = normalizeEpoch(input.updatedAt, now);

  if (existing) {
    db.prepare(
      `UPDATE agent_learning_runs
          SET task_type = ?,
              subject_type = ?,
              subject_id = ?,
              variant_id = ?,
              variant_strategy = ?,
              immediate_outcome = ?,
              immediate_quality_score = ?,
              delayed_outcome = ?,
              delayed_quality_score = ?,
              reconcile_status = ?,
              summary_json = ?,
              updated_at = ?
        WHERE service = ? AND run_id = ?`
    ).run(
      input.taskType,
      input.subjectType ?? null,
      input.subjectId ?? null,
      input.variantId ?? null,
      input.variantStrategy ?? null,
      input.immediateOutcome ?? null,
      normalizeNumber(input.immediateQualityScore),
      input.delayedOutcome ?? null,
      normalizeNumber(input.delayedQualityScore),
      input.reconcileStatus,
      JSON.stringify(input.summary ?? {}),
      updatedAt,
      input.service,
      input.runId
    );
    return;
  }

  db.prepare(
    `INSERT INTO agent_learning_runs (
        service, run_id, task_type, subject_type, subject_id, variant_id, variant_strategy,
        immediate_outcome, immediate_quality_score, delayed_outcome, delayed_quality_score,
        reconcile_status, summary_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    input.service,
    input.runId,
    input.taskType,
    input.subjectType ?? null,
    input.subjectId ?? null,
    input.variantId ?? null,
    input.variantStrategy ?? null,
    input.immediateOutcome ?? null,
    normalizeNumber(input.immediateQualityScore),
    input.delayedOutcome ?? null,
    normalizeNumber(input.delayedQualityScore),
    input.reconcileStatus,
    JSON.stringify(input.summary ?? {}),
    createdAt,
    updatedAt
  );
}

export function recordAgentLearningPromotion(input: AgentLearningPromotionInput): void {
  db.prepare(
    `INSERT INTO agent_learning_promotions (
        service, task_type, variant_id, prior_variant_id, event_kind, payload_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    input.service,
    input.taskType,
    input.variantId,
    input.priorVariantId ?? null,
    input.eventKind,
    JSON.stringify(input.payload ?? {}),
    normalizeEpoch(input.createdAt, Math.floor(Date.now() / 1000))
  );
}

export function getAgentLearningSummary(): AgentLearningSummary {
  const sevenDaysAgo = Math.floor(Date.now() / 1000) - 7 * 24 * 60 * 60;
  const runs = db
    .prepare(
      `SELECT * FROM agent_learning_runs
       WHERE updated_at >= ?
       ORDER BY updated_at DESC`
    )
    .all(sevenDaysAgo) as RunRow[];
  const recentActivityRows = db
    .prepare(
      `SELECT service, run_id, task_type, reconcile_status, immediate_outcome, delayed_outcome, updated_at
       FROM agent_learning_runs
       ORDER BY updated_at DESC
       LIMIT 8`
    )
    .all() as Array<{
    service: string;
    run_id: string;
    task_type: string;
    reconcile_status: AgentLearningReconcileStatus;
    immediate_outcome: string | null;
    delayed_outcome: string | null;
    updated_at: number;
  }>;
  const services = Array.from(new Set(runs.map(row => row.service))).sort();

  return {
    services: services.map(service => summarizeService(service, runs)),
    recentActivity: recentActivityRows.map(row => ({
      service: row.service,
      taskType: row.task_type,
      runId: row.run_id,
      reconcileStatus: row.reconcile_status,
      immediateOutcome: row.immediate_outcome,
      delayedOutcome: row.delayed_outcome,
      updatedAt: toIso(row.updated_at),
    })),
    lastUpdated: new Date().toISOString(),
  };
}

export function getAgentLearningServiceDetail(service: string): AgentLearningServiceDetail {
  const rows = db
    .prepare(
      `SELECT * FROM agent_learning_runs
       WHERE service = ?
       ORDER BY updated_at DESC
       LIMIT 50`
    )
    .all(service) as RunRow[];
  const promotions = db
    .prepare(
      `SELECT * FROM agent_learning_promotions
       WHERE service = ?
       ORDER BY created_at DESC
       LIMIT 20`
    )
    .all(service) as PromotionRow[];

  const aggregate = summarizeService(service, rows);
  const topVariants = aggregateVariants(rows);

  return {
    service,
    recentRuns: rows.map(mapRunRow),
    topVariants,
    recentEvents: promotions.map(mapPromotionRow),
    pendingReconciliations: aggregate.pendingReconciliations,
    finalizedDelayedSamples: aggregate.finalizedDelayedSamples,
    immediateAvgScore7d: aggregate.immediateAvgScore7d,
    delayedAvgScore7d: aggregate.delayedAvgScore7d,
    currentPromotedVariantId: aggregate.currentPromotedVariantId,
    activeCanary: aggregate.activeCanary,
  };
}

export function listAgentLearningRuns(options?: {
  service?: string;
  limit?: number;
}): AgentLearningServiceDetail['recentRuns'] {
  const limit = Math.max(1, Math.min(100, options?.limit ?? 50));
  const rows = options?.service
    ? (db
        .prepare(
          `SELECT * FROM agent_learning_runs
           WHERE service = ?
           ORDER BY updated_at DESC
           LIMIT ?`
        )
        .all(options.service, limit) as RunRow[])
    : (db
        .prepare(
          `SELECT * FROM agent_learning_runs
           ORDER BY updated_at DESC
           LIMIT ?`
        )
        .all(limit) as RunRow[]);
  return rows.map(mapRunRow);
}

function summarizeService(service: string, rows: RunRow[]): AgentLearningSummaryService {
  const serviceRows = rows.filter(row => row.service === service);
  const promotionRows = db
    .prepare(
      `SELECT * FROM agent_learning_promotions
       WHERE service = ?
       ORDER BY created_at DESC`
    )
    .all(service) as PromotionRow[];

  const immediateScores = serviceRows
    .map(row => row.immediate_quality_score)
    .filter((value): value is number => typeof value === 'number');
  const delayedScores = serviceRows
    .map(row => row.delayed_quality_score)
    .filter((value): value is number => typeof value === 'number');
  const latestTaskType = serviceRows[0]?.task_type ?? null;
  const lastPromotion = promotionRows.find(row => /promoted/i.test(row.event_kind)) ?? null;
  const latestCanaryEvent = promotionRows.find(row => row.event_kind.startsWith('canary_')) ?? null;

  let activeCanary: AgentLearningSummaryService['activeCanary'] = null;
  if (
    latestCanaryEvent &&
    (latestCanaryEvent.event_kind === 'canary_started' ||
      latestCanaryEvent.event_kind === 'canary_ramped')
  ) {
    const payload = parseJson(latestCanaryEvent.payload_json);
    activeCanary = {
      variantId: latestCanaryEvent.variant_id,
      priorVariantId: latestCanaryEvent.prior_variant_id,
      trafficPct:
        typeof payload.trafficPct === 'number'
          ? payload.trafficPct
          : typeof payload.to === 'number'
            ? payload.to
            : null,
      eventKind: latestCanaryEvent.event_kind,
      startedAt: toIso(latestCanaryEvent.created_at),
    };
  }

  return {
    service,
    taskType: latestTaskType,
    immediateAvgScore7d: average(immediateScores),
    delayedAvgScore7d: average(delayedScores),
    pendingReconciliations: serviceRows.filter(row => row.reconcile_status === 'pending').length,
    finalizedDelayedSamples: serviceRows.filter(
      row => row.reconcile_status === 'finalized' && row.delayed_quality_score !== null
    ).length,
    currentPromotedVariantId: lastPromotion?.variant_id ?? null,
    activeCanary,
    lastPromotionAt: lastPromotion ? toIso(lastPromotion.created_at) : null,
  };
}

function aggregateVariants(rows: RunRow[]) {
  const byVariant = new Map<
    string,
    {
      taskType: string;
      runs: number;
      delayedSamples: number;
      immediateScores: number[];
      delayedScores: number[];
    }
  >();

  for (const row of rows) {
    if (!row.variant_id) continue;
    const current = byVariant.get(row.variant_id) ?? {
      taskType: row.task_type,
      runs: 0,
      delayedSamples: 0,
      immediateScores: [],
      delayedScores: [],
    };
    current.runs += 1;
    if (typeof row.immediate_quality_score === 'number')
      current.immediateScores.push(row.immediate_quality_score);
    if (typeof row.delayed_quality_score === 'number') {
      current.delayedScores.push(row.delayed_quality_score);
      current.delayedSamples += 1;
    }
    byVariant.set(row.variant_id, current);
  }

  return [...byVariant.entries()]
    .map(([variantId, value]) => ({
      variantId,
      taskType: value.taskType,
      runs: value.runs,
      delayedSamples: value.delayedSamples,
      avgImmediateScore: average(value.immediateScores),
      avgDelayedScore: average(value.delayedScores),
    }))
    .sort((left, right) => (right.avgDelayedScore ?? -1) - (left.avgDelayedScore ?? -1))
    .slice(0, 10);
}

function mapRunRow(row: RunRow) {
  return {
    service: row.service,
    runId: row.run_id,
    taskType: row.task_type,
    subjectType: row.subject_type,
    subjectId: row.subject_id,
    variantId: row.variant_id,
    variantStrategy: row.variant_strategy,
    immediateOutcome: row.immediate_outcome,
    immediateQualityScore: row.immediate_quality_score,
    delayedOutcome: row.delayed_outcome,
    delayedQualityScore: row.delayed_quality_score,
    reconcileStatus: row.reconcile_status,
    summary: parseJson(row.summary_json),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

function mapPromotionRow(row: PromotionRow) {
  return {
    variantId: row.variant_id,
    priorVariantId: row.prior_variant_id,
    taskType: row.task_type,
    eventKind: row.event_kind,
    payload: parseJson(row.payload_json),
    createdAt: toIso(row.created_at),
  };
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function normalizeEpoch(value: number | null | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.floor(value) : fallback;
}

function normalizeNumber(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function parseJson(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function toIso(epochSeconds: number): string {
  return new Date(epochSeconds * 1000).toISOString();
}
