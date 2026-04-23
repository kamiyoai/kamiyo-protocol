import { randomUUID } from 'node:crypto';
import db from './db';

export type AgentLearningReconcileStatus = 'not_required' | 'pending' | 'finalized';
export type AgentLearningControlMode = 'auto' | 'paused';
export type AgentLearningCommandKind = 'pause_auto' | 'resume_auto' | 'rollback_active_canary';
export type AgentLearningCommandStatus = 'pending' | 'applied' | 'failed' | 'expired';
export type AgentLearningCanaryStatus = 'inactive' | 'active' | 'promoted' | 'rolled_back';
export type AgentLearningAlertLevel = 'info' | 'warning' | 'error';

export interface AgentLearningAlert {
  code: string;
  level: AgentLearningAlertLevel;
  message: string;
  detectedAt: string;
}

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

export interface AgentLearningControlInput {
  service: string;
  taskType: string;
  mode: AgentLearningControlMode;
  updatedBy?: string | null;
  note?: string | null;
  updatedAt?: number | null;
}

export interface AgentLearningCommandInput {
  service: string;
  taskType: string;
  kind: AgentLearningCommandKind;
  requestedBy?: string | null;
  note?: string | null;
  createdAt?: number | null;
}

export interface AgentLearningCommandAckInput {
  status: Exclude<AgentLearningCommandStatus, 'pending'>;
  result?: Record<string, unknown> | null;
  processedAt?: number | null;
}

export interface AgentLearningCanarySnapshotInput {
  service: string;
  taskType: string;
  rolloutId?: string | null;
  status: AgentLearningCanaryStatus;
  canaryVariantId?: string | null;
  baselineVariantId?: string | null;
  trafficPct?: number | null;
  decisionKind?: string | null;
  decisionReason?: string | null;
  canarySamples?: number | null;
  baselineSamples?: number | null;
  uplift?: number | null;
  pValue?: number | null;
  alerts?: AgentLearningAlert[];
  updatedAt?: number | null;
}

export interface AgentLearningControlState {
  service: string;
  taskType: string;
  mode: AgentLearningControlMode;
  updatedBy: string | null;
  note: string | null;
  updatedAt: string | null;
}

export interface AgentLearningCommand {
  id: string;
  service: string;
  taskType: string;
  kind: AgentLearningCommandKind;
  status: AgentLearningCommandStatus;
  requestedBy: string | null;
  note: string | null;
  createdAt: string;
  processedAt: string | null;
  result: Record<string, unknown>;
}

