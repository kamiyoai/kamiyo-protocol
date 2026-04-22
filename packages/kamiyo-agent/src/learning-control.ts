interface SelfImproveLeaderboardEntry {
  variantId: string;
  status: 'active' | 'archived' | 'promoted';
  sampleCount: number;
  mean: number;
  createdAt: number;
  promotedAt: number | null;
}

interface SelfImproveCanaryRollout {
  id: string;
  taskType: string;
  canaryVariantId: string;
  baselineVariantId: string;
  trafficPct: number;
  status: 'active' | 'promoted' | 'rolled_back';
  minSamples: number;
  rollbackThreshold: number;
  startedAt: number;
  decidedAt: number | null;
  decision: string | null;
  decisionEventId: string | null;
}

interface SelfImproveCanaryStepResult {
  action: 'held' | 'ramped' | 'promoted' | 'rolled_back';
  from?: number;
  to?: number;
  rolloutId?: string;
  promotedVariantId?: string;
  archivedVariantId?: string;
  eventId?: string;
  decision: Record<string, unknown>;
}

interface SelfImproveAPI {
  getActiveCanary(taskType: string): SelfImproveCanaryRollout | null;
  getLeaderboard(taskType: string, limit?: number): SelfImproveLeaderboardEntry[];
  startCanary(input: {
    taskType: string;
    canaryVariantId: string;
    baselineVariantId?: string;
    trafficPct?: number;
    minSamples?: number;
    rollbackThreshold?: number;
  }): SelfImproveCanaryRollout;
  stepCanary(input: {
    taskType: string;
    pThreshold?: number;
    rampSteps?: number[];
  }): SelfImproveCanaryStepResult;
}

export interface DelayedLearningControlOptions {
  taskType: string;
  minSamples?: number;
  pThreshold?: number;
  trafficPct?: number;
  rollbackThreshold?: number;
  rampSteps?: number[];
  autoCanary?: boolean;
}

export interface LearningControlEvent {
  taskType: string;
  eventKind: 'canary_started' | 'canary_ramped' | 'canary_promoted' | 'canary_rolled_back';
  variantId: string;
  priorVariantId?: string | null;
  payload: Record<string, unknown>;
}

export function advanceDelayedLearningControl(
  options: DelayedLearningControlOptions
): LearningControlEvent[] {
  const api = loadSelfImprove();
  if (!api) return [];

  const activeCanary = api.getActiveCanary(options.taskType);
  if (activeCanary) {
    try {
      const step = api.stepCanary({
        taskType: options.taskType,
        pThreshold: options.pThreshold,
        rampSteps: options.rampSteps,
      });
      if (step.action === 'held') return [];
      if (step.action === 'ramped') {
        return [
          {
            taskType: options.taskType,
            eventKind: 'canary_ramped',
            variantId: activeCanary.canaryVariantId,
            priorVariantId: activeCanary.baselineVariantId,
            payload: {
              rolloutId: activeCanary.id,
              from: step.from ?? activeCanary.trafficPct,
              to: step.to ?? activeCanary.trafficPct,
              decision: step.decision,
            },
          },
        ];
      }
      if (step.action === 'promoted' && step.promotedVariantId && step.archivedVariantId) {
        return [
          {
            taskType: options.taskType,
            eventKind: 'canary_promoted',
            variantId: step.promotedVariantId,
            priorVariantId: step.archivedVariantId,
            payload: {
              rolloutId: step.rolloutId ?? activeCanary.id,
              eventId: step.eventId ?? null,
              decision: step.decision,
            },
          },
        ];
      }
      if (step.action === 'rolled_back' && step.archivedVariantId) {
        return [
          {
            taskType: options.taskType,
            eventKind: 'canary_rolled_back',
            variantId: step.archivedVariantId,
            priorVariantId: activeCanary.baselineVariantId,
            payload: {
              rolloutId: step.rolloutId ?? activeCanary.id,
              eventId: step.eventId ?? null,
              decision: step.decision,
            },
          },
        ];
      }
      return [];
    } catch {
      return [];
    }
  }

  if (options.autoCanary === false) return [];

  const entries = api.getLeaderboard(options.taskType, 20);
  const minSamples = Math.max(2, options.minSamples ?? 5);
  const activeCandidates = entries.filter(
    entry => entry.status === 'active' && entry.sampleCount >= minSamples
  );
  if (activeCandidates.length === 0) return [];

  const canary = activeCandidates[0]!;
  const baseline =
    entries.find(entry => entry.status === 'promoted' && entry.variantId !== canary.variantId) ??
    activeCandidates.find(entry => entry.variantId !== canary.variantId);
  if (!baseline) return [];
  if (canary.mean <= baseline.mean) return [];

  try {
    const rollout = api.startCanary({
      taskType: options.taskType,
      canaryVariantId: canary.variantId,
      baselineVariantId: baseline.variantId,
      trafficPct: options.trafficPct ?? 0.1,
      minSamples,
      rollbackThreshold: options.rollbackThreshold ?? 0.05,
    });
    return [
      {
        taskType: options.taskType,
        eventKind: 'canary_started',
        variantId: canary.variantId,
        priorVariantId: baseline.variantId,
        payload: {
          rolloutId: rollout.id,
          trafficPct: rollout.trafficPct,
          minSamples: rollout.minSamples,
          rollbackThreshold: rollout.rollbackThreshold,
          candidateMean: canary.mean,
          baselineMean: baseline.mean,
          candidateSamples: canary.sampleCount,
          baselineSamples: baseline.sampleCount,
        },
      },
    ];
  } catch {
    return [];
  }
}

function loadSelfImprove(): SelfImproveAPI | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
    return require('@kamiyo-org/selfimprove') as SelfImproveAPI;
  } catch {
    return null;
  }
}
