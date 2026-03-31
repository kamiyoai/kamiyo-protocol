import type { SwarmRegistry } from './types.js';

export type SwarmAgentRuntimeMetrics = {
  agentId: string;
  basePriority: number;
  jobRevenueSol: number;
  jobExecuted: boolean;
  jobSucceeded: boolean;
  routeExecuted: boolean;
  claimExecuted: boolean;
  hadError: boolean;
};

export type SwarmPriorityStreak = {
  high: number;
  low: number;
};

export type SwarmPriorityState = {
  overrides: Record<string, number>;
  streaks: Record<string, SwarmPriorityStreak>;
  updatedAt: string;
};

export type SwarmPerformanceAgentScore = {
  agentId: string;
  score: number;
  revenueScore: number;
  reliabilityScore: number;
  routingScore: number;
  recommendation: 'hold' | 'boost' | 'scale' | 'throttle' | 'pause_candidate';
  previousPriority: number;
  nextPriority: number;
  streaks: SwarmPriorityStreak;
};

export type SwarmPerformanceEvaluation = {
  aggregate: {
    agentCount: number;
    totalJobRevenueSol: number;
    averageScore: number;
  };
  agents: SwarmPerformanceAgentScore[];
  state: SwarmPriorityState;
};

const MIN_PRIORITY = 1;
const MAX_PRIORITY = 500;
const REVENUE_TARGET_SOL = 0.2;

function clampPriority(value: number): number {
  if (!Number.isFinite(value)) return MIN_PRIORITY;
  return Math.max(MIN_PRIORITY, Math.min(MAX_PRIORITY, Math.round(value)));
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function asFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return null;
}

function parseStreak(value: unknown): SwarmPriorityStreak | null {
  const record = asRecord(value);
  if (!record) return null;

  const high = asFiniteNumber(record.high);
  const low = asFiniteNumber(record.low);
  if (high == null || low == null) return null;

  return {
    high: Math.max(0, Math.floor(high)),
    low: Math.max(0, Math.floor(low)),
  };
}

export function parsePriorityState(raw: string | undefined): SwarmPriorityState {
  if (!raw) {
    return {
      overrides: {},
      streaks: {},
      updatedAt: new Date(0).toISOString(),
    };
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    const root = asRecord(parsed);
    if (!root) throw new Error('priority state must be an object');

    const overridesRaw = asRecord(root.overrides) ?? {};
    const streaksRaw = asRecord(root.streaks) ?? {};

    const overrides: Record<string, number> = {};
    for (const [agentId, value] of Object.entries(overridesRaw)) {
      const numberValue = asFiniteNumber(value);
      if (numberValue == null) continue;
      overrides[agentId] = clampPriority(numberValue);
    }

    const streaks: Record<string, SwarmPriorityStreak> = {};
    for (const [agentId, value] of Object.entries(streaksRaw)) {
      const streak = parseStreak(value);
      if (!streak) continue;
      streaks[agentId] = streak;
    }

    const updatedAt = typeof root.updatedAt === 'string' ? root.updatedAt : new Date(0).toISOString();

    return { overrides, streaks, updatedAt };
  } catch {
    return {
      overrides: {},
      streaks: {},
      updatedAt: new Date(0).toISOString(),
    };
  }
}

function applyPriorityDelta(current: number, base: number, recommendation: SwarmPerformanceAgentScore['recommendation']): number {
  if (recommendation === 'scale') return clampPriority(current + 12);
  if (recommendation === 'boost') return clampPriority(current + 5);
  if (recommendation === 'throttle') return clampPriority(current - 10);
  if (recommendation === 'pause_candidate') return clampPriority(current - 25);

  if (current === base) return current;
  const direction = current < base ? 1 : -1;
  return clampPriority(current + direction * Math.min(3, Math.abs(base - current)));
}

function recommendationForScore(score: number, streak: SwarmPriorityStreak): SwarmPerformanceAgentScore['recommendation'] {
  if (streak.low >= 3) return 'pause_candidate';
  if (score <= 0.45) return 'throttle';
  if (streak.high >= 2) return 'scale';
  if (score >= 0.7) return 'boost';
  return 'hold';
}

export function evaluateSwarmPerformance(params: {
  registry: SwarmRegistry;
  metrics: SwarmAgentRuntimeMetrics[];
  previousState: SwarmPriorityState;
}): SwarmPerformanceEvaluation {
  const state: SwarmPriorityState = {
    overrides: { ...params.previousState.overrides },
    streaks: { ...params.previousState.streaks },
    updatedAt: new Date().toISOString(),
  };

  const scores: SwarmPerformanceAgentScore[] = [];
  let totalScore = 0;
  let totalJobRevenueSol = 0;

  for (const metric of params.metrics) {
    const revenueScore = Math.min(1, metric.jobRevenueSol / REVENUE_TARGET_SOL);
    const reliabilityScore = metric.hadError ? 0.2 : metric.jobExecuted ? (metric.jobSucceeded ? 1 : 0.4) : 0.7;
    const routingScore = metric.routeExecuted ? 1 : metric.claimExecuted ? 0.55 : 0.3;
    const score = revenueScore * 0.5 + reliabilityScore * 0.3 + routingScore * 0.2;

    const previousStreak = state.streaks[metric.agentId] ?? { high: 0, low: 0 };
    const nextStreak: SwarmPriorityStreak = {
      high: score >= 0.82 ? previousStreak.high + 1 : 0,
      low: score <= 0.35 ? previousStreak.low + 1 : 0,
    };
    state.streaks[metric.agentId] = nextStreak;

    const recommendation = recommendationForScore(score, nextStreak);
    const currentPriority = state.overrides[metric.agentId] ?? metric.basePriority;
    const nextPriority = applyPriorityDelta(currentPriority, metric.basePriority, recommendation);
    state.overrides[metric.agentId] = nextPriority;

    totalScore += score;
    totalJobRevenueSol += metric.jobRevenueSol;

    scores.push({
      agentId: metric.agentId,
      score,
      revenueScore,
      reliabilityScore,
      routingScore,
      recommendation,
      previousPriority: currentPriority,
      nextPriority,
      streaks: nextStreak,
    });
  }

  const activeAgentIds = new Set(params.registry.agents.filter(agent => agent.status === 'active').map(agent => agent.id));
  for (const agentId of Object.keys(state.overrides)) {
    if (!activeAgentIds.has(agentId)) {
      delete state.overrides[agentId];
      delete state.streaks[agentId];
    }
  }

  scores.sort((a, b) => b.score - a.score);

  return {
    aggregate: {
      agentCount: scores.length,
      totalJobRevenueSol,
      averageScore: scores.length > 0 ? totalScore / scores.length : 0,
    },
    agents: scores,
    state,
  };
}
