import type { AgentLearningCanarySnapshot, AgentLearningCommand } from './learning-control-plane';

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

type SelfImproveCanaryDecision =
  | { kind: 'hold'; reason: string; canarySamples: number; baselineSamples: number }
  | {
      kind: 'promote';
      meanCanary: number;
      meanBaseline: number;
      uplift: number;
      pValue: number;
      canarySamples: number;
    }
  | {
      kind: 'rollback';
      reason: 'regression' | 'pvalue';
      meanCanary: number;
      meanBaseline: number;
      delta: number;
      canarySamples: number;
    };

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

interface SelfImproveRollbackResult {
  rolloutId: string;
  archivedVariantId: string;
  eventId: string;
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
  evaluateCanary(input: { taskType: string; pThreshold?: number }): SelfImproveCanaryDecision;
  rollbackCanary(taskType: string, reason: string): SelfImproveRollbackResult;
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

export interface AppliedLearningCommand {
  commandId: string;
  kind: AgentLearningCommand['kind'];
  status: 'applied' | 'failed';
  result: Record<string, unknown>;
  event?: LearningControlEvent;
}

export function advanceDelayedLearningControl(
  options: DelayedLearningControlOptions
): LearningControlEvent[] {
  const api = loadSelfImprove();
  if (!api) return [];

  const activeCanary = safeGetActiveCanary(api, options.taskType);
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

export function snapshotDelayedLearningCanary(input: {
  service: string;
  taskType: string;
  pThreshold?: number;
  now?: number | Date;
}): AgentLearningCanarySnapshot {
  const updatedAt =
    typeof input.now === 'number'
      ? Math.floor(input.now)
      : input.now instanceof Date
        ? Math.floor(input.now.getTime() / 1000)
        : Math.floor(Date.now() / 1000);
  const api = loadSelfImprove();
  const activeCanary = api ? safeGetActiveCanary(api, input.taskType) : null;
  if (!api || !activeCanary) {
    return {
      service: input.service,
      taskType: input.taskType,
      rolloutId: null,
      status: 'inactive',
      canaryVariantId: null,
      baselineVariantId: null,
      trafficPct: null,
      decisionKind: null,
      decisionReason: null,
      canarySamples: null,
      baselineSamples: null,
      uplift: null,
      pValue: null,
      alerts: [],
      updatedAt,
    };
  }

  try {
    const decision = api.evaluateCanary({
      taskType: input.taskType,
      pThreshold: input.pThreshold,
    });
    return {
      service: input.service,
      taskType: input.taskType,
      rolloutId: activeCanary.id,
      status: activeCanary.status,
      canaryVariantId: activeCanary.canaryVariantId,
      baselineVariantId: activeCanary.baselineVariantId,
      trafficPct: activeCanary.trafficPct,
      decisionKind: decision.kind,
      decisionReason: 'reason' in decision ? decision.reason : null,
      canarySamples: decision.canarySamples ?? null,
      baselineSamples: 'baselineSamples' in decision ? decision.baselineSamples : null,
      uplift:
        decision.kind === 'promote'
          ? decision.uplift
          : decision.kind === 'rollback'
            ? decision.delta
            : null,
      pValue: decision.kind === 'promote' ? decision.pValue : null,
      alerts: [],
      updatedAt,
    };
  } catch {
    return {
      service: input.service,
      taskType: input.taskType,
      rolloutId: activeCanary.id,
      status: activeCanary.status,
      canaryVariantId: activeCanary.canaryVariantId,
      baselineVariantId: activeCanary.baselineVariantId,
      trafficPct: activeCanary.trafficPct,
      decisionKind: null,
      decisionReason: null,
      canarySamples: null,
      baselineSamples: null,
      uplift: null,
      pValue: null,
      alerts: [],
      updatedAt,
    };
  }
}

export function applyDelayedLearningCommands(input: {
  taskType: string;
  commands: Pick<AgentLearningCommand, 'id' | 'kind' | 'note'>[];
}): AppliedLearningCommand[] {
  const api = loadSelfImprove();
  const results: AppliedLearningCommand[] = [];

  for (const command of input.commands) {
    if (command.kind === 'pause_auto' || command.kind === 'resume_auto') {
      results.push({
        commandId: command.id,
        kind: command.kind,
        status: 'applied',
        result: {
          mode: command.kind === 'pause_auto' ? 'paused' : 'auto',
        },
      });
      continue;
    }

    if (!api) {
      results.push({
        commandId: command.id,
        kind: command.kind,
        status: 'failed',
        result: { error: 'selfimprove_not_available' },
      });
      continue;
    }

    const activeCanary = safeGetActiveCanary(api, input.taskType);
    if (!activeCanary) {
      results.push({
        commandId: command.id,
        kind: command.kind,
        status: 'failed',
        result: { error: 'no_active_canary' },
      });
      continue;
    }

    try {
      const rollback = api.rollbackCanary(input.taskType, command.note?.trim() || 'manual');
      results.push({
        commandId: command.id,
        kind: command.kind,
        status: 'applied',
        result: {
          rolloutId: rollback.rolloutId,
          archivedVariantId: rollback.archivedVariantId,
          eventId: rollback.eventId,
        },
        event: {
          taskType: input.taskType,
          eventKind: 'canary_rolled_back',
          variantId: rollback.archivedVariantId,
          priorVariantId: activeCanary.baselineVariantId,
          payload: {
            rolloutId: rollback.rolloutId,
            eventId: rollback.eventId,
            decision: {
              kind: 'rollback',
              reason: command.note?.trim() || 'manual',
            },
          },
        },
      });
    } catch (error) {
      results.push({
        commandId: command.id,
        kind: command.kind,
        status: 'failed',
        result: {
          error: error instanceof Error ? error.message : String(error),
        },
      });
    }
  }

  return results;
}

function loadSelfImprove(): SelfImproveAPI | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
    return require('@kamiyo-org/selfimprove') as SelfImproveAPI;
  } catch {
    return null;
  }
}

function safeGetActiveCanary(
  api: SelfImproveAPI,
  taskType: string
): SelfImproveCanaryRollout | null {
  try {
    return api.getActiveCanary(taskType);
  } catch {
    return null;
  }
}
