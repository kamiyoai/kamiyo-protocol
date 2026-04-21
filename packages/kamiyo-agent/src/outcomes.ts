export const DEFAULT_OUTCOME_METRIC_PREFIX = 'agent-outcome-metric';

const STATUS_BASE_SCORE = {
  success: 0.45,
  partial: 0.25,
  neutral: 0.2,
  failure: 0.05,
} as const;

const STATUS_SCORE_CAP = {
  success: 1,
  partial: 0.85,
  neutral: 0.75,
  failure: 0.45,
} as const;

export type OutcomeStatus = keyof typeof STATUS_BASE_SCORE;

export interface OutcomeSignal {
  name: string;
  value: boolean | number;
  weight?: number;
}

export interface OutcomeMetric {
  ts: string;
  service: string;
  task_type: string;
  status: OutcomeStatus;
  outcome: string;
  quality_score: number;
  status_score: number;
  signal_score: number;
  model: string;
  duration_ms: number;
  cost_usd: number;
  turn_count: number;
  tool_uses: number;
  variant_id: string | null;
  variant_strategy: string | null;
  signals: Record<string, number>;
  metadata: Record<string, unknown>;
}

export interface OutcomeAssessment {
  qualityScore: number;
  statusScore: number;
  signalScore: number;
  normalizedSignals: Record<string, number>;
  metric: OutcomeMetric;
}

export interface AssessOutcomeInput {
  service: string;
  taskType: string;
  status: OutcomeStatus;
  outcome: string;
  model: string;
  durationMs: number;
  signals: OutcomeSignal[];
  costUsd?: number;
  turnCount?: number;
  toolUses?: number;
  variantId?: string | null;
  variantStrategy?: string | null;
  metadata?: Record<string, unknown>;
}

export function parseTaggedFields(text: string): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^([A-Z][A-Z0-9_]+):\s*(.*)$/);
    if (!match) continue;
    fields[match[1]] = match[2].trim();
  }
  return fields;
}

export function assessAgentOutcome(input: AssessOutcomeInput): OutcomeAssessment {
  const normalizedSignals: Record<string, number> = {};
  let totalWeight = 0;
  let weightedScore = 0;

  for (const signal of input.signals) {
    const normalized = normalizeSignalValue(signal.value);
    normalizedSignals[signal.name] = roundMetricValue(normalized);
    const weight = normalizeWeight(signal.weight);
    totalWeight += weight;
    weightedScore += normalized * weight;
  }

  const signalScore = totalWeight > 0 ? weightedScore / totalWeight : 0;
  const statusScore = STATUS_BASE_SCORE[input.status];
  const cappedScore = Math.min(
    STATUS_SCORE_CAP[input.status],
    statusScore + signalScore * (1 - statusScore)
  );
  const qualityScore = roundMetricValue(clamp(cappedScore, 0, 1));

  return {
    qualityScore,
    statusScore: roundMetricValue(statusScore),
    signalScore: roundMetricValue(signalScore),
    normalizedSignals,
    metric: {
      ts: new Date().toISOString(),
      service: input.service,
      task_type: input.taskType,
      status: input.status,
      outcome: input.outcome,
      quality_score: qualityScore,
      status_score: roundMetricValue(statusScore),
      signal_score: roundMetricValue(signalScore),
      model: input.model,
      duration_ms: Math.max(0, Math.trunc(input.durationMs)),
      cost_usd: roundMetricValue(input.costUsd ?? 0),
      turn_count: Math.max(0, Math.trunc(input.turnCount ?? 0)),
      tool_uses: Math.max(0, Math.trunc(input.toolUses ?? 0)),
      variant_id: input.variantId ?? null,
      variant_strategy: input.variantStrategy ?? null,
      signals: normalizedSignals,
      metadata: input.metadata ?? {},
    },
  };
}

export function emitOutcomeMetric(metric: OutcomeMetric, prefix = DEFAULT_OUTCOME_METRIC_PREFIX): void {
  console.log(`[${prefix}] ${JSON.stringify(metric)}`);
}

function normalizeSignalValue(value: boolean | number): number {
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (!Number.isFinite(value)) return 0;
  return clamp(value, 0, 1);
}

function normalizeWeight(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return 1;
  }
  return value;
}

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function roundMetricValue(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}
