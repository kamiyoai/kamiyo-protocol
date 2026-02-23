import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

type RetentionCutoffs = {
  ticksBeforeIso: string;
  observationsBeforeIso: string;
  actionsBeforeIso: string;
  usageBeforeIso: string;
};

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
      const rows = swarmJobStatsSince.all(sinceIso) as Array<{
        agentId: string;
        total: number;
        succeeded: number;
        failed: number;
        paidCount: number;
        revenueSol: number;
        revenueUsd: number;
      }>;
      return rows;
    },

    swarmSourceStatsSince: (sinceIso: string): Array<{
      source: string;
      total: number;
      succeeded: number;
      failed: number;
      revenueSol: number;
      revenueUsd: number;
    }> => {
      return swarmSourceStatsSince.all(sinceIso) as Array<{
        source: string;
        total: number;
        succeeded: number;
        failed: number;
        revenueSol: number;
        revenueUsd: number;
      }>;
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
    },

    revenueLaneStatsSince: (sinceIso: string): Array<{
      lane: string;
      kind: string;
      events: number;
      amountSol: number;
      amountUsd: number;
    }> => {
      return revenueLaneStatsSince.all(sinceIso) as Array<{
        lane: string;
        kind: string;
        events: number;
        amountSol: number;
        amountUsd: number;
      }>;
    },

    tickStatsSince: (sinceIso: string): {
      total: number;
      ok: number;
      error: number;
      running: number;
    } => {
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
      };
    },

    actionStatsSince: (sinceIso: string, tool?: string): {
      total: number;
      success: number;
      failed: number;
    } => {
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
      };
    },

    ticksSince: (sinceIso: string): Array<{
      id: string;
      startedAt: string;
      finishedAt: string | null;
      status: 'running' | 'ok' | 'error';
      error: string | null;
    }> => {
      return ticksSince.all(sinceIso) as Array<{
        id: string;
        startedAt: string;
        finishedAt: string | null;
        status: 'running' | 'ok' | 'error';
        error: string | null;
      }>;
    },

    actionsSince: (sinceIso: string, tool?: string): Array<{
      tickId: string;
      at: string;
      tool: string;
      error: string | null;
    }> => {
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
