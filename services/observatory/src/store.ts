import type { Db } from './db';

export type IngestedEvent = {
  type: 'escrow_created' | 'dispute_initiated' | 'dispute_resolved' | 'funds_released' | 'funds_refunded';
  escrowPda: string;
  sessionId: string | null;
  user: string | null;
  treasury: string | null;
  amount: bigint | null;
  rating: number | null;
  qualityScore: number | null;
  refundPercentage: number | null;
  paymentAmount: bigint | null;
  refundAmount: bigint | null;
  signature: string;
  timestamp: number;
  slot: number;
};

export type EscrowRow = {
  escrowPda: string;
  sessionId: string | null;
  user: string | null;
  treasury: string | null;
  amount: string | null;
  status: 'active' | 'disputed' | 'resolved' | 'released' | 'refunded' | 'unknown';
  createdAt: number | null;
  disputedAt: number | null;
  resolvedAt: number | null;
  releasedAt: number | null;
  refundedAt: number | null;
  rating: number | null;
  qualityScore: number | null;
  refundPercentage: number | null;
  paymentAmount: string | null;
  refundAmount: string | null;
  lastSignature: string | null;
  lastSlot: number | null;
  lastTs: number | null;
  updatedAt: number;
};

export function computeEventId(ev: Pick<IngestedEvent, 'signature' | 'type' | 'escrowPda' | 'sessionId'>): string {
  return `${ev.signature}:${ev.type}:${ev.escrowPda}:${ev.sessionId ?? ''}`;
}

function jsonStringify(value: unknown): string {
  return JSON.stringify(value, (_, v) => (typeof v === 'bigint' ? v.toString() : v));
}

