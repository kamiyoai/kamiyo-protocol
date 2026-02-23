import fs from 'node:fs';
import path from 'node:path';

type RetentionCutoffs = {
  ticksBeforeIso: string;
  observationsBeforeIso: string;
  actionsBeforeIso: string;
  usageBeforeIso: string;
};

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

type DbState = {
  version: number;
  ticks: TickRow[];
  observations: ObservationRow[];
  actions: ActionRow[];
  llmUsage: UsageRow[];
  kv: Record<string, string>;
  swarmJobs: Record<string, SwarmJobRow>;
  swarmRevenueEvents: Record<string, RevenueEventRow>;
};

const CURRENT_VERSION = 1;

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
  };
}

function asNumber(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
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

      const after = {
        observations: state.observations.length,
        actions: state.actions.length,
        usage: state.llmUsage.length,
        ticks: state.ticks.length,
        swarmJobs: Object.keys(state.swarmJobs).length,
        revenueEvents: Object.keys(state.swarmRevenueEvents).length,
      };

      const result = {
        observationsDeleted: before.observations - after.observations,
        actionsDeleted: before.actions - after.actions,
        usageDeleted: before.usage - after.usage,
        ticksDeleted: before.ticks - after.ticks,
        swarmJobsDeleted: before.swarmJobs - after.swarmJobs,
        revenueEventsDeleted: before.revenueEvents - after.revenueEvents,
      };

      if (
        result.observationsDeleted +
          result.actionsDeleted +
          result.usageDeleted +
          result.ticksDeleted +
          result.swarmJobsDeleted +
          result.revenueEventsDeleted >
        0
      ) {
        persist();
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
      const groups = new Map<string, {
        agentId: string;
        total: number;
        succeeded: number;
        failed: number;
        paidCount: number;
        revenueSol: number;
        revenueUsd: number;
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
    },

    swarmSourceStatsSince: (sinceIso: string): Array<{
      source: string;
      total: number;
      succeeded: number;
      failed: number;
      revenueSol: number;
      revenueUsd: number;
    }> => {
      const groups = new Map<string, {
        source: string;
        total: number;
        succeeded: number;
        failed: number;
        revenueSol: number;
        revenueUsd: number;
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
    },

    revenueLaneStatsSince: (sinceIso: string): Array<{
      lane: string;
      kind: string;
      events: number;
      amountSol: number;
      amountUsd: number;
    }> => {
      const groups = new Map<string, {
        lane: string;
        kind: string;
        events: number;
        amountSol: number;
        amountUsd: number;
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
    },

    tickStatsSince: (sinceIso: string): {
      total: number;
      ok: number;
      error: number;
      running: number;
    } => {
      const rows = state.ticks.filter(row => row.startedAt >= sinceIso);
      return {
        total: rows.length,
        ok: rows.filter(row => row.status === 'ok').length,
        error: rows.filter(row => row.status === 'error').length,
        running: rows.filter(row => row.status === 'running').length,
      };
    },

    actionStatsSince: (sinceIso: string, tool?: string): {
      total: number;
      success: number;
      failed: number;
    } => {
      const rows = state.actions.filter(row => row.at >= sinceIso && (!tool || row.tool === tool));
      return {
        total: rows.length,
        success: rows.filter(row => row.error == null).length,
        failed: rows.filter(row => row.error != null).length,
      };
    },

    ticksSince: (sinceIso: string): Array<{
      id: string;
      startedAt: string;
      finishedAt: string | null;
      status: 'running' | 'ok' | 'error';
      error: string | null;
    }> => {
      return sortByIsoAsc(
        state.ticks.filter(row => row.startedAt >= sinceIso),
        'startedAt'
      );
    },

    actionsSince: (sinceIso: string, tool?: string): Array<{
      tickId: string;
      at: string;
      tool: string;
      error: string | null;
    }> => {
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
