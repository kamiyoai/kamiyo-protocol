/**
 * Tick Checkpoint/Resume
 *
 * Enables exact-phase resumption if Kamiyo Agent crashes mid-tick.
 * Checkpoint state is stored in the kv store (JSON-file DB).
 *
 * @module checkpoint
 */

export type TickPhase =
  | 'policy_refresh'
  | 'opportunity_collection'
  | 'mission_planning'
  | 'execution'
  | 'settlement'
  | 'housekeeping';

export const TICK_PHASES: readonly TickPhase[] = [
  'policy_refresh',
  'opportunity_collection',
  'mission_planning',
  'execution',
  'settlement',
  'housekeeping',
] as const;

export type TickCheckpointState = {
  tickId: string;
  startedAt: string;
  completedPhases: TickPhase[];
  phaseOutputs: Partial<Record<TickPhase, unknown>>;
  lastCheckpointAt: string;
};

const KV_KEY = 'tick_checkpoint';

type KvStore = {
  kvGet(key: string): string | undefined;
  kvSet(key: string, value: string): void;
};

export function saveCheckpoint(kv: KvStore, state: TickCheckpointState): void {
  kv.kvSet(KV_KEY, JSON.stringify(state));
}

export function loadCheckpoint(kv: KvStore): TickCheckpointState | null {
  const raw = kv.kvGet(KV_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    if (typeof parsed.tickId !== 'string' || !parsed.tickId) return null;
    if (typeof parsed.startedAt !== 'string') return null;
    if (!Array.isArray(parsed.completedPhases)) return null;

    const validPhases = new Set<string>(TICK_PHASES);
    const completedPhases = (parsed.completedPhases as unknown[]).filter(
      (p): p is TickPhase => typeof p === 'string' && validPhases.has(p)
    );

    return {
      tickId: parsed.tickId,
      startedAt: parsed.startedAt,
      completedPhases,
      phaseOutputs:
        parsed.phaseOutputs && typeof parsed.phaseOutputs === 'object' ? parsed.phaseOutputs : {},
      lastCheckpointAt:
        typeof parsed.lastCheckpointAt === 'string' ? parsed.lastCheckpointAt : parsed.startedAt,
    };
  } catch {
    return null;
  }
}

export function clearCheckpoint(kv: KvStore, tickId: string): void {
  const current = loadCheckpoint(kv);
  if (current && current.tickId === tickId) {
    kv.kvSet(KV_KEY, '');
  }
}

export function shouldResume(checkpoint: TickCheckpointState, maxStaleMs: number): boolean {
  const elapsed = Date.now() - Date.parse(checkpoint.lastCheckpointAt);
  if (!Number.isFinite(elapsed)) return false;
  return elapsed < maxStaleMs && checkpoint.completedPhases.length > 0;
}

export function isPhaseCompleted(
  checkpoint: TickCheckpointState | null,
  phase: TickPhase
): boolean {
  if (!checkpoint) return false;
  return checkpoint.completedPhases.includes(phase);
}

export function markPhaseCompleted(
  checkpoint: TickCheckpointState,
  phase: TickPhase,
  output?: unknown
): TickCheckpointState {
  const completedPhases = checkpoint.completedPhases.includes(phase)
    ? checkpoint.completedPhases
    : [...checkpoint.completedPhases, phase];

  const phaseOutputs = { ...checkpoint.phaseOutputs };
  if (output !== undefined) {
    phaseOutputs[phase] = output;
  }

  return {
    ...checkpoint,
    completedPhases,
    phaseOutputs,
    lastCheckpointAt: new Date().toISOString(),
  };
}

export function createCheckpoint(tickId: string, nowIso: string): TickCheckpointState {
  return {
    tickId,
    startedAt: nowIso,
    completedPhases: [],
    phaseOutputs: {},
    lastCheckpointAt: nowIso,
  };
}
