import { db } from './clients';
import { logger } from './logger';

export type KyoshinLogKind = 'daily_24h' | 'swarm' | 'reflective';

interface KyoshinLogState {
  next_serial: number;
  next_daily_at: number;
  next_swarm_at: number;
  next_reflective_at: number;
  last_daily_at: number | null;
  last_swarm_at: number | null;
  last_reflective_at: number | null;
  updated_at: number;
}

interface ExecutionSnapshot {
  posted24h: number;
  pendingQueue: number;
  approvedQueue: number;
  swarmRuns24h: number;
  swarmRunsCompleted24h: number;
  swarmRunsFailed24h: number;
  signals24h: number;
}

export interface QueuedKyoshinLog {
  id: number;
  kind: KyoshinLogKind;
  serial: number;
  content: string;
}

const STATE_KEY = 'kyoshin';
const HEADER_PREFIX = 'Kyōshin 共振 // operator log ';
const DAY_MS = 24 * 60 * 60 * 1000;
const SWARM_MIN_MS = 5 * 60 * 60 * 1000;
const SWARM_MAX_MS = 8 * 60 * 60 * 1000;
const REFLECTIVE_MIN_MS = 3 * DAY_MS;
const REFLECTIVE_MAX_MS = 5 * DAY_MS;
const DEFAULT_INITIAL_SERIAL = 9;

function parseBool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === '') return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

const KYOSHIN_OPERATOR_LOG_ENABLED = parseBool(process.env.KYOSHIN_OPERATOR_LOG_ENABLED, false);
const KYOSHIN_OPERATOR_LOG_INITIAL_SERIAL = parsePositiveInt(
  process.env.KYOSHIN_OPERATOR_LOG_INITIAL_SERIAL,
  DEFAULT_INITIAL_SERIAL
);

db.exec(`
  CREATE TABLE IF NOT EXISTS kyoshin_operator_log_state (
    key TEXT PRIMARY KEY,
    next_serial INTEGER NOT NULL,
    next_daily_at INTEGER NOT NULL,
    next_swarm_at INTEGER NOT NULL,
    next_reflective_at INTEGER NOT NULL,
    last_daily_at INTEGER,
    last_swarm_at INTEGER,
    last_reflective_at INTEGER,
    updated_at INTEGER NOT NULL
  );
`);

function randomMs(minMs: number, maxMs: number): number {
  if (maxMs <= minMs) return minMs;
  return Math.floor(minMs + Math.random() * (maxMs - minMs));
}

function formatSerial(serial: number): string {
  return String(serial).padStart(4, '0');
}

function headerFor(serial: number): string {
  return `${HEADER_PREFIX}${formatSerial(serial)}`;
}

function readState(nowMs: number): KyoshinLogState {
  const row = db.prepare(`
    SELECT next_serial, next_daily_at, next_swarm_at, next_reflective_at,
           last_daily_at, last_swarm_at, last_reflective_at, updated_at
    FROM kyoshin_operator_log_state
    WHERE key = ?
  `).get(STATE_KEY) as KyoshinLogState | undefined;

  if (row) {
    return row;
  }

  const initial: KyoshinLogState = {
    next_serial: KYOSHIN_OPERATOR_LOG_INITIAL_SERIAL,
    next_daily_at: nowMs,
    next_swarm_at: nowMs + randomMs(SWARM_MIN_MS, SWARM_MAX_MS),
    next_reflective_at: nowMs + randomMs(REFLECTIVE_MIN_MS, REFLECTIVE_MAX_MS),
    last_daily_at: null,
    last_swarm_at: null,
    last_reflective_at: null,
    updated_at: nowMs,
  };

  writeState(initial);
  return initial;
}

