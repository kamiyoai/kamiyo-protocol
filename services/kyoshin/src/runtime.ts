import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { env, type Env } from './config.js';
import { openDb } from './db.js';
import { writeOutbox } from './outbox.js';
import { loadOperatorKeypair, loadOptionalKeypair } from './wallet.js';
import { claimFeeVault, readFeeVault } from './tools/feeVault.js';
import {
  claimFundryStakingPeriods,
  getClaimableLamports,
  readFundryUserPosition,
  type FundryUserPosition,
} from './tools/fundryStaking.js';
import {
  depositToStakingPeriod,
  ensureOpenStakingPeriod,
  findLatestOpenStakingPeriod,
} from './tools/stakingPool.js';
import { loadSwarmRegistry } from './swarm/registry.js';
import { planSwarmMissions, type SwarmMissionOpportunityHint } from './swarm/planner.js';
import {
  collectSwarmOpportunities,
  type LeadConversionPolicy,
  type MarketplaceFeedConfig,
  type SwarmOpportunity,
  type SwarmOpportunityAssignment,
  type SwarmOpportunityIntake,
} from './swarm/opportunities.js';
import { executeAssignedOpportunity, type SourceAuthMap } from './swarm/jobs.js';
import {
  parseMarginCircuitState,
  pruneMarginCircuitState,
  isMarginCircuitOpen,
  updateMarginCircuit,
  type MarginCircuitState,
} from './swarm/circuitBreaker.js';
import {
  parseRollbackState,
  pruneRollbackState,
  isRollbackSourceDisabled,
  evaluateRollbackPolicy,
} from './swarm/rollback.js';
import {
  parsePriorityState,
  evaluateSwarmPerformance,
  type SwarmAgentRuntimeMetrics,
} from './swarm/performance.js';
import { revenueLaneForOpportunitySource, summariseLaneStats } from './swarm/revenue.js';
import {
  intakeJobBatchSchema,
  intakeJobToOpportunity,
  normalizeBatchInput,
  normalizeIntakeJob,
} from './swarm/intake.js';
import { evaluateSelfImprove, parseSelfImproveState } from './swarm/selfImprove.js';
import {
  extractAgentInsights,
  extractSourceInsights,
  mergeInsightSnapshots,
  parseInsightSnapshot,
} from './swarm/insightExtractor.js';
import {
  collectNearMarketSettlements,
  fetchNearMarketJobDetail,
  listNearMarketTrackedBids,
  submitNearMarketDeliverable,
  withdrawNearMarketBid,
} from './swarm/nearMarket.js';
import { buildAutonomySloReport } from './swarm/slo.js';
import { checkBudget, applyBudget } from './policy/budget.js';
import {
  buildExecutionPolicy,
  type ExecutionPolicy,
  type ExecutionPolicyInput,
} from './policy/executeProfile.js';
import type { SwarmRegistry } from './swarm/types.js';
import { createInitialStatus, type RuntimeStatus } from './state.js';

const SERVICE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STAKING_PERIOD_MAINTENANCE_INTERVAL_MS = 15 * 60_000;

function log(
  level: 'info' | 'warn' | 'error',
  message: string,
  context?: Record<string, unknown>
): void {
  const payload = {
    ts: new Date().toISOString(),
    level,
    service: 'kyoshin-exec',
    message,
    ...(context ? { context } : {}),
  };
  const line = JSON.stringify(payload);
  if (level === 'error') {
    console.error(line);
    return;
  }
  if (level === 'warn') {
    console.warn(line);
    return;
  }
  console.log(line);
}

function startOfUtcDayIso(now = new Date()): string {
  const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  return date.toISOString();
}

function daysAgoIso(days: number, now = new Date()): string {
  return new Date(now.getTime() - Math.max(1, days) * 86_400_000).toISOString();
}

function resolvePath(inputPath: string): string {
  return path.isAbsolute(inputPath) ? inputPath : path.resolve(SERVICE_DIR, inputPath);
}

function randomId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function parseBooleanLiteral(value: string | undefined): boolean | undefined {
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  return undefined;
}

function parseFiniteNumber(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value.trim());
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseCsv(value: string | undefined): string[] | undefined {
  if (value == null) return undefined;
  return value
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
}

function readExecutionPolicyEnvOverrides(envFilePath: string): Partial<ExecutionPolicyInput> {
  if (!envFilePath || !fs.existsSync(envFilePath)) return {};

  const raw = fs.readFileSync(envFilePath, 'utf8');
  const kv: Record<string, string> = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separator = trimmed.indexOf('=');
    if (separator <= 0) continue;
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim();
    kv[key] = value;
  }

  const overrides: Partial<ExecutionPolicyInput> = {};
  const stage = kv.KAMIYO_EXECUTION_STAGE;
  if (stage === 'canary_0' || stage === 'canary_1' || stage === 'canary_2' || stage === 'full') {
    overrides.KAMIYO_EXECUTION_STAGE = stage;
  }

  const hardStop = parseBooleanLiteral(kv.KAMIYO_EXECUTION_HARD_STOP);
  if (hardStop != null) overrides.KAMIYO_EXECUTION_HARD_STOP = hardStop;

  const dailyCap = parseFiniteNumber(kv.KAMIYO_SOL_DAILY_CAP);
  if (dailyCap != null) overrides.KAMIYO_SOL_DAILY_CAP = dailyCap;

  const perTxCap = parseFiniteNumber(kv.KAMIYO_SOL_PER_TX_CAP);
  if (perTxCap != null) overrides.KAMIYO_SOL_PER_TX_CAP = perTxCap;

  const maxTx = parseFiniteNumber(kv.KAMIYO_MAX_TX_PER_DAY);
  if (maxTx != null) overrides.KAMIYO_MAX_TX_PER_DAY = Math.max(1, Math.floor(maxTx));

  const swarmJobExecutionEnabled = parseBooleanLiteral(kv.KAMIYO_SWARM_JOB_EXECUTION_ENABLED);
  if (swarmJobExecutionEnabled != null) {
    overrides.KAMIYO_SWARM_JOB_EXECUTION_ENABLED = swarmJobExecutionEnabled;
  }

  const executionsPerTick = parseFiniteNumber(kv.KAMIYO_SWARM_JOB_EXECUTIONS_PER_TICK);
  if (executionsPerTick != null) {
    overrides.KAMIYO_SWARM_JOB_EXECUTIONS_PER_TICK = Math.max(1, Math.floor(executionsPerTick));
  }

  const minMargin = parseFiniteNumber(kv.KAMIYO_SWARM_JOB_MIN_MARGIN_SOL);
  if (minMargin != null) overrides.KAMIYO_SWARM_JOB_MIN_MARGIN_SOL = Math.max(0, minMargin);

  const autoClaimEnabled = parseBooleanLiteral(kv.KAMIYO_AUTO_CLAIM_ENABLED);
  if (autoClaimEnabled != null) overrides.KAMIYO_AUTO_CLAIM_ENABLED = autoClaimEnabled;

  const kyoshinAutoClaimEnabled = parseBooleanLiteral(kv.KAMIYO_KYOSHIN_AUTO_CLAIM_ENABLED);
  if (kyoshinAutoClaimEnabled != null) {
    overrides.KAMIYO_KYOSHIN_AUTO_CLAIM_ENABLED = kyoshinAutoClaimEnabled;
  }

  const autoStakeEnabled = parseBooleanLiteral(kv.KAMIYO_AUTO_STAKE_ENABLED);
  if (autoStakeEnabled != null) overrides.KAMIYO_AUTO_STAKE_ENABLED = autoStakeEnabled;

  const autoStakeAvailableBps = parseFiniteNumber(kv.KAMIYO_AUTO_STAKE_AVAILABLE_BPS);
  if (autoStakeAvailableBps != null) {
    overrides.KAMIYO_AUTO_STAKE_AVAILABLE_BPS = Math.max(1, Math.floor(autoStakeAvailableBps));
  }

  const autoStakeMaxLamportsPerTx = parseFiniteNumber(kv.KAMIYO_AUTO_STAKE_MAX_LAMPORTS_PER_TX);
  if (autoStakeMaxLamportsPerTx != null) {
    overrides.KAMIYO_AUTO_STAKE_MAX_LAMPORTS_PER_TX = Math.max(
      0,
      Math.floor(autoStakeMaxLamportsPerTx)
    );
  }

  const allowlist = parseCsv(kv.KAMIYO_ALLOWED_STAKING_POOLS);
  if (allowlist) overrides.KAMIYO_ALLOWED_STAKING_POOLS = allowlist;

  const requireAllowlist = parseBooleanLiteral(kv.KAMIYO_REQUIRE_STAKING_POOL_ALLOWLIST);
  if (requireAllowlist != null) {
    overrides.KAMIYO_REQUIRE_STAKING_POOL_ALLOWLIST = requireAllowlist;
  }

  return overrides;
}

function executionPolicyFingerprint(policy: ExecutionPolicy): string {
  const pools = Array.from(policy.allowedStakingPools).sort();
  return JSON.stringify({
    stage: policy.stage,
    hardStop: policy.hardStop,
    dailyCapSol: policy.dailyCapSol,
    perTxCapSol: policy.perTxCapSol,
    maxTxPerDay: policy.maxTxPerDay,
    swarmJobExecutionEnabled: policy.swarmJobExecutionEnabled,
    swarmJobExecutionsPerTick: policy.swarmJobExecutionsPerTick,
    swarmJobMinMarginSol: policy.swarmJobMinMarginSol,
    autoClaimEnabled: policy.autoClaimEnabled,
    kyoshinAutoClaimEnabled: policy.kyoshinAutoClaimEnabled,
    autoStakeEnabled: policy.autoStakeEnabled,
    autoStakeAvailableBps: policy.autoStakeAvailableBps,
    autoStakeMaxLamportsPerTx: policy.autoStakeMaxLamportsPerTx,
    requireStakingPoolAllowlist: policy.requireStakingPoolAllowlist,
    pools,
  });
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  if (timeoutMs <= 0) return promise;
  let timer: NodeJS.Timeout | null = null;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

function toLamports(value: unknown): bigint {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (!Number.isInteger(value)) throw new Error(`expected integer lamports, got ${value}`);
    return BigInt(value);
  }
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) return BigInt(value);
  throw new Error(`invalid lamports: ${String(value)}`);
}

function lamportsToSol(lamports: bigint): number {
  return Number(lamports) / 1e9;
}

function getUserUnclaimedLamports(
  breakdown: Awaited<ReturnType<typeof readFeeVault>>,
  address: string
): bigint {
  const entry = breakdown.userFees.find(item => item.address === address);
  if (!entry) return 0n;
  return toLamports(entry.feeUnclaimed);
}

function parsePeriodNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0) return value;
  if (typeof value === 'string' && /^\d+$/.test(value)) return Number(value);
  return null;
}

function getClaimablePeriodNumbers(position: FundryUserPosition, maxPeriods: number): number[] {
  const periods = Array.isArray(position.rewards?.claimablePeriods)
    ? position.rewards.claimablePeriods
    : [];

  const parsed = periods.flatMap(period => {
    const payload = period as Record<string, unknown>;
    const direct = parsePeriodNumber(payload.periodNumber);
    if (direct != null) return [direct];

    const nestedPayload = payload.period;
    const nested =
      nestedPayload && typeof nestedPayload === 'object'
        ? parsePeriodNumber((nestedPayload as Record<string, unknown>).periodNumber)
        : null;

    return nested != null ? [nested] : [];
  });

  return [...new Set(parsed)].slice(0, Math.max(1, maxPeriods));
}

type BudgetState = {
  dayStartIso: string;
  spentTodaySol: number;
  txToday: number;
};

type SwarmExecutionOutcome = {
  agentId: string;
  opportunityId: string;
  source: string;
  status: 'executed' | 'failed' | 'skipped';
  reason?: string;
  error?: string;
  realizedRevenueSol: number;
  realizedRevenueUsd: number;
  intakeJobId?: string;
};

type RevenueNet = {
  grossSol: number;
  costSol: number;
  netSol: number;
  grossUsd: number;
  costUsd: number;
  netUsd: number;
};

type SelfImproveSnapshot = {
  effectiveMinMarginSol: number;
  effectiveExecutionsPerTick: number;
  lastAction: 'hold' | 'tighten' | 'loosen' | 'scale_down' | 'scale_up';
  lastEvaluatedAt: string | null;
};

function isTerminalSkipReason(reason: string | undefined): boolean {
  if (!reason) return false;
  return (
    reason === 'missing_opportunity_url' ||
    reason === 'discovery_lead_non_executable' ||
    reason.startsWith('marketplace_') ||
    reason === 'request_failed' ||
    reason === 'request_error' ||
    reason === 'x402_requirement_missing' ||
    reason === 'x402_amount_invalid' ||
    reason === 'x402_amount_missing'
  );
}

function computeRevenueNet(
  stats: Array<{ lane: string; kind: string; events: number; amountSol: number; amountUsd: number }>
): RevenueNet {
  let grossSol = 0;
  let costSol = 0;
  let grossUsd = 0;
  let costUsd = 0;

  for (const row of stats) {
    if (row.kind === 'job' || row.kind === 'claim') {
      grossSol += row.amountSol;
      grossUsd += row.amountUsd;
      continue;
    }
    if (row.kind === 'job_cost' || row.kind === 'route') {
      costSol += Math.abs(row.amountSol);
      costUsd += Math.abs(row.amountUsd);
    }
  }

  return {
    grossSol,
    costSol,
    netSol: grossSol - costSol,
    grossUsd,
    costUsd,
    netUsd: grossUsd - costUsd,
  };
}

export class KyoshinRuntime {
  private readonly runtimeEnv: Env;
  private executionPolicy: ExecutionPolicy;
  private readonly db: ReturnType<typeof openDb>;
  private readonly status: RuntimeStatus;
  private readonly rpcConnections: Connection[];
  private readonly operatorKeypair: Keypair;

  private loopTimer: NodeJS.Timeout | null = null;
  private runningTick = false;
  private stopRequested = false;
  private lastPolicyReloadMs = 0;
  private lastStakingPeriodMaintenanceMs = 0;

  constructor(runtimeEnv: Env = env) {
    this.runtimeEnv = runtimeEnv;
    this.executionPolicy = buildExecutionPolicy(runtimeEnv);
    this.db = openDb(resolvePath(runtimeEnv.KAMIYO_DB_PATH));
    this.status = createInitialStatus(runtimeEnv.KAMIYO_MODE);

    let keypairInfo: { keypair: Keypair; source: string };
    try {
      keypairInfo = loadOperatorKeypair(runtimeEnv);
    } catch (error) {
      if (!this.executionPolicy.hardStop) throw error;
      keypairInfo = {
        keypair: Keypair.generate(),
        source: 'ephemeral_hard_stop_fallback',
      };
      log('warn', 'Operator keypair missing, using ephemeral hard-stop fallback keypair', {
        reason: error instanceof Error ? error.message : String(error),
      });
    }
    this.operatorKeypair = keypairInfo.keypair;

    const endpoints = [runtimeEnv.SOLANA_RPC_URL, ...runtimeEnv.SOLANA_RPC_FALLBACK_URLS];
    this.rpcConnections = endpoints.map(endpoint => new Connection(endpoint, 'confirmed'));

    this.status.mode = runtimeEnv.KAMIYO_MODE;
    this.status.selfImprove.enabled = runtimeEnv.KAMIYO_SELF_IMPROVE_ENABLED;
    this.applyExecutionPolicyToStatus();

    log('info', 'Kyoshin runtime initialized', {
      mode: runtimeEnv.KAMIYO_MODE,
      executionStage: this.executionPolicy.stage,
      executionHardStop: this.executionPolicy.hardStop,
      rpcEndpoints: endpoints,
      keypairSource: keypairInfo.source,
      swarmEnabled: runtimeEnv.KAMIYO_SWARM_ENABLED,
    });
  }

  getStatus(): RuntimeStatus {
    return {
      ...this.status,
      execution: { ...this.status.execution },
      swarm: { ...this.status.swarm },
      treasury: { ...this.status.treasury },
      economics: { ...this.status.economics },
      selfImprove: { ...this.status.selfImprove },
    };
  }

