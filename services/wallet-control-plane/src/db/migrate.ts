import { fileURLToPath } from 'url';
import path from 'path';
import { getPool, closePool } from './pool.js';

const MIGRATIONS = [
  {
    name: '001_initial',
    sql: `
      CREATE EXTENSION IF NOT EXISTS pgcrypto;

      CREATE TABLE IF NOT EXISTS migrations (
        name TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS agents (
        agent_id TEXT PRIMARY KEY,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS agent_wallets (
        agent_id TEXT NOT NULL REFERENCES agents(agent_id) ON DELETE CASCADE,
        kind TEXT NOT NULL,
        address TEXT NOT NULL,
        name TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (agent_id, kind)
      );

      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_agent_wallet_kind') THEN
          ALTER TABLE agent_wallets
            ADD CONSTRAINT chk_agent_wallet_kind
            CHECK (kind IN ('evm', 'solana'));
        END IF;
      END $$;

      CREATE INDEX IF NOT EXISTS idx_agent_wallets_address ON agent_wallets(address);

      CREATE TABLE IF NOT EXISTS end_users (
        user_id TEXT PRIMARY KEY,
        email TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_end_users_email ON end_users(email);

      CREATE TABLE IF NOT EXISTS mandate_policies (
        passport_address TEXT NOT NULL,
        agent_id TEXT NOT NULL REFERENCES agents(agent_id) ON DELETE CASCADE,
        kind TEXT NOT NULL,
        mandate_version INT NOT NULL,
        policy_id TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (passport_address, kind)
      );

      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_mandate_policy_kind') THEN
          ALTER TABLE mandate_policies
            ADD CONSTRAINT chk_mandate_policy_kind
            CHECK (kind IN ('evm', 'solana'));
        END IF;
      END $$;

      CREATE INDEX IF NOT EXISTS idx_mandate_policies_agent ON mandate_policies(agent_id);
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

const invokedAsScript = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
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
