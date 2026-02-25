import { afterEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

const SERVICE_ROOT = join(__dirname, '..', '..');
const WORKER_PATH = join(__dirname, 'fixtures', 'operator-logbook-worker.ts');

function createSchema(db: Database.Database): void {
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

function runWorker(env: NodeJS.ProcessEnv): Promise<{ queued: { id: number; kind: string; serial: number } | null }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--import', 'tsx', WORKER_PATH], {
      cwd: SERVICE_ROOT,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', chunk => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', code => {
      if (code !== 0) {
        reject(new Error(`worker exited ${code}: ${stderr || stdout}`));
        return;
      }
      try {
        const jsonLine = stdout
          .split(/\r?\n/)
          .map(line => line.trim())
          .filter(line => line.startsWith('{') && line.endsWith('}'))
          .pop();
        if (!jsonLine) {
          reject(new Error(`worker emitted no JSON payload\nstdout=${stdout}\nstderr=${stderr}`));
          return;
        }
        const parsed = JSON.parse(jsonLine) as { queued: { id: number; kind: string; serial: number } | null };
        resolve(parsed);
      } catch (err) {
        reject(new Error(`failed to parse worker output: ${String(err)}\nstdout=${stdout}\nstderr=${stderr}`));
      }
    });
  });
}

describe('operator-logbook multi-process contract', () => {
  let tempDir: string | null = null;

  afterEach(() => {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
      tempDir = null;
    }
  });

  it('allows only one daily enqueue when two workers tick concurrently', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'kyoshin-operator-logbook-mp-'));
    const dbPath = join(tempDir, 'autonomous.db');
    const db = new Database(dbPath);
    createSchema(db);
    db.close();

    const nowMs = 1_739_200_000_000;
    const env = {
      ...process.env,
      DATA_DIR: tempDir,
      KYOSHIN_OPERATOR_LOG_ENABLED: 'true',
      KYOSHIN_OPERATOR_LOG_INITIAL_SERIAL: '9',
      KYO_TEST_NOW_MS: String(nowMs),
    };

    const [a, b] = await Promise.all([runWorker(env), runWorker(env)]);
    const queuedCount = [a, b].filter(result => result.queued !== null).length;
    expect(queuedCount).toBe(1);

    const verifyDb = new Database(dbPath, { readonly: true });
    const postCount = (
      verifyDb.prepare('SELECT COUNT(*) as count FROM post_queue WHERE context = ?').get('kyoshin_log:daily_24h') as {
        count: number;
      }
    ).count;
    expect(postCount).toBe(1);

    const state = verifyDb
      .prepare('SELECT next_serial, last_daily_at FROM kyoshin_operator_log_state WHERE key = ?')
      .get('kyoshin') as { next_serial: number; last_daily_at: number };
    expect(state.next_serial).toBe(10);
    expect(state.last_daily_at).toBe(nowMs);
    verifyDb.close();
  });
});
