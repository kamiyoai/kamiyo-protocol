import { getPool, closePool } from './pool';

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
        network TEXT NOT NULL DEFAULT 'solana:mainnet',
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
  require('dotenv').config();
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
