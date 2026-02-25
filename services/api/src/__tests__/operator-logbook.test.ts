import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Database as SqliteDatabase } from 'better-sqlite3';

vi.mock('../logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

const ORIGINAL_ENV = {
  DATA_DIR: process.env.DATA_DIR,
  KYOSHIN_OPERATOR_LOG_ENABLED: process.env.KYOSHIN_OPERATOR_LOG_ENABLED,
  KYOSHIN_OPERATOR_LOG_INITIAL_SERIAL: process.env.KYOSHIN_OPERATOR_LOG_INITIAL_SERIAL,
};

function restoreEnv(): void {
  if (ORIGINAL_ENV.DATA_DIR === undefined) delete process.env.DATA_DIR;
  else process.env.DATA_DIR = ORIGINAL_ENV.DATA_DIR;

  if (ORIGINAL_ENV.KYOSHIN_OPERATOR_LOG_ENABLED === undefined) {
    delete process.env.KYOSHIN_OPERATOR_LOG_ENABLED;
  } else {
    process.env.KYOSHIN_OPERATOR_LOG_ENABLED = ORIGINAL_ENV.KYOSHIN_OPERATOR_LOG_ENABLED;
  }

  if (ORIGINAL_ENV.KYOSHIN_OPERATOR_LOG_INITIAL_SERIAL === undefined) {
    delete process.env.KYOSHIN_OPERATOR_LOG_INITIAL_SERIAL;
  } else {
    process.env.KYOSHIN_OPERATOR_LOG_INITIAL_SERIAL = ORIGINAL_ENV.KYOSHIN_OPERATOR_LOG_INITIAL_SERIAL;
  }
}

function createSchema(db: SqliteDatabase): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS post_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      content TEXT NOT NULL,
      post_type TEXT NOT NULL,
      context TEXT,
      generated_at INTEGER NOT NULL,
      status TEXT NOT NULL,
      approved_at INTEGER,
      image_path TEXT,
      posted_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS swarm_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      status TEXT NOT NULL,
      started_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS swarmteams_signals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at INTEGER NOT NULL
    );
  `);
}

interface LoadOptions {
  dataDir: string;
  enabled: boolean;
  initialSerial?: number;
}

async function loadOperatorLogbook(options: LoadOptions): Promise<{
  db: SqliteDatabase;
  isKyoshinOperatorLogEnabled: () => boolean;
  maybeQueueKyoshinOperatorLog: (nowMs?: number) => unknown;
  setKyoshinOperatorNextSerial: (nextSerial: number) => void;
}> {
  vi.resetModules();
  process.env.DATA_DIR = options.dataDir;
  process.env.KYOSHIN_OPERATOR_LOG_ENABLED = options.enabled ? 'true' : 'false';
  if (options.initialSerial === undefined) {
    delete process.env.KYOSHIN_OPERATOR_LOG_INITIAL_SERIAL;
  } else {
    process.env.KYOSHIN_OPERATOR_LOG_INITIAL_SERIAL = String(options.initialSerial);
  }

  const { db } = await import('../clients');
  createSchema(db);
  const operatorLogbook = await import('../operator-logbook');
  return {
    db,
    isKyoshinOperatorLogEnabled: operatorLogbook.isKyoshinOperatorLogEnabled,
    maybeQueueKyoshinOperatorLog: operatorLogbook.maybeQueueKyoshinOperatorLog,
    setKyoshinOperatorNextSerial: operatorLogbook.setKyoshinOperatorNextSerial,
  };
}

describe('operator-logbook', () => {
  let tempDir: string | null = null;
  let db: SqliteDatabase | null = null;

  afterEach(() => {
    vi.clearAllMocks();
    if (db) {
      db.close();
      db = null;
    }
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
      tempDir = null;
    }
    restoreEnv();
  });

  it('returns null when operator-log mode is disabled', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'kyoshin-operator-logbook-'));
    const operatorLogbook = await loadOperatorLogbook({
      dataDir: tempDir,
      enabled: false,
      initialSerial: 21,
    });
    db = operatorLogbook.db;

    expect(operatorLogbook.isKyoshinOperatorLogEnabled()).toBe(false);
    expect(operatorLogbook.maybeQueueKyoshinOperatorLog(1_738_800_000_000)).toBeNull();
    const row = db.prepare('SELECT COUNT(*) as count FROM post_queue').get() as { count: number };
    expect(row.count).toBe(0);
  });

  it('queues first due daily log and advances serial/state', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'kyoshin-operator-logbook-'));
    const operatorLogbook = await loadOperatorLogbook({
      dataDir: tempDir,
      enabled: true,
      initialSerial: 42,
    });
    db = operatorLogbook.db;

    const nowMs = 1_738_800_000_000;
    const queued = operatorLogbook.maybeQueueKyoshinOperatorLog(nowMs) as {
      kind: string;
      serial: number;
      content: string;
    } | null;

    expect(queued).not.toBeNull();
    expect(queued?.kind).toBe('daily_24h');
    expect(queued?.serial).toBe(42);
    expect(queued?.content).toContain('operator log 0042');
    expect(queued?.content.length ?? 999).toBeLessThanOrEqual(280);

    const post = db
      .prepare('SELECT context, status, approved_at FROM post_queue WHERE id = 1')
      .get() as { context: string; status: string; approved_at: number };
    expect(post.context).toBe('kyoshin_log:daily_24h');
    expect(post.status).toBe('approved');
    expect(post.approved_at).toBe(nowMs);

    expect(operatorLogbook.maybeQueueKyoshinOperatorLog(nowMs)).toBeNull();

    const state = db
      .prepare('SELECT next_serial, last_daily_at, next_daily_at FROM kyoshin_operator_log_state WHERE key = ?')
      .get('kyoshin') as { next_serial: number; last_daily_at: number; next_daily_at: number };
    expect(state.next_serial).toBe(43);
    expect(state.last_daily_at).toBe(nowMs);
    expect(state.next_daily_at).toBe(nowMs + 24 * 60 * 60 * 1000);
  });

  it('does not enqueue duplicate logs when scheduler checks same timestamp twice', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'kyoshin-operator-logbook-'));
    const operatorLogbook = await loadOperatorLogbook({
      dataDir: tempDir,
      enabled: true,
      initialSerial: 9,
    });
    db = operatorLogbook.db;

    const nowMs = 1_738_900_000_000;
    const first = operatorLogbook.maybeQueueKyoshinOperatorLog(nowMs);
    const second = operatorLogbook.maybeQueueKyoshinOperatorLog(nowMs);

    expect(first).not.toBeNull();
    expect(second).toBeNull();
    const row = db.prepare('SELECT COUNT(*) as count FROM post_queue').get() as { count: number };
    expect(row.count).toBe(1);
  });

  it('allows forward serial override and rejects rewind', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'kyoshin-operator-logbook-'));
    const operatorLogbook = await loadOperatorLogbook({
      dataDir: tempDir,
      enabled: true,
      initialSerial: 9,
    });
    db = operatorLogbook.db;

    operatorLogbook.setKyoshinOperatorNextSerial(15);
    let state = db
      .prepare('SELECT next_serial FROM kyoshin_operator_log_state WHERE key = ?')
      .get('kyoshin') as { next_serial: number };
    expect(state.next_serial).toBe(15);

    const queued = operatorLogbook.maybeQueueKyoshinOperatorLog(Date.now() + 1_000) as {
      serial: number;
    } | null;
    expect(queued?.serial).toBe(15);

    operatorLogbook.setKyoshinOperatorNextSerial(10);
    state = db
      .prepare('SELECT next_serial FROM kyoshin_operator_log_state WHERE key = ?')
      .get('kyoshin') as { next_serial: number };
    expect(state.next_serial).toBe(16);
  });
});
