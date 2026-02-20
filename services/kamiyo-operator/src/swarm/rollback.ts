export type RollbackSource = 'x402' | 'relevance' | 'agent_ai' | 'kore' | 'direct' | 'internal';

export type RollbackSourceState = {
  source: RollbackSource;
  disabledUntil: string;
  reason: string;
  weeklyNetSol: number;
  sourceRevenueSol: number;
  sourceSampleCount: number;
  updatedAt: string;
};

export type RollbackState = {
  updatedAt: string;
  lastEvaluatedAt?: string;
  lastTriggeredAt?: string;
  lastWeeklyNetSol?: number;
  sources: Partial<Record<RollbackSource, RollbackSourceState>>;
};

export type RollbackEvaluationResult = {
  state: RollbackState;
  triggered: boolean;
  disabledSources: RollbackSource[];
  reason?: string;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function asString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function asIso(value: unknown): string | null {
  const stringValue = asString(value);
  if (!stringValue) return null;
  return Number.isFinite(Date.parse(stringValue)) ? stringValue : null;
}

function asRollbackSource(value: unknown): RollbackSource | null {
  if (
    value !== 'x402' &&
    value !== 'relevance' &&
    value !== 'agent_ai' &&
    value !== 'kore' &&
    value !== 'direct' &&
    value !== 'internal'
  ) {
    return null;
  }
  return value;
}

function plusHoursIso(nowIso: string, hours: number): string {
  const nowMs = Date.parse(nowIso);
  const durationMs = Math.max(1, hours) * 3_600_000;
  return new Date(nowMs + durationMs).toISOString();
}

export function parseRollbackState(raw: string | undefined): RollbackState {
  if (!raw) {
    return {
      updatedAt: new Date(0).toISOString(),
      sources: {},
    };
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    const root = asRecord(parsed);
    if (!root) throw new Error('invalid rollback state');

    const updatedAt = asIso(root.updatedAt) ?? new Date(0).toISOString();
    const lastEvaluatedAt = asIso(root.lastEvaluatedAt) ?? undefined;
    const lastTriggeredAt = asIso(root.lastTriggeredAt) ?? undefined;
    const lastWeeklyNetSol = asNumber(root.lastWeeklyNetSol) ?? undefined;
    const sourcesRaw = asRecord(root.sources) ?? {};
    const sources: Partial<Record<RollbackSource, RollbackSourceState>> = {};

    for (const value of Object.values(sourcesRaw)) {
      const record = asRecord(value);
      if (!record) continue;
      const source = asRollbackSource(record.source);
      const disabledUntil = asIso(record.disabledUntil);
      const reason = asString(record.reason);
      if (!source || !disabledUntil || !reason) continue;

      sources[source] = {
        source,
        disabledUntil,
        reason,
        weeklyNetSol: asNumber(record.weeklyNetSol) ?? 0,
        sourceRevenueSol: asNumber(record.sourceRevenueSol) ?? 0,
        sourceSampleCount: Math.max(0, Math.floor(asNumber(record.sourceSampleCount) ?? 0)),
        updatedAt: asIso(record.updatedAt) ?? updatedAt,
      };
    }

    return {
      updatedAt,
      lastEvaluatedAt,
      lastTriggeredAt,
      lastWeeklyNetSol,
      sources,
    };
  } catch {
    return {
      updatedAt: new Date(0).toISOString(),
      sources: {},
    };
  }
}

export function pruneRollbackState(params: {
  state: RollbackState;
  nowIso?: string;
}): RollbackState {
  const nowIso = params.nowIso ?? new Date().toISOString();
  const nowMs = Date.parse(nowIso);
  const nextSources: Partial<Record<RollbackSource, RollbackSourceState>> = {};

  for (const [source, value] of Object.entries(params.state.sources)) {
    const entry = value as RollbackSourceState | undefined;
    if (!entry) continue;
    const disabledUntilMs = Date.parse(entry.disabledUntil);
    if (!Number.isFinite(disabledUntilMs) || disabledUntilMs <= nowMs) continue;
    nextSources[source as RollbackSource] = entry;
  }

  return {
    ...params.state,
    updatedAt: nowIso,
    sources: nextSources,
  };
}

export function isRollbackSourceDisabled(params: {
  state: RollbackState;
  source: string;
  nowIso?: string;
}): {
  disabled: boolean;
  disabledUntil?: string;
  reason?: string;
} {
  const source = asRollbackSource(params.source);
  if (!source) return { disabled: false };
  const nowMs = Date.parse(params.nowIso ?? new Date().toISOString());
  const entry = params.state.sources[source];
  if (!entry) return { disabled: false };

  const disabledUntilMs = Date.parse(entry.disabledUntil);
  if (!Number.isFinite(disabledUntilMs) || disabledUntilMs <= nowMs) return { disabled: false };
  return {
    disabled: true,
    disabledUntil: entry.disabledUntil,
    reason: entry.reason,
  };
}

export function evaluateRollbackPolicy(params: {
  state: RollbackState;
  nowIso: string;
  weeklyNetSol: number;
  weeklySourceStats: Array<{
    source: string;
    total: number;
    revenueSol: number;
  }>;
  minJobs: number;
  sourceMinJobs: number;
  netSolTrigger: number;
  maxDisabledSources: number;
  cooldownHours: number;
  recoveryNetSol: number;
}): RollbackEvaluationResult {
  const pruned = pruneRollbackState({
    state: params.state,
    nowIso: params.nowIso,
  });
  const totalJobs = params.weeklySourceStats.reduce((sum, row) => sum + row.total, 0);
  const nextState: RollbackState = {
    ...pruned,
    updatedAt: params.nowIso,
    lastEvaluatedAt: params.nowIso,
    lastWeeklyNetSol: params.weeklyNetSol,
  };

  if (totalJobs < Math.max(1, params.minJobs)) {
    return {
      state: nextState,
      triggered: false,
      disabledSources: [],
      reason: 'insufficient_samples',
    };
  }

  if (params.weeklyNetSol >= params.recoveryNetSol) {
    return {
      state: {
        ...nextState,
        sources: {},
      },
      triggered: false,
      disabledSources: [],
      reason: 'recovered',
    };
  }

  if (params.weeklyNetSol > params.netSolTrigger) {
    return {
      state: nextState,
      triggered: false,
      disabledSources: [],
      reason: 'above_trigger',
    };
  }

  const sourceMinJobs = Math.max(1, params.sourceMinJobs);
  const maxDisabled = Math.max(1, params.maxDisabledSources);
  const candidates = params.weeklySourceStats
    .flatMap(row => {
      const source = asRollbackSource(row.source);
      if (!source || row.total < sourceMinJobs) return [];
      return [
        {
          source,
          total: row.total,
          revenueSol: row.revenueSol,
        },
      ];
    })
    .sort((a, b) => {
      if (a.revenueSol !== b.revenueSol) return a.revenueSol - b.revenueSol;
      return b.total - a.total;
    });

  const losers = candidates.filter(candidate => candidate.revenueSol < 0);
  const selected = (losers.length > 0 ? losers : candidates).slice(0, maxDisabled);

  if (selected.length === 0) {
    return {
      state: nextState,
      triggered: false,
      disabledSources: [],
      reason: 'no_source_candidates',
    };
  }

  const sources = { ...nextState.sources };
  for (const candidate of selected) {
    sources[candidate.source] = {
      source: candidate.source,
      disabledUntil: plusHoursIso(params.nowIso, params.cooldownHours),
      reason: 'weekly_negative_net_sol',
      weeklyNetSol: params.weeklyNetSol,
      sourceRevenueSol: candidate.revenueSol,
      sourceSampleCount: candidate.total,
      updatedAt: params.nowIso,
    };
  }

  return {
    state: {
      ...nextState,
      lastTriggeredAt: params.nowIso,
      sources,
    },
    triggered: true,
    disabledSources: selected.map(candidate => candidate.source),
  };
}