export function insertEvents(db: Db, events: IngestedEvent[]): { inserted: number; affectedEscrows: string[] } {
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO events (
      id, signature, slot, ts, type, escrow_pda,
      session_id, user, treasury, amount, rating,
      quality_score, refund_percentage, payment_amount, refund_amount,
      raw_json, received_at
    ) VALUES (
      @id, @signature, @slot, @ts, @type, @escrow_pda,
      @session_id, @user, @treasury, @amount, @rating,
      @quality_score, @refund_percentage, @payment_amount, @refund_amount,
      @raw_json, @received_at
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
        session_id: ev.sessionId,
        user: ev.user,
        treasury: ev.treasury,
        amount: ev.amount !== null ? ev.amount.toString() : null,
        rating: ev.rating,
        quality_score: ev.qualityScore,
        refund_percentage: ev.refundPercentage,
        payment_amount: ev.paymentAmount !== null ? ev.paymentAmount.toString() : null,
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
    `SELECT session_id, user, treasury, amount, ts FROM events WHERE escrow_pda = ? AND type = 'escrow_created' ORDER BY slot ASC LIMIT 1`
  );
  const disputedStmt = db.prepare(
    `SELECT user, ts FROM events WHERE escrow_pda = ? AND type = 'dispute_initiated' ORDER BY slot ASC LIMIT 1`
  );
  const resolvedStmt = db.prepare(
    `SELECT quality_score, refund_percentage, payment_amount, refund_amount, ts FROM events WHERE escrow_pda = ? AND type = 'dispute_resolved' ORDER BY slot DESC LIMIT 1`
  );
  const releasedStmt = db.prepare(
    `SELECT user, treasury, amount, rating, payment_amount, ts FROM events WHERE escrow_pda = ? AND type = 'funds_released' ORDER BY slot DESC LIMIT 1`
  );
  const refundedStmt = db.prepare(
    `SELECT user, amount, rating, refund_amount, ts FROM events WHERE escrow_pda = ? AND type = 'funds_refunded' ORDER BY slot DESC LIMIT 1`
  );
  const lastStmt = db.prepare(
    `SELECT signature, slot, ts FROM events WHERE escrow_pda = ? ORDER BY slot DESC LIMIT 1`
  );

  const upsert = db.prepare(`
    INSERT INTO escrows (
      escrow_pda, session_id, user, treasury, amount, status,
      created_at, disputed_at, resolved_at, released_at, refunded_at,
      rating, quality_score, refund_percentage, payment_amount, refund_amount,
      last_signature, last_slot, last_ts, updated_at
    ) VALUES (
      @escrow_pda, @session_id, @user, @treasury, @amount, @status,
      @created_at, @disputed_at, @resolved_at, @released_at, @refunded_at,
      @rating, @quality_score, @refund_percentage, @payment_amount, @refund_amount,
      @last_signature, @last_slot, @last_ts, @updated_at
    )
    ON CONFLICT(escrow_pda) DO UPDATE SET
      session_id = excluded.session_id,
      user = excluded.user,
      treasury = excluded.treasury,
      amount = excluded.amount,
      status = excluded.status,
      created_at = excluded.created_at,
      disputed_at = excluded.disputed_at,
      resolved_at = excluded.resolved_at,
      released_at = excluded.released_at,
      refunded_at = excluded.refunded_at,
      rating = excluded.rating,
      quality_score = excluded.quality_score,
      refund_percentage = excluded.refund_percentage,
      payment_amount = excluded.payment_amount,
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
        | { session_id: string | null; user: string | null; treasury: string | null; amount: string | null; ts: number }
        | undefined;
      const disputed = disputedStmt.get(escrowPda) as
        | { user: string | null; ts: number }
        | undefined;
      const resolved = resolvedStmt.get(escrowPda) as
        | { quality_score: number | null; refund_percentage: number | null; payment_amount: string | null; refund_amount: string | null; ts: number }
        | undefined;
      const released = releasedStmt.get(escrowPda) as
        | { user: string | null; treasury: string | null; amount: string | null; rating: number | null; payment_amount: string | null; ts: number }
        | undefined;
      const refunded = refundedStmt.get(escrowPda) as
        | { user: string | null; amount: string | null; rating: number | null; refund_amount: string | null; ts: number }
        | undefined;
      const last = lastStmt.get(escrowPda) as
        | { signature: string; slot: number; ts: number }
        | undefined;

      let status: EscrowRow['status'] = 'unknown';
      if (resolved) status = 'resolved';
      else if (released) status = 'released';
      else if (refunded) status = 'refunded';
      else if (disputed) status = 'disputed';
      else if (created) status = 'active';

      const row = {
        escrow_pda: escrowPda,
        session_id: created?.session_id ?? null,
        user: created?.user ?? released?.user ?? refunded?.user ?? disputed?.user ?? null,
        treasury: created?.treasury ?? released?.treasury ?? null,
        amount: created?.amount ?? null,
        status,
        created_at: created?.ts ?? null,
        disputed_at: disputed?.ts ?? null,
        resolved_at: resolved?.ts ?? null,
        released_at: released?.ts ?? null,
        refunded_at: refunded?.ts ?? null,
        rating: released?.rating ?? refunded?.rating ?? null,
        quality_score: resolved?.quality_score ?? null,
        refund_percentage: resolved?.refund_percentage ?? null,
        payment_amount: resolved?.payment_amount ?? released?.payment_amount ?? null,
        refund_amount: resolved?.refund_amount ?? refunded?.refund_amount ?? null,
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
    sessionId: row.session_id,
    user: row.user,
    treasury: row.treasury,
    amount: row.amount,
    status: row.status,
    createdAt: row.created_at,
    disputedAt: row.disputed_at,
    resolvedAt: row.resolved_at,
    releasedAt: row.released_at,
    refundedAt: row.refunded_at,
    rating: row.rating,
    qualityScore: row.quality_score,
    refundPercentage: row.refund_percentage,
    paymentAmount: row.payment_amount,
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
    sessionId: row.session_id,
    user: row.user,
    treasury: row.treasury,
    amount: row.amount,
    status: row.status,
    createdAt: row.created_at,
    disputedAt: row.disputed_at,
    resolvedAt: row.resolved_at,
    releasedAt: row.released_at,
    refundedAt: row.refunded_at,
    rating: row.rating,
    qualityScore: row.quality_score,
    refundPercentage: row.refund_percentage,
    paymentAmount: row.payment_amount,
    refundAmount: row.refund_amount,
    lastSignature: row.last_signature,
    lastSlot: row.last_slot,
    lastTs: row.last_ts,
    updatedAt: row.updated_at,
  }));
}

export function listEscrowsBySessionId(db: Db, sessionId: string): EscrowRow[] {
  const rows = db.prepare(`SELECT * FROM escrows WHERE session_id = ? ORDER BY updated_at DESC`).all(sessionId) as any[];
  return rows.map((row) => ({
    escrowPda: row.escrow_pda,
    sessionId: row.session_id,
    user: row.user,
    treasury: row.treasury,
    amount: row.amount,
    status: row.status,
    createdAt: row.created_at,
    disputedAt: row.disputed_at,
    resolvedAt: row.resolved_at,
    releasedAt: row.released_at,
    refundedAt: row.refunded_at,
    rating: row.rating,
    qualityScore: row.quality_score,
    refundPercentage: row.refund_percentage,
    paymentAmount: row.payment_amount,
    refundAmount: row.refund_amount,
    lastSignature: row.last_signature,
    lastSlot: row.last_slot,
    lastTs: row.last_ts,
    updatedAt: row.updated_at,
  }));
}

export function listEvents(
  db: Db,
  params: { escrowPda?: string; sessionId?: string; limit?: number }
): Array<Record<string, unknown>> {
  const limit = Math.max(1, Math.min(params.limit ?? 100, 1000));

  if (params.escrowPda) {
    return db
      .prepare(`SELECT * FROM events WHERE escrow_pda = ? ORDER BY slot DESC LIMIT ?`)
      .all(params.escrowPda, limit) as any[];
  }

  if (params.sessionId) {
    return db
      .prepare(`SELECT * FROM events WHERE session_id = ? ORDER BY slot DESC LIMIT ?`)
      .all(params.sessionId, limit) as any[];
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
