import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

export type KamiyoDb = ReturnType<typeof openDb>;

export function openDb(dbPath: string) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');

  migrate(db);

  const insertTick = db.prepare(
    `INSERT INTO ticks (id, started_at, status) VALUES (@id, @started_at, @status)`
  );
  const finishTick = db.prepare(
    `UPDATE ticks SET finished_at = @finished_at, status = @status, error = @error WHERE id = @id`
  );
  const insertObservation = db.prepare(
    `INSERT INTO observations (tick_id, at, kind, json) VALUES (@tick_id, @at, @kind, @json)`
  );
  const insertAction = db.prepare(
    `INSERT INTO actions (tick_id, at, tool, input_json, result_json, error) VALUES (@tick_id, @at, @tool, @input_json, @result_json, @error)`
  );
  const insertUsage = db.prepare(
    `INSERT INTO llm_usage (tick_id, at, model, input_tokens, output_tokens) VALUES (@tick_id, @at, @model, @input_tokens, @output_tokens)`
  );

  const kvGet = db.prepare(`SELECT value FROM kv WHERE key = ?`);
  const kvSet = db.prepare(
    `INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  );

  const actionCountSinceAny = db.prepare(`SELECT COUNT(1) AS n FROM actions WHERE at >= ?`);
  const actionCountSinceTool = db.prepare(
    `SELECT COUNT(1) AS n FROM actions WHERE at >= ? AND tool = ?`
  );
  const llmCallCountSince = db.prepare(`SELECT COUNT(1) AS n FROM llm_usage WHERE at >= ?`);
  const llmUsageSince = db.prepare(
    `SELECT COALESCE(SUM(input_tokens), 0) AS inTok, COALESCE(SUM(output_tokens), 0) AS outTok FROM llm_usage WHERE at >= ?`
  );

  return {
    close: () => db.close(),

    startTick: (id: string) => {
      insertTick.run({ id, started_at: new Date().toISOString(), status: 'running' });
    },

    finishTick: (id: string, status: 'ok' | 'error', err?: string) => {
      finishTick.run({
        id,
        finished_at: new Date().toISOString(),
        status,
        error: err ?? null,
      });
    },

    addObservation: (tickId: string, kind: string, json: unknown) => {
      insertObservation.run({
        tick_id: tickId,
        at: new Date().toISOString(),
        kind,
        json: JSON.stringify(json),
      });
    },

    addAction: (tickId: string, tool: string, input: unknown, result: unknown, error?: string) => {
      insertAction.run({
        tick_id: tickId,
        at: new Date().toISOString(),
        tool,
        input_json: JSON.stringify(input ?? null),
        result_json: JSON.stringify(result ?? null),
        error: error ?? null,
      });
    },

    addUsage: (tickId: string, model: string, usage: { input_tokens: number; output_tokens: number }) => {
      insertUsage.run({
        tick_id: tickId,
        at: new Date().toISOString(),
        model,
        input_tokens: usage.input_tokens,
        output_tokens: usage.output_tokens,
      });
    },

    kvGet: (key: string): string | undefined => {
      const row = kvGet.get(key) as { value: string } | undefined;
      return row?.value;
    },

    kvSet: (key: string, value: string): void => {
      kvSet.run(key, value);
    },

    actionCountSince: (sinceIso: string, tool?: string): number => {
      const row = tool
        ? (actionCountSinceTool.get(sinceIso, tool) as { n: number })
        : (actionCountSinceAny.get(sinceIso) as { n: number });
      return row.n;
    },

    llmCallCountSince: (sinceIso: string): number => {
      const row = llmCallCountSince.get(sinceIso) as { n: number };
      return row.n;
    },

    llmUsageSince: (sinceIso: string): { inputTokens: number; outputTokens: number } => {
      const row = llmUsageSince.get(sinceIso) as { inTok: number; outTok: number };
      return { inputTokens: row.inTok, outputTokens: row.outTok };
    },
  };
}

function migrate(db: Database.Database): void {
  const version = Number(db.pragma('user_version', { simple: true }));
  if (version >= 1) return;

  db.exec(`
    CREATE TABLE IF NOT EXISTS ticks (
      id TEXT PRIMARY KEY,
      started_at TEXT NOT NULL,
      finished_at TEXT,
      status TEXT NOT NULL,
      error TEXT
    );

    CREATE TABLE IF NOT EXISTS observations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tick_id TEXT NOT NULL,
      at TEXT NOT NULL,
      kind TEXT NOT NULL,
      json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS actions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tick_id TEXT NOT NULL,
      at TEXT NOT NULL,
      tool TEXT NOT NULL,
      input_json TEXT NOT NULL,
      result_json TEXT NOT NULL,
      error TEXT
    );

    CREATE TABLE IF NOT EXISTS llm_usage (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tick_id TEXT NOT NULL,
      at TEXT NOT NULL,
      model TEXT NOT NULL,
      input_tokens INTEGER NOT NULL,
      output_tokens INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS kv (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  db.pragma('user_version = 1');
}
