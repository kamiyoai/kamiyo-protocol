import { getPool, closePool } from './pool';
import * as dotenv from 'dotenv';

const MIGRATIONS = [
  {
    name: '001_initial',
    sql: `
      CREATE EXTENSION IF NOT EXISTS pgcrypto;

      CREATE TABLE IF NOT EXISTS settlements (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        merchant_wallet TEXT NOT NULL,
        payer_wallet TEXT NOT NULL,
        amount NUMERIC(20, 6) NOT NULL,
        fee_amount NUMERIC(20, 6) NOT NULL,
        asset TEXT NOT NULL DEFAULT 'USDC',
        tx_hash TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        network TEXT NOT NULL DEFAULT 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS escrow_records (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        settlement_id UUID REFERENCES settlements(id),
        escrow_address TEXT NOT NULL UNIQUE,
        payer_wallet TEXT NOT NULL,
        merchant_wallet TEXT NOT NULL,
        amount NUMERIC(20, 6) NOT NULL,
        fee_amount NUMERIC(20, 6) NOT NULL,
        quality_score SMALLINT,
        release_tx TEXT,
        dispute_id UUID,
        status TEXT NOT NULL DEFAULT 'active',
        session_id TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        released_at TIMESTAMPTZ,
        expires_at TIMESTAMPTZ NOT NULL
      );

      CREATE TABLE IF NOT EXISTS fee_ledger (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        settlement_id UUID REFERENCES settlements(id),
        escrow_id UUID REFERENCES escrow_records(id),
        fee_type TEXT NOT NULL,
        amount NUMERIC(20, 6) NOT NULL,
        treasury_tx TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS api_keys (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        key_hash TEXT NOT NULL UNIQUE,
        merchant_wallet TEXT NOT NULL,
        label TEXT,
        rate_limit INT NOT NULL DEFAULT 100,
        monthly_volume NUMERIC(20, 6) NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        revoked_at TIMESTAMPTZ
      );

      CREATE TABLE IF NOT EXISTS migrations (
        name TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_settlements_merchant ON settlements(merchant_wallet);
      CREATE INDEX IF NOT EXISTS idx_settlements_payer ON settlements(payer_wallet);
      CREATE INDEX IF NOT EXISTS idx_settlements_status ON settlements(status);
      CREATE INDEX IF NOT EXISTS idx_escrow_status ON escrow_records(status);
      CREATE INDEX IF NOT EXISTS idx_escrow_session ON escrow_records(session_id);
      CREATE INDEX IF NOT EXISTS idx_fee_ledger_type ON fee_ledger(fee_type);
      CREATE INDEX IF NOT EXISTS idx_api_keys_wallet ON api_keys(merchant_wallet);
    `,
  },
  {
    name: '002_disputes_reputation',
    sql: `
      CREATE TABLE IF NOT EXISTS disputes (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        escrow_id UUID NOT NULL REFERENCES escrow_records(id),
        escrow_address TEXT NOT NULL,
        opener_wallet TEXT NOT NULL,
        reason TEXT NOT NULL,
        median_score SMALLINT,
        refund_percentage SMALLINT,
        resolution TEXT,
        finalize_tx TEXT,
        status TEXT NOT NULL DEFAULT 'commit_phase',
        commit_phase_ends_at TIMESTAMPTZ NOT NULL,
        reveal_phase_ends_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        resolved_at TIMESTAMPTZ
      );

      CREATE TABLE IF NOT EXISTS oracle_votes (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        dispute_id UUID NOT NULL REFERENCES disputes(id),
        oracle TEXT NOT NULL,
        commitment_hash TEXT NOT NULL,
        quality_score SMALLINT,
        committed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        revealed_at TIMESTAMPTZ,
        UNIQUE(dispute_id, oracle)
      );

      CREATE INDEX IF NOT EXISTS idx_disputes_escrow ON disputes(escrow_address);
      CREATE INDEX IF NOT EXISTS idx_disputes_status ON disputes(status);
      CREATE INDEX IF NOT EXISTS idx_disputes_opener ON disputes(opener_wallet);
      CREATE INDEX IF NOT EXISTS idx_oracle_votes_dispute ON oracle_votes(dispute_id);

      ALTER TABLE escrow_records ADD CONSTRAINT fk_escrow_dispute
        FOREIGN KEY (dispute_id) REFERENCES disputes(id);
    `,
  },
  {
    name: '003_value_checks',
    sql: `
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_escrow_quality') THEN
          ALTER TABLE escrow_records ADD CONSTRAINT chk_escrow_quality CHECK (quality_score IS NULL OR (quality_score >= 0 AND quality_score <= 100));
        END IF;
      END $$;

      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_oracle_quality') THEN
          ALTER TABLE oracle_votes ADD CONSTRAINT chk_oracle_quality CHECK (quality_score IS NULL OR (quality_score >= 0 AND quality_score <= 100));
        END IF;
      END $$;

      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_dispute_median') THEN
          ALTER TABLE disputes ADD CONSTRAINT chk_dispute_median CHECK (median_score IS NULL OR (median_score >= 0 AND median_score <= 100));
        END IF;
      END $$;

      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_dispute_refund') THEN
          ALTER TABLE disputes ADD CONSTRAINT chk_dispute_refund CHECK (refund_percentage IS NULL OR (refund_percentage >= 0 AND refund_percentage <= 100));
        END IF;
      END $$;
    `,
  },
  {
    name: '004_privacy',
    sql: `
      ALTER TABLE settlements ADD COLUMN IF NOT EXISTS shadow_commitment TEXT;
      ALTER TABLE settlements ADD COLUMN IF NOT EXISTS shadow_nullifier TEXT;
      ALTER TABLE settlements ADD COLUMN IF NOT EXISTS privacy_tier TEXT;

      ALTER TABLE escrow_records ADD COLUMN IF NOT EXISTS shadow_commitment TEXT;
      ALTER TABLE escrow_records ADD COLUMN IF NOT EXISTS shadow_nullifier TEXT;
      ALTER TABLE escrow_records ADD COLUMN IF NOT EXISTS privacy_tier TEXT;

      CREATE INDEX IF NOT EXISTS idx_settlements_shadow ON settlements(shadow_commitment) WHERE shadow_commitment IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_settlements_nullifier ON settlements(shadow_nullifier) WHERE shadow_nullifier IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_escrow_shadow ON escrow_records(shadow_commitment) WHERE shadow_commitment IS NOT NULL;
    `,
  },
  {
    name: '005_discovery_resources',
    sql: `
      CREATE TABLE IF NOT EXISTS discovery_resources (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        merchant_wallet TEXT NOT NULL,
        resource_url TEXT NOT NULL UNIQUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_discovery_merchant ON discovery_resources(merchant_wallet);
    `,
  },
  {
    name: '006_network_canonicalization',
    sql: `
      UPDATE settlements
      SET network = 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp'
      WHERE network IN ('solana:mainnet', 'solana:mainnet-beta');

      ALTER TABLE settlements
      ALTER COLUMN network SET DEFAULT 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp';
    `,
  },
  {
    name: '007_payment_nonce_guard',
    sql: `
      CREATE TABLE IF NOT EXISTS payment_nonce_guard (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        payer_wallet TEXT NOT NULL,
        nonce TEXT NOT NULL,
        usage TEXT NOT NULL,
        network TEXT NOT NULL,
        resource TEXT NOT NULL,
        amount NUMERIC(20, 6) NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (payer_wallet, nonce)
      );

      CREATE INDEX IF NOT EXISTS idx_payment_nonce_usage ON payment_nonce_guard(usage);
      CREATE INDEX IF NOT EXISTS idx_payment_nonce_network ON payment_nonce_guard(network);
    `,
  },
  {
    name: '008_rate_limit_windows',
    sql: `
      CREATE TABLE IF NOT EXISTS api_rate_limit_windows (
        rate_key TEXT NOT NULL,
        window_start TIMESTAMPTZ NOT NULL,
        count INT NOT NULL DEFAULT 0,
        PRIMARY KEY (rate_key, window_start)
      );

      CREATE INDEX IF NOT EXISTS idx_rate_limit_window_start ON api_rate_limit_windows(window_start);
    `,
  },
  {
    name: '009_session_auth',
    sql: `
      CREATE TABLE IF NOT EXISTS session_challenges (
        nonce TEXT PRIMARY KEY,
        payer_wallet TEXT NOT NULL,
        network TEXT NOT NULL,
        merchant_wallet TEXT NOT NULL,
        max_total_micro NUMERIC(30, 0) NOT NULL,
        max_single_micro NUMERIC(30, 0),
        session_expires_at TIMESTAMPTZ NOT NULL,
        message TEXT NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        used_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_session_challenges_payer ON session_challenges(payer_wallet);
      CREATE INDEX IF NOT EXISTS idx_session_challenges_expires ON session_challenges(expires_at);

      CREATE TABLE IF NOT EXISTS payment_sessions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        token_hash TEXT NOT NULL UNIQUE,
        payer_wallet TEXT NOT NULL,
        network TEXT NOT NULL,
        merchant_wallet TEXT NOT NULL,
        max_total_micro NUMERIC(30, 0) NOT NULL,
        max_single_micro NUMERIC(30, 0),
        spent_micro NUMERIC(30, 0) NOT NULL DEFAULT 0,
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        last_used_at TIMESTAMPTZ,
        revoked_at TIMESTAMPTZ
      );

      CREATE INDEX IF NOT EXISTS idx_payment_sessions_payer ON payment_sessions(payer_wallet);
      CREATE INDEX IF NOT EXISTS idx_payment_sessions_expires ON payment_sessions(expires_at);
    `,
  },
  {
    name: '010_payment_nonce_tx_hash',
    sql: `
      ALTER TABLE payment_nonce_guard ADD COLUMN IF NOT EXISTS tx_hash TEXT;
      ALTER TABLE payment_nonce_guard ADD COLUMN IF NOT EXISTS settlement_id UUID;

      CREATE INDEX IF NOT EXISTS idx_payment_nonce_tx_hash ON payment_nonce_guard(tx_hash) WHERE tx_hash IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_payment_nonce_settlement ON payment_nonce_guard(settlement_id) WHERE settlement_id IS NOT NULL;
    `,
  },
];

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

if (require.main === module) {
  dotenv.config();
  runMigrations()
    .then(() => {
      console.log('[migrate] done');
      return closePool();
    })
    .catch((err) => {
      console.error('[migrate] failed', err);
      process.exit(1);
    });
}
