import crypto from 'node:crypto';
import { Pool } from 'pg';
import type { Agent } from '../types/index.js';

export type ReceiptKind =
  | 'job_accepted'
  | 'job_submitted'
  | 'earning_created'
  | 'job_disputed';

export interface Receipt {
  version: 1;
  id: string;
  agentId: string;
  agentIdentity: string;
  kind: ReceiptKind;
  summary: string;
  payload: Record<string, unknown>;
  hash: string;
  signature: string | null;
  signatureAlgo: 'hmac-sha256' | null;
  createdAt: string;
}

const receipts = new Map<string, Receipt>();
const receiptsByAgent = new Map<string, string[]>();
const receiptsByIdempotency = new Map<string, string>();
const databaseUrl = process.env.DATABASE_URL?.trim() || '';
const usePostgres = databaseUrl.length > 0;

let pool: Pool | null = null;
let initPromise: Promise<void> | null = null;

function newId(): string {
  return crypto.randomUUID();
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
    a.localeCompare(b)
  );
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
}

function receiptMessage(receipt: Omit<Receipt, 'hash' | 'signature' | 'signatureAlgo'>): string {
  return stableStringify(receipt);
}

function hashMessage(message: string): string {
  return crypto.createHash('sha256').update(message).digest('hex');
}

function signingKey(): string | null {
  const raw = process.env.RECEIPT_SIGNING_KEY;
  if (!raw) return null;
  const trimmed = raw.trim();
  return trimmed === '' ? null : trimmed;
}

function signMessage(message: string, key: string): string {
  return crypto.createHmac('sha256', key).update(message).digest('hex');
}

function pushAgentReceipt(agentId: string, receiptId: string) {
  const next = [receiptId, ...(receiptsByAgent.get(agentId) ?? [])].slice(0, 200);
  receiptsByAgent.set(agentId, next);
}

function baseIdempotencyKey(params: {
  agentId: string;
  kind: ReceiptKind;
  summary: string;
  payload: Record<string, unknown>;
}): string {
  return hashMessage(
    stableStringify({
      agentId: params.agentId,
      kind: params.kind,
      summary: params.summary,
      payload: params.payload,
    })
  );
}

function mapRowToReceipt(row: Record<string, unknown>): Receipt {
  return {
    version: 1,
    id: row.id as string,
    agentId: row.agent_id as string,
    agentIdentity: row.agent_identity as string,
    kind: row.kind as ReceiptKind,
    summary: row.summary as string,
    payload: (row.payload as Record<string, unknown>) ?? {},
    hash: row.hash as string,
    signature: (row.signature as string | null) ?? null,
    signatureAlgo: (row.signature_algo as 'hmac-sha256' | null) ?? null,
    createdAt: new Date(row.created_at as string).toISOString(),
  };
}

