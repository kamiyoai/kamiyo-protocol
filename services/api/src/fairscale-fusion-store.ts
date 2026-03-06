import { Pool, type PoolConfig } from 'pg';
import db from './db';
import { logger } from './logger';

const SCHEMA_NAME = 'fairscale_fusion';
const SCHEMA_VERSION = 1;
const POSTGRES_BACKEND = 'postgres';
const SQLITE_BACKEND = 'sqlite';

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

export interface FairscaleFusionStoreStatus {
  backend: 'sqlite' | 'postgres';
  durable: boolean;
  databaseUrlConfigured: boolean;
}

interface EventRow {
  event_id: string;
  canonical_hash: string | null;
  partner: string;
  wallet: string;
  service_id: string;
  quality_score: number | string;
  refund_pct: number | string;
  timestamp_ms: number | string;
  proof_hash: string;
  payload_json: string;
  source_signature: string;
  key_id: string | null;
  created_at: number | string;
}

interface ReliabilitySummaryRow {
  sample_size: number | string;
  avg_quality_score: number | string | null;
  avg_refund_pct: number | string | null;
  dispute_rate: number | string | null;
  success_rate: number | string | null;
  last_event_at_ms: number | string | null;
}

interface ReliabilityServiceRow {
  service_id: string;
  sample_size: number | string;
  avg_quality_score: number | string | null;
  avg_refund_pct: number | string | null;
}

interface FairscaleFusionStore {
  readonly backend: 'sqlite' | 'postgres';
  readonly durable: boolean;
  init(): Promise<void>;
  getEvent(eventId: string): Promise<FairscaleFusionEvent | null>;
  getEventByCanonicalHash(canonicalHash: string): Promise<FairscaleFusionEvent | null>;
  insertEvent(input: FairscaleFusionEventInsert): Promise<{ inserted: boolean; event: FairscaleFusionEvent }>;
  listEvents(params: {
    partner?: string;
    wallet?: string;
    sinceMs?: number;
    limit?: number;
  }): Promise<FairscaleFusionEvent[]>;
  getReliabilitySummary(
    wallet: string,
    windowDays: number,
    serviceLimit: number
  ): Promise<FairscaleFusionReliabilitySummary>;
  resetForTests(): Promise<void>;
  close(): Promise<void>;
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

function toNumber(value: number | string | null | undefined): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function mapEventRow(row: EventRow): FairscaleFusionEvent {
  return {
    eventId: row.event_id,
    canonicalHash: row.canonical_hash,
    partner: row.partner,
    wallet: row.wallet,
    serviceId: row.service_id,
    qualityScore: toNumber(row.quality_score),
    refundPct: toNumber(row.refund_pct),
    timestampMs: toNumber(row.timestamp_ms),
    proofHash: row.proof_hash,
    payloadJson: row.payload_json,
    sourceSignature: row.source_signature,
    keyId: row.key_id,
    createdAt: toNumber(row.created_at),
  };
}

function mapReliabilitySummary(
  wallet: string,
  windowDays: number,
  windowStartMs: number,
  summary: ReliabilitySummaryRow,
  services: ReliabilityServiceRow[]
): FairscaleFusionReliabilitySummary {
  const sampleSize = toNumber(summary.sample_size);
  const avgQualityScore = round(toNumber(summary.avg_quality_score));
  const avgRefundPct = round(toNumber(summary.avg_refund_pct));
  const disputeRate = round(toNumber(summary.dispute_rate) * 100);
  const successRate = round(toNumber(summary.success_rate) * 100);

  return {
    wallet,
    windowDays,
    windowStartMs,
    sampleSize,
    avgQualityScore,
    avgRefundPct,
    disputeRate,
    successRate,
    reliabilityScore: computeReliabilityScore(avgQualityScore, avgRefundPct),
    lastEventAtMs: summary.last_event_at_ms === null ? null : toNumber(summary.last_event_at_ms),
    services: services.map((row) => {
      const serviceAvgQuality = round(toNumber(row.avg_quality_score));
      const serviceAvgRefund = round(toNumber(row.avg_refund_pct));
      return {
        serviceId: row.service_id,
        sampleSize: toNumber(row.sample_size),
        avgQualityScore: serviceAvgQuality,
        avgRefundPct: serviceAvgRefund,
        reliabilityScore: computeReliabilityScore(serviceAvgQuality, serviceAvgRefund),
      };
    }),
  };
}

function getPostgresConnectionString(): string {
  return process.env.FUSION_FAIRSCALE_DATABASE_URL?.trim() || '';
}

function shouldUseSsl(connectionString: string): boolean {
  const mode = process.env.PGSSLMODE?.trim().toLowerCase();
  if (mode === 'disable') return false;
  if (mode && mode !== 'allow' && mode !== 'prefer') return true;
  if (/sslmode=disable/i.test(connectionString)) return false;
  if (/sslmode=(?:require|verify-ca|verify-full)/i.test(connectionString)) return true;
  return process.env.RENDER === 'true' || process.env.NODE_ENV === 'production';
}

class SqliteFairscaleFusionStore implements FairscaleFusionStore {
  readonly backend = SQLITE_BACKEND;
  readonly durable = false;
  private ready = false;

