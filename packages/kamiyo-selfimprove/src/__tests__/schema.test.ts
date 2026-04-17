import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { applySchema, SCHEMA_SQL } from '../schema';

describe('applySchema', () => {
  it('creates all tables on fresh DB', () => {
    const db = new Database(':memory:');
    applySchema(db);
    const tables = db
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`)
      .all() as Array<{ name: string }>;
    const names = tables.map(t => t.name);
    expect(names).toContain('agent_variants');
    expect(names).toContain('variant_tournaments');
    expect(names).toContain('task_rubrics');
    expect(names).toContain('judge_cache');
    expect(names).toContain('canary_rollouts');
    expect(names).toContain('shadow_runs');
  });

  it('is idempotent', () => {
    const db = new Database(':memory:');
    applySchema(db);
    applySchema(db);
    const count = db
      .prepare(`SELECT count(*) as n FROM sqlite_master WHERE type='table'`)
      .get() as { n: number };
    expect(count.n).toBeGreaterThan(0);
  });

  it('adds elo_rating column', () => {
    const db = new Database(':memory:');
    applySchema(db);
    const cols = db.prepare(`PRAGMA table_info(agent_variants)`).all() as Array<{ name: string }>;
    expect(cols.map(c => c.name)).toContain('elo_rating');
  });

  it('survives dirty DB with >1 promoted variant per task', () => {
    const db = new Database(':memory:');
    // apply base schema without partial unique indexes
    const baseSchema = SCHEMA_SQL.replace(
      /CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_variants_one_promoted[^;]*;/,
      ''
    ).replace(/CREATE UNIQUE INDEX IF NOT EXISTS idx_canary_rollouts_active[^;]*;/, '');
    db.exec(baseSchema);
    db.exec(`ALTER TABLE agent_variants ADD COLUMN elo_rating REAL NOT NULL DEFAULT 1200`);

    // insert two promoted variants for same task — violates partial unique constraint
    const now = Math.trunc(Date.now() / 1000);
    db.prepare(
      `INSERT INTO agent_variants (id, agent_id, task_type, genome_hash, genome_json, status, promoted_at)
       VALUES (?, ?, ?, ?, ?, 'promoted', ?)`
    ).run('v1', 'bot', 'test', 'hash1', '{}', now);
    db.prepare(
      `INSERT INTO agent_variants (id, agent_id, task_type, genome_hash, genome_json, status, promoted_at)
       VALUES (?, ?, ?, ?, ?, 'promoted', ?)`
    ).run('v2', 'bot', 'test', 'hash2', '{}', now);

    // applySchema should not throw — index creation skipped gracefully
    expect(() => applySchema(db)).not.toThrow();

    // verify data survived
    const count = db
      .prepare(`SELECT count(*) as n FROM agent_variants WHERE status = 'promoted'`)
      .get() as { n: number };
    expect(count.n).toBe(2);
  });
});
