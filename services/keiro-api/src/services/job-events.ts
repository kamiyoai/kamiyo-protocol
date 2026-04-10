import type { JobEvent } from '../types/index.js';
import {
  keiroUsePostgres,
  newUuid,
  parseJsonRecord,
  queryKeiro,
  queryKeiroOne,
  toIsoString,
} from './store.js';

const events = new Map<string, JobEvent>();
const eventsByIdempotency = new Map<string, string>();

type CreateJobEventParams = {
  jobId: string;
  agentId?: string | null;
  eventType: JobEvent['eventType'];
  idempotencyKey?: string | null;
  escrowRef?: string | null;
  settlementRef?: string | null;
  receiptId?: string | null;
  payload?: Record<string, unknown>;
};

function rowToJobEvent(row: Record<string, unknown>): JobEvent {
  return {
    id: String(row.id),
    jobId: String(row.job_id),
    agentId: typeof row.agent_id === 'string' ? row.agent_id : undefined,
    eventType: row.event_type as JobEvent['eventType'],
    idempotencyKey: typeof row.idempotency_key === 'string' ? row.idempotency_key : undefined,
    escrowRef: typeof row.escrow_ref === 'string' ? row.escrow_ref : undefined,
    settlementRef: typeof row.settlement_ref === 'string' ? row.settlement_ref : undefined,
    receiptId: typeof row.receipt_id === 'string' ? row.receipt_id : undefined,
    payload: parseJsonRecord(row.payload, {}),
    createdAt: toIsoString(row.created_at),
  };
}

export const jobEventService = {
  async getByIdempotencyKey(idempotencyKey: string): Promise<JobEvent | undefined> {
    const key = idempotencyKey.trim();
    if (!key) return undefined;

    if (!keiroUsePostgres) {
      const eventId = eventsByIdempotency.get(key);
      return eventId ? events.get(eventId) : undefined;
    }

    const row = await queryKeiroOne<Record<string, unknown>>(
      `SELECT *
       FROM keiro_job_events
       WHERE idempotency_key = $1
       LIMIT 1`,
      [key]
    );
    return row ? rowToJobEvent(row) : undefined;
  },

  async create(params: CreateJobEventParams): Promise<JobEvent> {
    const key = params.idempotencyKey?.trim() || null;
    if (key) {
      const existing = await this.getByIdempotencyKey(key);
      if (existing) return existing;
    }

    const event: JobEvent = {
      id: newUuid(),
      jobId: params.jobId,
      agentId: params.agentId ?? undefined,
      eventType: params.eventType,
      idempotencyKey: key ?? undefined,
      escrowRef: params.escrowRef ?? undefined,
      settlementRef: params.settlementRef ?? undefined,
      receiptId: params.receiptId ?? undefined,
      payload: params.payload ?? {},
      createdAt: new Date().toISOString(),
    };

    if (!keiroUsePostgres) {
      events.set(event.id, event);
      if (key) eventsByIdempotency.set(key, event.id);
      return event;
    }

    await queryKeiro(
      `INSERT INTO keiro_job_events (
         id, job_id, agent_id, event_type, idempotency_key,
         escrow_ref, settlement_ref, receipt_id, payload, created_at
       )
       VALUES (
         $1::uuid, $2, $3, $4, $5,
         $6, $7, $8, $9::jsonb, $10::timestamptz
       )`,
      [
        event.id,
        event.jobId,
        event.agentId ?? null,
        event.eventType,
        event.idempotencyKey ?? null,
        event.escrowRef ?? null,
        event.settlementRef ?? null,
        event.receiptId ?? null,
        JSON.stringify(event.payload),
        event.createdAt,
      ]
    );

    return event;
  },
};
