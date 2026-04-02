import { randomUUID } from 'crypto';
import db from '../db';
import type { ControlRoomCaseEventType } from './types';

export function appendCaseEvent(params: {
  caseId: string;
  eventType: ControlRoomCaseEventType;
  payload: Record<string, unknown>;
  branchId?: string | null;
}): void {
  const id = `cf_evt_${randomUUID().slice(0, 12)}`;
  db.prepare(`
    INSERT INTO counterfactual_case_events (
      id, case_id, branch_id, event_type, payload_json, created_at
    )
    VALUES (?, ?, ?, ?, ?, unixepoch())
  `).run(
    id,
    params.caseId,
    params.branchId ?? null,
    params.eventType,
    JSON.stringify(params.payload)
  );
}

export function listCaseEvents(
  caseId: string,
  options: { afterCreatedAt?: number; limit?: number } = {}
): Array<{
  id: string;
  caseId: string;
  branchId: string | null;
  eventType: ControlRoomCaseEventType;
  payload: Record<string, unknown>;
  createdAt: number;
}> {
  const limit = Math.max(1, Math.min(options.limit ?? 500, 1000));
  const afterCreatedAt = options.afterCreatedAt ?? 0;
  const rows = db.prepare(`
    SELECT id, case_id, branch_id, event_type, payload_json, created_at
    FROM counterfactual_case_events
    WHERE case_id = ? AND created_at >= ?
    ORDER BY created_at ASC, rowid ASC
    LIMIT ?
  `).all(caseId, afterCreatedAt, limit) as Array<{
    id: string;
    case_id: string;
    branch_id: string | null;
    event_type: ControlRoomCaseEventType;
    payload_json: string;
    created_at: number;
  }>;

  return rows.map((row) => ({
    id: row.id,
    caseId: row.case_id,
    branchId: row.branch_id,
    eventType: row.event_type,
    payload: JSON.parse(row.payload_json),
    createdAt: row.created_at * 1000,
  }));
}
