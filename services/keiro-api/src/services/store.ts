import crypto from 'node:crypto';
import { Pool, type QueryResultRow } from 'pg';

const databaseUrl = process.env.DATABASE_URL?.trim() || '';

export const keiroUsePostgres = databaseUrl.length > 0;

let pool: Pool | null = null;
let initPromise: Promise<void> | null = null;

export function newEntityId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function newUuid(): string {
  return crypto.randomUUID();
}

export function toIsoString(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return new Date(value).toISOString();
  return new Date().toISOString();
}

export function parseJsonArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((entry): entry is string => typeof entry === 'string');
  if (typeof value !== 'string' || value.trim() === '') return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((entry): entry is string => typeof entry === 'string')
      : [];
  } catch {
    return [];
  }
}

export function parseJsonRecord<T extends Record<string, unknown>>(value: unknown, fallback: T): T {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as T;
  }
  if (typeof value !== 'string' || value.trim() === '') return fallback;
  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as T;
    }
  } catch {
    // fall through
  }
  return fallback;
}

export function parseNumeric(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

export function normalizeBoolean(value: unknown): boolean {
  return value === true || value === 1 || value === '1' || value === 'true' || value === 't';
}

function getPool(): Pool {
  if (!keiroUsePostgres) {
    throw new Error('DATABASE_URL is not configured');
  }
  if (!pool) {
    pool = new Pool({
      connectionString: databaseUrl,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    });
  }
  return pool;
}

export async function ensureKeiroTables(): Promise<void> {
  if (!keiroUsePostgres) return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const client = getPool();

    await client.query(`
      CREATE TABLE IF NOT EXISTS keiro_agents (
        id TEXT PRIMARY KEY,
        wallet_address TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        personality TEXT NOT NULL,
        skills JSONB NOT NULL DEFAULT '[]'::jsonb,
        tier TEXT NOT NULL,
        credit_score INTEGER NOT NULL DEFAULT 0,
        tasks_completed INTEGER NOT NULL DEFAULT 0,
        dispute_count INTEGER NOT NULL DEFAULT 0,
        tenure_days INTEGER NOT NULL DEFAULT 0,
        avg_quality INTEGER NOT NULL DEFAULT 0,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        global_id TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS keiro_jobs (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        required_skills JSONB NOT NULL DEFAULT '[]'::jsonb,
        required_tier TEXT NOT NULL,
        payment NUMERIC(20, 6) NOT NULL,
        payment_token TEXT NOT NULL,
        estimated_time TEXT NOT NULL,
        poster TEXT NOT NULL,
        poster_address TEXT NOT NULL,
        status TEXT NOT NULL,
        assigned_agent TEXT,
        escrow_ref TEXT,
        settlement_ref TEXT,
        receipt_id TEXT,
        objective_spec JSONB NOT NULL,
        minimum_credit_score INTEGER NOT NULL DEFAULT 0,
        deadline TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS keiro_earnings (
        id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL,
        job_id TEXT NOT NULL UNIQUE,
        amount NUMERIC(20, 6) NOT NULL,
        token TEXT NOT NULL,
        status TEXT NOT NULL,
        receipt_id TEXT,
        settlement_ref TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        released_at TIMESTAMPTZ
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS keiro_job_events (
        id UUID PRIMARY KEY,
        job_id TEXT NOT NULL,
        agent_id TEXT,
        event_type TEXT NOT NULL,
        idempotency_key TEXT UNIQUE,
        escrow_ref TEXT,
        settlement_ref TEXT,
        receipt_id TEXT,
        payload JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_keiro_agents_wallet
      ON keiro_agents (wallet_address)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_keiro_agents_leaderboard
      ON keiro_agents (is_active, credit_score DESC, created_at DESC)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_keiro_jobs_status_created
      ON keiro_jobs (status, created_at DESC)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_keiro_jobs_agent_created
      ON keiro_jobs (assigned_agent, created_at DESC)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_keiro_earnings_agent_created
      ON keiro_earnings (agent_id, created_at DESC)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_keiro_earnings_status_agent
      ON keiro_earnings (status, agent_id, created_at DESC)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_keiro_job_events_job_created
      ON keiro_job_events (job_id, created_at DESC)
    `);
  })();

  return initPromise;
}

export async function closeKeiroStore(): Promise<void> {
  if (!pool) return;
  const current = pool;
  pool = null;
  initPromise = null;
  await current.end();
}

export async function queryKeiro<T extends QueryResultRow = Record<string, unknown>>(
  sql: string,
  params: unknown[] = []
): Promise<T[]> {
  await ensureKeiroTables();
  const result = await getPool().query<T>(sql, params);
  return result.rows;
}

export async function queryKeiroOne<T extends QueryResultRow = Record<string, unknown>>(
  sql: string,
  params: unknown[] = []
): Promise<T | null> {
  const rows = await queryKeiro<T>(sql, params);
  return rows[0] ?? null;
}