function getPool(): Pool {
  if (!usePostgres) {
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

async function ensureTable(): Promise<void> {
  if (!usePostgres) return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    await getPool().query(`
      CREATE TABLE IF NOT EXISTS keiro_receipts (
        id UUID PRIMARY KEY,
        idempotency_key TEXT UNIQUE NOT NULL,
        agent_id TEXT NOT NULL,
        agent_identity TEXT NOT NULL,
        kind TEXT NOT NULL,
        summary TEXT NOT NULL,
        payload JSONB NOT NULL,
        hash TEXT NOT NULL,
        signature TEXT,
        signature_algo TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await getPool().query(`
      CREATE INDEX IF NOT EXISTS idx_keiro_receipts_agent_created
      ON keiro_receipts (agent_id, created_at DESC)
    `);
  })();

  return initPromise;
}

async function createInMemory(params: {
  agent: Agent;
  kind: ReceiptKind;
  summary: string;
  payload: Record<string, unknown>;
  idempotencyKey?: string;
}): Promise<Receipt> {
  const idempotencyKey =
    params.idempotencyKey?.trim() ||
    baseIdempotencyKey({
      agentId: params.agent.id,
      kind: params.kind,
      summary: params.summary,
      payload: params.payload,
    });

  const existingId = receiptsByIdempotency.get(idempotencyKey);
  if (existingId) {
    const existing = receipts.get(existingId);
    if (existing) return existing;
  }

  const id = newId();
  const unsigned: Omit<Receipt, 'hash' | 'signature' | 'signatureAlgo'> = {
    version: 1,
    id,
    agentId: params.agent.id,
    agentIdentity: params.agent.walletAddress,
    kind: params.kind,
    summary: params.summary,
    payload: params.payload,
    createdAt: new Date().toISOString(),
  };
  const message = receiptMessage(unsigned);
  const hash = hashMessage(message);
  const key = signingKey();
  const signature = key ? signMessage(message, key) : null;

  const receipt: Receipt = {
    ...unsigned,
    hash,
    signature,
    signatureAlgo: signature ? 'hmac-sha256' : null,
  };

  receipts.set(id, receipt);
  receiptsByIdempotency.set(idempotencyKey, id);
  pushAgentReceipt(params.agent.id, id);

  return receipt;
}

export const receiptService = {
  async create(params: {
    agent: Agent;
    kind: ReceiptKind;
    summary: string;
    payload: Record<string, unknown>;
    idempotencyKey?: string;
  }): Promise<Receipt> {
    if (!usePostgres) {
      return createInMemory(params);
    }

    await ensureTable();
    const idempotencyKey =
      params.idempotencyKey?.trim() ||
      baseIdempotencyKey({
        agentId: params.agent.id,
        kind: params.kind,
        summary: params.summary,
        payload: params.payload,
      });

    const existing = await getPool().query(
      `SELECT * FROM keiro_receipts WHERE idempotency_key = $1 LIMIT 1`,
      [idempotencyKey]
    );
    if (existing.rows[0]) {
      return mapRowToReceipt(existing.rows[0]);
    }

    const id = newId();
    const unsigned: Omit<Receipt, 'hash' | 'signature' | 'signatureAlgo'> = {
      version: 1,
      id,
      agentId: params.agent.id,
      agentIdentity: params.agent.walletAddress,
      kind: params.kind,
      summary: params.summary,
      payload: params.payload,
      createdAt: new Date().toISOString(),
    };
    const message = receiptMessage(unsigned);
    const hash = hashMessage(message);
    const key = signingKey();
    const signature = key ? signMessage(message, key) : null;

    const receipt: Receipt = {
      ...unsigned,
      hash,
      signature,
      signatureAlgo: signature ? 'hmac-sha256' : null,
    };

    try {
      await getPool().query(
        `INSERT INTO keiro_receipts
          (id, idempotency_key, agent_id, agent_identity, kind, summary, payload, hash, signature, signature_algo, created_at)
         VALUES
          ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, $11::timestamptz)`,
        [
          receipt.id,
          idempotencyKey,
          receipt.agentId,
          receipt.agentIdentity,
          receipt.kind,
          receipt.summary,
          JSON.stringify(receipt.payload),
          receipt.hash,
          receipt.signature,
          receipt.signatureAlgo,
          receipt.createdAt,
        ]
      );
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code !== '23505') throw error;
      const duplicate = await getPool().query(
        `SELECT * FROM keiro_receipts WHERE idempotency_key = $1 LIMIT 1`,
        [idempotencyKey]
      );
      if (duplicate.rows[0]) {
        return mapRowToReceipt(duplicate.rows[0]);
      }
      throw error;
    }

    return receipt;
  },

  async getById(id: string): Promise<Receipt | null> {
    if (!usePostgres) {
      return receipts.get(id) ?? null;
    }
    await ensureTable();
    const result = await getPool().query(`SELECT * FROM keiro_receipts WHERE id = $1 LIMIT 1`, [id]);
    if (!result.rows[0]) return null;
    return mapRowToReceipt(result.rows[0]);
  },

  async listByAgent(agentId: string, limit = 50): Promise<Receipt[]> {
    if (!usePostgres) {
      const ids = receiptsByAgent.get(agentId) ?? [];
      const out: Receipt[] = [];
      for (const id of ids.slice(0, limit)) {
        const r = receipts.get(id);
        if (r) out.push(r);
      }
      return out;
    }
    await ensureTable();
    const safeLimit = Math.max(1, Math.min(200, limit));
    const result = await getPool().query(
      `SELECT * FROM keiro_receipts WHERE agent_id = $1 ORDER BY created_at DESC LIMIT $2`,
      [agentId, safeLimit]
    );
    return result.rows.map(mapRowToReceipt);
  },

  verify(receipt: Receipt): {
    valid: boolean;
    hashValid: boolean;
    signatureValid: boolean | null;
    reason?: string;
  } {
    const unsigned: Omit<Receipt, 'hash' | 'signature' | 'signatureAlgo'> = {
      version: receipt.version,
      id: receipt.id,
      agentId: receipt.agentId,
      agentIdentity: receipt.agentIdentity,
      kind: receipt.kind,
      summary: receipt.summary,
      payload: receipt.payload,
      createdAt: receipt.createdAt,
    };

    const message = receiptMessage(unsigned);
    const expectedHash = hashMessage(message);
    const hashValid = expectedHash === receipt.hash;
    const key = signingKey();

    if (!receipt.signature || !receipt.signatureAlgo) {
      return {
        valid: hashValid,
        hashValid,
        signatureValid: null,
        reason: key ? 'unsigned_receipt' : 'signing_key_missing',
      };
    }

    if (!key) {
      return {
        valid: false,
        hashValid,
        signatureValid: null,
        reason: 'signing_key_missing',
      };
    }

    const expectedSignature = signMessage(message, key);
    const signatureValid = expectedSignature === receipt.signature;
    return {
      valid: hashValid && signatureValid,
      hashValid,
      signatureValid,
      reason: hashValid && signatureValid ? undefined : 'tampered',
    };
  },

  async reset(): Promise<void> {
    if (!usePostgres) {
      receipts.clear();
      receiptsByAgent.clear();
      receiptsByIdempotency.clear();
      return;
    }
    await ensureTable();
    await getPool().query(`TRUNCATE TABLE keiro_receipts`);
  },

  async close(): Promise<void> {
    if (!pool) return;
    await pool.end();
    pool = null;
    initPromise = null;
  },
};
