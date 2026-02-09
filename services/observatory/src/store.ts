import type { Db } from './db';

export type IngestedEvent = {
  type: 'escrow_created' | 'dispute_initiated' | 'dispute_resolved' | 'funds_released';
  escrowPda: string;
  transactionId: string | null;
  agent: string | null;
  api: string | null;
  amount: bigint | null;
  qualityScore: number | null;
  refundPercentage: number | null;
  refundAmount: bigint | null;
  signature: string;
  timestamp: number;
  slot: number;
};

export type EscrowRow = {
  escrowPda: string;
  transactionId: string | null;
  agent: string | null;
  api: string | null;
  amount: string | null;
  status: 'active' | 'disputed' | 'resolved' | 'released' | 'unknown';
  createdAt: number | null;
  disputedAt: number | null;
  resolvedAt: number | null;
  releasedAt: number | null;
  qualityScore: number | null;
  refundPercentage: number | null;
  refundAmount: string | null;
  lastSignature: string | null;
  lastSlot: number | null;
  lastTs: number | null;
  updatedAt: number;
};

export function computeEventId(ev: Pick<IngestedEvent, 'signature' | 'type' | 'escrowPda' | 'transactionId'>): string {
  return `${ev.signature}:${ev.type}:${ev.escrowPda}:${ev.transactionId ?? ''}`;
}

function jsonStringify(value: unknown): string {
  return JSON.stringify(value, (_, v) => (typeof v === 'bigint' ? v.toString() : v));
}