  async init(): Promise<void> {
    if (this.ready) return;

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

    const tableColumns = db.prepare('PRAGMA table_info(fairscale_fusion_events)').all() as Array<{ name: string }>;
    if (!tableColumns.some((column) => column.name === 'canonical_hash')) {
      db.exec('ALTER TABLE fairscale_fusion_events ADD COLUMN canonical_hash TEXT');
    }

    db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_fairscale_fusion_events_canonical_hash
      ON fairscale_fusion_events(canonical_hash)
      WHERE canonical_hash IS NOT NULL
    `);

    const row = db
      .prepare('SELECT version FROM fairscale_fusion_schema_migrations WHERE schema_name = ?')
      .get(SCHEMA_NAME) as { version: number } | undefined;

    if ((row?.version ?? 0) < SCHEMA_VERSION) {
      db.prepare(
        `
          INSERT INTO fairscale_fusion_schema_migrations (schema_name, version, applied_at)
          VALUES (?, ?, unixepoch())
          ON CONFLICT(schema_name) DO UPDATE SET
            version = excluded.version,
            applied_at = excluded.applied_at
        `
      ).run(SCHEMA_NAME, SCHEMA_VERSION);
    }

    this.ready = true;
  }

  async getEvent(eventId: string): Promise<FairscaleFusionEvent | null> {
    await this.init();
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

  async getEventByCanonicalHash(canonicalHash: string): Promise<FairscaleFusionEvent | null> {
    await this.init();
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

  async insertEvent(input: FairscaleFusionEventInsert): Promise<{ inserted: boolean; event: FairscaleFusionEvent }> {
    await this.init();

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

    const event = (await this.getEvent(input.eventId)) || (await this.getEventByCanonicalHash(input.canonicalHash));
    if (!event) {
      throw new Error(`Failed to load event after insert: ${input.eventId}`);
    }

    return {
      inserted: result.changes > 0,
      event,
    };
  }

  async listEvents(params: {
    partner?: string;
    wallet?: string;
    sinceMs?: number;
    limit?: number;
  }): Promise<FairscaleFusionEvent[]> {
    await this.init();

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

  async getReliabilitySummary(
    wallet: string,
    windowDays: number,
    serviceLimit = 10
  ): Promise<FairscaleFusionReliabilitySummary> {
    await this.init();

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

    return mapReliabilitySummary(wallet, clampedWindowDays, windowStartMs, summary, services);
  }

  async resetForTests(): Promise<void> {
    await this.init();
    db.exec('DELETE FROM fairscale_fusion_events');
  }

  async close(): Promise<void> {
    return;
  }
}

class PostgresFairscaleFusionStore implements FairscaleFusionStore {
  readonly backend = POSTGRES_BACKEND;
  readonly durable = true;
  private readonly pool: Pool;
  private initPromise: Promise<void> | null = null;

  constructor(connectionString: string) {
    const config: PoolConfig = {
      connectionString,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
      ssl: shouldUseSsl(connectionString) ? { rejectUnauthorized: false } : undefined,
    };

    this.pool = new Pool(config);
    this.pool.on('error', (error) => {
      logger.error('FairScale fusion postgres pool error', { error: error.message });
    });
  }

  async init(): Promise<void> {
    if (!this.initPromise) {
      this.initPromise = this.runMigrations();
    }
    return this.initPromise;
  }

  private async runMigrations(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS fairscale_fusion_schema_migrations (
        schema_name TEXT PRIMARY KEY,
        version INTEGER NOT NULL,
        applied_at BIGINT NOT NULL
      )
    `);

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS fairscale_fusion_events (
        id BIGSERIAL PRIMARY KEY,
        event_id TEXT NOT NULL UNIQUE,
        canonical_hash TEXT,
        partner TEXT NOT NULL DEFAULT 'fairscale',
        wallet TEXT NOT NULL,
        service_id TEXT NOT NULL,
        quality_score DOUBLE PRECISION NOT NULL,
        refund_pct DOUBLE PRECISION NOT NULL,
        timestamp_ms BIGINT NOT NULL,
        proof_hash TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        source_signature TEXT NOT NULL,
        key_id TEXT,
        created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW())::BIGINT)
      )
    `);

    await this.pool.query('ALTER TABLE fairscale_fusion_events ADD COLUMN IF NOT EXISTS canonical_hash TEXT');

    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS idx_fairscale_fusion_events_wallet_ts
      ON fairscale_fusion_events(wallet, timestamp_ms DESC)
    `);
    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS idx_fairscale_fusion_events_partner_ts
      ON fairscale_fusion_events(partner, timestamp_ms DESC)
    `);
    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS idx_fairscale_fusion_events_service_ts
      ON fairscale_fusion_events(service_id, timestamp_ms DESC)
    `);
    await this.pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_fairscale_fusion_events_canonical_hash
      ON fairscale_fusion_events(canonical_hash)
      WHERE canonical_hash IS NOT NULL
    `);

    const versionRow = await this.pool.query<{ version: number }>(
      'SELECT version FROM fairscale_fusion_schema_migrations WHERE schema_name = $1',
      [SCHEMA_NAME]
    );
    const version = versionRow.rows[0]?.version ?? 0;
    if (version < SCHEMA_VERSION) {
      await this.pool.query(
        `
          INSERT INTO fairscale_fusion_schema_migrations (schema_name, version, applied_at)
          VALUES ($1, $2, EXTRACT(EPOCH FROM NOW())::BIGINT)
          ON CONFLICT(schema_name) DO UPDATE SET
            version = EXCLUDED.version,
            applied_at = EXCLUDED.applied_at
        `,
        [SCHEMA_NAME, SCHEMA_VERSION]
      );
    }
  }

  async getEvent(eventId: string): Promise<FairscaleFusionEvent | null> {
    await this.init();
    const result = await this.pool.query<EventRow>(
      `
        SELECT event_id, canonical_hash, partner, wallet, service_id, quality_score, refund_pct,
               timestamp_ms, proof_hash, payload_json, source_signature, key_id, created_at
        FROM fairscale_fusion_events
        WHERE event_id = $1
      `,
      [eventId]
    );

    return result.rows[0] ? mapEventRow(result.rows[0]) : null;
  }

  async getEventByCanonicalHash(canonicalHash: string): Promise<FairscaleFusionEvent | null> {
    await this.init();
    const result = await this.pool.query<EventRow>(
      `
        SELECT event_id, canonical_hash, partner, wallet, service_id, quality_score, refund_pct,
               timestamp_ms, proof_hash, payload_json, source_signature, key_id, created_at
        FROM fairscale_fusion_events
        WHERE canonical_hash = $1
      `,
      [canonicalHash]
    );

    return result.rows[0] ? mapEventRow(result.rows[0]) : null;
  }

  async insertEvent(input: FairscaleFusionEventInsert): Promise<{ inserted: boolean; event: FairscaleFusionEvent }> {
    await this.init();

    const insert = await this.pool.query(
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
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        ON CONFLICT DO NOTHING
      `,
      [
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
        input.keyId ?? null,
      ]
    );

    const event = (await this.getEvent(input.eventId)) || (await this.getEventByCanonicalHash(input.canonicalHash));
    if (!event) {
      throw new Error(`Failed to load event after insert: ${input.eventId}`);
    }

    return {
      inserted: (insert.rowCount ?? 0) > 0,
      event,
    };
  }

  async listEvents(params: {
    partner?: string;
    wallet?: string;
    sinceMs?: number;
    limit?: number;
  }): Promise<FairscaleFusionEvent[]> {
    await this.init();

    const where: string[] = [];
    const values: Array<string | number> = [];

    if (params.partner) {
      values.push(params.partner);
      where.push(`partner = $${values.length}`);
    }

    if (params.wallet) {
      values.push(params.wallet);
      where.push(`wallet = $${values.length}`);
    }

    if (typeof params.sinceMs === 'number' && Number.isFinite(params.sinceMs)) {
      values.push(Math.floor(params.sinceMs));
      where.push(`timestamp_ms >= $${values.length}`);
    }

    const limit = Math.min(Math.max(Math.floor(params.limit ?? 100), 1), 500);
    values.push(limit);

    const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
    const result = await this.pool.query<EventRow>(
      `
        SELECT event_id, canonical_hash, partner, wallet, service_id, quality_score, refund_pct,
               timestamp_ms, proof_hash, payload_json, source_signature, key_id, created_at
        FROM fairscale_fusion_events
        ${whereClause}
        ORDER BY timestamp_ms DESC, id DESC
        LIMIT $${values.length}
      `,
      values
    );

    return result.rows.map(mapEventRow);
  }

  async getReliabilitySummary(
    wallet: string,
    windowDays: number,
    serviceLimit = 10
  ): Promise<FairscaleFusionReliabilitySummary> {
    await this.init();

    const clampedWindowDays = Math.min(Math.max(Math.floor(windowDays || 30), 1), 365);
    const windowStartMs = Date.now() - clampedWindowDays * 24 * 60 * 60 * 1000;
    const clampedServiceLimit = Math.min(Math.max(Math.floor(serviceLimit), 1), 25);

    const summaryResult = await this.pool.query<ReliabilitySummaryRow>(
      `
        SELECT
          COUNT(*) AS sample_size,
          AVG(quality_score) AS avg_quality_score,
          AVG(refund_pct) AS avg_refund_pct,
          AVG(CASE WHEN refund_pct > 0 THEN 1.0 ELSE 0.0 END) AS dispute_rate,
          AVG(CASE WHEN quality_score >= 80 THEN 1.0 ELSE 0.0 END) AS success_rate,
          MAX(timestamp_ms) AS last_event_at_ms
        FROM fairscale_fusion_events
        WHERE wallet = $1 AND timestamp_ms >= $2
      `,
      [wallet, windowStartMs]
    );

    const servicesResult = await this.pool.query<ReliabilityServiceRow>(
      `
        SELECT
          service_id,
          COUNT(*) AS sample_size,
          AVG(quality_score) AS avg_quality_score,
          AVG(refund_pct) AS avg_refund_pct
        FROM fairscale_fusion_events
        WHERE wallet = $1 AND timestamp_ms >= $2
        GROUP BY service_id
        ORDER BY sample_size DESC, avg_quality_score DESC
        LIMIT $3
      `,
      [wallet, windowStartMs, clampedServiceLimit]
    );

    return mapReliabilitySummary(
      wallet,
      clampedWindowDays,
      windowStartMs,
      summaryResult.rows[0] || {
        sample_size: 0,
        avg_quality_score: 0,
        avg_refund_pct: 0,
        dispute_rate: 0,
        success_rate: 0,
        last_event_at_ms: null,
      },
      servicesResult.rows
    );
  }

  async resetForTests(): Promise<void> {
    await this.init();
    await this.pool.query('DELETE FROM fairscale_fusion_events');
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

let store: FairscaleFusionStore | null = null;
let storeStatus: FairscaleFusionStoreStatus | null = null;

function createStore(): FairscaleFusionStore {
  const connectionString = getPostgresConnectionString();
  if (connectionString) {
    storeStatus = {
      backend: POSTGRES_BACKEND,
      durable: true,
      databaseUrlConfigured: true,
    };
    logger.info('FairScale fusion store configured', { backend: POSTGRES_BACKEND, durable: true });
    return new PostgresFairscaleFusionStore(connectionString);
  }

  storeStatus = {
    backend: SQLITE_BACKEND,
    durable: false,
    databaseUrlConfigured: false,
  };
  logger.warn('FairScale fusion store running without durable storage', { backend: SQLITE_BACKEND, durable: false });
  return new SqliteFairscaleFusionStore();
}

function getStore(): FairscaleFusionStore {
  if (!store) {
    store = createStore();
  }
  return store;
}

export function getFairscaleFusionStoreStatus(): FairscaleFusionStoreStatus {
  if (storeStatus) return storeStatus;
  if (getPostgresConnectionString()) {
    return {
      backend: POSTGRES_BACKEND,
      durable: true,
      databaseUrlConfigured: true,
    };
  }
  return {
    backend: SQLITE_BACKEND,
    durable: false,
    databaseUrlConfigured: false,
  };
}

export async function closeFairscaleFusionStore(): Promise<void> {
  if (!store) return;
  await store.close();
  store = null;
  storeStatus = null;
}

export async function getFairscaleFusionEvent(eventId: string): Promise<FairscaleFusionEvent | null> {
  return getStore().getEvent(eventId);
}

export async function getFairscaleFusionEventByCanonicalHash(
  canonicalHash: string
): Promise<FairscaleFusionEvent | null> {
  return getStore().getEventByCanonicalHash(canonicalHash);
}

export async function insertFairscaleFusionEvent(
  input: FairscaleFusionEventInsert
): Promise<{ inserted: boolean; event: FairscaleFusionEvent }> {
  return getStore().insertEvent(input);
}

export async function listFairscaleFusionEvents(params: {
  partner?: string;
  wallet?: string;
  sinceMs?: number;
  limit?: number;
}): Promise<FairscaleFusionEvent[]> {
  return getStore().listEvents(params);
}

export async function getFairscaleFusionReliabilitySummary(
  wallet: string,
  windowDays: number,
  serviceLimit = 10
): Promise<FairscaleFusionReliabilitySummary> {
  return getStore().getReliabilitySummary(wallet, windowDays, serviceLimit);
}

export async function __resetFairscaleFusionStoreForTests(): Promise<void> {
  return getStore().resetForTests();
}
