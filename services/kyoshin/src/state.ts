export type RuntimeStatus = {
  startedAt: string;
  mode: 'propose' | 'execute';
  execution: {
    stage: 'canary_0' | 'canary_1' | 'canary_2' | 'full';
    hardStop: boolean;
    swarmJobExecutionEnabled: boolean;
    autoClaimEnabled: boolean;
    autoStakeEnabled: boolean;
    requireStakingPoolAllowlist: boolean;
  };
  running: boolean;
  lastTickId: string | null;
  lastTickStartedAt: string | null;
  lastTickFinishedAt: string | null;
  lastTickStatus: 'ok' | 'error' | null;
  lastError: string | null;
  swarm: {
    enabled: boolean;
    opportunitiesLastTick: number;
    assignmentsLastTick: number;
    executedLastTick: number;
    skippedLastTick: number;
    failedLastTick: number;
  };
  treasury: {
    spentTodaySol: number;
    dailyCapSol: number;
    txToday: number;
    maxTxPerDay: number;
    lastRouteSignature: string | null;
    lastClaimSignature: string | null;
  };
<<<<<<< HEAD
=======
  economics: {
    pendingIntakeJobs: number;
    completedIntakeJobs: number;
    deadletterIntakeJobs: number;
    netRevenueTodaySol: number;
    grossRevenueTodaySol: number;
    costTodaySol: number;
    lastSettlementAt: string | null;
  };
  selfImprove: {
    enabled: boolean;
    lastEvaluatedAt: string | null;
    lastAction: 'hold' | 'tighten' | 'loosen' | 'scale_down' | 'scale_up';
    effectiveMinMarginSol: number;
    effectiveExecutionsPerTick: number;
  };
>>>>>>> origin/kamiyo/kyoshin-exec-canary
};

export function createInitialStatus(mode: 'propose' | 'execute'): RuntimeStatus {
  return {
    startedAt: new Date().toISOString(),
    mode,
    execution: {
      stage: 'canary_0',
      hardStop: false,
      swarmJobExecutionEnabled: false,
      autoClaimEnabled: false,
      autoStakeEnabled: false,
      requireStakingPoolAllowlist: true,
    },
    running: false,
    lastTickId: null,
    lastTickStartedAt: null,
    lastTickFinishedAt: null,
    lastTickStatus: null,
    lastError: null,
    swarm: {
      enabled: false,
      opportunitiesLastTick: 0,
      assignmentsLastTick: 0,
      executedLastTick: 0,
      skippedLastTick: 0,
      failedLastTick: 0,
    },
    treasury: {
      spentTodaySol: 0,
      dailyCapSol: 0,
      txToday: 0,
      maxTxPerDay: 0,
      lastRouteSignature: null,
      lastClaimSignature: null,
    },
<<<<<<< HEAD
=======
    economics: {
      pendingIntakeJobs: 0,
      completedIntakeJobs: 0,
      deadletterIntakeJobs: 0,
      netRevenueTodaySol: 0,
      grossRevenueTodaySol: 0,
      costTodaySol: 0,
      lastSettlementAt: null,
    },
    selfImprove: {
      enabled: false,
      lastEvaluatedAt: null,
      lastAction: 'hold',
      effectiveMinMarginSol: 0,
      effectiveExecutionsPerTick: 0,
    },
>>>>>>> origin/kamiyo/kyoshin-exec-canary
  };
}