export function insertEvents(db: Db, events: IngestedEvent[]): { inserted: number; affectedEscrows: string[] } {
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO events (
      id, signature, slot, ts, type, escrow_pda, transaction_id, agent, api,
      amount, quality_score, refund_percentage, refund_amount, raw_json, received_at
    ) VALUES (
      @id, @signature, @slot, @ts, @type, @escrow_pda, @transaction_id, @agent, @api,
      @amount, @quality_score, @refund_percentage, @refund_amount, @raw_json, @received_at
    )
  `);

  const now = Math.floor(Date.now() / 1000);
  const escrows = new Set<string>();
  let inserted = 0;

  const tx = db.transaction((rows: IngestedEvent[]) => {
    for (const ev of rows) {
      escrows.add(ev.escrowPda);
      const info = stmt.run({
        id: computeEventId(ev),
        signature: ev.signature,
        slot: ev.slot,
        ts: ev.timestamp,
        type: ev.type,
        escrow_pda: ev.escrowPda,
        transaction_id: ev.transactionId,
        agent: ev.agent,
        api: ev.api,
        amount: ev.amount !== null ? ev.amount.toString() : null,
        quality_score: ev.qualityScore,
        refund_percentage: ev.refundPercentage,
        refund_amount: ev.refundAmount !== null ? ev.refundAmount.toString() : null,
        raw_json: jsonStringify(ev),
        received_at: now,
      });
      inserted += info.changes;
    }
  });

  tx(events);
  return { inserted, affectedEscrows: Array.from(escrows) };
}

export function refreshEscrows(db: Db, escrowPdas: string[]): { updated: number } {
  const createdStmt = db.prepare(
    `SELECT transaction_id, agent, api, amount, ts FROM events WHERE escrow_pda = ? AND type = 'escrow_created' ORDER BY slot ASC LIMIT 1`
  );
  const disputedStmt = db.prepare(
    `SELECT agent, ts FROM events WHERE escrow_pda = ? AND type = 'dispute_initiated' ORDER BY slot ASC LIMIT 1`
  );
  const resolvedStmt = db.prepare(
    `SELECT agent, api, quality_score, refund_percentage, refund_amount, ts FROM events WHERE escrow_pda = ? AND type = 'dispute_resolved' ORDER BY slot DESC LIMIT 1`
  );
  const releasedStmt = db.prepare(
    `SELECT agent, api, amount, ts FROM events WHERE escrow_pda = ? AND type = 'funds_released' ORDER BY slot DESC LIMIT 1`
  );
  const lastStmt = db.prepare(
    `SELECT signature, slot, ts FROM events WHERE escrow_pda = ? ORDER BY slot DESC LIMIT 1`
  );

  const upsert = db.prepare(`
    INSERT INTO escrows (
      escrow_pda, transaction_id, agent, api, amount, status,
      created_at, disputed_at, resolved_at, released_at,
      quality_score, refund_percentage, refund_amount,
      last_signature, last_slot, last_ts, updated_at
    ) VALUES (
      @escrow_pda, @transaction_id, @agent, @api, @amount, @status,
      @created_at, @disputed_at, @resolved_at, @released_at,
      @quality_score, @refund_percentage, @refund_amount,
      @last_signature, @last_slot, @last_ts, @updated_at
    )
    ON CONFLICT(escrow_pda) DO UPDATE SET
      transaction_id = excluded.transaction_id,
      agent = excluded.agent,
      api = excluded.api,
      amount = excluded.amount,
      status = excluded.status,
      created_at = excluded.created_at,
      disputed_at = excluded.disputed_at,
      resolved_at = excluded.resolved_at,
      released_at = excluded.released_at,
      quality_score = excluded.quality_score,
      refund_percentage = excluded.refund_percentage,
      refund_amount = excluded.refund_amount,
      last_signature = excluded.last_signature,
      last_slot = excluded.last_slot,
      last_ts = excluded.last_ts,
      updated_at = excluded.updated_at
  `);

  let updated = 0;
  const updatedAt = Math.floor(Date.now() / 1000);

  const tx = db.transaction((pdas: string[]) => {
    for (const escrowPda of pdas) {
      const created = createdStmt.get(escrowPda) as
        | { transaction_id: string | null; agent: string | null; api: string | null; amount: string | null; ts: number }
        | undefined;
      const disputed = disputedStmt.get(escrowPda) as
        | { agent: string | null; ts: number }
        | undefined;
      const resolved = resolvedStmt.get(escrowPda) as
        | { agent: string | null; api: string | null; quality_score: number | null; refund_percentage: number | null; refund_amount: string | null; ts: number }
        | undefined;
      const released = releasedStmt.get(escrowPda) as
        | { agent: string | null; api: string | null; amount: string | null; ts: number }
        | undefined;
      const last = lastStmt.get(escrowPda) as
        | { signature: string; slot: number; ts: number }
        | undefined;

      let status: EscrowRow['status'] = 'unknown';
      if (resolved) status = 'resolved';
      else if (released) status = 'released';
      else if (disputed) status = 'disputed';
      else if (created) status = 'active';

      const row = {
        escrow_pda: escrowPda,
        transaction_id: created?.transaction_id ?? null,
        agent: created?.agent ?? resolved?.agent ?? released?.agent ?? disputed?.agent ?? null,
        api: created?.api ?? resolved?.api ?? released?.api ?? null,
        amount: created?.amount ?? released?.amount ?? null,
        status,
        created_at: created?.ts ?? null,
        disputed_at: disputed?.ts ?? null,
        resolved_at: resolved?.ts ?? null,
        released_at: released?.ts ?? null,
        quality_score: resolved?.quality_score ?? null,
        refund_percentage: resolved?.refund_percentage ?? null,
        refund_amount: resolved?.refund_amount ?? null,
        last_signature: last?.signature ?? null,
        last_slot: last?.slot ?? null,
        last_ts: last?.ts ?? null,
        updated_at: updatedAt,
      };

      const info = upsert.run(row);
      updated += info.changes;
    }
  });

  tx(escrowPdas);
  return { updated };
}

export function getEscrow(db: Db, escrowPda: string): EscrowRow | null {
  const row = db.prepare(`SELECT * FROM escrows WHERE escrow_pda = ?`).get(escrowPda) as any;
  if (!row) return null;
  return {
    escrowPda: row.escrow_pda,
    transactionId: row.transaction_id,
    agent: row.agent,
    api: row.api,
    amount: row.amount,
    status: row.status,
    createdAt: row.created_at,
    disputedAt: row.disputed_at,
    resolvedAt: row.resolved_at,
    releasedAt: row.released_at,
    qualityScore: row.quality_score,
    refundPercentage: row.refund_percentage,
    refundAmount: row.refund_amount,
    lastSignature: row.last_signature,
    lastSlot: row.last_slot,
    lastTs: row.last_ts,
    updatedAt: row.updated_at,
  };
}

export function listEscrows(
  db: Db,
  params: { status?: EscrowRow['status']; updatedSince?: number; limit?: number } = {}
): EscrowRow[] {
  const limit = Math.max(1, Math.min(params.limit ?? 100, 1000));
  const updatedSince = params.updatedSince ?? 0;

  let rows: any[];
  if (params.status) {
    rows = db
      .prepare(`SELECT * FROM escrows WHERE status = ? AND updated_at >= ? ORDER BY updated_at DESC LIMIT ?`)
      .all(params.status, updatedSince, limit) as any[];
  } else {
    rows = db
      .prepare(`SELECT * FROM escrows WHERE updated_at >= ? ORDER BY updated_at DESC LIMIT ?`)
      .all(updatedSince, limit) as any[];
  }

  return rows.map((row) => ({
    escrowPda: row.escrow_pda,
    transactionId: row.transaction_id,
    agent: row.agent,
    api: row.api,
    amount: row.amount,
    status: row.status,
    createdAt: row.created_at,
    disputedAt: row.disputed_at,
    resolvedAt: row.resolved_at,
    releasedAt: row.released_at,
    qualityScore: row.quality_score,
    refundPercentage: row.refund_percentage,
    refundAmount: row.refund_amount,
    lastSignature: row.last_signature,
    lastSlot: row.last_slot,
    lastTs: row.last_ts,
    updatedAt: row.updated_at,
  }));
}

export function listEscrowsByTransactionId(db: Db, transactionId: string): EscrowRow[] {
  const rows = db.prepare(`SELECT * FROM escrows WHERE transaction_id = ? ORDER BY updated_at DESC`).all(transactionId) as any[];
  return rows.map((row) => ({
    escrowPda: row.escrow_pda,
    transactionId: row.transaction_id,
    agent: row.agent,
    api: row.api,
    amount: row.amount,
    status: row.status,
    createdAt: row.created_at,
    disputedAt: row.disputed_at,
    resolvedAt: row.resolved_at,
    releasedAt: row.released_at,
    qualityScore: row.quality_score,
    refundPercentage: row.refund_percentage,
    refundAmount: row.refund_amount,
    lastSignature: row.last_signature,
    lastSlot: row.last_slot,
    lastTs: row.last_ts,
    updatedAt: row.updated_at,
  }));
}

export function listEvents(
  db: Db,
  params: { escrowPda?: string; transactionId?: string; limit?: number }
): Array<Record<string, unknown>> {
  const limit = Math.max(1, Math.min(params.limit ?? 100, 1000));

  if (params.escrowPda) {
    return db
      .prepare(`SELECT * FROM events WHERE escrow_pda = ? ORDER BY slot DESC LIMIT ?`)
      .all(params.escrowPda, limit) as any[];
  }

  if (params.transactionId) {
    return db
      .prepare(`SELECT * FROM events WHERE transaction_id = ? ORDER BY slot DESC LIMIT ?`)
      .all(params.transactionId, limit) as any[];
  }

  return db.prepare(`SELECT * FROM events ORDER BY slot DESC LIMIT ?`).all(limit) as any[];
}

export function getStats(db: Db): {
  totalEvents: number;
  totalEscrows: number;
  byStatus: Record<string, number>;
} {
  const totalEvents = (db.prepare(`SELECT COUNT(*) AS n FROM events`).get() as any).n as number;
  const totalEscrows = (db.prepare(`SELECT COUNT(*) AS n FROM escrows`).get() as any).n as number;

  const rows = db.prepare(`SELECT status, COUNT(*) AS n FROM escrows GROUP BY status`).all() as any[];
  const byStatus: Record<string, number> = {};
  for (const r of rows) byStatus[r.status] = r.n;

  return { totalEvents, totalEscrows, byStatus };
}
