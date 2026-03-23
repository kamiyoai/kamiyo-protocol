import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { closePool, getPool } from './pool.js';

const MIGRATIONS = [
  {
    name: '001_initial',
    sql: `
      CREATE EXTENSION IF NOT EXISTS pgcrypto;

      CREATE TABLE IF NOT EXISTS migrations (
        name TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS policy_packs (
        id TEXT NOT NULL,
        version TEXT NOT NULL,
        lane TEXT NOT NULL,
        body JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (id, version),
        CONSTRAINT chk_policy_pack_lane CHECK (lane IN ('enterprise', 'crypto-fast'))
      );

      CREATE TABLE IF NOT EXISTS policy_pack_activations (
        lane TEXT PRIMARY KEY,
        policy_pack_id TEXT NOT NULL,
        policy_pack_version TEXT NOT NULL,
        activated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        activated_by TEXT NOT NULL,
        CONSTRAINT chk_policy_activation_lane CHECK (lane IN ('enterprise', 'crypto-fast'))
      );

      CREATE TABLE IF NOT EXISTS signing_keys (
        kid TEXT PRIMARY KEY,
        algorithm TEXT NOT NULL,
        backend TEXT NOT NULL,
        public_key_pem TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT chk_signing_algorithm CHECK (algorithm IN ('ES256')),
        CONSTRAINT chk_signing_status CHECK (status IN ('active', 'retired'))
      );

      CREATE TABLE IF NOT EXISTS decision_ledger (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        decision_id TEXT NOT NULL UNIQUE,
        payer_wallet TEXT NOT NULL,
        request_nonce TEXT NOT NULL,
        request_hash TEXT NOT NULL,
        agent_id TEXT NOT NULL,
        repay_wallet TEXT NOT NULL,
        network TEXT NOT NULL,
        lane TEXT NOT NULL,
        pool_id TEXT NOT NULL,
        requested_micro NUMERIC(30, 0) NOT NULL,
        approved BOOLEAN NOT NULL,
        approved_micro NUMERIC(30, 0) NOT NULL,
        available_micro NUMERIC(30, 0) NOT NULL,
        outstanding_micro NUMERIC(30, 0) NOT NULL,
        score_raw INT NOT NULL,
        reason_codes TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
        tier TEXT NOT NULL,
        policy_pack_id TEXT NOT NULL,
        policy_pack_version TEXT NOT NULL,
        risk_level TEXT NOT NULL,
        risk_action TEXT NOT NULL,
        signing_kid TEXT,
        envelope_version TEXT,
        envelope JSONB,
        settlement_id TEXT,
        debt_id TEXT,
        tx_hash TEXT,
        status TEXT NOT NULL DEFAULT 'evaluated',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT chk_decision_lane CHECK (lane IN ('enterprise', 'crypto-fast')),
        CONSTRAINT chk_decision_requested CHECK (requested_micro >= 0),
        CONSTRAINT chk_decision_approved_micro CHECK (approved_micro >= 0),
        CONSTRAINT chk_decision_available_micro CHECK (available_micro >= 0),
        CONSTRAINT chk_decision_outstanding_micro CHECK (outstanding_micro >= 0),
        CONSTRAINT chk_decision_status CHECK (status IN ('evaluated', 'committed')),
        CONSTRAINT chk_decision_risk_action CHECK (risk_action IN ('none', 'freeze', 'throttle', 'unfreeze')),
        CONSTRAINT uq_decision_nonce UNIQUE (payer_wallet, request_nonce)
      );

      CREATE INDEX IF NOT EXISTS idx_decision_ledger_agent_created
        ON decision_ledger(agent_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_decision_ledger_lane_pool_created
        ON decision_ledger(lane, pool_id, created_at DESC);

      CREATE TABLE IF NOT EXISTS risk_entities (
        entity_type TEXT NOT NULL,
        entity_key TEXT NOT NULL,
        metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (entity_type, entity_key)
      );

      CREATE TABLE IF NOT EXISTS risk_edges (
        from_type TEXT NOT NULL,
        from_key TEXT NOT NULL,
        relation TEXT NOT NULL,
        to_type TEXT NOT NULL,
        to_key TEXT NOT NULL,
        seen_count INT NOT NULL DEFAULT 1,
        first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
        PRIMARY KEY (from_type, from_key, relation, to_type, to_key)
      );

      CREATE INDEX IF NOT EXISTS idx_risk_edges_from_last_seen
        ON risk_edges(from_type, from_key, relation, last_seen_at DESC);
      CREATE INDEX IF NOT EXISTS idx_risk_edges_to_last_seen
        ON risk_edges(to_type, to_key, relation, last_seen_at DESC);

      CREATE TABLE IF NOT EXISTS risk_counters (
        entity_type TEXT NOT NULL,
        entity_key TEXT NOT NULL,
        metric TEXT NOT NULL,
        window_seconds INT NOT NULL,
        bucket_start TIMESTAMPTZ NOT NULL,
        count INT NOT NULL DEFAULT 0,
        last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (entity_type, entity_key, metric, window_seconds, bucket_start)
      );

      CREATE INDEX IF NOT EXISTS idx_risk_counters_lookup
        ON risk_counters(entity_type, entity_key, metric, window_seconds, bucket_start DESC);

      CREATE TABLE IF NOT EXISTS risk_actions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        entity_type TEXT NOT NULL,
        entity_key TEXT NOT NULL,
        lane TEXT NOT NULL,
        pool_id TEXT NOT NULL,
        action TEXT NOT NULL,
        reason TEXT NOT NULL,
        source TEXT NOT NULL DEFAULT 'system',
        status TEXT NOT NULL DEFAULT 'active',
        metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        resolved_at TIMESTAMPTZ,
        CONSTRAINT chk_risk_action_lane CHECK (lane IN ('enterprise', 'crypto-fast')),
        CONSTRAINT chk_risk_action_action CHECK (action IN ('freeze', 'throttle', 'unfreeze')),
        CONSTRAINT chk_risk_action_status CHECK (status IN ('active', 'resolved'))
      );

      CREATE INDEX IF NOT EXISTS idx_risk_actions_entity_status
        ON risk_actions(entity_type, entity_key, status, created_at DESC);
    `,
  },
] as const;

export async function runMigrations(): Promise<void> {
  const pool = getPool();

  await pool.query(`
    CREATE TABLE IF NOT EXISTS migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  for (const migration of MIGRATIONS) {
    const existing = await pool.query('SELECT 1 FROM migrations WHERE name = $1', [migration.name]);
    if (existing.rows.length > 0) continue;

    console.log(`[migrate] applying ${migration.name}`);
    await pool.query(migration.sql);
    await pool.query('INSERT INTO migrations (name) VALUES ($1)', [migration.name]);
    console.log(`[migrate] applied ${migration.name}`);
  }
}

const invokedAsScript =
  process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (invokedAsScript) {
  runMigrations()
    .then(() => {
      console.log('[migrate] done');
      return closePool();
    })
    .catch((err) => {
      console.error('[migrate] failed', err);
      process.exitCode = 1;
    });
}
