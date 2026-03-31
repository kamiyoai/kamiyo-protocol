import type { Env } from '../config.js';

type ExecutionStage = Env['KAMIYO_EXECUTION_STAGE'];

export type ExecutionPolicyInput = Pick<
  Env,
  | 'KAMIYO_EXECUTION_STAGE'
  | 'KAMIYO_EXECUTION_HARD_STOP'
  | 'KAMIYO_SOL_DAILY_CAP'
  | 'KAMIYO_SOL_PER_TX_CAP'
  | 'KAMIYO_MAX_TX_PER_DAY'
  | 'KAMIYO_SWARM_JOB_EXECUTION_ENABLED'
  | 'KAMIYO_SWARM_JOB_EXECUTIONS_PER_TICK'
  | 'KAMIYO_SWARM_JOB_MIN_MARGIN_SOL'
  | 'KAMIYO_AUTO_CLAIM_ENABLED'
  | 'KAMIYO_AGENT_AUTO_CLAIM_ENABLED'
  | 'KAMIYO_AUTO_STAKE_ENABLED'
  | 'KAMIYO_AUTO_STAKE_AVAILABLE_BPS'
  | 'KAMIYO_AUTO_STAKE_MAX_LAMPORTS_PER_TX'
  | 'KAMIYO_STAKING_POOL'
  | 'KAMIYO_AGENT_STAKING_POOL'
  | 'KAMIYO_ALLOWED_STAKING_POOLS'
  | 'KAMIYO_REQUIRE_STAKING_POOL_ALLOWLIST'
>;

type StageCaps = {
  dailyCapSol: number;
  perTxCapSol: number;
  maxTxPerDay: number;
  swarmJobExecutionsPerTick: number;
  minMarginSol: number;
  allowSwarmExecution: boolean;
  allowAutoClaim: boolean;
  allowKamiyoAgentClaim: boolean;
  allowAutoStake: boolean;
  autoStakeAvailableBpsCap: number;
  autoStakeMaxLamportsPerTxCap: number;
};

const STAGE_CAPS: Record<ExecutionStage, StageCaps> = {
  canary_0: {
    dailyCapSol: 0.005,
    perTxCapSol: 0.001,
    maxTxPerDay: 1,
    swarmJobExecutionsPerTick: 0,
    minMarginSol: 0.003,
    allowSwarmExecution: false,
    allowAutoClaim: false,
    allowKamiyoAgentClaim: false,
    allowAutoStake: false,
    autoStakeAvailableBpsCap: 0,
    autoStakeMaxLamportsPerTxCap: 0,
  },
  canary_1: {
    dailyCapSol: 0.02,
    perTxCapSol: 0.003,
    maxTxPerDay: 4,
    swarmJobExecutionsPerTick: 1,
    minMarginSol: 0.0005,
    allowSwarmExecution: true,
    allowAutoClaim: false,
    allowKamiyoAgentClaim: false,
    allowAutoStake: false,
    autoStakeAvailableBpsCap: 0,
    autoStakeMaxLamportsPerTxCap: 0,
  },
  canary_2: {
    dailyCapSol: 0.05,
    perTxCapSol: 0.01,
    maxTxPerDay: 60,
    swarmJobExecutionsPerTick: 1,
    minMarginSol: 0.0001,
    allowSwarmExecution: true,
    allowAutoClaim: true,
    allowKamiyoAgentClaim: true,
    allowAutoStake: true,
    autoStakeAvailableBpsCap: 1000,
    autoStakeMaxLamportsPerTxCap: 25_000_000,
  },
  full: {
    dailyCapSol: Number.POSITIVE_INFINITY,
    perTxCapSol: Number.POSITIVE_INFINITY,
    maxTxPerDay: Number.MAX_SAFE_INTEGER,
    swarmJobExecutionsPerTick: Number.MAX_SAFE_INTEGER,
    minMarginSol: 0,
    allowSwarmExecution: true,
    allowAutoClaim: true,
    allowKamiyoAgentClaim: true,
    allowAutoStake: true,
    autoStakeAvailableBpsCap: 10_000,
    autoStakeMaxLamportsPerTxCap: Number.MAX_SAFE_INTEGER,
  },
};

function clampMin(value: number, floor: number): number {
  return Number.isFinite(value) ? Math.max(floor, value) : floor;
}

function clampMax(value: number, ceiling: number): number {
  return Math.min(value, ceiling);
}

function normalizePoolAddress(value: string): string {
  return value.trim();
}

