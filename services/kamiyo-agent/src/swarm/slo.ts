export type SloTickRow = {
  id: string;
  startedAt: string;
  finishedAt: string | null;
  status: 'running' | 'ok' | 'error';
  error: string | null;
};

export type SloActionRow = {
  tickId: string;
  at: string;
  tool: string;
  error: string | null;
};

export function buildAutonomySloReport(params: {
  nowIso: string;
  windowDays: number;
  ticks: SloTickRow[];
  actions: SloActionRow[];
  routeActions: SloActionRow[];
  revenueLaneStats: Array<{
    lane: string;
    kind: string;
    events: number;
    amountSol: number;
    amountUsd: number;
  }>;
  interventionTools?: string[];
}): {
  generatedAt: string;
  windowDays: number;
  windowStart: string;
  metrics: {
    totalTicks: number;
    okTicks: number;
    errorTicks: number;
    runningTicks: number;
    decisionLoopUptime: number;
    nonInterventionRate: number;
    routeSuccessRate: number;
    meanTimeToRecoveryMinutes: number | null;
    mttrSampleCount: number;
  };
  targets: {
    decisionLoopUptime: number;
    nonInterventionRate: number;
    routeSuccessRate: number;
    meanTimeToRecoveryMinutes: number;
  };
  meetsTargets: {
    decisionLoopUptime: boolean;
    nonInterventionRate: boolean;
    routeSuccessRate: boolean;
    meanTimeToRecoveryMinutes: boolean;
    overall: boolean;
  };
  interventions: {
    total: number;
    byTool: Record<string, number>;
  };
  revenue: {
    byLane: Array<{
      lane: string;
      amountSol: number;
      amountUsd: number;
      events: number;
    }>;
    totals: {
      amountSol: number;
      amountUsd: number;
      events: number;
    };
  };
} {
  const nowMs = Date.parse(params.nowIso);
  const windowMs = Math.max(1, params.windowDays) * 86_400_000;
  const windowStartIso = new Date(nowMs - windowMs).toISOString();
  const interventionTools = params.interventionTools ?? ['propose_action'];

  const totalTicks = params.ticks.length;
  const okTicks = params.ticks.filter(tick => tick.status === 'ok').length;
  const errorTicks = params.ticks.filter(tick => tick.status === 'error').length;
  const runningTicks = params.ticks.filter(tick => tick.status === 'running').length;
  const decisionLoopUptime = totalTicks > 0 ? okTicks / totalTicks : 0;

  const interventionsByTool: Record<string, number> = {};
  const interventionTickIds = new Set<string>();
  let interventionTotal = 0;
  for (const action of params.actions) {
    if (!interventionTools.includes(action.tool)) continue;
    interventionTotal += 1;
    interventionTickIds.add(action.tickId);
    interventionsByTool[action.tool] = (interventionsByTool[action.tool] ?? 0) + 1;
  }
  const nonInterventionRate =
    totalTicks > 0 ? Math.max(0, 1 - interventionTickIds.size / totalTicks) : 0;

  const routeAttempts = params.routeActions.length;
  const routeSuccess = params.routeActions.filter(action => !action.error).length;
  const routeSuccessRate = routeAttempts > 0 ? routeSuccess / routeAttempts : 1;

  const sortedTicks = [...params.ticks].sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  const mttrSamples: number[] = [];
  for (let i = 0; i < sortedTicks.length; i += 1) {
    const tick = sortedTicks[i];
    if (tick.status !== 'error' || !tick.finishedAt) continue;

    const errorFinishedMs = Date.parse(tick.finishedAt);
    if (!Number.isFinite(errorFinishedMs)) continue;

    const recovery = sortedTicks.find(
      candidate =>
        candidate.status === 'ok' &&
        Number.isFinite(Date.parse(candidate.startedAt)) &&
        Date.parse(candidate.startedAt) >= errorFinishedMs
    );
    if (!recovery) continue;
    const recoveryMs = Date.parse(recovery.startedAt) - errorFinishedMs;
    if (recoveryMs >= 0) mttrSamples.push(recoveryMs / 60_000);
  }

  const meanTimeToRecoveryMinutes =
    mttrSamples.length > 0
      ? mttrSamples.reduce((sum, value) => sum + value, 0) / mttrSamples.length
      : null;

  const laneMap = new Map<
    string,
    { lane: string; amountSol: number; amountUsd: number; events: number }
  >();
  let totalRevenueEvents = 0;
  let totalRevenueSol = 0;
  let totalRevenueUsd = 0;
  for (const stat of params.revenueLaneStats) {
    totalRevenueEvents += stat.events;
    totalRevenueSol += stat.amountSol;
    totalRevenueUsd += stat.amountUsd;
    const current = laneMap.get(stat.lane) ?? {
      lane: stat.lane,
      amountSol: 0,
      amountUsd: 0,
      events: 0,
    };
    current.amountSol += stat.amountSol;
    current.amountUsd += stat.amountUsd;
    current.events += stat.events;
    laneMap.set(stat.lane, current);
  }
  const byLane = Array.from(laneMap.values()).sort((a, b) => {
    if (b.amountSol !== a.amountSol) return b.amountSol - a.amountSol;
    return a.lane.localeCompare(b.lane);
  });

  const targets = {
    decisionLoopUptime: 0.995,
    nonInterventionRate: 0.99,
    routeSuccessRate: 0.95,
    meanTimeToRecoveryMinutes: 15,
  };
  const meetsTargets = {
    decisionLoopUptime: decisionLoopUptime >= targets.decisionLoopUptime,
    nonInterventionRate: nonInterventionRate >= targets.nonInterventionRate,
    routeSuccessRate: routeSuccessRate >= targets.routeSuccessRate,
    meanTimeToRecoveryMinutes:
      meanTimeToRecoveryMinutes != null &&
      meanTimeToRecoveryMinutes <= targets.meanTimeToRecoveryMinutes,
    overall: false,
  };
  meetsTargets.overall =
    meetsTargets.decisionLoopUptime &&
    meetsTargets.nonInterventionRate &&
    meetsTargets.routeSuccessRate &&
    meetsTargets.meanTimeToRecoveryMinutes;

  return {
    generatedAt: params.nowIso,
    windowDays: params.windowDays,
    windowStart: windowStartIso,
    metrics: {
      totalTicks,
      okTicks,
      errorTicks,
      runningTicks,
      decisionLoopUptime,
      nonInterventionRate,
      routeSuccessRate,
      meanTimeToRecoveryMinutes,
      mttrSampleCount: mttrSamples.length,
    },
    targets,
    meetsTargets,
    interventions: {
      total: interventionTotal,
      byTool: interventionsByTool,
    },
    revenue: {
      byLane,
      totals: {
        amountSol: totalRevenueSol,
        amountUsd: totalRevenueUsd,
        events: totalRevenueEvents,
      },
    },
  };
}
