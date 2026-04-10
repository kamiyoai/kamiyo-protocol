import { randomUUID } from 'crypto';
import db from './db';

db.exec(`
  CREATE TABLE IF NOT EXISTS revenue_events (
    event_id TEXT PRIMARY KEY,
    source TEXT NOT NULL,
    kind TEXT NOT NULL,
    agent_id TEXT,
    work_id TEXT,
    gross REAL NOT NULL,
    fees REAL NOT NULL DEFAULT 0,
    net REAL NOT NULL,
    token TEXT NOT NULL,
    chain TEXT NOT NULL,
    status TEXT NOT NULL,
    receipt_id TEXT,
    settlement_ref TEXT,
    metadata_json TEXT,
    occurred_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE INDEX IF NOT EXISTS idx_revenue_events_source_occurred
  ON revenue_events (source, occurred_at DESC);

  CREATE INDEX IF NOT EXISTS idx_revenue_events_agent_occurred
  ON revenue_events (agent_id, occurred_at DESC);

  CREATE INDEX IF NOT EXISTS idx_revenue_events_work_occurred
  ON revenue_events (work_id, occurred_at DESC);

  CREATE INDEX IF NOT EXISTS idx_revenue_events_settlement
  ON revenue_events (settlement_ref);
`);

export interface RevenueEvent {
  eventId: string;
  source: string;
  kind: string;
  agentId: string | null;
  workId: string | null;
  gross: number;
  fees: number;
  net: number;
  token: string;
  chain: string;
  status: string;
  receiptId: string | null;
  settlementRef: string | null;
  metadata: Record<string, unknown>;
  occurredAt: string;
  createdAt: string;
}

export interface RevenueEventInput {
  eventId?: string;
  source: string;
  kind: string;
  agentId?: string | null;
  workId?: string | null;
  gross: number;
  fees?: number;
  net?: number;
  token: string;
  chain: string;
  status: string;
  receiptId?: string | null;
  settlementRef?: string | null;
  metadata?: Record<string, unknown>;
  occurredAt?: string | number | Date;
}

function toUnixSeconds(value: RevenueEventInput['occurredAt']): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value > 10_000_000_000 ? Math.floor(value / 1000) : Math.floor(value);
  }
  if (value instanceof Date) {
    return Math.floor(value.getTime() / 1000);
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return Math.floor(parsed / 1000);
  }
  return Math.floor(Date.now() / 1000);
}

function parseMetadata(value: string | null): Record<string, unknown> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function mapRow(row: {
  event_id: string;
  source: string;
  kind: string;
  agent_id: string | null;
  work_id: string | null;
  gross: number;
  fees: number;
  net: number;
  token: string;
  chain: string;
  status: string;
  receipt_id: string | null;
  settlement_ref: string | null;
  metadata_json: string | null;
  occurred_at: number;
  created_at: number;
}): RevenueEvent {
  return {
    eventId: row.event_id,
    source: row.source,
    kind: row.kind,
    agentId: row.agent_id,
    workId: row.work_id,
    gross: row.gross,
    fees: row.fees,
    net: row.net,
    token: row.token,
    chain: row.chain,
    status: row.status,
    receiptId: row.receipt_id,
    settlementRef: row.settlement_ref,
    metadata: parseMetadata(row.metadata_json),
    occurredAt: new Date(row.occurred_at * 1000).toISOString(),
    createdAt: new Date(row.created_at * 1000).toISOString(),
  };
}

export function getRevenueEvent(eventId: string): RevenueEvent | null {
  const row = db.prepare(`
    SELECT
      event_id,
      source,
      kind,
      agent_id,
      work_id,
      gross,
      fees,
      net,
      token,
      chain,
      status,
      receipt_id,
      settlement_ref,
      metadata_json,
      occurred_at,
      created_at
    FROM revenue_events
    WHERE event_id = ?
    LIMIT 1
  `).get(eventId) as
    | {
        event_id: string;
        source: string;
        kind: string;
        agent_id: string | null;
        work_id: string | null;
        gross: number;
        fees: number;
        net: number;
        token: string;
        chain: string;
        status: string;
        receipt_id: string | null;
        settlement_ref: string | null;
        metadata_json: string | null;
        occurred_at: number;
        created_at: number;
      }
    | undefined;

  return row ? mapRow(row) : null;
}

export function recordRevenueEvent(input: RevenueEventInput): RevenueEvent {
  const eventId = input.eventId?.trim() || `rev_${randomUUID().slice(0, 18)}`;
  const gross = Number.isFinite(input.gross) ? input.gross : 0;
  const fees = Number.isFinite(input.fees) ? input.fees! : 0;
  const net = Number.isFinite(input.net) ? input.net! : gross - fees;
  const occurredAt = toUnixSeconds(input.occurredAt);

  db.prepare(`
    INSERT OR IGNORE INTO revenue_events (
      event_id,
      source,
      kind,
      agent_id,
      work_id,
      gross,
      fees,
      net,
      token,
      chain,
      status,
      receipt_id,
      settlement_ref,
      metadata_json,
      occurred_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    eventId,
    input.source,
    input.kind,
    input.agentId ?? null,
    input.workId ?? null,
    gross,
    fees,
    net,
    input.token,
    input.chain,
    input.status,
    input.receiptId ?? null,
    input.settlementRef ?? null,
    JSON.stringify(input.metadata ?? {}),
    occurredAt
  );

  return (
    getRevenueEvent(eventId) ?? {
      eventId,
      source: input.source,
      kind: input.kind,
      agentId: input.agentId ?? null,
      workId: input.workId ?? null,
      gross,
      fees,
      net,
      token: input.token,
      chain: input.chain,
      status: input.status,
      receiptId: input.receiptId ?? null,
      settlementRef: input.settlementRef ?? null,
      metadata: input.metadata ?? {},
      occurredAt: new Date(occurredAt * 1000).toISOString(),
      createdAt: new Date().toISOString(),
    }
  );
}
