type MarginCircuitEntry = {
  agentId: string;
  source: string;
  negativeMarginStreak: number;
  openUntil?: string;
  lastMarginSol?: number;
  lastError?: string;
  updatedAt: string;
};

export type MarginCircuitState = {
  updatedAt: string;
  entries: Record<string, MarginCircuitEntry>;
};

export type MarginCircuitEvent = {
  type: 'opened' | 'closed';
  key: string;
  agentId: string;
  source: string;
  marginSol: number;
  openUntil?: string;
  reason: string;
  at: string;
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
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return null;
}

function asIso(value: unknown): string | null {
  const s = asString(value);
  if (!s) return null;
  return Number.isFinite(Date.parse(s)) ? s : null;
}

function keyFor(agentId: string, source: string): string {
  return `${agentId}:${source}`.toLowerCase();
}

export function parseMarginCircuitState(raw: string | undefined): MarginCircuitState {
  if (!raw) {
    return {
      updatedAt: new Date(0).toISOString(),
      entries: {},
    };
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    const root = asRecord(parsed);
    if (!root) throw new Error('invalid margin circuit state');

    const updatedAt = asIso(root.updatedAt) ?? new Date(0).toISOString();
    const entriesRaw = asRecord(root.entries) ?? {};
    const entries: Record<string, MarginCircuitEntry> = {};

    for (const [key, value] of Object.entries(entriesRaw)) {
      const record = asRecord(value);
      if (!record) continue;
      const agentId = asString(record.agentId);
      const source = asString(record.source);
      if (!agentId || !source) continue;
      const negativeMarginStreak = Math.max(0, Math.floor(asNumber(record.negativeMarginStreak) ?? 0));
      const openUntil = asIso(record.openUntil) ?? undefined;
      const lastMarginSol = asNumber(record.lastMarginSol) ?? undefined;
      const lastError = asString(record.lastError) ?? undefined;
      const rowUpdatedAt = asIso(record.updatedAt) ?? updatedAt;
      entries[key] = {
        agentId,
        source,
        negativeMarginStreak,
        openUntil,
        lastMarginSol,
        lastError,
        updatedAt: rowUpdatedAt,
      };
    }

    return { updatedAt, entries };
  } catch {
    return {
      updatedAt: new Date(0).toISOString(),
      entries: {},
    };
  }
}

export function isMarginCircuitOpen(params: {
  state: MarginCircuitState;
  agentId: string;
  source: string;
  nowIso?: string;
}): {
  open: boolean;
  openUntil?: string;
} {
  const key = keyFor(params.agentId, params.source);
  const entry = params.state.entries[key];
  if (!entry?.openUntil) return { open: false };

  const nowMs = Date.parse(params.nowIso ?? new Date().toISOString());
  const openUntilMs = Date.parse(entry.openUntil);
  if (!Number.isFinite(nowMs) || !Number.isFinite(openUntilMs)) return { open: false };

  return openUntilMs > nowMs
    ? { open: true, openUntil: entry.openUntil }
    : { open: false };
}

export function updateMarginCircuit(params: {
  state: MarginCircuitState;
  agentId: string;
  source: string;
  marginSol: number;
  failed: boolean;
  error?: string;
  negativeMarginThreshold: number;
  cooldownMinutes: number;
  nowIso?: string;
}): {
  state: MarginCircuitState;
  event?: MarginCircuitEvent;
  key: string;
  entry: MarginCircuitEntry;
} {
  const nowIso = params.nowIso ?? new Date().toISOString();
  const key = keyFor(params.agentId, params.source);
  const previous = params.state.entries[key] ?? {
    agentId: params.agentId,
    source: params.source,
    negativeMarginStreak: 0,
    updatedAt: nowIso,
  };

  const wasOpen = isMarginCircuitOpen({
    state: params.state,
    agentId: params.agentId,
    source: params.source,
    nowIso,
  }).open;

  const next: MarginCircuitEntry = {
    ...previous,
    agentId: params.agentId,
    source: params.source,
    lastMarginSol: params.marginSol,
    lastError: params.error,
    updatedAt: nowIso,
  };

  if (params.failed || params.marginSol < 0) {
    next.negativeMarginStreak = previous.negativeMarginStreak + 1;
  } else {
    next.negativeMarginStreak = 0;
  }

  let event: MarginCircuitEvent | undefined;
  if (next.negativeMarginStreak >= Math.max(1, params.negativeMarginThreshold)) {
    const cooldownMs = Math.max(1, params.cooldownMinutes) * 60_000;
    next.openUntil = new Date(Date.parse(nowIso) + cooldownMs).toISOString();
    next.negativeMarginStreak = 0;
    event = {
      type: 'opened',
      key,
      agentId: params.agentId,
      source: params.source,
      marginSol: params.marginSol,
      openUntil: next.openUntil,
      reason: params.failed ? 'job_failed' : 'negative_margin_streak',
      at: nowIso,
    };
  } else if (wasOpen && params.marginSol >= 0 && !params.failed) {
    next.openUntil = undefined;
    event = {
      type: 'closed',
      key,
      agentId: params.agentId,
      source: params.source,
      marginSol: params.marginSol,
      reason: 'positive_margin_recovered',
      at: nowIso,
    };
  }

  const entries = { ...params.state.entries, [key]: next };
  return {
    state: {
      updatedAt: nowIso,
      entries,
    },
    event,
    key,
    entry: next,
  };
}

export function pruneMarginCircuitState(params: {
  state: MarginCircuitState;
  keepDays: number;
  nowIso?: string;
}): MarginCircuitState {
  const nowMs = Date.parse(params.nowIso ?? new Date().toISOString());
  const keepMs = Math.max(1, params.keepDays) * 86_400_000;
  const nextEntries: Record<string, MarginCircuitEntry> = {};

  for (const [key, entry] of Object.entries(params.state.entries)) {
    const updatedAtMs = Date.parse(entry.updatedAt);
    if (!Number.isFinite(updatedAtMs)) continue;
    if (nowMs - updatedAtMs > keepMs) continue;
    nextEntries[key] = entry;
  }

  return {
    updatedAt: params.nowIso ?? new Date().toISOString(),
    entries: nextEntries,
  };
}
