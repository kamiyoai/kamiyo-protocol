import { randomUUID } from 'crypto';
import type { DB } from './db-types';
import { safeSerialize } from './utils';

type RunReceiptRow = {
  id: string;
  run_id: string;
  agent_id: string;
  service: string;
  task_type: string;
  subject_type: string | null;
  subject_id: string | null;
  variant_id: string | null;
  variant_strategy: string | null;
  outcome: string | null;
  quality_score: number | null;
  cost_usd: number;
  duration_ms: number;
  receipt_json: string;
  reconcile_after: number | null;
  reconciled_at: number | null;
  created_at: number;
  updated_at: number;
};

export interface AgentRunReceipt {
  id: string;
  runId: string;
  agentId: string;
  service: string;
  taskType: string;
  subjectType: string | null;
  subjectId: string | null;
  variantId: string | null;
  variantStrategy: string | null;
  outcome: string | null;
  qualityScore: number | null;
  costUsd: number;
  durationMs: number;
  receipt: Record<string, unknown>;
  reconcileAfter: number | null;
  reconciledAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface AgentRunReceiptInput {
  runId: string;
  agentId: string;
  service: string;
  taskType: string;
  subjectType?: string | null;
  subjectId?: string | null;
  variantId?: string | null;
  variantStrategy?: string | null;
  outcome?: string | null;
  qualityScore?: number | null;
  costUsd?: number;
  durationMs?: number;
  receipt?: Record<string, unknown>;
  reconcileAfter?: number | Date | null;
  reconciledAt?: number | Date | null;
}

export interface AgentRunReceiptPatch {
  subjectType?: string | null;
  subjectId?: string | null;
  variantId?: string | null;
  variantStrategy?: string | null;
  outcome?: string | null;
  qualityScore?: number | null;
  costUsd?: number;
  durationMs?: number;
  receipt?: Record<string, unknown>;
  reconcileAfter?: number | Date | null;
  reconciledAt?: number | Date | null;
}

export interface AgentRunReceiptLookup {
  service: string;
  subjectType: string;
  subjectId: string;
}

export function recordAgentRunReceipt(db: DB, input: AgentRunReceiptInput): AgentRunReceipt {
  const existing = fetchRunReceiptRow(
    db.prepare(`SELECT * FROM agent_run_receipts WHERE run_id = ?`).get(input.runId)
  );
  const now = nowEpochSeconds();
  const receiptJson = safeSerialize(input.receipt ?? {});

  if (existing) {
    db.prepare(
      `UPDATE agent_run_receipts
          SET agent_id = ?,
              service = ?,
              task_type = ?,
              subject_type = ?,
              subject_id = ?,
              variant_id = ?,
              variant_strategy = ?,
              outcome = ?,
              quality_score = ?,
              cost_usd = ?,
              duration_ms = ?,
              receipt_json = ?,
              reconcile_after = ?,
              reconciled_at = ?,
              updated_at = ?
        WHERE run_id = ?`
    ).run(
      input.agentId,
      input.service,
      input.taskType,
      input.subjectType ?? null,
      input.subjectId ?? null,
      input.variantId ?? null,
      input.variantStrategy ?? null,
      input.outcome ?? null,
      normalizeOptionalNumber(input.qualityScore),
      normalizeNumber(input.costUsd, 0),
      normalizeInteger(input.durationMs, 0),
      receiptJson,
      normalizeEpochSeconds(input.reconcileAfter),
      normalizeEpochSeconds(input.reconciledAt),
      now,
      input.runId
    );
  } else {
    db.prepare(
      `INSERT INTO agent_run_receipts (
          id, run_id, agent_id, service, task_type, subject_type, subject_id,
          variant_id, variant_strategy, outcome, quality_score, cost_usd, duration_ms,
          receipt_json, reconcile_after, reconciled_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      randomUUID(),
      input.runId,
      input.agentId,
      input.service,
      input.taskType,
      input.subjectType ?? null,
      input.subjectId ?? null,
      input.variantId ?? null,
      input.variantStrategy ?? null,
      input.outcome ?? null,
      normalizeOptionalNumber(input.qualityScore),
      normalizeNumber(input.costUsd, 0),
      normalizeInteger(input.durationMs, 0),
      receiptJson,
      normalizeEpochSeconds(input.reconcileAfter),
      normalizeEpochSeconds(input.reconciledAt),
      now,
      now
    );
  }

  return getAgentRunReceipt(db, input.runId)!;
}

export function getAgentRunReceipt(db: DB, runId: string): AgentRunReceipt | null {
  const row = fetchRunReceiptRow(
    db.prepare(`SELECT * FROM agent_run_receipts WHERE run_id = ?`).get(runId)
  );
  return row ? mapRunReceiptRow(row) : null;
}

export function updateAgentRunReceipt(
  db: DB,
  runId: string,
  patch: AgentRunReceiptPatch
): AgentRunReceipt | null {
  const current = fetchRunReceiptRow(
    db.prepare(`SELECT * FROM agent_run_receipts WHERE run_id = ?`).get(runId)
  );
  if (!current) return null;

  const mergedReceipt = {
    ...parseReceiptJson(current.receipt_json),
    ...(patch.receipt ?? {}),
  };
  const now = nowEpochSeconds();

  db.prepare(
    `UPDATE agent_run_receipts
        SET subject_type = ?,
            subject_id = ?,
            variant_id = ?,
            variant_strategy = ?,
            outcome = ?,
            quality_score = ?,
            cost_usd = ?,
            duration_ms = ?,
            receipt_json = ?,
            reconcile_after = ?,
            reconciled_at = ?,
            updated_at = ?
      WHERE run_id = ?`
  ).run(
    patch.subjectType !== undefined ? patch.subjectType : current.subject_type,
    patch.subjectId !== undefined ? patch.subjectId : current.subject_id,
    patch.variantId !== undefined ? patch.variantId : current.variant_id,
    patch.variantStrategy !== undefined ? patch.variantStrategy : current.variant_strategy,
    patch.outcome !== undefined ? patch.outcome : current.outcome,
    patch.qualityScore !== undefined ? normalizeOptionalNumber(patch.qualityScore) : current.quality_score,
    patch.costUsd !== undefined ? normalizeNumber(patch.costUsd, current.cost_usd) : current.cost_usd,
    patch.durationMs !== undefined ? normalizeInteger(patch.durationMs, current.duration_ms) : current.duration_ms,
    safeSerialize(mergedReceipt),
    patch.reconcileAfter !== undefined
      ? normalizeEpochSeconds(patch.reconcileAfter)
      : current.reconcile_after,
    patch.reconciledAt !== undefined ? normalizeEpochSeconds(patch.reconciledAt) : current.reconciled_at,
    now,
    runId
  );

  return getAgentRunReceipt(db, runId);
}

export function updateLatestAgentRunReceipt(
  db: DB,
  lookup: AgentRunReceiptLookup,
  patch: AgentRunReceiptPatch
): AgentRunReceipt | null {
  const row = fetchRunReceiptRow(
    db.prepare(
      `SELECT * FROM agent_run_receipts
        WHERE service = ? AND subject_type = ? AND subject_id = ?
        ORDER BY created_at DESC, updated_at DESC, rowid DESC
        LIMIT 1`
    ).get(lookup.service, lookup.subjectType, lookup.subjectId)
  );
  if (!row) return null;
  return updateAgentRunReceipt(db, row.run_id, patch);
}

export function listPendingAgentRunReceipts(
  db: DB,
  options?: { now?: number | Date; service?: string; taskType?: string }
): AgentRunReceipt[] {
  const now = normalizeEpochSeconds(options?.now) ?? nowEpochSeconds();
  const params: unknown[] = [now];
  const filters = ['reconcile_after IS NOT NULL', 'reconcile_after <= ?', 'reconciled_at IS NULL'];

  if (options?.service) {
    filters.push('service = ?');
    params.push(options.service);
  }
  if (options?.taskType) {
    filters.push('task_type = ?');
    params.push(options.taskType);
  }

  const rows = db
    .prepare(
      `SELECT * FROM agent_run_receipts
        WHERE ${filters.join(' AND ')}
        ORDER BY reconcile_after ASC, created_at ASC`
    )
    .all(...params) as RunReceiptRow[];
  return rows.map(mapRunReceiptRow);
}

function fetchRunReceiptRow(row: unknown): RunReceiptRow | null {
  return row && typeof row === 'object' ? (row as RunReceiptRow) : null;
}

function mapRunReceiptRow(row: RunReceiptRow): AgentRunReceipt {
  return {
    id: row.id,
    runId: row.run_id,
    agentId: row.agent_id,
    service: row.service,
    taskType: row.task_type,
    subjectType: row.subject_type,
    subjectId: row.subject_id,
    variantId: row.variant_id,
    variantStrategy: row.variant_strategy,
    outcome: row.outcome,
    qualityScore: row.quality_score,
    costUsd: row.cost_usd,
    durationMs: row.duration_ms,
    receipt: parseReceiptJson(row.receipt_json),
    reconcileAfter: row.reconcile_after,
    reconciledAt: row.reconciled_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function parseReceiptJson(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function normalizeEpochSeconds(value: number | Date | null | undefined): number | null {
  if (value === null) return null;
  if (value === undefined) return null;
  if (value instanceof Date) return Math.floor(value.getTime() / 1000);
  if (!Number.isFinite(value)) return null;
  return Math.floor(value);
}

function normalizeNumber(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function normalizeOptionalNumber(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function normalizeInteger(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : fallback;
}

function nowEpochSeconds(): number {
  return Math.floor(Date.now() / 1000);
}