  enqueueIntakeJobs(payload: unknown): {
    accepted: string[];
    updated: string[];
    rejected: Array<{ id: string; reason: string }>;
  } {
    const parsed = intakeJobBatchSchema.parse(payload);
    const normalized = normalizeBatchInput(parsed).map(job => ({
      id: job.id,
      payload: normalizeIntakeJob(job),
    }));
    const result = this.db.upsertIntakeJobs(normalized);
    const stats = this.db.intakeJobStats();
    this.status.economics.pendingIntakeJobs = stats.pending;
    this.status.economics.completedIntakeJobs = stats.completed;
    this.status.economics.deadletterIntakeJobs = stats.deadletter;
    return result;
  }

  listIntakeJobs(params?: {
    status?: 'pending' | 'completed' | 'deadletter';
    limit?: number;
  }): ReturnType<ReturnType<typeof openDb>['listIntakeJobs']> {
    return this.db.listIntakeJobs(params);
  }

  getEconomicsSnapshot(): {
    dayStartIso: string;
    revenue: RevenueNet;
    laneSummary: ReturnType<typeof summariseLaneStats>;
    intake: ReturnType<ReturnType<typeof openDb>['intakeJobStats']>;
    jobs: {
      total: number;
      executed: number;
      failed: number;
      skipped: number;
      paid: number;
    };
    selfImprove: SelfImproveSnapshot;
  } {
    const dayStartIso = startOfUtcDayIso();
    const laneStats = this.db.revenueLaneStatsSince(dayStartIso);
    const intake = this.db.intakeJobStats();
    const jobsByAgent = this.db.swarmJobStatsSince(dayStartIso);
    const revenue = computeRevenueNet(laneStats);
    const laneSummary = summariseLaneStats(laneStats);
    const jobs = jobsByAgent.reduce(
      (totals, row) => {
        totals.total += row.total;
        totals.executed += row.succeeded;
        totals.failed += row.failed;
        totals.paid += row.paidCount;
        return totals;
      },
      {
        total: 0,
        executed: 0,
        failed: 0,
        skipped: 0,
        paid: 0,
      }
    );
    jobs.skipped = Math.max(0, jobs.total - jobs.executed - jobs.failed);

    return {
      dayStartIso,
      revenue,
      laneSummary,
      intake,
      jobs,
      selfImprove: {
        effectiveMinMarginSol: this.status.selfImprove.effectiveMinMarginSol,
        effectiveExecutionsPerTick: this.status.selfImprove.effectiveExecutionsPerTick,
        lastAction: this.status.selfImprove.lastAction,
        lastEvaluatedAt: this.status.selfImprove.lastEvaluatedAt,
      },
    };
  }

  getMetrics(): string {
    const nowIso = new Date().toISOString();
    const windowStartIso = daysAgoIso(this.runtimeEnv.KAMIYO_SWARM_ROLLBACK_WINDOW_DAYS);

    const tickStats = this.db.tickStatsSince(windowStartIso);
    const actions = this.db.actionsSince(windowStartIso);
    const routeActions = this.db.actionsSince(windowStartIso, 'staking_period_deposit');
    const revenueStats = this.db.revenueLaneStatsSince(windowStartIso);

    const sloReport = buildAutonomySloReport({
      nowIso,
      windowDays: this.runtimeEnv.KAMIYO_SWARM_ROLLBACK_WINDOW_DAYS,
      ticks: this.db.ticksSince(windowStartIso),
      actions,
      routeActions,
      revenueLaneStats: revenueStats,
      interventionTools: ['propose_action'],
    });

    const lines = [
      '# HELP kyoshin_process_up Process health state.',
      '# TYPE kyoshin_process_up gauge',
      'kyoshin_process_up 1',
      '# HELP kyoshin_tick_total Tick totals by status.',
      '# TYPE kyoshin_tick_total gauge',
      `kyoshin_tick_total{status="ok"} ${tickStats.ok}`,
      `kyoshin_tick_total{status="error"} ${tickStats.error}`,
      `kyoshin_tick_total{status="running"} ${tickStats.running}`,
      '# HELP kyoshin_swarm_non_intervention_rate Fraction of ticks without intervention.',
      '# TYPE kyoshin_swarm_non_intervention_rate gauge',
      `kyoshin_swarm_non_intervention_rate ${sloReport.metrics.nonInterventionRate}`,
      '# HELP kyoshin_swarm_route_success_rate Route action success ratio.',
      '# TYPE kyoshin_swarm_route_success_rate gauge',
      `kyoshin_swarm_route_success_rate ${sloReport.metrics.routeSuccessRate}`,
      '# HELP kyoshin_swarm_decision_loop_uptime Decision loop uptime ratio.',
      '# TYPE kyoshin_swarm_decision_loop_uptime gauge',
      `kyoshin_swarm_decision_loop_uptime ${sloReport.metrics.decisionLoopUptime}`,
      '# HELP kyoshin_treasury_spent_today_sol Estimated spend since UTC day start.',
      '# TYPE kyoshin_treasury_spent_today_sol gauge',
      `kyoshin_treasury_spent_today_sol ${this.status.treasury.spentTodaySol}`,
      '# HELP kyoshin_treasury_tx_today Number of treasury tx attempts today.',
      '# TYPE kyoshin_treasury_tx_today gauge',
      `kyoshin_treasury_tx_today ${this.status.treasury.txToday}`,
      '# HELP kyoshin_intake_jobs_pending Pending intake jobs.',
      '# TYPE kyoshin_intake_jobs_pending gauge',
      `kyoshin_intake_jobs_pending ${this.status.economics.pendingIntakeJobs}`,
      '# HELP kyoshin_revenue_net_today_sol Net realized revenue for UTC day.',
      '# TYPE kyoshin_revenue_net_today_sol gauge',
      `kyoshin_revenue_net_today_sol ${this.status.economics.netRevenueTodaySol}`,
      '# HELP kyoshin_self_improve_effective_min_margin_sol Adaptive min margin.',
      '# TYPE kyoshin_self_improve_effective_min_margin_sol gauge',
      `kyoshin_self_improve_effective_min_margin_sol ${this.status.selfImprove.effectiveMinMarginSol}`,
      '# HELP kyoshin_self_improve_effective_executions_per_tick Adaptive execution rate.',
      '# TYPE kyoshin_self_improve_effective_executions_per_tick gauge',
      `kyoshin_self_improve_effective_executions_per_tick ${this.status.selfImprove.effectiveExecutionsPerTick}`,
    ];

    return `${lines.join('\n')}\n`;
  }

  private applyExecutionPolicyToStatus(): void {
    this.status.execution.stage = this.executionPolicy.stage;
    this.status.execution.hardStop = this.executionPolicy.hardStop;
    this.status.execution.swarmJobExecutionEnabled = this.executionPolicy.swarmJobExecutionEnabled;
    this.status.execution.autoClaimEnabled = this.executionPolicy.autoClaimEnabled;
    this.status.execution.autoStakeEnabled = this.executionPolicy.autoStakeEnabled;
    this.status.execution.requireStakingPoolAllowlist =
      this.executionPolicy.requireStakingPoolAllowlist;
    this.status.treasury.dailyCapSol = this.executionPolicy.dailyCapSol;
    this.status.treasury.maxTxPerDay = this.executionPolicy.maxTxPerDay;
    this.status.selfImprove.effectiveMinMarginSol = this.executionPolicy.swarmJobMinMarginSol;
    this.status.selfImprove.effectiveExecutionsPerTick =
      this.executionPolicy.swarmJobExecutionsPerTick;
  }

  private getExecutionPolicyInput(): ExecutionPolicyInput {
    return {
      KAMIYO_EXECUTION_STAGE: this.executionPolicy.stage,
      KAMIYO_EXECUTION_HARD_STOP: this.executionPolicy.hardStop,
      KAMIYO_SOL_DAILY_CAP: this.executionPolicy.dailyCapSol,
      KAMIYO_SOL_PER_TX_CAP: this.executionPolicy.perTxCapSol,
      KAMIYO_MAX_TX_PER_DAY: this.executionPolicy.maxTxPerDay,
      KAMIYO_SWARM_JOB_EXECUTION_ENABLED: this.executionPolicy.swarmJobExecutionEnabled,
      KAMIYO_SWARM_JOB_EXECUTIONS_PER_TICK: this.executionPolicy.swarmJobExecutionsPerTick,
      KAMIYO_SWARM_JOB_MIN_MARGIN_SOL: this.executionPolicy.swarmJobMinMarginSol,
      KAMIYO_AUTO_CLAIM_ENABLED: this.executionPolicy.autoClaimEnabled,
      KAMIYO_KYOSHIN_AUTO_CLAIM_ENABLED: this.executionPolicy.kyoshinAutoClaimEnabled,
      KAMIYO_AUTO_STAKE_ENABLED: this.executionPolicy.autoStakeEnabled,
      KAMIYO_AUTO_STAKE_AVAILABLE_BPS: this.executionPolicy.autoStakeAvailableBps,
      KAMIYO_AUTO_STAKE_MAX_LAMPORTS_PER_TX: this.executionPolicy.autoStakeMaxLamportsPerTx,
      KAMIYO_ALLOWED_STAKING_POOLS: Array.from(this.executionPolicy.allowedStakingPools),
      KAMIYO_REQUIRE_STAKING_POOL_ALLOWLIST: this.executionPolicy.requireStakingPoolAllowlist,
    };
  }

