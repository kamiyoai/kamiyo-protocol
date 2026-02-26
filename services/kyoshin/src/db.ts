<<<<<<< HEAD
import Database from 'better-sqlite3';
=======
>>>>>>> origin/kamiyo/kyoshin-exec-canary
import fs from 'node:fs';
import path from 'node:path';

type RetentionCutoffs = {
  ticksBeforeIso: string;
  observationsBeforeIso: string;
  actionsBeforeIso: string;
  usageBeforeIso: string;
};

<<<<<<< HEAD
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
  const staleRunningTicks = db.prepare(
    `SELECT id FROM ticks WHERE status = 'running' AND finished_at IS NULL AND started_at <= ? ORDER BY started_at ASC`
  );
  const markTickRecovered = db.prepare(
    `UPDATE ticks SET finished_at = @finished_at, status = 'error', error = @error WHERE id = @id`
  );
  const deleteObservationsBefore = db.prepare(`DELETE FROM observations WHERE at < ?`);
  const deleteActionsBefore = db.prepare(`DELETE FROM actions WHERE at < ?`);
  const deleteUsageBefore = db.prepare(`DELETE FROM llm_usage WHERE at < ?`);
  const deleteTicksBefore = db.prepare(
    `DELETE FROM ticks WHERE finished_at IS NOT NULL AND finished_at < ?`
  );
  const deleteSwarmJobsBefore = db.prepare(`DELETE FROM swarm_jobs WHERE executed_at < ?`);
  const deleteRevenueEventsBefore = db.prepare(`DELETE FROM swarm_revenue_events WHERE created_at < ?`);
  const upsertSwarmJob = db.prepare(
    `INSERT INTO swarm_jobs (
      id, agent_id, source, status, url, paid, payment_network, payment_amount_usd,
      revenue_sol, revenue_usd, error, metadata_json, executed_at, updated_at
    ) VALUES (
      @id, @agent_id, @source, @status, @url, @paid, @payment_network, @payment_amount_usd,
      @revenue_sol, @revenue_usd, @error, @metadata_json, @executed_at, @updated_at
    )
    ON CONFLICT(id) DO UPDATE SET
      agent_id = excluded.agent_id,
      source = excluded.source,
      status = excluded.status,
      url = excluded.url,
      paid = excluded.paid,
      payment_network = excluded.payment_network,
      payment_amount_usd = excluded.payment_amount_usd,
      revenue_sol = excluded.revenue_sol,
      revenue_usd = excluded.revenue_usd,
      error = excluded.error,
      metadata_json = excluded.metadata_json,
      executed_at = excluded.executed_at,
      updated_at = excluded.updated_at`
  );
  const swarmJobStatsSince = db.prepare(
    `SELECT
      agent_id AS agentId,
      COUNT(1) AS total,
      SUM(CASE WHEN status = 'executed' THEN 1 ELSE 0 END) AS succeeded,
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed,
      SUM(CASE WHEN paid = 1 THEN 1 ELSE 0 END) AS paidCount,
      COALESCE(SUM(revenue_sol), 0) AS revenueSol,
      COALESCE(SUM(revenue_usd), 0) AS revenueUsd
    FROM swarm_jobs
    WHERE executed_at >= ?
    GROUP BY agent_id`
  );
  const swarmSourceStatsSince = db.prepare(
    `SELECT
      source,
      COUNT(1) AS total,
      SUM(CASE WHEN status = 'executed' THEN 1 ELSE 0 END) AS succeeded,
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed,
      COALESCE(SUM(revenue_sol), 0) AS revenueSol,
      COALESCE(SUM(revenue_usd), 0) AS revenueUsd
    FROM swarm_jobs
    WHERE executed_at >= ?
    GROUP BY source`
  );
  const insertRevenueEvent = db.prepare(
    `INSERT INTO swarm_revenue_events (
      id, tick_id, agent_id, lane, kind, amount_sol, amount_usd, metadata_json, created_at
    ) VALUES (
      @id, @tick_id, @agent_id, @lane, @kind, @amount_sol, @amount_usd, @metadata_json, @created_at
    )
    ON CONFLICT(id) DO UPDATE SET
      tick_id = excluded.tick_id,
      agent_id = excluded.agent_id,
      lane = excluded.lane,
      kind = excluded.kind,
      amount_sol = excluded.amount_sol,
      amount_usd = excluded.amount_usd,
      metadata_json = excluded.metadata_json,
      created_at = excluded.created_at`
  );
  const revenueLaneStatsSince = db.prepare(
    `SELECT
      lane,
      kind,
      COUNT(1) AS events,
      COALESCE(SUM(amount_sol), 0) AS amountSol,
      COALESCE(SUM(amount_usd), 0) AS amountUsd
    FROM swarm_revenue_events
    WHERE created_at >= ?
    GROUP BY lane, kind
    ORDER BY lane ASC, kind ASC`
  );
  const tickStatsSince = db.prepare(
    `SELECT
      COUNT(1) AS total,
      SUM(CASE WHEN status = 'ok' THEN 1 ELSE 0 END) AS ok,
      SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) AS error,
      SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END) AS running
    FROM ticks
    WHERE started_at >= ?`
  );
  const actionStatsSinceAny = db.prepare(
    `SELECT
      COUNT(1) AS total,
      SUM(CASE WHEN error IS NULL THEN 1 ELSE 0 END) AS success,
      SUM(CASE WHEN error IS NOT NULL THEN 1 ELSE 0 END) AS failed
    FROM actions
    WHERE at >= ?`
  );
  const actionStatsSinceTool = db.prepare(
    `SELECT
      COUNT(1) AS total,
      SUM(CASE WHEN error IS NULL THEN 1 ELSE 0 END) AS success,
      SUM(CASE WHEN error IS NOT NULL THEN 1 ELSE 0 END) AS failed
    FROM actions
    WHERE at >= ? AND tool = ?`
  );
  const ticksSince = db.prepare(
    `SELECT
      id,
      started_at AS startedAt,
      finished_at AS finishedAt,
      status,
      error
    FROM ticks
    WHERE started_at >= ?
    ORDER BY started_at ASC`
  );
  const actionsSinceAny = db.prepare(
    `SELECT tick_id AS tickId, at, tool, error FROM actions WHERE at >= ? ORDER BY at ASC`
  );
  const actionsSinceTool = db.prepare(
    `SELECT tick_id AS tickId, at, tool, error FROM actions WHERE at >= ? AND tool = ? ORDER BY at ASC`
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

    recoverStaleRunningTicks: (cutoffIso: string, reason: string): string[] => {
      const rows = staleRunningTicks.all(cutoffIso) as Array<{ id: string }>;
      if (rows.length === 0) return [];

      const finishedAt = new Date().toISOString();
      const tx = db.transaction((tickIds: string[]) => {
        for (const id of tickIds) {
          markTickRecovered.run({
            id,
            finished_at: finishedAt,
            error: reason,
          });
        }
      });

      const ids = rows.map(row => row.id);
      tx(ids);
      return ids;
    },

    pruneHistory: (cutoffs: RetentionCutoffs) => {
      const tx = db.transaction((params: RetentionCutoffs) => {
        const observationsDeleted = deleteObservationsBefore.run(params.observationsBeforeIso).changes;
        const actionsDeleted = deleteActionsBefore.run(params.actionsBeforeIso).changes;
        const usageDeleted = deleteUsageBefore.run(params.usageBeforeIso).changes;
        const ticksDeleted = deleteTicksBefore.run(params.ticksBeforeIso).changes;
        const swarmJobsDeleted = deleteSwarmJobsBefore.run(params.actionsBeforeIso).changes;
        const revenueEventsDeleted = deleteRevenueEventsBefore.run(params.actionsBeforeIso).changes;
        return {
          observationsDeleted,
          actionsDeleted,
          usageDeleted,
          ticksDeleted,
          swarmJobsDeleted,
          revenueEventsDeleted,
        };
      });

      const result = tx(cutoffs);
      const totalDeleted =
        result.observationsDeleted +
        result.actionsDeleted +
        result.usageDeleted +
        result.ticksDeleted +
        result.swarmJobsDeleted +
        result.revenueEventsDeleted;
      if (totalDeleted > 0) {
        try {
          db.pragma('wal_checkpoint(PASSIVE)');
        } catch {
          // Best effort.
        }
      }

=======
type TickStatus = 'running' | 'ok' | 'error';

type TickRow = {
  id: string;
  startedAt: string;
  finishedAt: string | null;
  status: TickStatus;
  error: string | null;
};

type ObservationRow = {
  tickId: string;
  at: string;
  kind: string;
  json: unknown;
};

type ActionRow = {
  tickId: string;
  at: string;
  tool: string;
  input: unknown;
  result: unknown;
  error: string | null;
};

type UsageRow = {
  tickId: string;
  at: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
};

type SwarmJobRow = {
  id: string;
  agentId: string;
  source: string;
  status: 'executed' | 'failed' | 'skipped';
  url?: string;
  paid: boolean;
  paymentNetwork?: string;
  paymentAmountUsd?: number;
  revenueSol: number;
  revenueUsd: number;
  error?: string;
  metadata?: unknown;
  executedAt: string;
  updatedAt: string;
};

type RevenueEventRow = {
  id: string;
  tickId: string;
  agentId?: string;
  lane: string;
  kind: string;
  amountSol: number;
  amountUsd?: number;
  metadata?: unknown;
  createdAt: string;
};

type IntakeJobStatus = 'pending' | 'completed' | 'deadletter';

type IntakeJobPayload = {
  source: 'x402' | 'direct' | 'internal';
  title: string;
  summary: string;
  url: string;
  confidence: number;
  roleHints: string[];
  tags: string[];
  payoutUsd?: number;
  payoutSol?: number;
  expiresAt?: string;
  metadata?: Record<string, unknown>;
};

type IntakeJobResult = {
  status: 'executed' | 'failed' | 'skipped';
  reason?: string;
  realizedRevenueSol: number;
  realizedRevenueUsd: number;
  at: string;
};

type IntakeJobRow = {
  id: string;
  status: IntakeJobStatus;
  attempts: number;
  nextAttemptAt: string;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
  payload: IntakeJobPayload;
  lastResult: IntakeJobResult | null;
};

type DbState = {
  version: number;
  ticks: TickRow[];
  observations: ObservationRow[];
  actions: ActionRow[];
  llmUsage: UsageRow[];
  kv: Record<string, string>;
  swarmJobs: Record<string, SwarmJobRow>;
  swarmRevenueEvents: Record<string, RevenueEventRow>;
  intakeJobs: Record<string, IntakeJobRow>;
};

const CURRENT_VERSION = 2;

function createEmptyState(): DbState {
  return {
    version: CURRENT_VERSION,
    ticks: [],
    observations: [],
    actions: [],
    llmUsage: [],
    kv: {},
    swarmJobs: {},
    swarmRevenueEvents: {},
    intakeJobs: {},
  };
}

function asNumber(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function asString(value: unknown, fallback = ''): string {
  if (typeof value === 'string') return value;
  if (value == null) return fallback;
  return String(value);
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .flatMap(item => (typeof item === 'string' ? [item.trim()] : []))
    .filter(Boolean);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asNullableIso(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return undefined;
  return new Date(parsed).toISOString();
}

function parseState(raw: unknown): DbState {
  if (!raw || typeof raw !== 'object') {
    return createEmptyState();
  }

  const obj = raw as Partial<DbState>;
  const state = createEmptyState();

  state.version = asNumber(obj.version) || CURRENT_VERSION;
  state.ticks = Array.isArray(obj.ticks)
    ? obj.ticks.map((row: any) => ({
        id: String(row?.id ?? ''),
        startedAt: String(row?.startedAt ?? ''),
        finishedAt: row?.finishedAt == null ? null : String(row.finishedAt),
        status: (row?.status ?? 'running') as TickStatus,
        error: row?.error == null ? null : String(row.error),
      }))
    : [];

  state.observations = Array.isArray(obj.observations)
    ? obj.observations.map((row: any) => ({
        tickId: String(row?.tickId ?? ''),
        at: String(row?.at ?? ''),
        kind: String(row?.kind ?? ''),
        json: row?.json ?? null,
      }))
    : [];

  state.actions = Array.isArray(obj.actions)
    ? obj.actions.map((row: any) => ({
        tickId: String(row?.tickId ?? ''),
        at: String(row?.at ?? ''),
        tool: String(row?.tool ?? ''),
        input: row?.input ?? null,
        result: row?.result ?? null,
        error: row?.error == null ? null : String(row.error),
      }))
    : [];

  state.llmUsage = Array.isArray(obj.llmUsage)
    ? obj.llmUsage.map((row: any) => ({
        tickId: String(row?.tickId ?? ''),
        at: String(row?.at ?? ''),
        model: String(row?.model ?? ''),
        inputTokens: asNumber(row?.inputTokens),
        outputTokens: asNumber(row?.outputTokens),
      }))
    : [];

  if (obj.kv && typeof obj.kv === 'object') {
    for (const [key, value] of Object.entries(obj.kv)) {
      if (typeof value === 'string') {
        state.kv[key] = value;
      }
    }
  }

  if (obj.swarmJobs && typeof obj.swarmJobs === 'object') {
    for (const [id, value] of Object.entries(obj.swarmJobs as Record<string, any>)) {
      state.swarmJobs[id] = {
        id,
        agentId: String(value?.agentId ?? ''),
        source: String(value?.source ?? ''),
        status: (value?.status ?? 'failed') as SwarmJobRow['status'],
        url: value?.url == null ? undefined : String(value.url),
        paid: Boolean(value?.paid),
        paymentNetwork: value?.paymentNetwork == null ? undefined : String(value.paymentNetwork),
        paymentAmountUsd: value?.paymentAmountUsd == null ? undefined : asNumber(value.paymentAmountUsd),
        revenueSol: asNumber(value?.revenueSol),
        revenueUsd: asNumber(value?.revenueUsd),
        error: value?.error == null ? undefined : String(value.error),
        metadata: value?.metadata,
        executedAt: String(value?.executedAt ?? ''),
        updatedAt: String(value?.updatedAt ?? ''),
      };
    }
  }

  if (obj.swarmRevenueEvents && typeof obj.swarmRevenueEvents === 'object') {
    for (const [id, value] of Object.entries(obj.swarmRevenueEvents as Record<string, any>)) {
      state.swarmRevenueEvents[id] = {
        id,
        tickId: String(value?.tickId ?? ''),
        agentId: value?.agentId == null ? undefined : String(value.agentId),
        lane: String(value?.lane ?? ''),
        kind: String(value?.kind ?? ''),
        amountSol: asNumber(value?.amountSol),
        amountUsd: value?.amountUsd == null ? undefined : asNumber(value.amountUsd),
        metadata: value?.metadata,
        createdAt: String(value?.createdAt ?? ''),
      };
    }
  }

  if (obj.intakeJobs && typeof obj.intakeJobs === 'object') {
    for (const [id, value] of Object.entries(obj.intakeJobs as Record<string, any>)) {
      const payload = asRecord(value?.payload) ?? {};
      const metadata = asRecord(payload.metadata) ?? undefined;
      const sourceRaw = asString(payload.source, 'direct');
      const source =
        sourceRaw === 'x402' || sourceRaw === 'internal' || sourceRaw === 'direct'
          ? sourceRaw
          : 'direct';

      const resultRaw = asRecord(value?.lastResult);
      const resultStatus = asString(resultRaw?.status);
      const lastResult =
        resultStatus === 'executed' || resultStatus === 'failed' || resultStatus === 'skipped'
          ? {
              status: resultStatus as IntakeJobResult['status'],
              reason: resultRaw?.reason == null ? undefined : asString(resultRaw.reason),
              realizedRevenueSol: asNumber(resultRaw?.realizedRevenueSol),
              realizedRevenueUsd: asNumber(resultRaw?.realizedRevenueUsd),
              at: asString(resultRaw?.at, new Date(0).toISOString()),
            }
          : null;

      const statusRaw = asString(value?.status, 'pending');
      const status =
        statusRaw === 'pending' || statusRaw === 'completed' || statusRaw === 'deadletter'
          ? statusRaw
          : 'pending';

      state.intakeJobs[id] = {
        id,
        status,
        attempts: Math.max(0, Math.trunc(asNumber(value?.attempts))),
        nextAttemptAt: asNullableIso(value?.nextAttemptAt) ?? new Date(0).toISOString(),
        lastError: value?.lastError == null ? null : asString(value.lastError),
        createdAt: asNullableIso(value?.createdAt) ?? new Date(0).toISOString(),
        updatedAt: asNullableIso(value?.updatedAt) ?? new Date(0).toISOString(),
        payload: {
          source,
          title: asString(payload.title),
          summary: asString(payload.summary),
          url: asString(payload.url),
          confidence: Math.max(0, Math.min(1, asNumber(payload.confidence))),
          roleHints: asStringArray(payload.roleHints),
          tags: asStringArray(payload.tags),
          payoutUsd: payload.payoutUsd == null ? undefined : asNumber(payload.payoutUsd),
          payoutSol: payload.payoutSol == null ? undefined : asNumber(payload.payoutSol),
          expiresAt: asNullableIso(payload.expiresAt),
          metadata,
        },
        lastResult,
      };
    }
  }

  return state;
}

function readState(filePath: string): DbState {
  if (!fs.existsSync(filePath)) {
    return createEmptyState();
  }

  try {
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return parseState(raw);
  } catch {
    return createEmptyState();
  }
}

function writeState(filePath: string, state: DbState): void {
  const next = `${filePath}.tmp`;
  fs.writeFileSync(next, JSON.stringify(state));
  fs.renameSync(next, filePath);
}

function sortByIsoAsc<T extends { [k: string]: unknown }>(rows: T[], key: keyof T): T[] {
  return rows.slice().sort((a, b) => String(a[key]).localeCompare(String(b[key])));
}

function nowIso(): string {
  return new Date().toISOString();
}

function stableIntakeId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function intakeBackoffSeconds(params: {
  attempts: number;
  baseSeconds: number;
  maxSeconds: number;
}): number {
  const exponent = Math.max(0, params.attempts - 1);
  const candidate = params.baseSeconds * Math.pow(2, exponent);
  return Math.max(params.baseSeconds, Math.min(params.maxSeconds, Math.floor(candidate)));
}

export function openDb(dbPath: string) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  const state = readState(dbPath);

  const persist = () => {
    writeState(dbPath, state);
  };

  return {
    close: () => {
      persist();
    },

    startTick: (id: string) => {
      state.ticks.push({
        id,
        startedAt: new Date().toISOString(),
        finishedAt: null,
        status: 'running',
        error: null,
      });
      persist();
    },

    finishTick: (id: string, status: 'ok' | 'error', err?: string) => {
      const row = state.ticks.find(t => t.id === id);
      if (!row) return;
      row.finishedAt = new Date().toISOString();
      row.status = status;
      row.error = err ?? null;
      persist();
    },

    addObservation: (tickId: string, kind: string, json: unknown) => {
      state.observations.push({
        tickId,
        at: new Date().toISOString(),
        kind,
        json,
      });
      persist();
    },

    addAction: (tickId: string, tool: string, input: unknown, result: unknown, error?: string) => {
      state.actions.push({
        tickId,
        at: new Date().toISOString(),
        tool,
        input: input ?? null,
        result: result ?? null,
        error: error ?? null,
      });
      persist();
    },

    addUsage: (tickId: string, model: string, usage: { input_tokens: number; output_tokens: number }) => {
      state.llmUsage.push({
        tickId,
        at: new Date().toISOString(),
        model,
        inputTokens: usage.input_tokens,
        outputTokens: usage.output_tokens,
      });
      persist();
    },

    kvGet: (key: string): string | undefined => state.kv[key],

    kvSet: (key: string, value: string): void => {
      state.kv[key] = value;
      persist();
    },

    kvKeys: (prefix?: string): string[] => {
      const keys = Object.keys(state.kv);
      if (!prefix) return keys;
      return keys.filter(key => key.startsWith(prefix));
    },

    upsertIntakeJobs: (jobs: Array<{ id?: string; payload: IntakeJobPayload }>): {
      accepted: string[];
      updated: string[];
      rejected: Array<{ id: string; reason: string }>;
    } => {
      const accepted: string[] = [];
      const updated: string[] = [];
      const rejected: Array<{ id: string; reason: string }> = [];
      const now = nowIso();

      for (const job of jobs) {
        const id = (job.id ?? stableIntakeId('job')).trim();
        if (!id) {
          rejected.push({ id: '', reason: 'missing_id' });
          continue;
        }
        const existing = state.intakeJobs[id];
        if (existing?.status === 'completed') {
          rejected.push({ id, reason: 'already_completed' });
          continue;
        }

        const next: IntakeJobRow = {
          id,
          status: 'pending',
          attempts: existing?.attempts ?? 0,
          nextAttemptAt: now,
          lastError: null,
          createdAt: existing?.createdAt ?? now,
          updatedAt: now,
          payload: {
            source: job.payload.source,
            title: job.payload.title,
            summary: job.payload.summary,
            url: job.payload.url,
            confidence: Math.max(0, Math.min(1, job.payload.confidence)),
            roleHints: Array.from(new Set(job.payload.roleHints)),
            tags: Array.from(new Set(job.payload.tags)),
            payoutUsd: job.payload.payoutUsd,
            payoutSol: job.payload.payoutSol,
            expiresAt: job.payload.expiresAt,
            metadata: job.payload.metadata,
          },
          lastResult: existing?.lastResult ?? null,
        };

        state.intakeJobs[id] = next;
        if (existing) {
          updated.push(id);
        } else {
          accepted.push(id);
        }
      }

      if (accepted.length > 0 || updated.length > 0 || rejected.length > 0) {
        persist();
      }

      return { accepted, updated, rejected };
    },

    dueIntakeJobs: (params: { nowIso: string; limit: number }): IntakeJobRow[] => {
      let mutated = false;
      for (const row of Object.values(state.intakeJobs)) {
        if (row.status !== 'pending') continue;
        if (row.payload.expiresAt && row.payload.expiresAt <= params.nowIso) {
          row.status = 'deadletter';
          row.updatedAt = params.nowIso;
          row.lastError = 'expired';
          mutated = true;
        }
      }
      if (mutated) persist();

      const rows = Object.values(state.intakeJobs)
        .filter(row => row.status === 'pending' && row.nextAttemptAt <= params.nowIso)
        .sort((a, b) => {
          if (a.nextAttemptAt !== b.nextAttemptAt) return a.nextAttemptAt.localeCompare(b.nextAttemptAt);
          return a.createdAt.localeCompare(b.createdAt);
        })
        .slice(0, Math.max(1, params.limit));

      return rows.map(row => ({
        ...row,
        payload: { ...row.payload, roleHints: [...row.payload.roleHints], tags: [...row.payload.tags] },
        lastResult: row.lastResult ? { ...row.lastResult } : null,
      }));
    },

    settleIntakeJob: (params: {
      jobId: string;
      status: 'executed' | 'failed' | 'skipped';
      reason?: string;
      realizedRevenueSol: number;
      realizedRevenueUsd: number;
      retryLimit: number;
      retryBaseSeconds: number;
      retryMaxSeconds: number;
      terminal?: boolean;
      nowIso?: string;
    }): IntakeJobRow | null => {
      const row = state.intakeJobs[params.jobId];
      if (!row) return null;

      const at = params.nowIso ?? nowIso();
      row.attempts += 1;
      row.updatedAt = at;
      row.lastResult = {
        status: params.status,
        reason: params.reason,
        realizedRevenueSol: params.realizedRevenueSol,
        realizedRevenueUsd: params.realizedRevenueUsd,
        at,
      };

      if (params.status === 'executed') {
        row.status = 'completed';
        row.lastError = null;
      } else {
        const retryable = !params.terminal && row.attempts < Math.max(1, params.retryLimit);
        if (retryable) {
          const backoff = intakeBackoffSeconds({
            attempts: row.attempts,
            baseSeconds: Math.max(1, params.retryBaseSeconds),
            maxSeconds: Math.max(Math.max(1, params.retryBaseSeconds), params.retryMaxSeconds),
          });
          row.status = 'pending';
          row.lastError = params.reason ?? params.status;
          row.nextAttemptAt = new Date(Date.parse(at) + backoff * 1000).toISOString();
        } else {
          row.status = 'deadletter';
          row.lastError = params.reason ?? params.status;
          row.nextAttemptAt = at;
        }
      }

      persist();
      return {
        ...row,
        payload: { ...row.payload, roleHints: [...row.payload.roleHints], tags: [...row.payload.tags] },
        lastResult: row.lastResult ? { ...row.lastResult } : null,
      };
    },

    intakeJobStats: (): {
      pending: number;
      completed: number;
      deadletter: number;
      total: number;
    } => {
      let pending = 0;
      let completed = 0;
      let deadletter = 0;
      for (const row of Object.values(state.intakeJobs)) {
        if (row.status === 'pending') pending += 1;
        else if (row.status === 'completed') completed += 1;
        else if (row.status === 'deadletter') deadletter += 1;
      }
      return { pending, completed, deadletter, total: pending + completed + deadletter };
    },

    listIntakeJobs: (params?: {
      status?: IntakeJobStatus;
      limit?: number;
    }): IntakeJobRow[] => {
      const limit = Math.max(1, params?.limit ?? 100);
      const filtered = Object.values(state.intakeJobs)
        .filter(row => !params?.status || row.status === params.status)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, limit);

      return filtered.map(row => ({
        ...row,
        payload: { ...row.payload, roleHints: [...row.payload.roleHints], tags: [...row.payload.tags] },
        lastResult: row.lastResult ? { ...row.lastResult } : null,
      }));
    },

    actionCountSince: (sinceIso: string, tool?: string): number =>
      state.actions.filter(row => row.at >= sinceIso && (!tool || row.tool === tool)).length,

    llmCallCountSince: (sinceIso: string): number =>
      state.llmUsage.filter(row => row.at >= sinceIso).length,

    llmUsageSince: (sinceIso: string): { inputTokens: number; outputTokens: number } => {
      return state.llmUsage
        .filter(row => row.at >= sinceIso)
        .reduce(
          (acc, row) => {
            acc.inputTokens += row.inputTokens;
            acc.outputTokens += row.outputTokens;
            return acc;
          },
          { inputTokens: 0, outputTokens: 0 }
        );
    },

    recoverStaleRunningTicks: (cutoffIso: string, reason: string): string[] => {
      const nowIso = new Date().toISOString();
      const recovered: string[] = [];
      for (const tick of state.ticks) {
        if (tick.status !== 'running' || tick.finishedAt !== null) continue;
        if (tick.startedAt > cutoffIso) continue;
        tick.status = 'error';
        tick.finishedAt = nowIso;
        tick.error = reason;
        recovered.push(tick.id);
      }
      if (recovered.length > 0) {
        persist();
      }
      return recovered;
    },

    pruneHistory: (cutoffs: RetentionCutoffs) => {
      const before = {
        observations: state.observations.length,
        actions: state.actions.length,
        usage: state.llmUsage.length,
        ticks: state.ticks.length,
        swarmJobs: Object.keys(state.swarmJobs).length,
        revenueEvents: Object.keys(state.swarmRevenueEvents).length,
        intakeJobs: Object.keys(state.intakeJobs).length,
      };

      state.observations = state.observations.filter(row => row.at >= cutoffs.observationsBeforeIso);
      state.actions = state.actions.filter(row => row.at >= cutoffs.actionsBeforeIso);
      state.llmUsage = state.llmUsage.filter(row => row.at >= cutoffs.usageBeforeIso);
      state.ticks = state.ticks.filter(
        row => row.finishedAt === null || row.finishedAt >= cutoffs.ticksBeforeIso
      );

      for (const [id, row] of Object.entries(state.swarmJobs)) {
        if (row.executedAt < cutoffs.actionsBeforeIso) {
          delete state.swarmJobs[id];
        }
      }

      for (const [id, row] of Object.entries(state.swarmRevenueEvents)) {
        if (row.createdAt < cutoffs.actionsBeforeIso) {
          delete state.swarmRevenueEvents[id];
        }
      }

      for (const [id, row] of Object.entries(state.intakeJobs)) {
        if (row.status !== 'pending' && row.updatedAt < cutoffs.actionsBeforeIso) {
          delete state.intakeJobs[id];
        }
      }

      const after = {
        observations: state.observations.length,
        actions: state.actions.length,
        usage: state.llmUsage.length,
        ticks: state.ticks.length,
        swarmJobs: Object.keys(state.swarmJobs).length,
        revenueEvents: Object.keys(state.swarmRevenueEvents).length,
        intakeJobs: Object.keys(state.intakeJobs).length,
      };

      const result = {
        observationsDeleted: before.observations - after.observations,
        actionsDeleted: before.actions - after.actions,
        usageDeleted: before.usage - after.usage,
        ticksDeleted: before.ticks - after.ticks,
        swarmJobsDeleted: before.swarmJobs - after.swarmJobs,
        revenueEventsDeleted: before.revenueEvents - after.revenueEvents,
        intakeJobsDeleted: before.intakeJobs - after.intakeJobs,
      };

      if (
        result.observationsDeleted +
          result.actionsDeleted +
          result.usageDeleted +
          result.ticksDeleted +
          result.swarmJobsDeleted +
          result.revenueEventsDeleted +
          result.intakeJobsDeleted >
        0
      ) {
        persist();
      }

>>>>>>> origin/kamiyo/kyoshin-exec-canary
      return result;
    },

    recordSwarmJob: (params: {
      id: string;
      agentId: string;
      source: string;
      status: 'executed' | 'failed' | 'skipped';
      url?: string;
      paid: boolean;
      paymentNetwork?: string;
      paymentAmountUsd?: number;
      revenueSol: number;
      revenueUsd: number;
      error?: string;
      metadata?: unknown;
      executedAt?: string;
    }) => {
      const nowIso = new Date().toISOString();
<<<<<<< HEAD
      upsertSwarmJob.run({
        id: params.id,
        agent_id: params.agentId,
        source: params.source,
        status: params.status,
        url: params.url ?? null,
        paid: params.paid ? 1 : 0,
        payment_network: params.paymentNetwork ?? null,
        payment_amount_usd: params.paymentAmountUsd ?? null,
        revenue_sol: params.revenueSol,
        revenue_usd: params.revenueUsd,
        error: params.error ?? null,
        metadata_json: JSON.stringify(params.metadata ?? null),
        executed_at: params.executedAt ?? nowIso,
        updated_at: nowIso,
      });
=======
      state.swarmJobs[params.id] = {
        id: params.id,
        agentId: params.agentId,
        source: params.source,
        status: params.status,
        url: params.url,
        paid: params.paid,
        paymentNetwork: params.paymentNetwork,
        paymentAmountUsd: params.paymentAmountUsd,
        revenueSol: params.revenueSol,
        revenueUsd: params.revenueUsd,
        error: params.error,
        metadata: params.metadata,
        executedAt: params.executedAt ?? nowIso,
        updatedAt: nowIso,
      };
      persist();
>>>>>>> origin/kamiyo/kyoshin-exec-canary
    },

    swarmJobStatsSince: (sinceIso: string): Array<{
      agentId: string;
      total: number;
      succeeded: number;
      failed: number;
      paidCount: number;
      revenueSol: number;
      revenueUsd: number;
    }> => {
<<<<<<< HEAD
      const rows = swarmJobStatsSince.all(sinceIso) as Array<{
=======
      const groups = new Map<string, {
>>>>>>> origin/kamiyo/kyoshin-exec-canary
        agentId: string;
        total: number;
        succeeded: number;
        failed: number;
        paidCount: number;
        revenueSol: number;
        revenueUsd: number;
<<<<<<< HEAD
      }>;
      return rows;
=======
      }>();

      for (const row of Object.values(state.swarmJobs)) {
        if (row.executedAt < sinceIso) continue;
        const current =
          groups.get(row.agentId) ??
          {
            agentId: row.agentId,
            total: 0,
            succeeded: 0,
            failed: 0,
            paidCount: 0,
            revenueSol: 0,
            revenueUsd: 0,
          };

        current.total += 1;
        if (row.status === 'executed') current.succeeded += 1;
        if (row.status === 'failed') current.failed += 1;
        if (row.paid) current.paidCount += 1;
        current.revenueSol += row.revenueSol;
        current.revenueUsd += row.revenueUsd;

        groups.set(row.agentId, current);
      }

      return Array.from(groups.values()).sort((a, b) => a.agentId.localeCompare(b.agentId));
>>>>>>> origin/kamiyo/kyoshin-exec-canary
    },

    swarmSourceStatsSince: (sinceIso: string): Array<{
      source: string;
      total: number;
      succeeded: number;
      failed: number;
      revenueSol: number;
      revenueUsd: number;
    }> => {
<<<<<<< HEAD
      return swarmSourceStatsSince.all(sinceIso) as Array<{
=======
      const groups = new Map<string, {
>>>>>>> origin/kamiyo/kyoshin-exec-canary
        source: string;
        total: number;
        succeeded: number;
        failed: number;
        revenueSol: number;
        revenueUsd: number;
<<<<<<< HEAD
      }>;
=======
      }>();

      for (const row of Object.values(state.swarmJobs)) {
        if (row.executedAt < sinceIso) continue;
        const current =
          groups.get(row.source) ??
          {
            source: row.source,
            total: 0,
            succeeded: 0,
            failed: 0,
            revenueSol: 0,
            revenueUsd: 0,
          };

        current.total += 1;
        if (row.status === 'executed') current.succeeded += 1;
        if (row.status === 'failed') current.failed += 1;
        current.revenueSol += row.revenueSol;
        current.revenueUsd += row.revenueUsd;

        groups.set(row.source, current);
      }

      return Array.from(groups.values()).sort((a, b) => a.source.localeCompare(b.source));
>>>>>>> origin/kamiyo/kyoshin-exec-canary
    },

    recordRevenueEvent: (params: {
      id: string;
      tickId: string;
      agentId?: string;
      lane: string;
      kind: string;
      amountSol: number;
      amountUsd?: number;
      metadata?: unknown;
      createdAt?: string;
    }) => {
<<<<<<< HEAD
      insertRevenueEvent.run({
        id: params.id,
        tick_id: params.tickId,
        agent_id: params.agentId ?? null,
        lane: params.lane,
        kind: params.kind,
        amount_sol: params.amountSol,
        amount_usd: params.amountUsd ?? null,
        metadata_json: JSON.stringify(params.metadata ?? null),
        created_at: params.createdAt ?? new Date().toISOString(),
      });
=======
      state.swarmRevenueEvents[params.id] = {
        id: params.id,
        tickId: params.tickId,
        agentId: params.agentId,
        lane: params.lane,
        kind: params.kind,
        amountSol: params.amountSol,
        amountUsd: params.amountUsd,
        metadata: params.metadata,
        createdAt: params.createdAt ?? new Date().toISOString(),
      };
      persist();
>>>>>>> origin/kamiyo/kyoshin-exec-canary
    },

    revenueLaneStatsSince: (sinceIso: string): Array<{
      lane: string;
      kind: string;
      events: number;
      amountSol: number;
      amountUsd: number;
    }> => {
<<<<<<< HEAD
      return revenueLaneStatsSince.all(sinceIso) as Array<{
=======
      const groups = new Map<string, {
>>>>>>> origin/kamiyo/kyoshin-exec-canary
        lane: string;
        kind: string;
        events: number;
        amountSol: number;
        amountUsd: number;
<<<<<<< HEAD
      }>;
=======
      }>();

      for (const row of Object.values(state.swarmRevenueEvents)) {
        if (row.createdAt < sinceIso) continue;
        const key = `${row.lane}::${row.kind}`;
        const current =
          groups.get(key) ??
          {
            lane: row.lane,
            kind: row.kind,
            events: 0,
            amountSol: 0,
            amountUsd: 0,
          };

        current.events += 1;
        current.amountSol += row.amountSol;
        current.amountUsd += row.amountUsd ?? 0;
        groups.set(key, current);
      }

      return Array.from(groups.values()).sort((a, b) => {
        const laneCmp = a.lane.localeCompare(b.lane);
        if (laneCmp !== 0) return laneCmp;
        return a.kind.localeCompare(b.kind);
      });
>>>>>>> origin/kamiyo/kyoshin-exec-canary
    },

    tickStatsSince: (sinceIso: string): {
      total: number;
      ok: number;
      error: number;
      running: number;
    } => {
<<<<<<< HEAD
      const row = tickStatsSince.get(sinceIso) as {
        total: number;
        ok: number;
        error: number;
        running: number;
      };
      return {
        total: row.total ?? 0,
        ok: row.ok ?? 0,
        error: row.error ?? 0,
        running: row.running ?? 0,
=======
      const rows = state.ticks.filter(row => row.startedAt >= sinceIso);
      return {
        total: rows.length,
        ok: rows.filter(row => row.status === 'ok').length,
        error: rows.filter(row => row.status === 'error').length,
        running: rows.filter(row => row.status === 'running').length,
>>>>>>> origin/kamiyo/kyoshin-exec-canary
      };
    },

    actionStatsSince: (sinceIso: string, tool?: string): {
      total: number;
      success: number;
      failed: number;
    } => {
<<<<<<< HEAD
      const row = tool
        ? (actionStatsSinceTool.get(sinceIso, tool) as {
            total: number;
            success: number;
            failed: number;
          })
        : (actionStatsSinceAny.get(sinceIso) as {
            total: number;
            success: number;
            failed: number;
          });
      return {
        total: row.total ?? 0,
        success: row.success ?? 0,
        failed: row.failed ?? 0,
=======
      const rows = state.actions.filter(row => row.at >= sinceIso && (!tool || row.tool === tool));
      return {
        total: rows.length,
        success: rows.filter(row => row.error == null).length,
        failed: rows.filter(row => row.error != null).length,
>>>>>>> origin/kamiyo/kyoshin-exec-canary
      };
    },

    ticksSince: (sinceIso: string): Array<{
      id: string;
      startedAt: string;
      finishedAt: string | null;
      status: 'running' | 'ok' | 'error';
      error: string | null;
    }> => {
<<<<<<< HEAD
      return ticksSince.all(sinceIso) as Array<{
        id: string;
        startedAt: string;
        finishedAt: string | null;
        status: 'running' | 'ok' | 'error';
        error: string | null;
      }>;
=======
      return sortByIsoAsc(
        state.ticks.filter(row => row.startedAt >= sinceIso),
        'startedAt'
      );
>>>>>>> origin/kamiyo/kyoshin-exec-canary
    },

    actionsSince: (sinceIso: string, tool?: string): Array<{
      tickId: string;
      at: string;
      tool: string;
      error: string | null;
    }> => {
<<<<<<< HEAD
      if (tool) {
        return actionsSinceTool.all(sinceIso, tool) as Array<{
          tickId: string;
          at: string;
          tool: string;
          error: string | null;
        }>;
      }
      return actionsSinceAny.all(sinceIso) as Array<{
        tickId: string;
        at: string;
        tool: string;
        error: string | null;
      }>;
    },
  };
}

function migrate(db: Database.Database): void {
  const version = Number(db.pragma('user_version', { simple: true }));
  if (version < 1) {
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

  if (version < 2) {
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_ticks_status_finished_at ON ticks(status, finished_at);
      CREATE INDEX IF NOT EXISTS idx_ticks_status_started_at ON ticks(status, started_at);
      CREATE INDEX IF NOT EXISTS idx_observations_tick_at ON observations(tick_id, at);
      CREATE INDEX IF NOT EXISTS idx_actions_tool_at ON actions(tool, at);
      CREATE INDEX IF NOT EXISTS idx_actions_at ON actions(at);
      CREATE INDEX IF NOT EXISTS idx_llm_usage_at ON llm_usage(at);
    `);
    db.pragma('user_version = 2');
  }

  if (version < 3) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS swarm_jobs (
        id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL,
        source TEXT NOT NULL,
        status TEXT NOT NULL,
        url TEXT,
        paid INTEGER NOT NULL,
        payment_network TEXT,
        payment_amount_usd REAL,
        revenue_sol REAL NOT NULL,
        revenue_usd REAL NOT NULL,
        error TEXT,
        metadata_json TEXT NOT NULL,
        executed_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_swarm_jobs_executed_at ON swarm_jobs(executed_at);
      CREATE INDEX IF NOT EXISTS idx_swarm_jobs_agent_executed_at ON swarm_jobs(agent_id, executed_at);
      CREATE INDEX IF NOT EXISTS idx_swarm_jobs_status ON swarm_jobs(status);
    `);
    db.pragma('user_version = 3');
  }

  if (version < 4) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS swarm_revenue_events (
        id TEXT PRIMARY KEY,
        tick_id TEXT NOT NULL,
        agent_id TEXT,
        lane TEXT NOT NULL,
        kind TEXT NOT NULL,
        amount_sol REAL NOT NULL,
        amount_usd REAL,
        metadata_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_swarm_revenue_created_at ON swarm_revenue_events(created_at);
      CREATE INDEX IF NOT EXISTS idx_swarm_revenue_lane_created_at ON swarm_revenue_events(lane, created_at);
      CREATE INDEX IF NOT EXISTS idx_swarm_revenue_agent_created_at ON swarm_revenue_events(agent_id, created_at);
    `);
    db.pragma('user_version = 4');
  }
}
=======
      const rows = state.actions
        .filter(row => row.at >= sinceIso && (!tool || row.tool === tool))
        .map(row => ({
          tickId: row.tickId,
          at: row.at,
          tool: row.tool,
          error: row.error,
        }));

      return sortByIsoAsc(rows, 'at');
    },
  };
}
>>>>>>> origin/kamiyo/kyoshin-exec-canary
