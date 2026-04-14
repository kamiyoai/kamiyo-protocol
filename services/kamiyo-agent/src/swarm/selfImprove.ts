export type SelfImproveState = {
  minMarginDeltaSol: number;
  executionsDelta: number;
  lastEvaluatedAt: string | null;
  lastAction: 'hold' | 'tighten' | 'loosen' | 'scale_down' | 'scale_up';
  consecutiveTightens: number;
  consecutiveLoosens: number;
};

export type SelfImproveDecision = {
  state: SelfImproveState;
  action: SelfImproveState['lastAction'];
  totalJobs: number;
  failedJobs: number;
  failRate: number;
  netRevenueSol: number;
  effectiveMinMarginSol: number;
  effectiveExecutionsPerTick: number;
  reason: string;
};

export function parseSelfImproveState(raw: string | undefined): SelfImproveState {
  if (!raw) {
    return {
      minMarginDeltaSol: 0,
      executionsDelta: 0,
      lastEvaluatedAt: null,
      lastAction: 'hold',
      consecutiveTightens: 0,
      consecutiveLoosens: 0,
    };
  }

  try {
    const parsed = JSON.parse(raw) as Partial<SelfImproveState>;
    return {
      minMarginDeltaSol:
        typeof parsed.minMarginDeltaSol === 'number' && Number.isFinite(parsed.minMarginDeltaSol)
          ? parsed.minMarginDeltaSol
          : 0,
      executionsDelta:
        typeof parsed.executionsDelta === 'number' && Number.isFinite(parsed.executionsDelta)
          ? Math.trunc(parsed.executionsDelta)
          : 0,
      lastEvaluatedAt:
        typeof parsed.lastEvaluatedAt === 'string' && parsed.lastEvaluatedAt.trim()
          ? parsed.lastEvaluatedAt
          : null,
      lastAction:
        parsed.lastAction === 'tighten' ||
        parsed.lastAction === 'loosen' ||
        parsed.lastAction === 'scale_down' ||
        parsed.lastAction === 'scale_up'
          ? parsed.lastAction
          : 'hold',
      consecutiveTightens:
        typeof parsed.consecutiveTightens === 'number' && Number.isFinite(parsed.consecutiveTightens)
          ? Math.max(0, Math.trunc(parsed.consecutiveTightens))
          : 0,
      consecutiveLoosens:
        typeof parsed.consecutiveLoosens === 'number' && Number.isFinite(parsed.consecutiveLoosens)
          ? Math.max(0, Math.trunc(parsed.consecutiveLoosens))
          : 0,
    };
  } catch {
    return {
      minMarginDeltaSol: 0,
      executionsDelta: 0,
      lastEvaluatedAt: null,
      lastAction: 'hold',
      consecutiveTightens: 0,
      consecutiveLoosens: 0,
    };
  }
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function clampInt(value: number, min: number, max: number): number {
  return Math.trunc(clampNumber(value, min, max));
}

export function evaluateSelfImprove(params: {
  state: SelfImproveState;
  nowIso: string;
  totalJobs: number;
  failedJobs: number;
  netRevenueSol: number;
  minJobs: number;
  failRateUpper: number;
  failRateLower: number;
  marginStepSol: number;
  minMarginFloorSol: number;
  currentMinMarginSol: number;
  baseExecutionsPerTick: number;
  maxExecutionsPerTick: number;
}): SelfImproveDecision {
  const failRate = params.totalJobs > 0 ? params.failedJobs / params.totalJobs : 0;
  const next: SelfImproveState = { ...params.state, lastEvaluatedAt: params.nowIso };

  let action: SelfImproveState['lastAction'] = 'hold';
  let reason = 'not_enough_signal';

  if (params.totalJobs >= params.minJobs) {
    if (failRate >= params.failRateUpper || params.netRevenueSol < 0) {
      action = failRate >= params.failRateUpper ? 'tighten' : 'scale_down';
      next.minMarginDeltaSol = clampNumber(
        next.minMarginDeltaSol + params.marginStepSol,
        0,
        0.02
      );
      next.executionsDelta = clampInt(next.executionsDelta - 1, -8, 8);
      next.consecutiveTightens += 1;
      next.consecutiveLoosens = 0;
      reason = failRate >= params.failRateUpper ? 'high_fail_rate' : 'negative_net_revenue';
    } else if (failRate <= params.failRateLower && params.netRevenueSol > 0) {
      action = params.netRevenueSol > params.marginStepSol ? 'scale_up' : 'loosen';
      next.minMarginDeltaSol = clampNumber(
        next.minMarginDeltaSol - params.marginStepSol,
        -0.01,
        0.02
      );
      next.executionsDelta = clampInt(next.executionsDelta + 1, -8, 8);
      next.consecutiveLoosens += 1;
      next.consecutiveTightens = 0;
      reason = 'healthy_margin_and_fail_rate';
    } else {
      action = 'hold';
      next.consecutiveLoosens = 0;
      next.consecutiveTightens = 0;
      reason = 'mixed_signals_hold';
    }
  }

  next.lastAction = action;

  const effectiveMinMarginSol = Math.max(
    params.minMarginFloorSol,
    params.currentMinMarginSol + next.minMarginDeltaSol
  );
  const effectiveExecutionsPerTick = clampInt(
    params.baseExecutionsPerTick + next.executionsDelta,
    1,
    Math.max(1, params.maxExecutionsPerTick)
  );

  return {
    state: next,
    action,
    totalJobs: params.totalJobs,
    failedJobs: params.failedJobs,
    failRate,
    netRevenueSol: params.netRevenueSol,
    effectiveMinMarginSol,
    effectiveExecutionsPerTick,
    reason,
  };
}