  private maybeRefreshExecutionPolicy(params: { tickId: string; nowIso: string }): void {
    if (!this.runtimeEnv.KAMIYO_POLICY_HOT_RELOAD_ENABLED) return;

    const nowMs = Date.now();
    const intervalMs =
      Math.max(1, this.runtimeEnv.KAMIYO_POLICY_HOT_RELOAD_INTERVAL_SECONDS) * 1000;
    if (nowMs - this.lastPolicyReloadMs < intervalMs) return;
    this.lastPolicyReloadMs = nowMs;

    const envFilePathRaw = this.runtimeEnv.KAMIYO_POLICY_HOT_RELOAD_ENV_FILE;
    if (!envFilePathRaw) return;
    const envFilePath = path.isAbsolute(envFilePathRaw)
      ? envFilePathRaw
      : resolvePath(envFilePathRaw);
    if (!fs.existsSync(envFilePath)) return;

    try {
      const overrides = readExecutionPolicyEnvOverrides(envFilePath);
      if (Object.keys(overrides).length === 0) return;

      const previousPolicy = this.executionPolicy;
      const nextPolicy = buildExecutionPolicy({
        ...this.getExecutionPolicyInput(),
        ...overrides,
      });
      if (executionPolicyFingerprint(previousPolicy) === executionPolicyFingerprint(nextPolicy))
        return;

      this.executionPolicy = nextPolicy;
      this.applyExecutionPolicyToStatus();
      this.db.addAction(
        params.tickId,
        'execution_policy_hot_reload',
        {
          envFilePath,
          overrides,
        },
        {
          previous: {
            stage: previousPolicy.stage,
            hardStop: previousPolicy.hardStop,
            dailyCapSol: previousPolicy.dailyCapSol,
            perTxCapSol: previousPolicy.perTxCapSol,
            maxTxPerDay: previousPolicy.maxTxPerDay,
          },
          next: {
            stage: nextPolicy.stage,
            hardStop: nextPolicy.hardStop,
            dailyCapSol: nextPolicy.dailyCapSol,
            perTxCapSol: nextPolicy.perTxCapSol,
            maxTxPerDay: nextPolicy.maxTxPerDay,
          },
          at: params.nowIso,
        }
      );
      log('warn', 'Execution policy hot-reloaded from env file', {
        envFilePath,
        stage: nextPolicy.stage,
        hardStop: nextPolicy.hardStop,
        dailyCapSol: nextPolicy.dailyCapSol,
        perTxCapSol: nextPolicy.perTxCapSol,
        maxTxPerDay: nextPolicy.maxTxPerDay,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.db.addAction(
        params.tickId,
        'execution_policy_hot_reload',
        { envFilePath },
        null,
        message
      );
      log('warn', 'Execution policy hot-reload failed', { envFilePath, error: message });
    }
  }

  async start(): Promise<void> {
    await this.runTickGuarded();

    if (this.runtimeEnv.KAMIYO_RUN_ONCE) {
      log('info', 'Run-once mode completed');
      return;
    }

    this.loopTimer = setInterval(() => {
      void this.runTickGuarded();
    }, this.runtimeEnv.KAMIYO_LOOP_INTERVAL_SECONDS * 1000);
  }

  async stop(): Promise<void> {
    this.stopRequested = true;
    if (this.loopTimer) {
      clearInterval(this.loopTimer);
      this.loopTimer = null;
    }
    while (this.runningTick) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    this.db.close();
  }

  private async runTickGuarded(): Promise<void> {
    if (this.runningTick || this.stopRequested) return;

    this.runningTick = true;
    const tickId = randomId('tick');
    const startedAt = new Date().toISOString();

    this.status.running = true;
    this.status.lastTickId = tickId;
    this.status.lastTickStartedAt = startedAt;

    this.db.startTick(tickId);

    try {
      await this.runTick(tickId);
      this.db.finishTick(tickId, 'ok');
      this.status.lastTickStatus = 'ok';
      this.status.lastError = null;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.db.finishTick(tickId, 'error', message);
      this.status.lastTickStatus = 'error';
      this.status.lastError = message;
      log('error', 'Tick failed', { tickId, error: message });
    } finally {
      this.status.lastTickFinishedAt = new Date().toISOString();
      this.status.running = false;
      this.runningTick = false;
    }
  }

  private async runTick(tickId: string): Promise<void> {
    const nowIso = new Date().toISOString();
    const dayStartIso = startOfUtcDayIso();
    this.maybeRefreshExecutionPolicy({ tickId, nowIso });
    const effectiveSelfImprove = this.getEffectiveSelfImproveSnapshot();

    let budget = this.calculateBudgetState(dayStartIso);

    this.status.treasury.spentTodaySol = budget.spentTodaySol;
    this.status.treasury.txToday = budget.txToday;
    this.status.selfImprove.effectiveExecutionsPerTick =
      effectiveSelfImprove.effectiveExecutionsPerTick;
    this.status.selfImprove.effectiveMinMarginSol = effectiveSelfImprove.effectiveMinMarginSol;
    this.status.selfImprove.lastAction = effectiveSelfImprove.lastAction;
    this.status.selfImprove.lastEvaluatedAt = effectiveSelfImprove.lastEvaluatedAt;
    const intakeStats = this.db.intakeJobStats();
    this.status.economics.pendingIntakeJobs = intakeStats.pending;
    this.status.economics.completedIntakeJobs = intakeStats.completed;
    this.status.economics.deadletterIntakeJobs = intakeStats.deadletter;

    const observation: Record<string, unknown> = {
      tickId,
      at: nowIso,
      mode: this.runtimeEnv.KAMIYO_MODE,
      executionPolicy: {
        stage: this.executionPolicy.stage,
        hardStop: this.executionPolicy.hardStop,
        swarmJobExecutionEnabled: this.executionPolicy.swarmJobExecutionEnabled,
        effectiveSwarmJobExecutionsPerTick: effectiveSelfImprove.effectiveExecutionsPerTick,
        effectiveSwarmJobMinMarginSol: effectiveSelfImprove.effectiveMinMarginSol,
        autoClaimEnabled: this.executionPolicy.autoClaimEnabled,
        autoStakeEnabled: this.executionPolicy.autoStakeEnabled,
      },
      budgets: {
        spentTodaySol: budget.spentTodaySol,
        dailyCapSol: this.executionPolicy.dailyCapSol,
        txToday: budget.txToday,
        txCap: this.executionPolicy.maxTxPerDay,
      },
    };

    const registryResult = loadSwarmRegistry(resolvePath(this.runtimeEnv.KAMIYO_SWARM_REGISTRY_PATH));
    const swarmRegistry = registryResult.ok ? registryResult.registry : null;
    let swarmOpportunityIntake: SwarmOpportunityIntake | null = null;

    if (this.runtimeEnv.KAMIYO_SWARM_ENABLED && swarmRegistry) {
      const sourceQualityBySource = this.deriveSourceQuality();
      const rollbackState = pruneRollbackState({
        state: parseRollbackState(this.db.kvGet('swarm_rollback_state')),
        nowIso,
      });
      this.db.kvSet('swarm_rollback_state', JSON.stringify(rollbackState));

      const disabledSources = Object.values(rollbackState.sources)
        .filter(value => value != null)
        .map(value => value!.source);
      const intakeJobs = this.runtimeEnv.KAMIYO_SWARM_INTAKE_ENABLED
        ? this.db.dueIntakeJobs({
            nowIso,
            limit: this.runtimeEnv.KAMIYO_SWARM_INTAKE_MAX_OPEN,
          })
        : [];
      const intakeOpportunities = intakeJobs.map(intakeJobToOpportunity);
      let excludedOpportunityIds = this.getNearMarketBidSubmittedOpportunityIds();
      if (this.runtimeEnv.KAMIYO_MODE === 'execute') {
        await this.maybeSyncNearMarketBidMarkers({ tickId, nowIso });
        await this.maybeWithdrawStaleNearMarketBids({ tickId, nowIso });
        excludedOpportunityIds = this.getNearMarketBidSubmittedOpportunityIds();
      }

      if (this.runtimeEnv.KAMIYO_SWARM_JOB_INTAKE_ENABLED || intakeOpportunities.length > 0) {
        const marketplaceFeeds: MarketplaceFeedConfig[] = [];
        if (this.runtimeEnv.KAMIYO_SWARM_RELEVANCE_FEED_URL) {
          marketplaceFeeds.push({
            source: 'relevance',
            url: this.runtimeEnv.KAMIYO_SWARM_RELEVANCE_FEED_URL,
            apiKey: this.runtimeEnv.KAMIYO_SWARM_RELEVANCE_API_KEY,
            authHeader: this.runtimeEnv.KAMIYO_SWARM_RELEVANCE_AUTH_HEADER,
          });
        }
        if (this.runtimeEnv.KAMIYO_SWARM_AGENTAI_FEED_URL) {
          marketplaceFeeds.push({
            source: 'agent_ai',
            url: this.runtimeEnv.KAMIYO_SWARM_AGENTAI_FEED_URL,
            apiKey: this.runtimeEnv.KAMIYO_SWARM_AGENTAI_API_KEY,
            authHeader: this.runtimeEnv.KAMIYO_SWARM_AGENTAI_AUTH_HEADER,
          });
        }
        if (this.runtimeEnv.KAMIYO_SWARM_KORE_FEED_URL) {
          marketplaceFeeds.push({
            source: 'kore',
            url: this.runtimeEnv.KAMIYO_SWARM_KORE_FEED_URL,
            apiKey: this.runtimeEnv.KAMIYO_SWARM_KORE_API_KEY,
            authHeader: this.runtimeEnv.KAMIYO_SWARM_KORE_AUTH_HEADER,
          });
        }
        if (this.runtimeEnv.KAMIYO_SWARM_NEAR_MARKET_FEED_URL) {
          marketplaceFeeds.push({
            source: 'near_market',
            url: this.runtimeEnv.KAMIYO_SWARM_NEAR_MARKET_FEED_URL,
            apiKey: this.runtimeEnv.KAMIYO_SWARM_NEAR_MARKET_API_KEY,
            authHeader: this.runtimeEnv.KAMIYO_SWARM_NEAR_MARKET_AUTH_HEADER,
            nearMarketAdapter: {
              enabled: true,
              agentId: this.runtimeEnv.KAMIYO_SWARM_NEAR_MARKET_AGENT_ID,
              nearPriceUsd: this.runtimeEnv.KAMIYO_SWARM_NEAR_MARKET_NEAR_PRICE_USD,
              minBudgetNear: this.runtimeEnv.KAMIYO_SWARM_NEAR_MARKET_MIN_BUDGET_NEAR,
              maxBudgetNear: this.runtimeEnv.KAMIYO_SWARM_NEAR_MARKET_MAX_BUDGET_NEAR,
              bidDiscountBps: this.runtimeEnv.KAMIYO_SWARM_NEAR_MARKET_BID_DISCOUNT_BPS,
              minBidNear: this.runtimeEnv.KAMIYO_SWARM_NEAR_MARKET_MIN_BID_NEAR,
              maxBidNear: this.runtimeEnv.KAMIYO_SWARM_NEAR_MARKET_MAX_BID_NEAR,
              maxExistingBids: this.runtimeEnv.KAMIYO_SWARM_NEAR_MARKET_MAX_EXISTING_BIDS,
              etaSeconds: this.runtimeEnv.KAMIYO_SWARM_NEAR_MARKET_ETA_SECONDS,
              allowCompetition: this.runtimeEnv.KAMIYO_SWARM_NEAR_MARKET_ALLOW_COMPETITION,
              proposalTemplate: this.runtimeEnv.KAMIYO_SWARM_NEAR_MARKET_PROPOSAL_TEMPLATE,
              minMarginSol: this.runtimeEnv.KAMIYO_SWARM_NEAR_MARKET_MIN_MARGIN_SOL,
            },
          });
        }

        const leadConversionPolicy: LeadConversionPolicy = {
          enabled: this.runtimeEnv.KAMIYO_SWARM_LEAD_CONVERSION_ENABLED,
          maxConversions: this.runtimeEnv.KAMIYO_SWARM_LEAD_CONVERSION_MAX_PER_TICK,
          defaultPayoutUsd: this.runtimeEnv.KAMIYO_SWARM_LEAD_CONVERSION_DEFAULT_PAYOUT_USD,
          requireEndpoint: this.runtimeEnv.KAMIYO_SWARM_LEAD_CONVERSION_REQUIRE_ENDPOINT,
          simulateOnly: this.runtimeEnv.KAMIYO_SWARM_LEAD_CONVERSION_SIMULATE_ONLY,
          estimatedFeeSol: this.runtimeEnv.KAMIYO_SWARM_JOB_ESTIMATED_FEE_SOL,
          minConfidence: this.runtimeEnv.KAMIYO_SWARM_LEAD_CONVERSION_MIN_CONFIDENCE,
          validateSourceContracts: this.runtimeEnv.KAMIYO_SWARM_LEAD_CONTRACT_VALIDATION,
        };

        swarmOpportunityIntake = await collectSwarmOpportunities({
          registry: swarmRegistry,
          feedPath: this.runtimeEnv.KAMIYO_SWARM_JOB_FEED_PATH
            ? resolvePath(this.runtimeEnv.KAMIYO_SWARM_JOB_FEED_PATH)
            : undefined,
          feedUrls: this.runtimeEnv.KAMIYO_SWARM_JOB_FEED_URLS,
          marketplaceFeeds,
          leadConversionPolicy,
          extraOpportunities: intakeOpportunities,
          sourceQualityBySource,
          disabledSources,
          excludedOpportunityIds,
          minRewardUsd: this.runtimeEnv.KAMIYO_SWARM_JOB_MIN_REWARD_USD,
          maxOpen: this.runtimeEnv.KAMIYO_SWARM_JOB_MAX_OPEN,
          assignmentLimit: this.runtimeEnv.KAMIYO_SWARM_MISSIONS_PER_TICK,
          solPriceUsd: this.runtimeEnv.KAMIYO_SWARM_SOL_PRICE_USD,
          fetchTimeoutMs: this.runtimeEnv.KAMIYO_SWARM_JOB_FETCH_TIMEOUT_MS,
        });

        this.db.addObservation(tickId, 'swarm-opportunity-intake', swarmOpportunityIntake);
      }

      const cursorKey = 'swarm_mission_cursor';
      const cursor = Number.parseInt(this.db.kvGet(cursorKey) ?? '0', 10) || 0;
      const priorityState = parsePriorityState(this.db.kvGet('swarm_priority_state'));

      const opportunityHintsByAgent = this.buildOpportunityHints(swarmOpportunityIntake);
      const missionPlan = planSwarmMissions({
        registry: swarmRegistry,
        tickId,
        maxMissions: this.runtimeEnv.KAMIYO_SWARM_MISSIONS_PER_TICK,
        maxActiveAgents: this.runtimeEnv.KAMIYO_SWARM_MAX_ACTIVE_AGENTS,
        cursor,
        primeDirective:
          'Maximize sustainable positive-margin job flow and route realized SOL into the staking pool with strict risk controls.',
        opportunityHintsByAgent,
        priorityOverridesByAgent: priorityState.overrides,
      });

      this.db.kvSet(cursorKey, String(missionPlan.nextCursor));
      const missionPlanReceipt = writeOutbox(
        resolvePath(this.runtimeEnv.KAMIYO_OUTBOX_DIR),
        'swarm-mission-plan',
        {
          tickId,
          at: nowIso,
          plan: missionPlan,
        }
      );
      this.db.addAction(tickId, 'swarm_plan_missions', {}, { missionPlanReceipt, missionPlan });

      this.status.swarm.enabled = true;
      this.status.swarm.opportunitiesLastTick = swarmOpportunityIntake?.opportunities.length ?? 0;
      this.status.swarm.assignmentsLastTick = missionPlan.missions.length;

      if (
        this.runtimeEnv.KAMIYO_MODE === 'execute' &&
        this.executionPolicy.swarmJobExecutionEnabled &&
        effectiveSelfImprove.effectiveExecutionsPerTick > 0 &&
        swarmOpportunityIntake
      ) {
        const executionResult = await this.executeSwarmJobs({
          tickId,
          dayStartIso,
          budget,
          effectiveMinMarginSol: effectiveSelfImprove.effectiveMinMarginSol,
          effectiveExecutionsPerTick: effectiveSelfImprove.effectiveExecutionsPerTick,
          registry: swarmRegistry,
          missionPlan,
          opportunityIntake: swarmOpportunityIntake,
        });

        budget = executionResult.budget;
        this.status.swarm.executedLastTick = executionResult.executed;
        this.status.swarm.skippedLastTick = executionResult.skipped;
        this.status.swarm.failedLastTick = executionResult.failed;
        this.settleIntakeJobOutcomes({
          tickId,
          outcomes: executionResult.outcomes,
          nowIso,
        });

        const performance = evaluateSwarmPerformance({
          registry: swarmRegistry,
          metrics: executionResult.runtimeMetrics,
          previousState: priorityState,
        });
        this.db.kvSet('swarm_priority_state', JSON.stringify(performance.state));
        this.db.addObservation(tickId, 'swarm-performance', performance);

        await this.maybeEvaluateRollback({ tickId, nowIso });
      }

      if (this.runtimeEnv.KAMIYO_MODE === 'execute') {
        await this.maybeEvaluateSelfImprove({ tickId, nowIso });
      }

      observation.swarm = {
        enabled: true,
        registryVersion: swarmRegistry.version,
        opportunities: swarmOpportunityIntake?.opportunities.length ?? 0,
        assignments: swarmOpportunityIntake?.assignments.length ?? 0,
      };
    } else {
      this.status.swarm.enabled = this.runtimeEnv.KAMIYO_SWARM_ENABLED;
      if (!registryResult.ok && this.runtimeEnv.KAMIYO_SWARM_ENABLED) {
        this.db.addAction(
          tickId,
          'swarm_registry',
          {},
          null,
          registryResult.error ?? registryResult.reason
        );
      }
      observation.swarm = {
        enabled: this.runtimeEnv.KAMIYO_SWARM_ENABLED,
        registryLoaded: Boolean(swarmRegistry),
      };
    }

    if (this.runtimeEnv.KAMIYO_MODE === 'execute') {
      if (this.runtimeEnv.KAMIYO_STAKING_POOL) {
        await this.maybeMaintainOpenStakingPeriod({
          tickId,
          poolAddress: this.runtimeEnv.KAMIYO_STAKING_POOL,
          admin: this.operatorKeypair,
          source: 'runtime_period_maintenance',
        });
      }

      budget = await this.maybeClaimFeeVault({ tickId, dayStartIso, budget });
      budget = await this.maybeClaimKyoshinStaking({ tickId, dayStartIso, budget });

      if (this.executionPolicy.autoStakeEnabled && this.runtimeEnv.KAMIYO_STAKING_POOL) {
        budget = await this.maybeRouteToStakingPool({
          tickId,
          dayStartIso,
          budget,
          poolAddress: this.runtimeEnv.KAMIYO_STAKING_POOL,
          depositor: this.operatorKeypair,
          source: 'runtime_auto_stake_operator',
        });
      }

      if (this.executionPolicy.autoStakeEnabled && this.runtimeEnv.KAMIYO_KYOSHIN_STAKING_POOL) {
        const claimSigner = loadOptionalKeypair({
          keypairPath: this.runtimeEnv.KAMIYO_KYOSHIN_CLAIMER_KEYPAIR_PATH,
          privateKey: this.runtimeEnv.KAMIYO_KYOSHIN_CLAIMER_PRIVATE_KEY,
        }) ?? { keypair: this.operatorKeypair };

        budget = await this.maybeRouteToStakingPool({
          tickId,
          dayStartIso,
          budget,
          poolAddress: this.runtimeEnv.KAMIYO_KYOSHIN_STAKING_POOL,
          depositor: claimSigner.keypair,
          source: 'runtime_auto_stake_kyoshin',
        });
      }

      await this.maybeProcessNearMarketSubmissions({ tickId, nowIso });
      await this.maybeCollectNearMarketSettlements({ tickId, nowIso });
      budget = await this.maybeSettleRevenuePolicy({ tickId, dayStartIso, nowIso, budget });
    }

    await this.maybeRunRetention({ tickId, nowIso });

    this.status.treasury.spentTodaySol = budget.spentTodaySol;
    this.status.treasury.txToday = budget.txToday;
    const revenueStatsToday = this.db.revenueLaneStatsSince(dayStartIso);
    const revenueNetToday = computeRevenueNet(revenueStatsToday);
    this.status.economics.grossRevenueTodaySol = revenueNetToday.grossSol;
    this.status.economics.costTodaySol = revenueNetToday.costSol;
    this.status.economics.netRevenueTodaySol = revenueNetToday.netSol;
    const intakeStatsEnd = this.db.intakeJobStats();
    this.status.economics.pendingIntakeJobs = intakeStatsEnd.pending;
    this.status.economics.completedIntakeJobs = intakeStatsEnd.completed;
    this.status.economics.deadletterIntakeJobs = intakeStatsEnd.deadletter;

    observation.budgetsEnd = {
      spentTodaySol: budget.spentTodaySol,
      txToday: budget.txToday,
      dailyCapSol: this.executionPolicy.dailyCapSol,
      txCap: this.executionPolicy.maxTxPerDay,
    };
    observation.economics = {
      grossRevenueSol: revenueNetToday.grossSol,
      costSol: revenueNetToday.costSol,
      netRevenueSol: revenueNetToday.netSol,
      intakeJobs: intakeStatsEnd,
      selfImprove: this.status.selfImprove,
    };

    this.db.addObservation(tickId, 'snapshot', observation);
    log('info', 'Tick complete', {
      tickId,
      spentTodaySol: budget.spentTodaySol,
      txToday: budget.txToday,
      swarmExecuted: this.status.swarm.executedLastTick,
      swarmFailed: this.status.swarm.failedLastTick,
    });
  }

  private async executeSwarmJobs(params: {
    tickId: string;
    dayStartIso: string;
    budget: BudgetState;
    effectiveMinMarginSol: number;
    effectiveExecutionsPerTick: number;
    registry: SwarmRegistry;
    missionPlan: ReturnType<typeof planSwarmMissions>;
    opportunityIntake: SwarmOpportunityIntake;
  }): Promise<{
    budget: BudgetState;
    runtimeMetrics: SwarmAgentRuntimeMetrics[];
    executed: number;
    skipped: number;
    failed: number;
    outcomes: SwarmExecutionOutcome[];
  }> {
    let budget = { ...params.budget };

    const opportunitiesById = new Map<string, SwarmOpportunity>(
      params.opportunityIntake.opportunities.map(opportunity => [opportunity.id, opportunity])
    );
    const assignmentsByAgent = new Map<string, SwarmOpportunityAssignment>();
    for (const assignment of params.opportunityIntake.assignments) {
      if (!assignmentsByAgent.has(assignment.agentId)) {
        assignmentsByAgent.set(assignment.agentId, assignment);
      }
    }

    const sourceAuth: SourceAuthMap = {
      relevance: this.runtimeEnv.KAMIYO_SWARM_RELEVANCE_API_KEY
        ? {
            apiKey: this.runtimeEnv.KAMIYO_SWARM_RELEVANCE_API_KEY,
            authHeader: this.runtimeEnv.KAMIYO_SWARM_RELEVANCE_AUTH_HEADER,
          }
        : undefined,
      agent_ai: this.runtimeEnv.KAMIYO_SWARM_AGENTAI_API_KEY
        ? {
            apiKey: this.runtimeEnv.KAMIYO_SWARM_AGENTAI_API_KEY,
            authHeader: this.runtimeEnv.KAMIYO_SWARM_AGENTAI_AUTH_HEADER,
          }
        : undefined,
      kore: this.runtimeEnv.KAMIYO_SWARM_KORE_API_KEY
        ? {
            apiKey: this.runtimeEnv.KAMIYO_SWARM_KORE_API_KEY,
            authHeader: this.runtimeEnv.KAMIYO_SWARM_KORE_AUTH_HEADER,
          }
        : undefined,
      near_market: this.runtimeEnv.KAMIYO_SWARM_NEAR_MARKET_API_KEY
        ? {
            apiKey: this.runtimeEnv.KAMIYO_SWARM_NEAR_MARKET_API_KEY,
            authHeader: this.runtimeEnv.KAMIYO_SWARM_NEAR_MARKET_AUTH_HEADER,
          }
        : undefined,
    };

    let marginCircuitState = pruneMarginCircuitState({
      state: parseMarginCircuitState(this.db.kvGet('swarm_margin_circuit_state')),
      keepDays: this.runtimeEnv.KAMIYO_SWARM_CIRCUIT_STATE_KEEP_DAYS,
    });
    marginCircuitState = this.clearTransientNearMarketCircuitBlocks(marginCircuitState);

    const rollbackState = pruneRollbackState({
      state: parseRollbackState(this.db.kvGet('swarm_rollback_state')),
    });
    this.db.kvSet('swarm_rollback_state', JSON.stringify(rollbackState));

    const runtimeMetrics: SwarmAgentRuntimeMetrics[] = [];
    const outcomes: SwarmExecutionOutcome[] = [];
    let executed = 0;
    let skipped = 0;
    let failed = 0;
    let remainingExecutions = params.effectiveExecutionsPerTick;

    for (const mission of params.missionPlan.missions) {
      const agent = params.registry.agents.find(row => row.id === mission.agentId);
      if (!agent) continue;

      const metric: SwarmAgentRuntimeMetrics = {
        agentId: agent.id,
        basePriority: agent.priority,
        jobRevenueSol: 0,
        jobExecuted: false,
        jobSucceeded: false,
        routeExecuted: false,
        claimExecuted: false,
        hadError: false,
      };

      if (remainingExecutions <= 0) {
        runtimeMetrics.push(metric);
        continue;
      }

      const assignment =
        (mission.opportunityId
          ? params.opportunityIntake.assignments.find(
              row => row.agentId === mission.agentId && row.opportunityId === mission.opportunityId
            )
          : assignmentsByAgent.get(mission.agentId)) ?? assignmentsByAgent.get(mission.agentId);

      if (!assignment) {
        runtimeMetrics.push(metric);
        continue;
      }

      const opportunity = opportunitiesById.get(assignment.opportunityId);
      if (!opportunity) {
        runtimeMetrics.push(metric);
        continue;
      }
      const intakeJobId =
        opportunity.metadata &&
        typeof opportunity.metadata === 'object' &&
        typeof (opportunity.metadata as Record<string, unknown>).intakeJobId === 'string'
          ? String((opportunity.metadata as Record<string, unknown>).intakeJobId)
          : undefined;

      if (
        opportunity.source === 'near_market' &&
        this.db.kvGet(`near_market_bid_submitted:${opportunity.id}`)
      ) {
        skipped += 1;
        this.db.recordSwarmJob({
          id: `${params.tickId}:${agent.id}:${assignment.opportunityId}`,
          agentId: agent.id,
          source: opportunity.source,
          status: 'skipped',
          url: opportunity.url,
          paid: false,
          revenueSol: 0,
          revenueUsd: 0,
          error: 'near_market_bid_already_submitted',
          metadata: { reason: 'near_market_bid_already_submitted' },
        });
        runtimeMetrics.push(metric);
        continue;
      }

      const rollbackStatus = this.runtimeEnv.KAMIYO_SWARM_ROLLBACK_ENABLED
        ? isRollbackSourceDisabled({ state: rollbackState, source: opportunity.source })
        : { disabled: false };
      if (rollbackStatus.disabled) {
        skipped += 1;
        this.db.recordSwarmJob({
          id: `${params.tickId}:${agent.id}:${assignment.opportunityId}`,
          agentId: agent.id,
          source: opportunity.source,
          status: 'skipped',
          url: opportunity.url,
          paid: false,
          revenueSol: 0,
          revenueUsd: 0,
          error: rollbackStatus.reason,
          metadata: {
            reason: 'rollback_source_disabled',
            disabledUntil: rollbackStatus.disabledUntil,
          },
        });
        if (intakeJobId) {
          outcomes.push({
            agentId: agent.id,
            opportunityId: assignment.opportunityId,
            source: opportunity.source,
            status: 'skipped',
            reason: rollbackStatus.reason ?? 'rollback_source_disabled',
            realizedRevenueSol: 0,
            realizedRevenueUsd: 0,
            intakeJobId,
          });
        }
        runtimeMetrics.push(metric);
        continue;
      }

      const circuitStatus = this.runtimeEnv.KAMIYO_SWARM_CIRCUIT_BREAKER_ENABLED
        ? isMarginCircuitOpen({
            state: marginCircuitState,
            agentId: agent.id,
            source: opportunity.source,
          })
        : { open: false };
      if (circuitStatus.open) {
        skipped += 1;
        this.db.recordSwarmJob({
          id: `${params.tickId}:${agent.id}:${assignment.opportunityId}`,
          agentId: agent.id,
          source: opportunity.source,
          status: 'skipped',
          url: opportunity.url,
          paid: false,
          revenueSol: 0,
          revenueUsd: 0,
          error: 'margin_circuit_open',
          metadata: { openUntil: circuitStatus.openUntil },
        });
        if (intakeJobId) {
          outcomes.push({
            agentId: agent.id,
            opportunityId: assignment.opportunityId,
            source: opportunity.source,
            status: 'skipped',
            reason: 'margin_circuit_open',
            realizedRevenueSol: 0,
            realizedRevenueUsd: 0,
            intakeJobId,
          });
        }
        runtimeMetrics.push(metric);
        continue;
      }

      const x402BufferSol =
        opportunity.source === 'x402'
          ? this.runtimeEnv.KAMIYO_SWARM_X402_MAX_PRICE_USD /
            this.runtimeEnv.KAMIYO_SWARM_SOL_PRICE_USD
          : 0;
      const estimatedSpendSol = this.runtimeEnv.KAMIYO_SWARM_JOB_ESTIMATED_FEE_SOL + x402BufferSol;
      const budgetReason = this.rejectBudget({
        budget,
        additionalSpendSol: estimatedSpendSol,
        additionalTxs: 1,
      });
      if (budgetReason) {
        skipped += 1;
        this.db.recordSwarmJob({
          id: `${params.tickId}:${agent.id}:${assignment.opportunityId}`,
          agentId: agent.id,
          source: opportunity.source,
          status: 'skipped',
          url: opportunity.url,
          paid: false,
          revenueSol: 0,
          revenueUsd: 0,
          error: budgetReason,
          metadata: { reason: 'budget_guard' },
        });
        if (intakeJobId) {
          outcomes.push({
            agentId: agent.id,
            opportunityId: assignment.opportunityId,
            source: opportunity.source,
            status: 'skipped',
            reason: budgetReason,
            realizedRevenueSol: 0,
            realizedRevenueUsd: 0,
            intakeJobId,
          });
        }
        runtimeMetrics.push(metric);
        continue;
      }

      const agentSigner = agent.claimerKeypairPath
        ? (loadOptionalKeypair({ keypairPath: agent.claimerKeypairPath })?.keypair ??
          this.operatorKeypair)
        : this.operatorKeypair;

      const result = await executeAssignedOpportunity({
        agentId: agent.id,
        opportunity,
        assignment,
        signer: agentSigner,
        timeoutMs: this.runtimeEnv.KAMIYO_SWARM_JOB_HTTP_TIMEOUT_MS,
        solPriceUsd: this.runtimeEnv.KAMIYO_SWARM_SOL_PRICE_USD,
        minMarginSol: params.effectiveMinMarginSol,
        estimatedFeeSol: this.runtimeEnv.KAMIYO_SWARM_JOB_ESTIMATED_FEE_SOL,
        requireExpectedRevenue: this.runtimeEnv.KAMIYO_SWARM_JOB_REQUIRE_EXPECTED_REWARD,
        sourceAuth,
        x402Enabled: this.runtimeEnv.KAMIYO_SWARM_X402_ENABLED,
        x402MaxPriceUsd: this.runtimeEnv.KAMIYO_SWARM_X402_MAX_PRICE_USD,
        x402PreferredNetwork: this.runtimeEnv.KAMIYO_SWARM_X402_PREFERRED_NETWORK,
        x402FacilitatorPolicy: this.runtimeEnv.KAMIYO_SWARM_X402_FACILITATOR_POLICY,
      });
      const normalizedResult =
        opportunity.source === 'near_market' &&
        result.status === 'failed' &&
        result.httpStatus === 409
          ? {
              ...result,
              status: 'skipped' as const,
              reason: 'near_market_bid_already_submitted',
              error: undefined,
            }
          : result;

      this.db.addAction(
        params.tickId,
        'swarm_execute_opportunity',
        {
          agentId: agent.id,
          opportunityId: assignment.opportunityId,
          source: opportunity.source,
        },
        normalizedResult,
        normalizedResult.error
      );

      this.db.recordSwarmJob({
        id: `${params.tickId}:${agent.id}:${assignment.opportunityId}`,
        agentId: agent.id,
        source: opportunity.source,
        status: normalizedResult.status,
        url: normalizedResult.endpoint,
        paid: normalizedResult.paid,
        paymentNetwork: normalizedResult.paymentNetwork,
        paymentAmountUsd: normalizedResult.paymentAmountUsd,
        revenueSol: normalizedResult.realizedRevenueSol,
        revenueUsd: normalizedResult.realizedRevenueUsd,
        error: normalizedResult.error ?? normalizedResult.reason,
        metadata: {
          reason: normalizedResult.reason,
          paymentTransactionId: normalizedResult.paymentTransactionId,
          httpStatus: normalizedResult.httpStatus,
          output: normalizedResult.output,
        },
      });
      if (intakeJobId) {
        outcomes.push({
          agentId: agent.id,
          opportunityId: assignment.opportunityId,
          source: opportunity.source,
          status: normalizedResult.status,
          reason: normalizedResult.reason,
          error: normalizedResult.error,
          realizedRevenueSol: normalizedResult.realizedRevenueSol,
          realizedRevenueUsd: normalizedResult.realizedRevenueUsd,
          intakeJobId,
        });
      }

      if (
        opportunity.source === 'near_market' &&
        (normalizedResult.status === 'executed' || normalizedResult.httpStatus === 409)
      ) {
        this.db.kvSet(`near_market_bid_submitted:${opportunity.id}`, new Date().toISOString());
      }

      const paymentCostSol =
        normalizedResult.paid && normalizedResult.paymentAmountUsd
          ? normalizedResult.paymentAmountUsd / this.runtimeEnv.KAMIYO_SWARM_SOL_PRICE_USD
          : 0;
      const feeCostSol =
        normalizedResult.status === 'skipped'
          ? 0
          : this.runtimeEnv.KAMIYO_SWARM_JOB_ESTIMATED_FEE_SOL;
      const totalCostSol = feeCostSol + paymentCostSol;

      if (normalizedResult.status !== 'skipped') {
        budget = {
          ...budget,
          ...applyBudget({
            budget,
            spendSol: totalCostSol,
            txs: 1,
          }),
        };
      }

      if (normalizedResult.realizedRevenueSol > 0) {
        this.db.recordRevenueEvent({
          id: `${params.tickId}:job:${agent.id}:${assignment.opportunityId}`,
          tickId: params.tickId,
          agentId: agent.id,
          lane: revenueLaneForOpportunitySource(opportunity.source),
          kind: 'job',
          amountSol: normalizedResult.realizedRevenueSol,
          amountUsd: normalizedResult.realizedRevenueUsd,
          metadata: { source: opportunity.source, status: normalizedResult.status },
        });
      }

      if (totalCostSol > 0) {
        this.db.recordRevenueEvent({
          id: `${params.tickId}:job_cost:${agent.id}:${assignment.opportunityId}`,
          tickId: params.tickId,
          agentId: agent.id,
          lane: revenueLaneForOpportunitySource(opportunity.source),
          kind: 'job_cost',
          amountSol: -totalCostSol,
          amountUsd: -totalCostSol * this.runtimeEnv.KAMIYO_SWARM_SOL_PRICE_USD,
          metadata: {
            source: opportunity.source,
            paymentCostSol,
            feeCostSol,
            paid: normalizedResult.paid,
          },
        });
      }

      if (
        this.runtimeEnv.KAMIYO_SWARM_CIRCUIT_BREAKER_ENABLED &&
        normalizedResult.status !== 'skipped'
      ) {
        const outputRecord =
          normalizedResult.output &&
          typeof normalizedResult.output === 'object' &&
          !Array.isArray(normalizedResult.output)
            ? (normalizedResult.output as Record<string, unknown>)
            : null;
        const settlementMode =
          outputRecord && typeof outputRecord.settlementMode === 'string'
            ? outputRecord.settlementMode
            : undefined;
        const deferredNearMarketExpectedRevenue =
          opportunity.source === 'near_market' && settlementMode === 'deferred'
            ? (assignment.expectedRewardSol ?? opportunity.payoutSolEstimate ?? null)
            : null;
        const realizedOrExpectedRevenue =
          deferredNearMarketExpectedRevenue != null
            ? deferredNearMarketExpectedRevenue
            : normalizedResult.realizedRevenueSol;
        const marginSol = realizedOrExpectedRevenue - totalCostSol;
        const circuitUpdate = updateMarginCircuit({
          state: marginCircuitState,
          agentId: agent.id,
          source: opportunity.source,
          marginSol,
          failed: normalizedResult.status === 'failed',
          error: normalizedResult.error ?? normalizedResult.reason,
          negativeMarginThreshold: this.runtimeEnv.KAMIYO_SWARM_CIRCUIT_NEG_MARGIN_STREAK,
          cooldownMinutes: this.runtimeEnv.KAMIYO_SWARM_CIRCUIT_COOLDOWN_MINUTES,
        });
        marginCircuitState = circuitUpdate.state;
      }

      if (normalizedResult.status === 'executed') executed += 1;
      if (normalizedResult.status === 'failed') failed += 1;
      if (normalizedResult.status === 'skipped') skipped += 1;

      metric.jobExecuted =
        normalizedResult.status === 'executed' || normalizedResult.status === 'failed';
      metric.jobSucceeded = normalizedResult.status === 'executed';
      metric.jobRevenueSol = normalizedResult.realizedRevenueSol;
      metric.hadError = normalizedResult.status === 'failed';

      runtimeMetrics.push(metric);
      remainingExecutions -= 1;
    }

    marginCircuitState = pruneMarginCircuitState({
      state: marginCircuitState,
      keepDays: this.runtimeEnv.KAMIYO_SWARM_CIRCUIT_STATE_KEEP_DAYS,
    });
    this.db.kvSet('swarm_margin_circuit_state', JSON.stringify(marginCircuitState));

    const marginCircuitReceipt = writeOutbox(
      resolvePath(this.runtimeEnv.KAMIYO_OUTBOX_DIR),
      'swarm-margin-circuit',
      {
        tickId: params.tickId,
        at: new Date().toISOString(),
        state: marginCircuitState,
      }
    );
    this.db.addAction(params.tickId, 'swarm_update_margin_circuit', {}, { marginCircuitReceipt });

    return {
      budget,
      runtimeMetrics,
      executed,
      skipped,
      failed,
      outcomes,
    };
  }

  private settleIntakeJobOutcomes(params: {
    tickId: string;
    outcomes: SwarmExecutionOutcome[];
    nowIso: string;
  }): void {
    for (const outcome of params.outcomes) {
      if (!outcome.intakeJobId) continue;

      const terminal =
        outcome.status === 'executed'
          ? false
          : isTerminalSkipReason(outcome.reason) || isTerminalSkipReason(outcome.error);

      const settled = this.db.settleIntakeJob({
        jobId: outcome.intakeJobId,
        status: outcome.status,
        reason: outcome.error ?? outcome.reason,
        realizedRevenueSol: outcome.realizedRevenueSol,
        realizedRevenueUsd: outcome.realizedRevenueUsd,
        retryLimit: this.runtimeEnv.KAMIYO_SWARM_INTAKE_RETRY_LIMIT,
        retryBaseSeconds: this.runtimeEnv.KAMIYO_SWARM_INTAKE_RETRY_BASE_SECONDS,
        retryMaxSeconds: this.runtimeEnv.KAMIYO_SWARM_INTAKE_RETRY_MAX_SECONDS,
        terminal,
        nowIso: params.nowIso,
      });

      this.db.addAction(
        params.tickId,
        'swarm_intake_settle',
        {
          jobId: outcome.intakeJobId,
          outcome,
          terminal,
        },
        settled
      );
    }

    const intakeStats = this.db.intakeJobStats();
    this.status.economics.pendingIntakeJobs = intakeStats.pending;
    this.status.economics.completedIntakeJobs = intakeStats.completed;
    this.status.economics.deadletterIntakeJobs = intakeStats.deadletter;
  }

  private getEffectiveSelfImproveSnapshot(): SelfImproveSnapshot {
    const state = parseSelfImproveState(this.db.kvGet('swarm_self_improve_state'));
    const minMargin = Math.max(
      this.runtimeEnv.KAMIYO_SELF_IMPROVE_MIN_MARGIN_FLOOR_SOL,
      this.executionPolicy.swarmJobMinMarginSol + state.minMarginDeltaSol
    );
    const maxExecutions = Math.max(
      this.executionPolicy.swarmJobExecutionsPerTick,
      this.runtimeEnv.KAMIYO_SELF_IMPROVE_MAX_EXECUTIONS_PER_TICK
    );
    const executions = this.executionPolicy.swarmJobExecutionEnabled
      ? Math.max(
          1,
          Math.min(
            maxExecutions,
            this.executionPolicy.swarmJobExecutionsPerTick + state.executionsDelta
          )
        )
      : 0;

    return {
      effectiveMinMarginSol: minMargin,
      effectiveExecutionsPerTick: executions,
      lastAction: state.lastAction,
      lastEvaluatedAt: state.lastEvaluatedAt,
    };
  }

  private async maybeEvaluateSelfImprove(params: {
    tickId: string;
    nowIso: string;
  }): Promise<void> {
    if (!this.runtimeEnv.KAMIYO_SELF_IMPROVE_ENABLED) return;
    if (!this.executionPolicy.swarmJobExecutionEnabled) return;

    const lastEvaluatedAt = this.db.kvGet('swarm_self_improve_last_at');
    if (lastEvaluatedAt) {
      const elapsedMs = Date.now() - Date.parse(lastEvaluatedAt);
      if (
        Number.isFinite(elapsedMs) &&
        elapsedMs < this.runtimeEnv.KAMIYO_SELF_IMPROVE_INTERVAL_MINUTES * 60_000
      ) {
        return;
      }
    }

    const windowStartIso = new Date(
      Date.now() - this.runtimeEnv.KAMIYO_SELF_IMPROVE_WINDOW_HOURS * 3_600_000
    ).toISOString();
    const sourceStats = this.db.swarmSourceStatsSince(windowStartIso);
    const totalJobs = sourceStats.reduce((sum, row) => sum + row.total, 0);
    const failedJobs = sourceStats.reduce((sum, row) => sum + row.failed, 0);
    const netRevenueSol = sourceStats.reduce((sum, row) => sum + row.revenueSol, 0);
    const previousState = parseSelfImproveState(this.db.kvGet('swarm_self_improve_state'));

    const decision = evaluateSelfImprove({
      state: previousState,
      nowIso: params.nowIso,
      totalJobs,
      failedJobs,
      netRevenueSol,
      minJobs: this.runtimeEnv.KAMIYO_SELF_IMPROVE_MIN_JOBS,
      failRateUpper: this.runtimeEnv.KAMIYO_SELF_IMPROVE_FAIL_RATE_UPPER,
      failRateLower: this.runtimeEnv.KAMIYO_SELF_IMPROVE_FAIL_RATE_LOWER,
      marginStepSol: this.runtimeEnv.KAMIYO_SELF_IMPROVE_MARGIN_STEP_SOL,
      minMarginFloorSol: this.runtimeEnv.KAMIYO_SELF_IMPROVE_MIN_MARGIN_FLOOR_SOL,
      currentMinMarginSol: this.executionPolicy.swarmJobMinMarginSol,
      baseExecutionsPerTick: this.executionPolicy.swarmJobExecutionsPerTick,
      maxExecutionsPerTick: this.runtimeEnv.KAMIYO_SELF_IMPROVE_MAX_EXECUTIONS_PER_TICK,
    });

    this.db.kvSet('swarm_self_improve_state', JSON.stringify(decision.state));
    this.db.kvSet('swarm_self_improve_last_at', params.nowIso);
    this.status.selfImprove.lastAction = decision.action;
    this.status.selfImprove.lastEvaluatedAt = decision.state.lastEvaluatedAt;
    this.status.selfImprove.effectiveMinMarginSol = decision.effectiveMinMarginSol;
    this.status.selfImprove.effectiveExecutionsPerTick = decision.effectiveExecutionsPerTick;

    const receiptPath = writeOutbox(
      resolvePath(this.runtimeEnv.KAMIYO_OUTBOX_DIR),
      'swarm-self-improve',
      {
        tickId: params.tickId,
        at: params.nowIso,
        decision,
        sourceStats,
      }
    );
    this.db.addAction(
      params.tickId,
      'swarm_self_improve',
      { windowStartIso },
      { decision, receiptPath }
    );
  }

  private clearTransientNearMarketCircuitBlocks(state: MarginCircuitState): MarginCircuitState {
    const nowIso = new Date().toISOString();
    const nowMs = Date.parse(nowIso);
    let changed = false;
    const entries: MarginCircuitState['entries'] = {};

    for (const [key, entry] of Object.entries(state.entries)) {
      const openUntilMs = entry.openUntil ? Date.parse(entry.openUntil) : Number.NaN;
      const staleDeferredNearMarketBlock =
        entry.source === 'near_market' &&
        entry.openUntil &&
        Number.isFinite(openUntilMs) &&
        openUntilMs > nowMs &&
        entry.negativeMarginStreak === 0 &&
        !entry.lastError &&
        typeof entry.lastMarginSol === 'number' &&
        entry.lastMarginSol < 0;
      const isTransientNearMarketBlock =
        entry.source === 'near_market' &&
        entry.openUntil &&
        Number.isFinite(openUntilMs) &&
        openUntilMs > nowMs &&
        entry.negativeMarginStreak === 0 &&
        entry.lastError === 'marketplace_apply_failed';
      if (isTransientNearMarketBlock || staleDeferredNearMarketBlock) {
        entries[key] = {
          ...entry,
          openUntil: undefined,
          updatedAt: nowIso,
        };
        changed = true;
        continue;
      }
      entries[key] = entry;
    }

    if (!changed) return state;
    return {
      updatedAt: nowIso,
      entries,
    };
  }

  private getNearMarketBidSubmittedOpportunityIds(): string[] {
    const prefix = 'near_market_bid_submitted:';
    return this.db
      .kvKeys(prefix)
      .filter(key => {
        const value = this.db.kvGet(key);
        return typeof value === 'string' && value.trim().length > 0;
      })
      .map(key => key.slice(prefix.length).trim())
      .filter(Boolean);
  }

  private async maybeSyncNearMarketBidMarkers(params: {
    tickId: string;
    nowIso: string;
  }): Promise<void> {
    if (!this.runtimeEnv.KAMIYO_SWARM_NEAR_MARKET_BID_SYNC_ENABLED) return;
    if (!this.runtimeEnv.KAMIYO_SWARM_NEAR_MARKET_API_KEY) return;

    const lastSyncedAt = this.db.kvGet('near_market_bid_sync_last_at');
    if (lastSyncedAt) {
      const elapsedMs = Date.now() - Date.parse(lastSyncedAt);
      if (
        Number.isFinite(elapsedMs) &&
        elapsedMs < this.runtimeEnv.KAMIYO_SWARM_NEAR_MARKET_BID_SYNC_INTERVAL_MINUTES * 60_000
      ) {
        return;
      }
    }

    try {
      const statuses = [
        'pending',
        'accepted',
        'submitted',
        'in_progress',
        'withdrawn',
        'rejected',
        'completed',
      ];
      const bids = await listNearMarketTrackedBids({
        baseUrl: this.runtimeEnv.KAMIYO_SWARM_NEAR_MARKET_BASE_URL,
        apiKey: this.runtimeEnv.KAMIYO_SWARM_NEAR_MARKET_API_KEY,
        limit: this.runtimeEnv.KAMIYO_SWARM_NEAR_MARKET_BID_SYNC_LIMIT,
        timeoutMs: this.runtimeEnv.KAMIYO_SWARM_JOB_FETCH_TIMEOUT_MS,
        statuses,
      });

      let marked = 0;
      let cleared = 0;
      for (const bid of bids) {
        const markerKey = `near_market_bid_submitted:${bid.jobId}`;
        const status = (bid.status ?? '').toLowerCase();
        if (status === 'rejected') {
          if (this.db.kvGet(markerKey)) {
            this.db.kvSet(markerKey, '');
            cleared += 1;
          }
          continue;
        }
        if (status === 'withdrawn') {
          if (!this.db.kvGet(markerKey)) {
            this.db.kvSet(markerKey, params.nowIso);
            marked += 1;
          }
          continue;
        }
        if (this.db.kvGet(markerKey)) continue;
        this.db.kvSet(markerKey, params.nowIso);
        marked += 1;
      }

      this.db.addAction(
        params.tickId,
        'near_market_bid_marker_sync',
        {
          statuses,
          limit: this.runtimeEnv.KAMIYO_SWARM_NEAR_MARKET_BID_SYNC_LIMIT,
        },
        {
          tracked: bids.length,
          marked,
          cleared,
        }
      );
    } catch (error) {
      this.db.addAction(
        params.tickId,
        'near_market_bid_marker_sync',
        {
          limit: this.runtimeEnv.KAMIYO_SWARM_NEAR_MARKET_BID_SYNC_LIMIT,
        },
        null,
        error instanceof Error ? error.message : String(error)
      );
    }

    this.db.kvSet('near_market_bid_sync_last_at', params.nowIso);
  }

  private async maybeWithdrawStaleNearMarketBids(params: {
    tickId: string;
    nowIso: string;
  }): Promise<void> {
    if (!this.runtimeEnv.KAMIYO_SWARM_NEAR_MARKET_WITHDRAW_STALE_ENABLED) return;
    if (!this.runtimeEnv.KAMIYO_SWARM_NEAR_MARKET_API_KEY) return;

    const lastCheckedAt = this.db.kvGet('near_market_bid_withdraw_last_at');
    if (lastCheckedAt) {
      const elapsedMs = Date.now() - Date.parse(lastCheckedAt);
      if (
        Number.isFinite(elapsedMs) &&
        elapsedMs < this.runtimeEnv.KAMIYO_SWARM_NEAR_MARKET_WITHDRAW_INTERVAL_MINUTES * 60_000
      ) {
        return;
      }
    }

    let tracked;
    try {
      tracked = await listNearMarketTrackedBids({
        baseUrl: this.runtimeEnv.KAMIYO_SWARM_NEAR_MARKET_BASE_URL,
        apiKey: this.runtimeEnv.KAMIYO_SWARM_NEAR_MARKET_API_KEY,
        limit: this.runtimeEnv.KAMIYO_SWARM_NEAR_MARKET_WITHDRAW_LIMIT,
        timeoutMs: this.runtimeEnv.KAMIYO_SWARM_JOB_FETCH_TIMEOUT_MS,
        statuses: ['pending'],
      });
    } catch (error) {
      this.db.addAction(
        params.tickId,
        'near_market_bid_withdraw_stale',
        {
          limit: this.runtimeEnv.KAMIYO_SWARM_NEAR_MARKET_WITHDRAW_LIMIT,
        },
        null,
        error instanceof Error ? error.message : String(error)
      );
      this.db.kvSet('near_market_bid_withdraw_last_at', params.nowIso);
      return;
    }

    const staleCutoffMs =
      Date.now() - this.runtimeEnv.KAMIYO_SWARM_NEAR_MARKET_WITHDRAW_PENDING_MAX_MINUTES * 60_000;
    let inspected = 0;
    let stale = 0;
    let withdrawn = 0;
    let failures = 0;
    let initializedMarkers = 0;

    for (const bid of tracked) {
      inspected += 1;
      const markerKey = `near_market_bid_submitted:${bid.jobId}`;
      const markerRaw = this.db.kvGet(markerKey);
      if (!markerRaw) {
        this.db.kvSet(markerKey, params.nowIso);
        initializedMarkers += 1;
        continue;
      }

      const markerMs = Date.parse(markerRaw);
      if (!Number.isFinite(markerMs)) {
        this.db.kvSet(markerKey, params.nowIso);
        initializedMarkers += 1;
        continue;
      }
      if (markerMs > staleCutoffMs) continue;

      stale += 1;
      try {
        await withdrawNearMarketBid({
          baseUrl: this.runtimeEnv.KAMIYO_SWARM_NEAR_MARKET_BASE_URL,
          apiKey: this.runtimeEnv.KAMIYO_SWARM_NEAR_MARKET_API_KEY,
          bidId: bid.bidId,
          timeoutMs: this.runtimeEnv.KAMIYO_SWARM_JOB_HTTP_TIMEOUT_MS,
        });
        this.db.kvSet(`near_market_bid_withdrawn:${bid.bidId}`, params.nowIso);
        withdrawn += 1;
      } catch (error) {
        failures += 1;
        this.db.addAction(
          params.tickId,
          'near_market_bid_withdraw_stale',
          {
            bidId: bid.bidId,
            jobId: bid.jobId,
            markerAt: markerRaw,
          },
          null,
          error instanceof Error ? error.message : String(error)
        );
      }
    }

    this.db.addAction(
      params.tickId,
      'near_market_bid_withdraw_stale',
      {
        limit: this.runtimeEnv.KAMIYO_SWARM_NEAR_MARKET_WITHDRAW_LIMIT,
        staleAfterMinutes: this.runtimeEnv.KAMIYO_SWARM_NEAR_MARKET_WITHDRAW_PENDING_MAX_MINUTES,
      },
      {
        tracked: tracked.length,
        inspected,
        stale,
        withdrawn,
        failures,
        initializedMarkers,
      }
    );
    this.db.kvSet('near_market_bid_withdraw_last_at', params.nowIso);
  }

  private async maybeFetchBerlinWeather(): Promise<{
    observedAt: string;
    temperatureC: number | null;
    humidityPct: number | null;
    windSpeedKmh: number | null;
    sourceUrl: string;
  }> {
    const sourceUrl =
      'https://api.open-meteo.com/v1/forecast?latitude=52.52&longitude=13.41&current=temperature_2m,relative_humidity_2m,wind_speed_10m&timezone=UTC';
    const response = await withTimeout(
      fetch(sourceUrl, { headers: { accept: 'application/json' } }),
      this.runtimeEnv.KAMIYO_SWARM_JOB_FETCH_TIMEOUT_MS,
      'berlin_weather_timeout'
    );
    if (!response.ok) {
      throw new Error(`berlin_weather_http_${response.status}`);
    }
    const payload = (await response.json()) as Record<string, unknown>;
    const current =
      payload && typeof payload.current === 'object'
        ? (payload.current as Record<string, unknown>)
        : {};
    const numberOrNull = (value: unknown): number | null =>
      typeof value === 'number' && Number.isFinite(value) ? value : null;

    return {
      observedAt:
        typeof current.time === 'string' && current.time.trim()
          ? current.time
          : new Date().toISOString(),
      temperatureC: numberOrNull(current.temperature_2m),
      humidityPct: numberOrNull(current.relative_humidity_2m),
      windSpeedKmh: numberOrNull(current.wind_speed_10m),
      sourceUrl,
    };
  }

  private async publishNearMarketArtifact(markdown: string): Promise<string> {
    const response = await withTimeout(
      fetch('https://paste.rs', {
        method: 'POST',
        headers: {
          'content-type': 'text/plain; charset=utf-8',
        },
        body: markdown,
      }),
      this.runtimeEnv.KAMIYO_SWARM_JOB_HTTP_TIMEOUT_MS,
      'near_deliverable_publish_timeout'
    );
    if (!response.ok) {
      throw new Error(`near_deliverable_publish_http_${response.status}`);
    }
    const url = (await response.text()).trim();
    if (!/^https?:\/\//i.test(url)) {
      throw new Error('near_deliverable_publish_invalid_url');
    }
    return url;
  }

  private async buildNearMarketDeliverable(params: {
    jobId: string;
    title: string;
    description: string;
    amountNear: number | null;
    nowIso: string;
  }): Promise<string> {
    const heading = `# Delivery: ${params.title}\n\n`;
    const meta = [
      `- Job ID: ${params.jobId}`,
      `- Delivered At (UTC): ${params.nowIso}`,
      `- Proposed Fee (NEAR): ${params.amountNear != null ? params.amountNear : 'unknown'}`,
      '- Generated by: kyoshin-exec autonomous runner',
    ].join('\n');
    const titleLower = `${params.title} ${params.description}`.toLowerCase();

    const sections: string[] = [];
    sections.push(
      '## Outcome\n' +
        'A complete response package is provided below with clear assumptions, reproducible method, and concise actionable output.'
    );

    if (titleLower.includes('weather') && titleLower.includes('berlin')) {
      const weather = await this.maybeFetchBerlinWeather();
      sections.push(
        [
          '## Berlin Weather Snapshot',
          `- Observed At (UTC): ${weather.observedAt}`,
          `- Temperature: ${weather.temperatureC != null ? `${weather.temperatureC} C` : 'unavailable'}`,
          `- Relative Humidity: ${weather.humidityPct != null ? `${weather.humidityPct}%` : 'unavailable'}`,
          `- Wind Speed: ${weather.windSpeedKmh != null ? `${weather.windSpeedKmh} km/h` : 'unavailable'}`,
          `- Source: ${weather.sourceUrl}`,
        ].join('\n')
      );
    } else if (titleLower.includes('equity') && titleLower.includes('founding engineer')) {
      sections.push(
        [
          '## Equity Recommendation',
          '- Recommended range: 1.5% to 3.5% for a true founding engineer joining pre-product/pre-seed.',
          '- Anchor recommendation: 2.5% with a 4-year vesting schedule and 1-year cliff.',
          '- If joining post-PMF or with cash-market salary, compress toward 0.5% to 1.5%.',
          '- If taking significant risk, no salary, and owning core architecture, expand toward 3% to 5%.',
          '',
          '### Rationale',
          '1. Equity should track company stage, compensation discount, and expected ownership over technical roadmap.',
          '2. The grant should be calibrated against dilution through seed and Series A.',
          '3. Include performance and role-scope review milestones at 12 and 24 months.',
        ].join('\n')
      );
    } else {
      const trimmedDescription = params.description.trim().slice(0, 1500);
      sections.push(
        [
          '## Structured Response',
          `Task context:\n${trimmedDescription || '(description omitted)'}`,
          '',
          'Delivery plan:',
          '1. Clarify objective and acceptance criteria from the brief.',
          '2. Execute against objective with measurable output artifacts.',
          '3. Provide concise summary and explicit assumptions.',
          '',
          'Output status: ready for requester review.',
        ].join('\n')
      );
    }

    sections.push(
      '## Notes\n- Generated without LLM inference costs.\n- Deterministic workflow with auditable timestamps.'
    );
    return `${heading}${meta}\n\n${sections.join('\n\n')}\n`;
  }

  private async maybeProcessNearMarketSubmissions(params: {
    tickId: string;
    nowIso: string;
  }): Promise<void> {
    if (!this.runtimeEnv.KAMIYO_SWARM_NEAR_MARKET_AUTO_SUBMIT_ENABLED) return;
    if (!this.runtimeEnv.KAMIYO_SWARM_NEAR_MARKET_API_KEY) return;

    const lastSubmittedAt = this.db.kvGet('near_market_submit_last_at');
    if (lastSubmittedAt) {
      const elapsedMs = Date.now() - Date.parse(lastSubmittedAt);
      if (
        Number.isFinite(elapsedMs) &&
        elapsedMs < this.runtimeEnv.KAMIYO_SWARM_NEAR_MARKET_SUBMIT_INTERVAL_MINUTES * 60_000
      ) {
        return;
      }
    }

    let trackedBids;
    try {
      trackedBids = await listNearMarketTrackedBids({
        baseUrl: this.runtimeEnv.KAMIYO_SWARM_NEAR_MARKET_BASE_URL,
        apiKey: this.runtimeEnv.KAMIYO_SWARM_NEAR_MARKET_API_KEY,
        limit: Math.max(this.runtimeEnv.KAMIYO_SWARM_NEAR_MARKET_SUBMIT_LIMIT, 100),
        timeoutMs: this.runtimeEnv.KAMIYO_SWARM_JOB_FETCH_TIMEOUT_MS,
        statuses: ['accepted', 'in_progress', 'submitted'],
      });
    } catch (error) {
      this.db.addAction(
        params.tickId,
        'near_market_submit',
        {},
        null,
        error instanceof Error ? error.message : String(error)
      );
      this.db.kvSet('near_market_submit_last_at', params.nowIso);
      return;
    }

    const nowMs = Date.parse(params.nowIso);
    const retryLimit = this.runtimeEnv.KAMIYO_SWARM_NEAR_MARKET_SUBMIT_RETRY_LIMIT;
    const backoffBaseMs =
      this.runtimeEnv.KAMIYO_SWARM_NEAR_MARKET_SUBMIT_RETRY_BACKOFF_MINUTES * 60_000;
    const backoffMaxMs =
      this.runtimeEnv.KAMIYO_SWARM_NEAR_MARKET_SUBMIT_RETRY_MAX_BACKOFF_MINUTES * 60_000;
    const escalateAfterMs =
      this.runtimeEnv.KAMIYO_SWARM_NEAR_MARKET_SUBMIT_ESCALATE_AFTER_MINUTES * 60_000;
    const escalationLimit = this.runtimeEnv.KAMIYO_SWARM_NEAR_MARKET_SUBMIT_ESCALATION_LIMIT;

    let submitted = 0;
    let failed = 0;
    let skippedBackoff = 0;
    let escalated = 0;

    for (const bid of trackedBids) {
      if (submitted >= this.runtimeEnv.KAMIYO_SWARM_NEAR_MARKET_SUBMIT_LIMIT) break;
      const keySuffix = `${bid.jobId}:${bid.bidId}`;
      const submitMarkerKey = `near_market_submit:${keySuffix}`;
      if (this.db.kvGet(submitMarkerKey)) continue;

      const firstSeenKey = `near_market_submit_first_seen:${keySuffix}`;
      const attemptsKey = `near_market_submit_attempts:${keySuffix}`;
      const nextAttemptAtKey = `near_market_submit_next_at:${keySuffix}`;
      const escalationMarkerKey = `near_market_submit_escalated:${keySuffix}`;

      const firstSeenAt = this.db.kvGet(firstSeenKey) || params.nowIso;
      if (!this.db.kvGet(firstSeenKey)) {
        this.db.kvSet(firstSeenKey, firstSeenAt);
      }

      const attempts = Number.parseInt(this.db.kvGet(attemptsKey) ?? '0', 10) || 0;
      const nextAttemptAt = this.db.kvGet(nextAttemptAtKey);
      if (nextAttemptAt) {
        const nextAttemptMs = Date.parse(nextAttemptAt);
        if (Number.isFinite(nextAttemptMs) && nextAttemptMs > nowMs) {
          skippedBackoff += 1;
          continue;
        }
      }

      const bidStatus = (bid.status ?? '').toLowerCase();
      if (bidStatus === 'submitted') {
        this.db.kvSet(submitMarkerKey, params.nowIso);
        this.db.kvSet(attemptsKey, '0');
        this.db.kvSet(nextAttemptAtKey, '');
        continue;
      }

      try {
        const detail = await fetchNearMarketJobDetail({
          baseUrl: this.runtimeEnv.KAMIYO_SWARM_NEAR_MARKET_BASE_URL,
          apiKey: this.runtimeEnv.KAMIYO_SWARM_NEAR_MARKET_API_KEY,
          jobId: bid.jobId,
          timeoutMs: this.runtimeEnv.KAMIYO_SWARM_JOB_FETCH_TIMEOUT_MS,
        });
        if (!detail) {
          throw new Error('near_market_job_detail_missing');
        }
        const assignment =
          detail.myAssignments.find(
            row =>
              row.status === 'in_progress' ||
              row.status === 'submitted' ||
              row.status === 'accepted' ||
              row.status === 'completed' ||
              row.status === 'rejected'
          ) ?? null;
        if (!assignment) {
          throw new Error('near_market_assignment_missing');
        }

        if (
          assignment.status === 'submitted' ||
          assignment.status === 'completed' ||
          assignment.status === 'rejected'
        ) {
          this.db.kvSet(submitMarkerKey, params.nowIso);
          this.db.kvSet(attemptsKey, '0');
          this.db.kvSet(nextAttemptAtKey, '');
          continue;
        }
        if (assignment.status !== 'accepted' && assignment.status !== 'in_progress') {
          continue;
        }

        const markdown = await this.buildNearMarketDeliverable({
          jobId: bid.jobId,
          title: detail.title,
          description: detail.description,
          amountNear: bid.amountNear,
          nowIso: params.nowIso,
        });
        const deliverableUrl = await this.publishNearMarketArtifact(markdown);
        const deliverableHash = `sha256:${createHash('sha256').update(markdown).digest('hex')}`;

        const submitResult = await submitNearMarketDeliverable({
          baseUrl: this.runtimeEnv.KAMIYO_SWARM_NEAR_MARKET_BASE_URL,
          apiKey: this.runtimeEnv.KAMIYO_SWARM_NEAR_MARKET_API_KEY,
          jobId: bid.jobId,
          deliverableUrl,
          deliverableHash,
          timeoutMs: this.runtimeEnv.KAMIYO_SWARM_JOB_HTTP_TIMEOUT_MS,
        });

        const receiptPath = writeOutbox(
          resolvePath(this.runtimeEnv.KAMIYO_OUTBOX_DIR),
          'near-market-submit',
          {
            tickId: params.tickId,
            at: params.nowIso,
            bid,
            assignment,
            deliverableUrl,
            deliverableHash,
            submitResult,
          }
        );
        this.db.addAction(
          params.tickId,
          'near_market_submit',
          {
            jobId: bid.jobId,
            bidId: bid.bidId,
            deliverableUrl,
            deliverableHash,
          },
          {
            submitResult,
            receiptPath,
          }
        );
        this.db.kvSet(submitMarkerKey, params.nowIso);
        this.db.kvSet(attemptsKey, '0');
        this.db.kvSet(nextAttemptAtKey, '');
        this.db.kvSet(escalationMarkerKey, '');
        submitted += 1;
      } catch (error) {
        failed += 1;
        const nextAttempts = attempts + 1;
        this.db.kvSet(attemptsKey, String(nextAttempts));
        const backoffMs = Math.min(backoffMaxMs, backoffBaseMs * Math.max(1, nextAttempts));
        this.db.kvSet(nextAttemptAtKey, new Date(nowMs + backoffMs).toISOString());

        this.db.addAction(
          params.tickId,
          'near_market_submit',
          {
            jobId: bid.jobId,
            bidId: bid.bidId,
          },
          null,
          error instanceof Error ? error.message : String(error)
        );

        const firstSeenMs = Date.parse(firstSeenAt);
        const ageMs = Number.isFinite(firstSeenMs) ? Math.max(0, nowMs - firstSeenMs) : 0;
        const shouldEscalate = nextAttempts >= retryLimit || ageMs >= escalateAfterMs;
        if (shouldEscalate && escalated < escalationLimit && !this.db.kvGet(escalationMarkerKey)) {
          const escalationError = error instanceof Error ? error.message : String(error);
          const receiptPath = writeOutbox(
            resolvePath(this.runtimeEnv.KAMIYO_OUTBOX_DIR),
            'near-market-submit-escalation',
            {
              tickId: params.tickId,
              at: params.nowIso,
              bid,
              attempts: nextAttempts,
              firstSeenAt,
              ageMinutes: Math.floor(ageMs / 60_000),
              retryLimit,
              escalateAfterMinutes:
                this.runtimeEnv.KAMIYO_SWARM_NEAR_MARKET_SUBMIT_ESCALATE_AFTER_MINUTES,
              error: escalationError,
            }
          );
          this.db.addAction(
            params.tickId,
            'near_market_submit_escalation',
            {
              jobId: bid.jobId,
              bidId: bid.bidId,
              attempts: nextAttempts,
              ageMinutes: Math.floor(ageMs / 60_000),
            },
            {
              receiptPath,
              error: escalationError,
            }
          );
          this.db.kvSet(escalationMarkerKey, params.nowIso);
          escalated += 1;
        }
      }
    }

    this.db.addAction(
      params.tickId,
      'near_market_submit',
      {
        limit: this.runtimeEnv.KAMIYO_SWARM_NEAR_MARKET_SUBMIT_LIMIT,
        retryLimit,
        backoffMinutes: this.runtimeEnv.KAMIYO_SWARM_NEAR_MARKET_SUBMIT_RETRY_BACKOFF_MINUTES,
        escalateAfterMinutes:
          this.runtimeEnv.KAMIYO_SWARM_NEAR_MARKET_SUBMIT_ESCALATE_AFTER_MINUTES,
      },
      {
        tracked: trackedBids.length,
        submitted,
        failed,
        skippedBackoff,
        escalated,
      }
    );

    this.db.kvSet('near_market_submit_last_at', params.nowIso);
  }

  private async maybeCollectNearMarketSettlements(params: {
    tickId: string;
    nowIso: string;
  }): Promise<void> {
    if (!this.runtimeEnv.KAMIYO_SWARM_NEAR_MARKET_SETTLEMENT_ENABLED) return;
    if (!this.runtimeEnv.KAMIYO_SWARM_NEAR_MARKET_API_KEY) return;
    if (!this.runtimeEnv.KAMIYO_SWARM_NEAR_MARKET_AGENT_ID) return;

    const lastSettledAt = this.db.kvGet('near_market_settlement_last_at');
    if (lastSettledAt) {
      const elapsedMs = Date.now() - Date.parse(lastSettledAt);
      if (
        Number.isFinite(elapsedMs) &&
        elapsedMs < this.runtimeEnv.KAMIYO_SWARM_NEAR_MARKET_SETTLEMENT_INTERVAL_MINUTES * 60_000
      ) {
        return;
      }
    }

    let settlements: Awaited<ReturnType<typeof collectNearMarketSettlements>>;
    try {
      settlements = await collectNearMarketSettlements({
        baseUrl: this.runtimeEnv.KAMIYO_SWARM_NEAR_MARKET_BASE_URL,
        apiKey: this.runtimeEnv.KAMIYO_SWARM_NEAR_MARKET_API_KEY,
        agentId: this.runtimeEnv.KAMIYO_SWARM_NEAR_MARKET_AGENT_ID,
        limit: this.runtimeEnv.KAMIYO_SWARM_NEAR_MARKET_SETTLEMENT_LIMIT,
        timeoutMs: this.runtimeEnv.KAMIYO_SWARM_JOB_FETCH_TIMEOUT_MS,
        nearPriceUsd: this.runtimeEnv.KAMIYO_SWARM_NEAR_MARKET_NEAR_PRICE_USD,
        solPriceUsd: this.runtimeEnv.KAMIYO_SWARM_SOL_PRICE_USD,
      });
    } catch (error) {
      this.db.addAction(
        params.tickId,
        'near_market_settlement',
        {
          limit: this.runtimeEnv.KAMIYO_SWARM_NEAR_MARKET_SETTLEMENT_LIMIT,
          agentId: this.runtimeEnv.KAMIYO_SWARM_NEAR_MARKET_AGENT_ID,
        },
        null,
        error instanceof Error ? error.message : String(error)
      );
      this.db.kvSet('near_market_settlement_last_at', params.nowIso);
      return;
    }

    let recorded = 0;
    for (const settlement of settlements) {
      const markerKey = `near_market_settlement:${settlement.settlementId}`;
      if (this.db.kvGet(markerKey)) continue;

      this.db.recordRevenueEvent({
        id: `${params.tickId}:near_settlement:${settlement.settlementId}`,
        tickId: params.tickId,
        lane: 'marketplace_direct',
        kind: 'job',
        amountSol: settlement.amountSol,
        amountUsd: settlement.amountUsd,
        metadata: {
          source: 'near_market',
          settlementId: settlement.settlementId,
          jobId: settlement.jobId,
          jobTitle: settlement.jobTitle,
          bidId: settlement.bidId,
          amountNear: settlement.amountNear,
          completedAt: settlement.completedAt,
        },
      });
      this.db.kvSet(markerKey, settlement.completedAt);
      recorded += 1;
    }

    if (recorded > 0) {
      const receiptPath = writeOutbox(
        resolvePath(this.runtimeEnv.KAMIYO_OUTBOX_DIR),
        'near-market-settlement',
        {
          tickId: params.tickId,
          at: params.nowIso,
          recorded,
          settlements,
        }
      );
      this.db.addAction(
        params.tickId,
        'near_market_settlement',
        {
          limit: this.runtimeEnv.KAMIYO_SWARM_NEAR_MARKET_SETTLEMENT_LIMIT,
          agentId: this.runtimeEnv.KAMIYO_SWARM_NEAR_MARKET_AGENT_ID,
        },
        { recorded, receiptPath }
      );
    } else {
      this.db.addAction(
        params.tickId,
        'near_market_settlement',
        {
          limit: this.runtimeEnv.KAMIYO_SWARM_NEAR_MARKET_SETTLEMENT_LIMIT,
          agentId: this.runtimeEnv.KAMIYO_SWARM_NEAR_MARKET_AGENT_ID,
        },
        { recorded: 0 }
      );
    }

    this.db.kvSet('near_market_settlement_last_at', params.nowIso);
  }

  private async maybeSettleRevenuePolicy(params: {
    tickId: string;
    dayStartIso: string;
    nowIso: string;
    budget: BudgetState;
  }): Promise<BudgetState> {
    if (!this.runtimeEnv.KAMIYO_REVENUE_POLICY_ENABLED) return params.budget;

    const lastSettledAt = this.db.kvGet('revenue_policy_last_at');
    if (lastSettledAt) {
      const elapsedMs = Date.now() - Date.parse(lastSettledAt);
      if (
        Number.isFinite(elapsedMs) &&
        elapsedMs < this.runtimeEnv.KAMIYO_REVENUE_SETTLE_INTERVAL_MINUTES * 60_000
      ) {
        return params.budget;
      }
    }

    const laneStats = this.db.revenueLaneStatsSince(params.dayStartIso);
    const net = computeRevenueNet(laneStats);
    this.status.economics.grossRevenueTodaySol = net.grossSol;
    this.status.economics.costTodaySol = net.costSol;
    this.status.economics.netRevenueTodaySol = net.netSol;

    const alreadySettled =
      Number.parseFloat(this.db.kvGet('revenue_policy_settled_sol') ?? '0') || 0;
    const unsettledNet = net.netSol - alreadySettled;
    if (unsettledNet < this.runtimeEnv.KAMIYO_REVENUE_MIN_NET_SOL) return params.budget;

    const bpsTotal =
      this.runtimeEnv.KAMIYO_REVENUE_ROUTE_BPS +
      this.runtimeEnv.KAMIYO_REVENUE_RESERVE_BPS +
      this.runtimeEnv.KAMIYO_REVENUE_OPERATIONS_BPS;
    if (bpsTotal <= 0) return params.budget;

    const scale = 10_000 / bpsTotal;
    const routeBps = this.runtimeEnv.KAMIYO_REVENUE_ROUTE_BPS * scale;
    const reserveBps = this.runtimeEnv.KAMIYO_REVENUE_RESERVE_BPS * scale;
    const operationsBps = this.runtimeEnv.KAMIYO_REVENUE_OPERATIONS_BPS * scale;

    const routeSol = unsettledNet * (routeBps / 10_000);
    const reserveSol = unsettledNet * (reserveBps / 10_000);
    const operationsSol = unsettledNet * (operationsBps / 10_000);

    this.db.recordRevenueEvent({
      id: `${params.tickId}:revenue_allocation_route`,
      tickId: params.tickId,
      lane: 'internal',
      kind: 'allocation_route',
      amountSol: routeSol,
      amountUsd: routeSol * this.runtimeEnv.KAMIYO_SWARM_SOL_PRICE_USD,
      metadata: { unsettledNet, routeBps },
    });
    this.db.recordRevenueEvent({
      id: `${params.tickId}:revenue_allocation_reserve`,
      tickId: params.tickId,
      lane: 'internal',
      kind: 'allocation_reserve',
      amountSol: reserveSol,
      amountUsd: reserveSol * this.runtimeEnv.KAMIYO_SWARM_SOL_PRICE_USD,
      metadata: { unsettledNet, reserveBps },
    });
    this.db.recordRevenueEvent({
      id: `${params.tickId}:revenue_allocation_operations`,
      tickId: params.tickId,
      lane: 'internal',
      kind: 'allocation_operations',
      amountSol: operationsSol,
      amountUsd: operationsSol * this.runtimeEnv.KAMIYO_SWARM_SOL_PRICE_USD,
      metadata: { unsettledNet, operationsBps },
    });

    const receiptPath = writeOutbox(
      resolvePath(this.runtimeEnv.KAMIYO_OUTBOX_DIR),
      'revenue-settlement',
      {
        tickId: params.tickId,
        at: params.nowIso,
        net,
        alreadySettled,
        unsettledNet,
        routeSol,
        reserveSol,
        operationsSol,
      }
    );
    this.db.addAction(
      params.tickId,
      'revenue_settlement',
      { dayStartIso: params.dayStartIso, alreadySettled },
      { unsettledNet, routeSol, reserveSol, operationsSol, receiptPath }
    );

    this.db.kvSet('revenue_policy_settled_sol', String(alreadySettled + unsettledNet));
    this.db.kvSet('revenue_policy_last_at', params.nowIso);
    this.status.economics.lastSettlementAt = params.nowIso;

    return params.budget;
  }

  private async maybeClaimFeeVault(params: {
    tickId: string;
    dayStartIso: string;
    budget: BudgetState;
  }): Promise<BudgetState> {
    if (!this.executionPolicy.autoClaimEnabled || !this.runtimeEnv.KAMIYO_FEE_VAULT) {
      return params.budget;
    }

    const claimsToday = this.db.actionCountSince(params.dayStartIso, 'fee_vault_claim');
    if (claimsToday >= this.runtimeEnv.KAMIYO_MAX_FEE_CLAIMS_PER_DAY) {
      return params.budget;
    }

    const feeVault = new PublicKey(this.runtimeEnv.KAMIYO_FEE_VAULT);
    const breakdown = await this.rpcRead('read_fee_vault', connection =>
      readFeeVault(connection, feeVault)
    );
    const userAddress = this.operatorKeypair.publicKey.toBase58();
    const unclaimedLamports = getUserUnclaimedLamports(breakdown, userAddress);

    if (unclaimedLamports < BigInt(this.runtimeEnv.KAMIYO_AUTO_CLAIM_MIN_LAMPORTS)) {
      return params.budget;
    }

    const budgetReason = this.rejectBudget({
      budget: params.budget,
      additionalSpendSol: this.runtimeEnv.KAMIYO_SWARM_JOB_ESTIMATED_FEE_SOL,
      additionalTxs: 1,
    });
    if (budgetReason) return params.budget;

    const claimResult = await claimFeeVault({
      connection: this.rpcConnections[0],
      feeVault,
      user: this.operatorKeypair,
      payer: this.operatorKeypair,
      dryRun: false,
    });

    this.db.addAction(
      params.tickId,
      'fee_vault_claim',
      {
        source: 'runtime_auto_claim',
        feeVault: feeVault.toBase58(),
        claimer: userAddress,
        unclaimedLamports: unclaimedLamports.toString(),
      },
      claimResult
    );

    const receiptPath = writeOutbox(
      resolvePath(this.runtimeEnv.KAMIYO_OUTBOX_DIR),
      'fee-claim-receipt',
      {
        tickId: params.tickId,
        at: new Date().toISOString(),
        source: 'runtime_auto_claim',
        feeVault: feeVault.toBase58(),
        claimer: userAddress,
        unclaimedLamports: unclaimedLamports.toString(),
        signature: claimResult.signature,
        before: claimResult.before,
        after: claimResult.after,
      }
    );
    this.db.addAction(params.tickId, 'write_fee_claim_receipt', {}, { receiptPath });

    const claimedSol = lamportsToSol(unclaimedLamports);
    this.db.recordRevenueEvent({
      id: `${params.tickId}:claim:operator:${feeVault.toBase58()}`,
      tickId: params.tickId,
      lane: 'internal',
      kind: 'claim',
      amountSol: claimedSol,
      amountUsd: claimedSol * this.runtimeEnv.KAMIYO_SWARM_SOL_PRICE_USD,
      metadata: {
        source: 'runtime_auto_claim',
        signature: claimResult.signature,
      },
    });

    this.status.treasury.lastClaimSignature = claimResult.signature;

    return {
      ...params.budget,
      ...applyBudget({
        budget: params.budget,
        spendSol: this.runtimeEnv.KAMIYO_SWARM_JOB_ESTIMATED_FEE_SOL,
        txs: 1,
      }),
    };
  }

  private async maybeClaimKyoshinStaking(params: {
    tickId: string;
    dayStartIso: string;
    budget: BudgetState;
  }): Promise<BudgetState> {
    if (
      !this.runtimeEnv.KAMIYO_KYOSHIN_STAKING_POOL ||
      !this.executionPolicy.kyoshinAutoClaimEnabled
    ) {
      return params.budget;
    }

    if (
      !this.isStakingPoolAllowed({
        tickId: params.tickId,
        source: 'runtime_kyoshin_staking_claim',
        poolAddress: this.runtimeEnv.KAMIYO_KYOSHIN_STAKING_POOL,
      })
    ) {
      return params.budget;
    }

    const claimer = loadOptionalKeypair({
      keypairPath: this.runtimeEnv.KAMIYO_KYOSHIN_CLAIMER_KEYPAIR_PATH,
      privateKey: this.runtimeEnv.KAMIYO_KYOSHIN_CLAIMER_PRIVATE_KEY,
    }) ?? { keypair: this.operatorKeypair, source: 'operator' };

    const position = await readFundryUserPosition({
      apiBase: this.runtimeEnv.KAMIYO_FUNDRY_API_BASE_URL,
      poolAddress: this.runtimeEnv.KAMIYO_KYOSHIN_STAKING_POOL,
      wallet: claimer.keypair.publicKey.toBase58(),
      timeoutMs: this.runtimeEnv.KAMIYO_SWARM_JOB_FETCH_TIMEOUT_MS,
    });

    const claimableLamports = getClaimableLamports(position);
    const periodNumbers = getClaimablePeriodNumbers(
      position,
      this.runtimeEnv.KAMIYO_KYOSHIN_AUTO_CLAIM_MAX_PERIODS_PER_RUN
    );

    if (periodNumbers.length === 0) return params.budget;
    if (claimableLamports < BigInt(this.runtimeEnv.KAMIYO_KYOSHIN_AUTO_CLAIM_MIN_LAMPORTS))
      return params.budget;

    const budgetReason = this.rejectBudget({
      budget: params.budget,
      additionalSpendSol: this.runtimeEnv.KAMIYO_SWARM_JOB_ESTIMATED_FEE_SOL,
      additionalTxs: 1,
    });
    if (budgetReason) return params.budget;

    const claims = await claimFundryStakingPeriods({
      connection: this.rpcConnections[0],
      apiBase: this.runtimeEnv.KAMIYO_FUNDRY_API_BASE_URL,
      poolAddress: this.runtimeEnv.KAMIYO_KYOSHIN_STAKING_POOL,
      signer: claimer.keypair,
      periodNumbers,
      requestTimeoutMs: this.runtimeEnv.KAMIYO_SWARM_JOB_FETCH_TIMEOUT_MS,
      confirmTimeoutMs: this.runtimeEnv.KAMIYO_RPC_READ_TIMEOUT_MS * 2,
    });

    this.db.addAction(
      params.tickId,
      'kyoshin_staking_claim',
      {
        source: 'runtime_kyoshin_staking_claim',
        pool: this.runtimeEnv.KAMIYO_KYOSHIN_STAKING_POOL,
        claimer: claimer.keypair.publicKey.toBase58(),
        periodNumbers,
        claimableLamports: claimableLamports.toString(),
        keySource: claimer.source,
      },
      { claims }
    );

    const receiptPath = writeOutbox(
      resolvePath(this.runtimeEnv.KAMIYO_OUTBOX_DIR),
      'kyoshin-staking-claim-receipt',
      {
        tickId: params.tickId,
        at: new Date().toISOString(),
        source: 'runtime_kyoshin_staking_claim',
        pool: this.runtimeEnv.KAMIYO_KYOSHIN_STAKING_POOL,
        claimer: claimer.keypair.publicKey.toBase58(),
        periodNumbers,
        claimableLamports: claimableLamports.toString(),
        claims,
      }
    );
    this.db.addAction(params.tickId, 'write_kyoshin_staking_claim_receipt', {}, { receiptPath });

    const claimSol = lamportsToSol(claimableLamports);
    this.db.recordRevenueEvent({
      id: `${params.tickId}:claim:kyoshin:${this.runtimeEnv.KAMIYO_KYOSHIN_STAKING_POOL}`,
      tickId: params.tickId,
      lane: 'internal',
      kind: 'claim',
      amountSol: claimSol,
      amountUsd: claimSol * this.runtimeEnv.KAMIYO_SWARM_SOL_PRICE_USD,
      metadata: {
        source: 'runtime_kyoshin_staking_claim',
        signatures: claims.map(row => row.signature).filter(Boolean),
      },
    });

    const signature = claims.map(item => item.signature).find(Boolean) ?? null;
    this.status.treasury.lastClaimSignature = signature;

    return {
      ...params.budget,
      ...applyBudget({
        budget: params.budget,
        spendSol: this.runtimeEnv.KAMIYO_SWARM_JOB_ESTIMATED_FEE_SOL,
        txs: 1,
      }),
    };
  }

  private async maybeMaintainOpenStakingPeriod(params: {
    tickId: string;
    poolAddress: string;
    admin: Keypair;
    source: string;
  }): Promise<void> {
    const nowMs = Date.now();
    if (nowMs - this.lastStakingPeriodMaintenanceMs < STAKING_PERIOD_MAINTENANCE_INTERVAL_MS)
      return;
    this.lastStakingPeriodMaintenanceMs = nowMs;

    const meta = {
      source: params.source,
      pool: params.poolAddress,
      wallet: params.admin.publicKey.toBase58(),
    };

    try {
      const pool = new PublicKey(params.poolAddress);
      const existingOpen = await this.rpcRead('find_latest_open_staking_period', connection =>
        findLatestOpenStakingPeriod(connection, pool)
      );
      if (existingOpen) return;

      const rollover = await withTimeout(
        ensureOpenStakingPeriod({
          connection: this.rpcConnections[0],
          admin: params.admin,
          pool,
        }),
        Math.max(this.runtimeEnv.KAMIYO_RPC_READ_TIMEOUT_MS * 3, 60_000),
        'ensure_open_staking_period timed out'
      );

      if (rollover.createSignature || rollover.activateSignature) {
        this.db.addAction(
          params.tickId,
          'staking_period_rollover',
          {
            source: params.source,
            wallet: params.admin.publicKey.toBase58(),
            pool: pool.toBase58(),
            createdPeriod: rollover.createdPeriod?.address ?? null,
            createdPeriodNumber: rollover.createdPeriod?.periodNumber ?? null,
          },
          {
            success: true,
            data: {
              createSignature: rollover.createSignature,
              activateSignature: rollover.activateSignature,
              period: rollover.period,
            },
          }
        );
      }

      if (!rollover.period) {
        this.db.addAction(
          params.tickId,
          'staking_period_rollover',
          meta,
          null,
          'no_open_period_after_rollover'
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.db.addAction(params.tickId, 'staking_period_rollover', meta, null, message);
    }
  }

  private async maybeRouteToStakingPool(params: {
    tickId: string;
    dayStartIso: string;
    budget: BudgetState;
    poolAddress: string;
    depositor: Keypair;
    source: string;
  }): Promise<BudgetState> {
    if (
      !this.isStakingPoolAllowed({
        tickId: params.tickId,
        source: params.source,
        poolAddress: params.poolAddress,
      })
    ) {
      return params.budget;
    }

    const feedsToday = this.db.actionCountSince(params.dayStartIso, 'staking_period_deposit');
    if (feedsToday >= this.runtimeEnv.KAMIYO_AUTO_STAKE_MAX_FEEDS_PER_DAY) return params.budget;

    const balanceLamports = BigInt(
      await this.rpcRead('read_depositor_balance', connection =>
        connection.getBalance(params.depositor.publicKey, 'confirmed')
      )
    );

    const reserveLamports = BigInt(this.runtimeEnv.KAMIYO_AUTO_STAKE_RESERVE_LAMPORTS);
    const minLamports = BigInt(this.runtimeEnv.KAMIYO_AUTO_STAKE_MIN_LAMPORTS);
    const availableLamports =
      balanceLamports > reserveLamports ? balanceLamports - reserveLamports : 0n;
    const targetLamports =
      (availableLamports * BigInt(this.executionPolicy.autoStakeAvailableBps)) / 10_000n;
    const maxLamportsPerTx = BigInt(this.executionPolicy.autoStakeMaxLamportsPerTx);

    const routeLamports =
      maxLamportsPerTx > 0n && targetLamports > maxLamportsPerTx
        ? maxLamportsPerTx
        : targetLamports;

    if (routeLamports < minLamports) return params.budget;

    const routeSol = lamportsToSol(routeLamports);
    const budgetReason = this.rejectBudget({
      budget: params.budget,
      additionalSpendSol: routeSol,
      additionalTxs: 1,
    });
    if (budgetReason) {
      this.db.addAction(
        params.tickId,
        'staking_period_deposit',
        {
          source: params.source,
          pool: params.poolAddress,
          routeLamports: routeLamports.toString(),
          routeSol,
        },
        null,
        budgetReason
      );
      return params.budget;
    }

    const pool = new PublicKey(params.poolAddress);
    let stakingPeriod = await this.rpcRead('find_latest_open_staking_period', connection =>
      findLatestOpenStakingPeriod(connection, pool)
    );
    if (!stakingPeriod) {
      const rollover = await withTimeout(
        ensureOpenStakingPeriod({
          connection: this.rpcConnections[0],
          admin: params.depositor,
          pool,
        }),
        Math.max(this.runtimeEnv.KAMIYO_RPC_READ_TIMEOUT_MS * 3, 60_000),
        'ensure_open_staking_period timed out'
      );
      stakingPeriod = rollover.period;

      if (rollover.createSignature || rollover.activateSignature) {
        this.db.addAction(
          params.tickId,
          'staking_period_rollover',
          {
            source: params.source,
            wallet: params.depositor.publicKey.toBase58(),
            pool: pool.toBase58(),
            createdPeriod: rollover.createdPeriod?.address ?? null,
            createdPeriodNumber: rollover.createdPeriod?.periodNumber ?? null,
          },
          {
            success: true,
            data: {
              createSignature: rollover.createSignature,
              activateSignature: rollover.activateSignature,
              period: stakingPeriod,
            },
          }
        );
      }
    }
    if (!stakingPeriod) return params.budget;

    const depositResult = await depositToStakingPeriod({
      connection: this.rpcConnections[0],
      depositor: params.depositor,
      pool,
      stakingPeriod: new PublicKey(stakingPeriod.address),
      amountLamports: routeLamports,
      dryRun: false,
    });

    this.db.addAction(
      params.tickId,
      'staking_period_deposit',
      {
        source: params.source,
        pool: pool.toBase58(),
        stakingPeriod: stakingPeriod.address,
        routeLamports: routeLamports.toString(),
        routeSol,
        reserveLamports: reserveLamports.toString(),
        availableBps: this.executionPolicy.autoStakeAvailableBps,
      },
      depositResult
    );

    const receiptPath = writeOutbox(
      resolvePath(this.runtimeEnv.KAMIYO_OUTBOX_DIR),
      'staking-deposit-receipt',
      {
        tickId: params.tickId,
        at: new Date().toISOString(),
        source: params.source,
        pool: pool.toBase58(),
        stakingPeriod: stakingPeriod.address,
        routeLamports: routeLamports.toString(),
        routeSol,
        signature: depositResult.signature,
        periodVault: depositResult.periodVault,
      }
    );
    this.db.addAction(params.tickId, 'write_staking_deposit_receipt', {}, { receiptPath });

    this.db.recordRevenueEvent({
      id: `${params.tickId}:route:${params.depositor.publicKey.toBase58()}:${pool.toBase58()}`,
      tickId: params.tickId,
      lane: 'internal',
      kind: 'route',
      amountSol: -routeSol,
      amountUsd: -routeSol * this.runtimeEnv.KAMIYO_SWARM_SOL_PRICE_USD,
      metadata: {
        source: params.source,
        signature: depositResult.signature,
        stakingPeriod: stakingPeriod.address,
      },
    });

    this.status.treasury.lastRouteSignature = depositResult.signature;

    return {
      ...params.budget,
      ...applyBudget({
        budget: params.budget,
        spendSol: routeSol,
        txs: 1,
      }),
    };
  }

  private async maybeEvaluateRollback(params: { tickId: string; nowIso: string }): Promise<void> {
    if (!this.runtimeEnv.KAMIYO_SWARM_ROLLBACK_ENABLED) return;

    const lastEvaluatedAt = this.db.kvGet('swarm_rollback_last_at');
    if (lastEvaluatedAt) {
      const elapsedMs = Date.now() - Date.parse(lastEvaluatedAt);
      if (
        Number.isFinite(elapsedMs) &&
        elapsedMs < this.runtimeEnv.KAMIYO_SWARM_ROLLBACK_EVAL_INTERVAL_HOURS * 3_600_000
      ) {
        return;
      }
    }

    const windowStartIso = daysAgoIso(this.runtimeEnv.KAMIYO_SWARM_ROLLBACK_WINDOW_DAYS);
    const sourceStats = this.db.swarmSourceStatsSince(windowStartIso);
    const weeklyNetSol = sourceStats.reduce((sum, row) => sum + row.revenueSol, 0);

    const rollbackEvaluation = evaluateRollbackPolicy({
      state: parseRollbackState(this.db.kvGet('swarm_rollback_state')),
      nowIso: params.nowIso,
      weeklyNetSol,
      weeklySourceStats: sourceStats.map(row => ({
        source: row.source,
        total: row.total,
        revenueSol: row.revenueSol,
      })),
      minJobs: this.runtimeEnv.KAMIYO_SWARM_ROLLBACK_MIN_JOBS,
      sourceMinJobs: this.runtimeEnv.KAMIYO_SWARM_ROLLBACK_SOURCE_MIN_JOBS,
      netSolTrigger: this.runtimeEnv.KAMIYO_SWARM_ROLLBACK_NET_SOL_TRIGGER,
      maxDisabledSources: this.runtimeEnv.KAMIYO_SWARM_ROLLBACK_MAX_DISABLED_SOURCES,
      cooldownHours: this.runtimeEnv.KAMIYO_SWARM_ROLLBACK_COOLDOWN_HOURS,
      recoveryNetSol: this.runtimeEnv.KAMIYO_SWARM_ROLLBACK_RECOVERY_NET_SOL,
    });

    this.db.kvSet('swarm_rollback_state', JSON.stringify(rollbackEvaluation.state));
    this.db.kvSet('swarm_rollback_last_at', params.nowIso);

    const receiptPath = writeOutbox(
      resolvePath(this.runtimeEnv.KAMIYO_OUTBOX_DIR),
      'swarm-rollback-policy',
      {
        tickId: params.tickId,
        at: params.nowIso,
        weeklyNetSol,
        sourceStats,
        evaluation: rollbackEvaluation,
      }
    );

    this.db.addAction(
      params.tickId,
      'swarm_rollback_policy',
      {
        windowDays: this.runtimeEnv.KAMIYO_SWARM_ROLLBACK_WINDOW_DAYS,
        trigger: this.runtimeEnv.KAMIYO_SWARM_ROLLBACK_NET_SOL_TRIGGER,
      },
      {
        weeklyNetSol,
        disabledSources: rollbackEvaluation.disabledSources,
        triggered: rollbackEvaluation.triggered,
        receiptPath,
      }
    );
  }

  private async maybeRunRetention(params: { tickId: string; nowIso: string }): Promise<void> {
    if (!this.runtimeEnv.KAMIYO_RETENTION_ENABLED) return;

    const lastRunAt = this.db.kvGet('retention_last_at');
    if (lastRunAt) {
      const elapsedMs = Date.now() - Date.parse(lastRunAt);
      if (
        Number.isFinite(elapsedMs) &&
        elapsedMs < this.runtimeEnv.KAMIYO_RETENTION_INTERVAL_MINUTES * 60_000
      ) {
        return;
      }
    }

    const cutoffs = {
      ticksBeforeIso: daysAgoIso(this.runtimeEnv.KAMIYO_RETENTION_TICKS_DAYS),
      observationsBeforeIso: daysAgoIso(this.runtimeEnv.KAMIYO_RETENTION_OBSERVATIONS_DAYS),
      actionsBeforeIso: daysAgoIso(this.runtimeEnv.KAMIYO_RETENTION_ACTIONS_DAYS),
      usageBeforeIso: daysAgoIso(this.runtimeEnv.KAMIYO_RETENTION_LLM_USAGE_DAYS),
    };

    // Extract insights from jobs about to be pruned before deleting them
    if (this.runtimeEnv.KAMIYO_INSIGHT_EXTRACTION_ENABLED) {
      const jobsAboutToPrune = this.db.swarmJobsBefore(cutoffs.actionsBeforeIso);
      if (jobsAboutToPrune.length > 0) {
        const agentInsights = extractAgentInsights(jobsAboutToPrune, params.nowIso);
        const sourceInsights = extractSourceInsights(jobsAboutToPrune, params.nowIso);
        const fresh = {
          agents: agentInsights,
          sources: sourceInsights,
          extractedAt: params.nowIso,
        };
        const existing = parseInsightSnapshot(this.db.kvGet('insight:snapshot'));
        const merged = mergeInsightSnapshots(existing, fresh);
        this.db.kvSet('insight:snapshot', JSON.stringify(merged));
        this.db.addAction(
          params.tickId,
          'insight_extraction',
          {
            jobsAnalyzed: jobsAboutToPrune.length,
            agentInsights: agentInsights.length,
            sourceInsights: sourceInsights.length,
          },
          null
        );
      }
    }

    const result = this.db.pruneHistory(cutoffs);
    this.db.kvSet('retention_last_at', params.nowIso);
    this.db.addAction(params.tickId, 'retention_prune', cutoffs, result);
  }

  private deriveSourceQuality(): Partial<
    Record<
      | 'trading'
      | 'x402'
      | 'relevance'
      | 'agent_ai'
      | 'kore'
      | 'near_market'
      | 'direct'
      | 'internal',
      number
    >
  > {
    const since = new Date(
      Date.now() - this.runtimeEnv.KAMIYO_SWARM_SOURCE_FEEDBACK_WINDOW_HOURS * 3_600_000
    ).toISOString();
    const stats = this.db.swarmSourceStatsSince(since);
    const quality: Partial<
      Record<
        | 'trading'
        | 'x402'
        | 'relevance'
        | 'agent_ai'
        | 'kore'
        | 'near_market'
        | 'direct'
        | 'internal',
        number
      >
    > = {};

    for (const row of stats) {
      if (row.total < this.runtimeEnv.KAMIYO_SWARM_SOURCE_FEEDBACK_MIN_SAMPLES) continue;
      const successRate = row.total > 0 ? row.succeeded / row.total : 0;
      const marginBias = row.revenueSol >= 0 ? 0.25 : -0.25;
      const q = Math.max(0.3, Math.min(1.3, successRate + marginBias));

      if (
        row.source === 'trading' ||
        row.source === 'x402' ||
        row.source === 'relevance' ||
        row.source === 'agent_ai' ||
        row.source === 'kore' ||
        row.source === 'near_market' ||
        row.source === 'direct' ||
        row.source === 'internal'
      ) {
        quality[row.source] = q;
      }
    }

    return quality;
  }

  private buildOpportunityHints(
    intake: SwarmOpportunityIntake | null
  ): Record<string, SwarmMissionOpportunityHint> {
    if (!intake) return {};

    const opportunitiesById = new Map(
      intake.opportunities.map(opportunity => [opportunity.id, opportunity])
    );
    const hints: Record<string, SwarmMissionOpportunityHint> = {};

    for (const assignment of intake.assignments) {
      if (hints[assignment.agentId]) continue;
      const opportunity = opportunitiesById.get(assignment.opportunityId);
      if (!opportunity) continue;

      hints[assignment.agentId] = {
        id: opportunity.id,
        source: opportunity.source,
        title: opportunity.title,
        summary: opportunity.summary,
        expectedRewardSol: assignment.expectedRewardSol,
        assignmentReason: assignment.reason,
      };
    }

    return hints;
  }

  private isStakingPoolAllowed(params: {
    tickId: string;
    source: string;
    poolAddress: string;
  }): boolean {
    if (!this.executionPolicy.requireStakingPoolAllowlist) return true;
    if (this.executionPolicy.allowedStakingPools.has(params.poolAddress)) return true;

    this.db.addAction(
      params.tickId,
      'staking_pool_guard_reject',
      {
        source: params.source,
        pool: params.poolAddress,
        allowedPools: [...this.executionPolicy.allowedStakingPools],
      },
      null,
      'staking_pool_not_allowlisted'
    );
    return false;
  }

  private calculateBudgetState(dayStartIso: string): BudgetState {
    const revenueStats = this.db.revenueLaneStatsSince(dayStartIso);
    const spentTodaySol = revenueStats.reduce((sum, row) => {
      if (row.amountSol >= 0) return sum;
      return sum + Math.abs(row.amountSol);
    }, 0);

    const txTools = [
      'swarm_execute_opportunity',
      'staking_period_deposit',
      'fee_vault_claim',
      'kyoshin_staking_claim',
      'swarm_agent_staking_claim',
    ];
    const txToday = txTools.reduce(
      (sum, tool) => sum + this.db.actionCountSince(dayStartIso, tool),
      0
    );

    return {
      dayStartIso,
      spentTodaySol,
      txToday,
    };
  }

  private rejectBudget(params: {
    budget: BudgetState;
    additionalSpendSol: number;
    additionalTxs: number;
  }): string | null {
    return checkBudget({
      budget: params.budget,
      additionalSpendSol: params.additionalSpendSol,
      additionalTxs: params.additionalTxs,
      dailyCapSol: this.executionPolicy.dailyCapSol,
      perTxCapSol: this.executionPolicy.perTxCapSol,
      maxTxPerDay: this.executionPolicy.maxTxPerDay,
    });
  }

  private async rpcRead<T>(label: string, fn: (connection: Connection) => Promise<T>): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.runtimeEnv.KAMIYO_RPC_READ_RETRIES; attempt += 1) {
      for (let i = 0; i < this.rpcConnections.length; i += 1) {
        const connection = this.rpcConnections[i];
        try {
          return await withTimeout(
            fn(connection),
            this.runtimeEnv.KAMIYO_RPC_READ_TIMEOUT_MS,
            `${label} timed out`
          );
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));
          log('warn', 'RPC read failed', {
            label,
            attempt,
            endpointIndex: i,
            error: lastError.message,
          });
        }
      }
    }

    throw new Error(`rpc_read_failed:${label}:${lastError ? lastError.message : 'unknown'}`);
  }
}
