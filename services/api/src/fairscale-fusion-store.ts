import db from './db';

const SCHEMA_NAME = 'fairscale_fusion';
const SCHEMA_VERSION = 1;

export interface FairscaleFusionEvent {
  eventId: string;
  canonicalHash: string | null;
  partner: string;
  wallet: string;
  serviceId: string;
  qualityScore: number;
  refundPct: number;
  timestampMs: number;
  proofHash: string;
  payloadJson: string;
  sourceSignature: string;
  keyId: string | null;
  createdAt: number;
}

export interface FairscaleFusionEventInsert {
  eventId: string;
  canonicalHash: string;
  partner: string;
  wallet: string;
  serviceId: string;
  qualityScore: number;
  refundPct: number;
  timestampMs: number;
  proofHash: string;
  payloadJson: string;
  sourceSignature: string;
  keyId?: string | null;
}

export interface FairscaleFusionServiceBreakdown {
  serviceId: string;
  sampleSize: number;
  avgQualityScore: number;
  avgRefundPct: number;
  reliabilityScore: number;
}

export interface FairscaleFusionReliabilitySummary {
  wallet: string;
  windowDays: number;
  windowStartMs: number;
  sampleSize: number;
  avgQualityScore: number;
  avgRefundPct: number;
  disputeRate: number;
  successRate: number;
  reliabilityScore: number;
  lastEventAtMs: number | null;
  services: FairscaleFusionServiceBreakdown[];
}

interface EventRow {
  event_id: string;
  canonical_hash: string | null;
  partner: string;
  wallet: string;
  service_id: string;
  quality_score: number;
  refund_pct: number;
  timestamp_ms: number;
  proof_hash: string;
  payload_json: string;
  source_signature: string;
  key_id: string | null;
  created_at: number;
}

interface ReliabilitySummaryRow {
  sample_size: number;
  avg_quality_score: number | null;
  avg_refund_pct: number | null;
  dispute_rate: number | null;
  success_rate: number | null;
  last_event_at_ms: number | null;
}