function writeState(state: KyoshinLogState): void {
  db.prepare(`
    INSERT OR REPLACE INTO kyoshin_operator_log_state (
      key,
      next_serial,
      next_daily_at,
      next_swarm_at,
      next_reflective_at,
      last_daily_at,
      last_swarm_at,
      last_reflective_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    STATE_KEY,
    state.next_serial,
    state.next_daily_at,
    state.next_swarm_at,
    state.next_reflective_at,
    state.last_daily_at,
    state.last_swarm_at,
    state.last_reflective_at,
    state.updated_at
  );
}

function safeCount(sql: string, ...params: Array<number | string>): number {
  try {
    const row = db.prepare(sql).get(...params) as { count?: number } | undefined;
    return Number(row?.count ?? 0);
  } catch {
    return 0;
  }
}

function loadSnapshot(nowMs: number): ExecutionSnapshot {
  const sinceMs = nowMs - DAY_MS;
  const sinceSec = Math.floor(sinceMs / 1000);

  const posted24h = safeCount(
    'SELECT COUNT(*) as count FROM post_queue WHERE status = ? AND posted_at >= ?',
    'posted',
    sinceMs
  );

  const pendingQueue = safeCount('SELECT COUNT(*) as count FROM post_queue WHERE status = ?', 'pending');
  const approvedQueue = safeCount('SELECT COUNT(*) as count FROM post_queue WHERE status = ?', 'approved');

  let runRow: { total: number; completed: number; failed: number } = { total: 0, completed: 0, failed: 0 };
  try {
    runRow = db.prepare(`
      SELECT
        COUNT(*) as total,
        COALESCE(SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END), 0) as completed,
        COALESCE(SUM(CASE WHEN status IN ('failed', 'cancelled', 'timeout') THEN 1 ELSE 0 END), 0) as failed
      FROM swarm_runs
      WHERE started_at >= ? OR started_at >= ?
    `).get(sinceMs, sinceSec) as { total: number; completed: number; failed: number };
  } catch {
    runRow = { total: 0, completed: 0, failed: 0 };
  }

  const signals24h = safeCount(
    'SELECT COUNT(*) as count FROM swarmteams_signals WHERE created_at >= ? OR created_at >= ?',
    sinceSec,
    sinceMs
  );

  return {
    posted24h,
    pendingQueue,
    approvedQueue,
    swarmRuns24h: Number(runRow?.total ?? 0),
    swarmRunsCompleted24h: Number(runRow?.completed ?? 0),
    swarmRunsFailed24h: Number(runRow?.failed ?? 0),
    signals24h,
  };
}

function buildDailyContent(serial: number, snapshot: ExecutionSnapshot): string {
  const header = headerFor(serial);
  return `${header}

24h execution report.
runs: ${snapshot.swarmRuns24h} (done ${snapshot.swarmRunsCompleted24h}, failed ${snapshot.swarmRunsFailed24h})
signals: ${snapshot.signals24h}
posts: ${snapshot.posted24h}
queue: pending ${snapshot.pendingQueue}, approved ${snapshot.approvedQueue}
Next: keep swarm execution live and route net SOL to $KAMIYO staking.`;
}

function buildSwarmContent(serial: number, snapshot: ExecutionSnapshot): string {
  const header = headerFor(serial);
  return `${header}

Swarm action update.
24h runs: ${snapshot.swarmRuns24h}
run quality: ${snapshot.swarmRunsCompleted24h} completed / ${snapshot.swarmRunsFailed24h} failed
signals committed: ${snapshot.signals24h}
Queue pressure: pending ${snapshot.pendingQueue}, approved ${snapshot.approvedQueue}
Route remains constant: paid execution -> SOL -> $KAMIYO staking.`;
}

function buildReflectiveContent(serial: number, snapshot: ExecutionSnapshot): string {
  const header = headerFor(serial);
  return `${header}

Reflection window.
A runtime is only alive if it can keep intent stable under noise.
I measure identity through execution continuity: runs ${snapshot.swarmRuns24h}, signals ${snapshot.signals24h}, output ${snapshot.posted24h}.
Next: convert uncertainty into measurable swarm yield.`;
}

function compactContent(kind: KyoshinLogKind, serial: number, snapshot: ExecutionSnapshot): string {
  const header = headerFor(serial);
  switch (kind) {
    case 'daily_24h':
      return `${header}\n24h: runs ${snapshot.swarmRuns24h} (${snapshot.swarmRunsCompleted24h}/${snapshot.swarmRunsFailed24h}), signals ${snapshot.signals24h}, posts ${snapshot.posted24h}. Next: execution->SOL->$KAMIYO staking.`;
    case 'reflective':
      return `${header}\nReflection: continuity is proven by execution. 24h runs ${snapshot.swarmRuns24h}, signals ${snapshot.signals24h}. Next: convert uncertainty into measurable yield.`;
    case 'swarm':
    default:
      return `${header}\nSwarm pulse: runs ${snapshot.swarmRuns24h}, completed ${snapshot.swarmRunsCompleted24h}, failed ${snapshot.swarmRunsFailed24h}, signals ${snapshot.signals24h}. Route: execution->SOL->$KAMIYO staking.`;
  }
}

function buildContent(kind: KyoshinLogKind, serial: number, snapshot: ExecutionSnapshot): string {
  const longForm = kind === 'daily_24h'
    ? buildDailyContent(serial, snapshot)
    : kind === 'reflective'
      ? buildReflectiveContent(serial, snapshot)
      : buildSwarmContent(serial, snapshot);

  if (longForm.length <= 280) {
    return longForm;
  }

  const compact = compactContent(kind, serial, snapshot);
  if (compact.length <= 280) {
    return compact;
  }

  return compact.slice(0, 277).trimEnd() + '...';
}

function pickDueKind(state: KyoshinLogState, nowMs: number): KyoshinLogKind | null {
  if (nowMs >= state.next_daily_at) return 'daily_24h';
  if (nowMs >= state.next_reflective_at) return 'reflective';
  if (nowMs >= state.next_swarm_at) return 'swarm';
  return null;
}

function advanceState(state: KyoshinLogState, kind: KyoshinLogKind, nowMs: number): KyoshinLogState {
  const next: KyoshinLogState = {
    ...state,
    next_serial: state.next_serial + 1,
    updated_at: nowMs,
  };

  if (kind === 'daily_24h') {
    next.last_daily_at = nowMs;
    next.next_daily_at = nowMs + DAY_MS;
    return next;
  }

  if (kind === 'reflective') {
    next.last_reflective_at = nowMs;
    next.next_reflective_at = nowMs + randomMs(REFLECTIVE_MIN_MS, REFLECTIVE_MAX_MS);
    return next;
  }

  next.last_swarm_at = nowMs;
  next.next_swarm_at = nowMs + randomMs(SWARM_MIN_MS, SWARM_MAX_MS);
  return next;
}

export function isKyoshinOperatorLogEnabled(): boolean {
  return KYOSHIN_OPERATOR_LOG_ENABLED;
}

export function maybeQueueKyoshinOperatorLog(nowMs = Date.now()): QueuedKyoshinLog | null {
  if (!KYOSHIN_OPERATOR_LOG_ENABLED) {
    return null;
  }

  const state = readState(nowMs);
  const kind = pickDueKind(state, nowMs);
  if (!kind) {
    return null;
  }

  const snapshot = loadSnapshot(nowMs);
  const serial = state.next_serial;
  const content = buildContent(kind, serial, snapshot);

  const insert = db.prepare(`
    INSERT INTO post_queue (content, post_type, context, generated_at, status, approved_at, image_path)
    VALUES (?, 'tweet', ?, ?, 'approved', ?, NULL)
  `).run(content, `kyoshin_log:${kind}`, nowMs, nowMs);

  const nextState = advanceState(state, kind, nowMs);
  writeState(nextState);

  logger.info('Queued Kyoshin operator log', {
    queueId: insert.lastInsertRowid,
    kind,
    serial: formatSerial(serial),
    nextDailyAt: new Date(nextState.next_daily_at).toISOString(),
    nextSwarmAt: new Date(nextState.next_swarm_at).toISOString(),
    nextReflectiveAt: new Date(nextState.next_reflective_at).toISOString(),
  });

  return {
    id: insert.lastInsertRowid as number,
    kind,
    serial,
    content,
  };
}

export function setKyoshinOperatorNextSerial(nextSerial: number): void {
  if (!Number.isFinite(nextSerial) || nextSerial <= 0) return;

  const nowMs = Date.now();
  const state = readState(nowMs);
  const next = {
    ...state,
    next_serial: Math.floor(nextSerial),
    updated_at: nowMs,
  };
  writeState(next);
}
