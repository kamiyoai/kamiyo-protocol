import type { OutcomeAssessment } from './outcomes';
import type { AgentRunReceipt, AgentRunReceiptPatch } from './run-ledger';

interface SelfImproveAPI {
  getOrCreateStandingTournament(taskType: string): { id: string };
  recordTournamentEntry(params: {
    tournamentId: string;
    variantId: string;
    performanceEventId?: string | null;
    qualityScore?: number | null;
    cost?: number | null;
    latencyMs?: number | null;
    outcome?: string | null;
  }): { ok: true; totalCost: number } | { ok: false; error: string };
}

export interface ReconciliationPatchInput {
  assessment?: OutcomeAssessment | null;
  snapshot?: Record<string, unknown>;
  reconcileAfter?: number | Date | null;
  delayedRecorded?: boolean;
  note?: string | null;
  reconciled?: boolean;
  now?: number | Date;
}

export function getReceiptString(receipt: AgentRunReceipt, key: string): string | null {
  const value = receipt.receipt[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function getReceiptNumber(receipt: AgentRunReceipt, key: string): number | null {
  const value = receipt.receipt[key];
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function getReceiptFiles(receipt: AgentRunReceipt, key: string): string[] {
  const value = receipt.receipt[key];
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .sort();
}

export function hoursFromNow(hours: number, now: number | Date = Date.now()): number {
  const baseMs = typeof now === 'number' ? now : now.getTime();
  return Math.floor(baseMs / 1000) + Math.max(1, Math.floor(hours)) * 60 * 60;
}

export function createReconciliationPatch(
  receipt: AgentRunReceipt,
  input: ReconciliationPatchInput
): AgentRunReceiptPatch {
  const nowSeconds = toEpochSeconds(input.now ?? Date.now());
  const initialOutcome = getReceiptString(receipt, 'initialOutcome') ?? receipt.outcome ?? null;
  const initialQuality =
    getReceiptNumber(receipt, 'initialQualityScore') ?? receipt.qualityScore ?? null;
  const reconciledNow = input.reconciled ?? Boolean(input.assessment);

  return {
    outcome: input.assessment?.metric.outcome ?? receipt.outcome,
    qualityScore: input.assessment?.qualityScore ?? receipt.qualityScore,
    reconcileAfter:
      input.reconcileAfter !== undefined ? input.reconcileAfter : receipt.reconcileAfter,
    reconciledAt: reconciledNow ? nowSeconds : null,
    receipt: {
      model: getReceiptString(receipt, 'model') ?? null,
      initialOutcome,
      initialQualityScore: initialQuality,
      delayedOutcome: input.assessment?.metric.outcome ?? null,
      delayedQualityScore: input.assessment?.qualityScore ?? null,
      delayedMetric: input.assessment?.metric ?? null,
      delayedTournamentRecorded: input.delayedRecorded ?? false,
      reconciliationNote: input.note ?? null,
      reconciledAtIso: reconciledNow ? new Date(nowSeconds * 1000).toISOString() : null,
      ...(input.snapshot ?? {}),
    },
  };
}

export function recordDelayedVariantScore(
  taskType: string,
  variantId: string | null,
  assessment: OutcomeAssessment
): boolean {
  if (!variantId) return false;
  const api = loadSelfImprove();
  if (!api) return false;

  try {
    const tournament = api.getOrCreateStandingTournament(taskType);
    const result = api.recordTournamentEntry({
      tournamentId: tournament.id,
      variantId,
      qualityScore: assessment.qualityScore,
      cost: assessment.metric.cost_usd,
      latencyMs: assessment.metric.duration_ms,
      outcome: assessment.metric.outcome,
    });
    return result.ok;
  } catch {
    return false;
  }
}

function toEpochSeconds(value: number | Date): number {
  const ms = typeof value === 'number' ? value : value.getTime();
  return Math.floor(ms / 1000);
}

function loadSelfImprove(): SelfImproveAPI | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
    return require('@kamiyo-org/selfimprove') as SelfImproveAPI;
  } catch {
    return null;
  }
}