function addAllowedPool(allowedPools: Set<string>, poolAddress: string | undefined): void {
  if (!poolAddress) return;
  const normalized = normalizePoolAddress(poolAddress);
  if (!normalized) return;
  allowedPools.add(normalized);
}

export type ExecutionPolicy = {
  stage: ExecutionStage;
  hardStop: boolean;
  dailyCapSol: number;
  perTxCapSol: number;
  maxTxPerDay: number;
  swarmJobExecutionEnabled: boolean;
  swarmJobExecutionsPerTick: number;
  swarmJobMinMarginSol: number;
  autoClaimEnabled: boolean;
  kamiyoAgentAutoClaimEnabled: boolean;
  autoStakeEnabled: boolean;
  autoStakeAvailableBps: number;
  autoStakeMaxLamportsPerTx: number;
  requireStakingPoolAllowlist: boolean;
  allowedStakingPools: Set<string>;
};

export function buildExecutionPolicy(env: ExecutionPolicyInput): ExecutionPolicy {
  const stageCaps = STAGE_CAPS[env.KAMIYO_EXECUTION_STAGE];
  const hardStop = env.KAMIYO_EXECUTION_HARD_STOP;

  const dailyCapSol = clampMax(env.KAMIYO_SOL_DAILY_CAP, stageCaps.dailyCapSol);
  const perTxCapSol = clampMax(env.KAMIYO_SOL_PER_TX_CAP, stageCaps.perTxCapSol);
  const maxTxPerDay = Math.max(
    1,
    Math.floor(clampMax(env.KAMIYO_MAX_TX_PER_DAY, stageCaps.maxTxPerDay))
  );

  const swarmJobExecutionEnabled =
    !hardStop && env.KAMIYO_SWARM_JOB_EXECUTION_ENABLED && stageCaps.allowSwarmExecution;
  const swarmJobExecutionsPerTick = swarmJobExecutionEnabled
    ? Math.max(
        1,
        Math.floor(clampMax(env.KAMIYO_SWARM_JOB_EXECUTIONS_PER_TICK, stageCaps.swarmJobExecutionsPerTick))
      )
    : 0;
  const swarmJobMinMarginSol = clampMin(env.KAMIYO_SWARM_JOB_MIN_MARGIN_SOL, stageCaps.minMarginSol);

  const autoClaimEnabled = !hardStop && env.KAMIYO_AUTO_CLAIM_ENABLED && stageCaps.allowAutoClaim;
  const kamiyoAgentAutoClaimEnabled =
    !hardStop && env.KAMIYO_AGENT_AUTO_CLAIM_ENABLED && stageCaps.allowKamiyoAgentClaim;
  const autoStakeEnabled = !hardStop && env.KAMIYO_AUTO_STAKE_ENABLED && stageCaps.allowAutoStake;

  const autoStakeAvailableBps = autoStakeEnabled
    ? Math.max(1, Math.floor(clampMax(env.KAMIYO_AUTO_STAKE_AVAILABLE_BPS, stageCaps.autoStakeAvailableBpsCap)))
    : 0;

  const autoStakeMaxLamportsPerTx = autoStakeEnabled
    ? env.KAMIYO_AUTO_STAKE_MAX_LAMPORTS_PER_TX > 0
      ? Math.floor(
          clampMax(
            env.KAMIYO_AUTO_STAKE_MAX_LAMPORTS_PER_TX,
            stageCaps.autoStakeMaxLamportsPerTxCap
          )
        )
      : Math.floor(stageCaps.autoStakeMaxLamportsPerTxCap)
    : 0;

  const allowedStakingPools = new Set(
    env.KAMIYO_ALLOWED_STAKING_POOLS.map(normalizePoolAddress).filter(Boolean)
  );
  addAllowedPool(allowedStakingPools, env.KAMIYO_STAKING_POOL);
  addAllowedPool(allowedStakingPools, env.KAMIYO_AGENT_STAKING_POOL);

  return {
    stage: env.KAMIYO_EXECUTION_STAGE,
    hardStop,
    dailyCapSol,
    perTxCapSol,
    maxTxPerDay,
    swarmJobExecutionEnabled,
    swarmJobExecutionsPerTick,
    swarmJobMinMarginSol,
    autoClaimEnabled,
    kamiyoAgentAutoClaimEnabled,
    autoStakeEnabled,
    autoStakeAvailableBps,
    autoStakeMaxLamportsPerTx,
    requireStakingPoolAllowlist: env.KAMIYO_REQUIRE_STAKING_POOL_ALLOWLIST,
    allowedStakingPools,
  };
}