interface ReliabilityServiceRow {
  service_id: string;
  sample_size: number;
  avg_quality_score: number | null;
  avg_refund_pct: number | null;
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function round(value: number, decimals = 4): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function computeReliabilityScore(avgQualityScore: number, avgRefundPct: number): number {
  const weighted = avgQualityScore * (1 - clampPercent(avgRefundPct) / 100);
  return round(clampPercent(weighted));
}

function getSchemaVersion(): number {
  const row = db
    .prepare('SELECT version FROM fairscale_fusion_schema_migrations WHERE schema_name = ?')
    .get(SCHEMA_NAME) as { version: number } | undefined;
  return row?.version ?? 0;
}

function setSchemaVersion(version: number): void {
  db.prepare(
    `
      INSERT INTO fairscale_fusion_schema_migrations (schema_name, version, applied_at)
      VALUES (?, ?, unixepoch())
      ON CONFLICT(schema_name) DO UPDATE SET
        version = excluded.version,
        applied_at = excluded.applied_at
    `
  ).run(SCHEMA_NAME, version);
}

function runMigrations(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS fairscale_fusion_schema_migrations (
      schema_name TEXT PRIMARY KEY,
      version INTEGER NOT NULL,
      applied_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS fairscale_fusion_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id TEXT NOT NULL UNIQUE,
      canonical_hash TEXT,
      partner TEXT NOT NULL DEFAULT 'fairscale',
      wallet TEXT NOT NULL,
      service_id TEXT NOT NULL,
      quality_score REAL NOT NULL,
      refund_pct REAL NOT NULL,
      timestamp_ms INTEGER NOT NULL,
      proof_hash TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      source_signature TEXT NOT NULL,
      key_id TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE INDEX IF NOT EXISTS idx_fairscale_fusion_events_wallet_ts
      ON fairscale_fusion_events(wallet, timestamp_ms DESC);
    CREATE INDEX IF NOT EXISTS idx_fairscale_fusion_events_partner_ts
      ON fairscale_fusion_events(partner, timestamp_ms DESC);
    CREATE INDEX IF NOT EXISTS idx_fairscale_fusion_events_service_ts
      ON fairscale_fusion_events(service_id, timestamp_ms DESC);
  `);

  const tableColumns = db
    .prepare(`PRAGMA table_info(fairscale_fusion_events)`)
    .all() as Array<{ name: string }>;
  if (!tableColumns.some((column) => column.name === 'canonical_hash')) {
    db.exec('ALTER TABLE fairscale_fusion_events ADD COLUMN canonical_hash TEXT');
  }
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_fairscale_fusion_events_canonical_hash
    ON fairscale_fusion_events(canonical_hash)
    WHERE canonical_hash IS NOT NULL
  `);

  if (getSchemaVersion() < SCHEMA_VERSION) {
    setSchemaVersion(SCHEMA_VERSION);
  }
}

runMigrations();

function mapEventRow(row: EventRow): FairscaleFusionEvent {
  return {
    eventId: row.event_id,
    canonicalHash: row.canonical_hash,
    partner: row.partner,
    wallet: row.wallet,
    serviceId: row.service_id,
    qualityScore: row.quality_score,
    refundPct: row.refund_pct,
    timestampMs: row.timestamp_ms,
    proofHash: row.proof_hash,
    payloadJson: row.payload_json,
    sourceSignature: row.source_signature,
    keyId: row.key_id,
    createdAt: row.created_at,
  };
}

export function getFairscaleFusionEvent(eventId: string): FairscaleFusionEvent | null {
  const row = db
    .prepare(
      `
        SELECT event_id, canonical_hash, partner, wallet, service_id, quality_score, refund_pct,
               timestamp_ms, proof_hash, payload_json, source_signature, key_id, created_at
        FROM fairscale_fusion_events
        WHERE event_id = ?
      `
    )
    .get(eventId) as EventRow | undefined;

  return row ? mapEventRow(row) : null;
}

export function getFairscaleFusionEventByCanonicalHash(canonicalHash: string): FairscaleFusionEvent | null {
  const row = db
    .prepare(
      `
        SELECT event_id, canonical_hash, partner, wallet, service_id, quality_score, refund_pct,
               timestamp_ms, proof_hash, payload_json, source_signature, key_id, created_at
        FROM fairscale_fusion_events
        WHERE canonical_hash = ?
      `
    )
    .get(canonicalHash) as EventRow | undefined;

  return row ? mapEventRow(row) : null;
}

export function insertFairscaleFusionEvent(
  input: FairscaleFusionEventInsert
): { inserted: boolean; event: FairscaleFusionEvent } {
  const result = db
    .prepare(
      `
        INSERT INTO fairscale_fusion_events (
          event_id,
          canonical_hash,
          partner,
          wallet,
          service_id,
          quality_score,
          refund_pct,
          timestamp_ms,
          proof_hash,
          payload_json,
          source_signature,
          key_id
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT DO NOTHING
      `
    )
    .run(
      input.eventId,
      input.canonicalHash,
      input.partner,
      input.wallet,
      input.serviceId,
      input.qualityScore,
      input.refundPct,
      input.timestampMs,
      input.proofHash,
      input.payloadJson,
      input.sourceSignature,
      input.keyId ?? null
    );

  const event =
    getFairscaleFusionEvent(input.eventId) || getFairscaleFusionEventByCanonicalHash(input.canonicalHash);
  if (!event) {
    throw new Error(`Failed to load event after insert: ${input.eventId}`);
  }

  return {
    inserted: result.changes > 0,
    event,
  };
}

export function listFairscaleFusionEvents(params: {
  partner?: string;
  wallet?: string;
  sinceMs?: number;
  limit?: number;
}): FairscaleFusionEvent[] {
  const where: string[] = [];
  const values: Array<string | number> = [];

  if (params.partner) {
    where.push('partner = ?');
    values.push(params.partner);
  }

  if (params.wallet) {
    where.push('wallet = ?');
    values.push(params.wallet);
  }

  if (typeof params.sinceMs === 'number' && Number.isFinite(params.sinceMs)) {
    where.push('timestamp_ms >= ?');
    values.push(Math.floor(params.sinceMs));
  }

  const limit = Math.min(Math.max(Math.floor(params.limit ?? 100), 1), 500);

  const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
  const rows = db
    .prepare(
      `
        SELECT event_id, canonical_hash, partner, wallet, service_id, quality_score, refund_pct,
               timestamp_ms, proof_hash, payload_json, source_signature, key_id, created_at
        FROM fairscale_fusion_events
        ${whereClause}
        ORDER BY timestamp_ms DESC, id DESC
        LIMIT ?
      `
    )
    .all(...values, limit) as EventRow[];

  return rows.map(mapEventRow);
}

export function getFairscaleFusionReliabilitySummary(
  wallet: string,
  windowDays: number,
  serviceLimit = 10
): FairscaleFusionReliabilitySummary {
  const clampedWindowDays = Math.min(Math.max(Math.floor(windowDays || 30), 1), 365);
  const windowStartMs = Date.now() - clampedWindowDays * 24 * 60 * 60 * 1000;
  const clampedServiceLimit = Math.min(Math.max(Math.floor(serviceLimit), 1), 25);

  const summary = db
    .prepare(
      `
        SELECT
          COUNT(*) AS sample_size,
          AVG(quality_score) AS avg_quality_score,
          AVG(refund_pct) AS avg_refund_pct,
          AVG(CASE WHEN refund_pct > 0 THEN 1.0 ELSE 0.0 END) AS dispute_rate,
          AVG(CASE WHEN quality_score >= 80 THEN 1.0 ELSE 0.0 END) AS success_rate,
          MAX(timestamp_ms) AS last_event_at_ms
        FROM fairscale_fusion_events
        WHERE wallet = ? AND timestamp_ms >= ?
      `
    )
    .get(wallet, windowStartMs) as ReliabilitySummaryRow;

  const services = db
    .prepare(
      `
        SELECT
          service_id,
          COUNT(*) AS sample_size,
          AVG(quality_score) AS avg_quality_score,
          AVG(refund_pct) AS avg_refund_pct
        FROM fairscale_fusion_events
        WHERE wallet = ? AND timestamp_ms >= ?
        GROUP BY service_id
        ORDER BY sample_size DESC, avg_quality_score DESC
        LIMIT ?
      `
    )
    .all(wallet, windowStartMs, clampedServiceLimit) as ReliabilityServiceRow[];

  const sampleSize = summary.sample_size || 0;
  const avgQualityScore = round(summary.avg_quality_score ?? 0);
  const avgRefundPct = round(summary.avg_refund_pct ?? 0);
  const disputeRate = round((summary.dispute_rate ?? 0) * 100);
  const successRate = round((summary.success_rate ?? 0) * 100);

  return {
    wallet,
    windowDays: clampedWindowDays,
    windowStartMs,
    sampleSize,
    avgQualityScore,
    avgRefundPct,
    disputeRate,
    successRate,
    reliabilityScore: computeReliabilityScore(avgQualityScore, avgRefundPct),
    lastEventAtMs: summary.last_event_at_ms ?? null,
    services: services.map((row) => {
      const serviceAvgQuality = round(row.avg_quality_score ?? 0);
      const serviceAvgRefund = round(row.avg_refund_pct ?? 0);
      return {
        serviceId: row.service_id,
        sampleSize: row.sample_size,
        avgQualityScore: serviceAvgQuality,
        avgRefundPct: serviceAvgRefund,
        reliabilityScore: computeReliabilityScore(serviceAvgQuality, serviceAvgRefund),
      };
    }),
  };
}

export function __resetFairscaleFusionStoreForTests(): void {
  db.exec('DELETE FROM fairscale_fusion_events');
}