export interface AgentLearningCanarySnapshot {
  service: string;
  taskType: string;
  rolloutId: string | null;
  status: AgentLearningCanaryStatus;
  canaryVariantId: string | null;
  baselineVariantId: string | null;
  trafficPct: number | null;
  decisionKind: string | null;
  decisionReason: string | null;
  canarySamples: number | null;
  baselineSamples: number | null;
  uplift: number | null;
  pValue: number | null;
  alerts: AgentLearningAlert[];
  updatedAt: string;
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
  recentCommands: AgentLearningCommand[];
  pendingReconciliations: number;
  finalizedDelayedSamples: number;
  immediateAvgScore7d: number | null;
  delayedAvgScore7d: number | null;
  currentPromotedVariantId: string | null;
  activeCanary: AgentLearningSummaryService['activeCanary'];
  controlState: AgentLearningControlState | null;
  activeCanarySnapshot: AgentLearningCanarySnapshot | null;
  alerts: AgentLearningAlert[];
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

type ControlRow = {
  service: string;
  task_type: string;
  mode: AgentLearningControlMode;
  updated_by: string | null;
  note: string | null;
  updated_at: number;
};

type CommandRow = {
  id: string;
  service: string;
  task_type: string;
  kind: AgentLearningCommandKind;
  status: AgentLearningCommandStatus;
  requested_by: string | null;
  note: string | null;
  result_json: string;
  created_at: number;
  processed_at: number | null;
};

type CanarySnapshotRow = {
  service: string;
  task_type: string;
  rollout_id: string | null;
  status: AgentLearningCanaryStatus;
  canary_variant_id: string | null;
  baseline_variant_id: string | null;
  traffic_pct: number | null;
  decision_kind: string | null;
  decision_reason: string | null;
  canary_samples: number | null;
  baseline_samples: number | null;
  uplift: number | null;
  p_value: number | null;
  alerts_json: string;
  updated_at: number;
};

const COMMAND_EXPIRY_HOURS = 24;
const STALE_UPDATE_HOURS = 24;
const PENDING_BACKLOG_THRESHOLD = 5;

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

export function upsertAgentLearningControl(
  input: AgentLearningControlInput
): AgentLearningControlState {
  const updatedAt = normalizeEpoch(input.updatedAt, Math.floor(Date.now() / 1000));
  db.prepare(
    `INSERT INTO agent_learning_controls (
        service, task_type, mode, updated_by, note, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(service, task_type) DO UPDATE SET
        mode = excluded.mode,
        updated_by = excluded.updated_by,
        note = excluded.note,
        updated_at = excluded.updated_at`
  ).run(
    input.service,
    input.taskType,
    input.mode,
    input.updatedBy ?? null,
    input.note ?? null,
    updatedAt
  );

  return getAgentLearningControlState(input.service, input.taskType);
}

export function getAgentLearningControlState(
  service: string,
  taskType: string
): AgentLearningControlState {
  const row = db
    .prepare(
      `SELECT * FROM agent_learning_controls
       WHERE service = ? AND task_type = ?`
    )
    .get(service, taskType) as ControlRow | undefined;

  if (!row) {
    return {
      service,
      taskType,
      mode: 'auto',
      updatedBy: null,
      note: null,
      updatedAt: null,
    };
  }

  return mapControlRow(row);
}

export function createAgentLearningCommand(input: AgentLearningCommandInput): AgentLearningCommand {
  const createdAt = normalizeEpoch(input.createdAt, Math.floor(Date.now() / 1000));
  const id = randomUUID();

  const tx = db.transaction(() => {
    if (input.kind === 'pause_auto' || input.kind === 'resume_auto') {
      upsertAgentLearningControl({
        service: input.service,
        taskType: input.taskType,
        mode: input.kind === 'pause_auto' ? 'paused' : 'auto',
        updatedBy: input.requestedBy ?? null,
        note: input.note ?? null,
        updatedAt: createdAt,
      });
    }

    db.prepare(
      `INSERT INTO agent_learning_commands (
          id, service, task_type, kind, status, requested_by, note, result_json, created_at, processed_at
        ) VALUES (?, ?, ?, ?, 'pending', ?, ?, '{}', ?, NULL)`
    ).run(
      id,
      input.service,
      input.taskType,
      input.kind,
      input.requestedBy ?? null,
      input.note ?? null,
      createdAt
    );

    return db.prepare(`SELECT * FROM agent_learning_commands WHERE id = ?`).get(id) as CommandRow;
  });

  return mapCommandRow(tx());
}

export function acknowledgeAgentLearningCommand(
  id: string,
  input: AgentLearningCommandAckInput
): AgentLearningCommand | null {
  const existing = db.prepare(`SELECT * FROM agent_learning_commands WHERE id = ?`).get(id) as
    | CommandRow
    | undefined;
  if (!existing) return null;

  const processedAt = normalizeEpoch(input.processedAt, Math.floor(Date.now() / 1000));
  db.prepare(
    `UPDATE agent_learning_commands
        SET status = ?,
            result_json = ?,
            processed_at = ?
      WHERE id = ?`
  ).run(input.status, JSON.stringify(input.result ?? {}), processedAt, id);

  const updated = db.prepare(`SELECT * FROM agent_learning_commands WHERE id = ?`).get(id) as
    | CommandRow
    | undefined;
  return updated ? mapCommandRow(updated) : null;
}

export function listAgentLearningCommands(options?: {
  service?: string;
  taskType?: string;
  status?: AgentLearningCommandStatus;
  limit?: number;
}): AgentLearningCommand[] {
  expireStaleAgentLearningCommands();

  const limit = Math.max(1, Math.min(100, options?.limit ?? 20));
  let sql = `SELECT * FROM agent_learning_commands`;
  const clauses: string[] = [];
  const params: Array<string | number> = [];

  if (options?.service) {
    clauses.push(`service = ?`);
    params.push(options.service);
  }
  if (options?.taskType) {
    clauses.push(`task_type = ?`);
    params.push(options.taskType);
  }
  if (options?.status) {
    clauses.push(`status = ?`);
    params.push(options.status);
  }

  if (clauses.length > 0) sql += ` WHERE ${clauses.join(' AND ')}`;
  sql += ` ORDER BY created_at DESC LIMIT ?`;
  params.push(limit);

  const rows = db.prepare(sql).all(...params) as CommandRow[];
  return rows.map(mapCommandRow);
}

export function upsertAgentLearningCanarySnapshot(
  input: AgentLearningCanarySnapshotInput
): AgentLearningCanarySnapshot {
  const updatedAt = normalizeEpoch(input.updatedAt, Math.floor(Date.now() / 1000));
  db.prepare(
    `INSERT INTO agent_learning_canary_snapshots (
        service, task_type, rollout_id, status, canary_variant_id, baseline_variant_id,
        traffic_pct, decision_kind, decision_reason, canary_samples, baseline_samples,
        uplift, p_value, alerts_json, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(service, task_type) DO UPDATE SET
        rollout_id = excluded.rollout_id,
        status = excluded.status,
        canary_variant_id = excluded.canary_variant_id,
        baseline_variant_id = excluded.baseline_variant_id,
        traffic_pct = excluded.traffic_pct,
        decision_kind = excluded.decision_kind,
        decision_reason = excluded.decision_reason,
        canary_samples = excluded.canary_samples,
        baseline_samples = excluded.baseline_samples,
        uplift = excluded.uplift,
        p_value = excluded.p_value,
        alerts_json = excluded.alerts_json,
        updated_at = excluded.updated_at`
  ).run(
    input.service,
    input.taskType,
    input.rolloutId ?? null,
    input.status,
    input.canaryVariantId ?? null,
    input.baselineVariantId ?? null,
    normalizeNumber(input.trafficPct),
    input.decisionKind ?? null,
    input.decisionReason ?? null,
    normalizeInteger(input.canarySamples),
    normalizeInteger(input.baselineSamples),
    normalizeNumber(input.uplift),
    normalizeNumber(input.pValue),
    JSON.stringify(input.alerts ?? []),
    updatedAt
  );

  return getAgentLearningCanarySnapshot(input.service, input.taskType);
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
  expireStaleAgentLearningCommands();

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
  const commands = listAgentLearningCommands({ service, limit: 20 });

  const aggregate = summarizeService(service, rows);
  const topVariants = aggregateVariants(rows);
  const primaryTaskType =
    rows[0]?.task_type ??
    promotions[0]?.task_type ??
    commands[0]?.taskType ??
    getLatestCanarySnapshot(service)?.taskType ??
    null;
  const controlState = primaryTaskType
    ? getAgentLearningControlState(service, primaryTaskType)
    : null;
  const activeCanarySnapshot = getLatestCanarySnapshot(service, primaryTaskType ?? undefined);

  return {
    service,
    recentRuns: rows.map(mapRunRow),
    topVariants,
    recentEvents: promotions.map(mapPromotionRow),
    recentCommands: commands,
    pendingReconciliations: aggregate.pendingReconciliations,
    finalizedDelayedSamples: aggregate.finalizedDelayedSamples,
    immediateAvgScore7d: aggregate.immediateAvgScore7d,
    delayedAvgScore7d: aggregate.delayedAvgScore7d,
    currentPromotedVariantId: aggregate.currentPromotedVariantId,
    activeCanary: aggregate.activeCanary,
    controlState,
    activeCanarySnapshot,
    alerts: buildServiceAlerts({
      rows,
      snapshot: activeCanarySnapshot,
      commands,
      pendingReconciliations: aggregate.pendingReconciliations,
    }),
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
  const snapshot = getLatestCanarySnapshot(service);

  const immediateScores = serviceRows
    .map(row => row.immediate_quality_score)
    .filter((value): value is number => typeof value === 'number');
  const delayedScores = serviceRows
    .map(row => row.delayed_quality_score)
    .filter((value): value is number => typeof value === 'number');
  const latestTaskType = serviceRows[0]?.task_type ?? snapshot?.taskType ?? null;
  const lastPromotion = promotionRows.find(row => /promoted/i.test(row.event_kind)) ?? null;
  const latestCanaryEvent = promotionRows.find(row => row.event_kind.startsWith('canary_')) ?? null;

  let activeCanary: AgentLearningSummaryService['activeCanary'] = null;
  if (snapshot?.status === 'active' && snapshot.canaryVariantId) {
    activeCanary = {
      variantId: snapshot.canaryVariantId,
      priorVariantId: snapshot.baselineVariantId,
      trafficPct: snapshot.trafficPct,
      eventKind: snapshot.decisionKind ? `decision:${snapshot.decisionKind}` : 'active',
      startedAt: snapshot.updatedAt,
    };
  } else if (
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
    if (typeof row.immediate_quality_score === 'number') {
      current.immediateScores.push(row.immediate_quality_score);
    }
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

function buildServiceAlerts(params: {
  rows: RunRow[];
  snapshot: AgentLearningCanarySnapshot | null;
  commands: AgentLearningCommand[];
  pendingReconciliations: number;
}): AgentLearningAlert[] {
  const alerts: AgentLearningAlert[] = [];
  const nowSeconds = Math.floor(Date.now() / 1000);
  const latestRunUpdatedAt = params.rows[0]?.updated_at ?? null;
  const latestSnapshotUpdatedAt = params.snapshot
    ? Date.parse(params.snapshot.updatedAt) / 1000
    : null;
  const latestCommandAt = params.commands[0]?.createdAt
    ? Math.floor(Date.parse(params.commands[0].createdAt) / 1000)
    : null;
  const latestActivity = [latestRunUpdatedAt, latestSnapshotUpdatedAt, latestCommandAt]
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
    .reduce((max, value) => (value > max ? value : max), 0);

  if (latestActivity > 0 && nowSeconds - latestActivity >= STALE_UPDATE_HOURS * 60 * 60) {
    alerts.push({
      code: 'stale_service_updates',
      level: 'warning',
      message: `No mirrored learning update has been seen in the last ${STALE_UPDATE_HOURS}h.`,
      detectedAt: new Date(nowSeconds * 1000).toISOString(),
    });
  }

  if (params.pendingReconciliations >= PENDING_BACKLOG_THRESHOLD) {
    alerts.push({
      code: 'pending_reconciliation_backlog',
      level: 'warning',
      message: `${params.pendingReconciliations} receipts are still waiting on reconciliation.`,
      detectedAt: new Date(nowSeconds * 1000).toISOString(),
    });
  }

  if (params.snapshot) alerts.push(...params.snapshot.alerts);

  for (const command of params.commands) {
    if (command.status !== 'failed' && command.status !== 'expired') continue;
    alerts.push({
      code: command.status === 'failed' ? 'failed_operator_command' : 'expired_operator_command',
      level: 'error',
      message:
        command.status === 'failed'
          ? `Command ${command.kind} failed.`
          : `Command ${command.kind} expired before the service applied it.`,
      detectedAt: command.processedAt ?? command.createdAt,
    });
  }

  return dedupeAlerts(alerts);
}

function expireStaleAgentLearningCommands(): void {
  const threshold = Math.floor(Date.now() / 1000) - COMMAND_EXPIRY_HOURS * 60 * 60;
  db.prepare(
    `UPDATE agent_learning_commands
        SET status = 'expired',
            processed_at = ?,
            result_json = json_set(COALESCE(NULLIF(result_json, ''), '{}'), '$.reason', 'command_expired')
      WHERE status = 'pending' AND created_at < ?`
  ).run(Math.floor(Date.now() / 1000), threshold);
}

function getLatestCanarySnapshot(
  service: string,
  taskType?: string
): AgentLearningCanarySnapshot | null {
  const row = taskType
    ? (db
        .prepare(
          `SELECT * FROM agent_learning_canary_snapshots
           WHERE service = ? AND task_type = ?`
        )
        .get(service, taskType) as CanarySnapshotRow | undefined)
    : (db
        .prepare(
          `SELECT * FROM agent_learning_canary_snapshots
           WHERE service = ?
           ORDER BY updated_at DESC
           LIMIT 1`
        )
        .get(service) as CanarySnapshotRow | undefined);

  return row ? mapCanarySnapshotRow(row) : null;
}

function getAgentLearningCanarySnapshot(
  service: string,
  taskType: string
): AgentLearningCanarySnapshot {
  const row = db
    .prepare(
      `SELECT * FROM agent_learning_canary_snapshots
       WHERE service = ? AND task_type = ?`
    )
    .get(service, taskType) as CanarySnapshotRow | undefined;

  if (!row) {
    return {
      service,
      taskType,
      rolloutId: null,
      status: 'inactive',
      canaryVariantId: null,
      baselineVariantId: null,
      trafficPct: null,
      decisionKind: null,
      decisionReason: null,
      canarySamples: null,
      baselineSamples: null,
      uplift: null,
      pValue: null,
      alerts: [],
      updatedAt: new Date(0).toISOString(),
    };
  }

  return mapCanarySnapshotRow(row);
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

function mapControlRow(row: ControlRow): AgentLearningControlState {
  return {
    service: row.service,
    taskType: row.task_type,
    mode: row.mode,
    updatedBy: row.updated_by,
    note: row.note,
    updatedAt: toIso(row.updated_at),
  };
}

function mapCommandRow(row: CommandRow): AgentLearningCommand {
  return {
    id: row.id,
    service: row.service,
    taskType: row.task_type,
    kind: row.kind,
    status: row.status,
    requestedBy: row.requested_by,
    note: row.note,
    createdAt: toIso(row.created_at),
    processedAt: row.processed_at ? toIso(row.processed_at) : null,
    result: parseJson(row.result_json),
  };
}

function mapCanarySnapshotRow(row: CanarySnapshotRow): AgentLearningCanarySnapshot {
  return {
    service: row.service,
    taskType: row.task_type,
    rolloutId: row.rollout_id,
    status: row.status,
    canaryVariantId: row.canary_variant_id,
    baselineVariantId: row.baseline_variant_id,
    trafficPct: row.traffic_pct,
    decisionKind: row.decision_kind,
    decisionReason: row.decision_reason,
    canarySamples: row.canary_samples,
    baselineSamples: row.baseline_samples,
    uplift: row.uplift,
    pValue: row.p_value,
    alerts: parseAlertArray(row.alerts_json),
    updatedAt: toIso(row.updated_at),
  };
}

function dedupeAlerts(alerts: AgentLearningAlert[]): AgentLearningAlert[] {
  const seen = new Set<string>();
  const deduped: AgentLearningAlert[] = [];
  for (const alert of alerts) {
    const key = `${alert.code}:${alert.message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(alert);
  }
  return deduped;
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function normalizeEpoch(value: number | null | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.floor(value) : fallback;
}

function normalizeInteger(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? Math.floor(value) : null;
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

function parseAlertArray(value: string): AgentLearningAlert[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap(item => {
      if (!item || typeof item !== 'object') return [];
      const alert = item as Record<string, unknown>;
      const code = typeof alert.code === 'string' ? alert.code : '';
      const level = typeof alert.level === 'string' ? alert.level : '';
      const message = typeof alert.message === 'string' ? alert.message : '';
      const detectedAt = typeof alert.detectedAt === 'string' ? alert.detectedAt : '';
      if (!code || !message || !detectedAt) return [];
      if (level !== 'info' && level !== 'warning' && level !== 'error') return [];
      return [{ code, level, message, detectedAt }];
    });
  } catch {
    return [];
  }
}

function toIso(epochSeconds: number): string {
  return new Date(epochSeconds * 1000).toISOString();
}
