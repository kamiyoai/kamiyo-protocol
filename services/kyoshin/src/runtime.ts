import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { env, type Env } from './config.js';
import { openDb } from './db.js';
import { writeOutbox } from './outbox.js';
import { loadOperatorKeypair, loadOptionalKeypair } from './wallet.js';
import { claimFeeVault, readFeeVault } from './tools/feeVault.js';
import { claimFundryStakingPeriods, getClaimableLamports, readFundryUserPosition, type FundryUserPosition } from './tools/fundryStaking.js';
import { depositToStakingPeriod, findLatestOpenStakingPeriod } from './tools/stakingPool.js';
import { loadSwarmRegistry } from './swarm/registry.js';
import { planSwarmMissions, type SwarmMissionOpportunityHint } from './swarm/planner.js';
import {
  collectSwarmOpportunities,
  type MarketplaceFeedConfig,
  type SwarmOpportunity,
  type SwarmOpportunityAssignment,
  type SwarmOpportunityIntake,
} from './swarm/opportunities.js';
import { executeAssignedOpportunity, type SourceAuthMap } from './swarm/jobs.js';
import { parseMarginCircuitState, pruneMarginCircuitState, isMarginCircuitOpen, updateMarginCircuit } from './swarm/circuitBreaker.js';
import { parseRollbackState, pruneRollbackState, isRollbackSourceDisabled, evaluateRollbackPolicy } from './swarm/rollback.js';
import { parsePriorityState, evaluateSwarmPerformance, type SwarmAgentRuntimeMetrics } from './swarm/performance.js';
import { revenueLaneForOpportunitySource } from './swarm/revenue.js';
import { buildAutonomySloReport } from './swarm/slo.js';
import { checkBudget, applyBudget } from './policy/budget.js';
import { buildExecutionPolicy, type ExecutionPolicy } from './policy/executeProfile.js';
import type { SwarmRegistry } from './swarm/types.js';
import { createInitialStatus, type RuntimeStatus } from './state.js';

const SERVICE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function log(level: 'info' | 'warn' | 'error', message: string, context?: Record<string, unknown>): void {
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

export class KyoshinRuntime {
  private readonly runtimeEnv: Env;
  private readonly executionPolicy: ExecutionPolicy;
  private readonly db = openDb(resolvePath(env.KAMIYO_DB_PATH));
  private readonly status: RuntimeStatus = createInitialStatus(env.KAMIYO_MODE);
  private readonly rpcConnections: Connection[];
  private readonly operatorKeypair: Keypair;

  private loopTimer: NodeJS.Timeout | null = null;
  private runningTick = false;
  private stopRequested = false;

  constructor(runtimeEnv: Env = env) {
    this.runtimeEnv = runtimeEnv;
    this.executionPolicy = buildExecutionPolicy(runtimeEnv);

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
    this.status.execution.stage = this.executionPolicy.stage;
    this.status.execution.hardStop = this.executionPolicy.hardStop;
    this.status.execution.swarmJobExecutionEnabled = this.executionPolicy.swarmJobExecutionEnabled;
    this.status.execution.autoClaimEnabled = this.executionPolicy.autoClaimEnabled;
    this.status.execution.autoStakeEnabled = this.executionPolicy.autoStakeEnabled;
    this.status.execution.requireStakingPoolAllowlist = this.executionPolicy.requireStakingPoolAllowlist;
    this.status.treasury.dailyCapSol = this.executionPolicy.dailyCapSol;
    this.status.treasury.maxTxPerDay = this.executionPolicy.maxTxPerDay;

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
    ];

    return `${lines.join('\n')}\n`;
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

    let budget = this.calculateBudgetState(dayStartIso);

    this.status.treasury.spentTodaySol = budget.spentTodaySol;
    this.status.treasury.txToday = budget.txToday;

    const observation: Record<string, unknown> = {
      tickId,
      at: nowIso,
      mode: this.runtimeEnv.KAMIYO_MODE,
      executionPolicy: {
        stage: this.executionPolicy.stage,
        hardStop: this.executionPolicy.hardStop,
        swarmJobExecutionEnabled: this.executionPolicy.swarmJobExecutionEnabled,
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

      if (this.runtimeEnv.KAMIYO_SWARM_JOB_INTAKE_ENABLED) {
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

        swarmOpportunityIntake = await collectSwarmOpportunities({
          registry: swarmRegistry,
          feedPath: this.runtimeEnv.KAMIYO_SWARM_JOB_FEED_PATH
            ? resolvePath(this.runtimeEnv.KAMIYO_SWARM_JOB_FEED_PATH)
            : undefined,
          feedUrls: this.runtimeEnv.KAMIYO_SWARM_JOB_FEED_URLS,
          marketplaceFeeds,
          sourceQualityBySource,
          disabledSources,
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
      const missionPlanReceipt = writeOutbox(resolvePath(this.runtimeEnv.KAMIYO_OUTBOX_DIR), 'swarm-mission-plan', {
        tickId,
        at: nowIso,
        plan: missionPlan,
      });
      this.db.addAction(tickId, 'swarm_plan_missions', {}, { missionPlanReceipt, missionPlan });

      this.status.swarm.enabled = true;
      this.status.swarm.opportunitiesLastTick = swarmOpportunityIntake?.opportunities.length ?? 0;
      this.status.swarm.assignmentsLastTick = missionPlan.missions.length;

      if (
        this.runtimeEnv.KAMIYO_MODE === 'execute' &&
        this.executionPolicy.swarmJobExecutionEnabled &&
        swarmOpportunityIntake
      ) {
        const executionResult = await this.executeSwarmJobs({
          tickId,
          dayStartIso,
          budget,
          registry: swarmRegistry,
          missionPlan,
          opportunityIntake: swarmOpportunityIntake,
        });

        budget = executionResult.budget;
        this.status.swarm.executedLastTick = executionResult.executed;
        this.status.swarm.skippedLastTick = executionResult.skipped;
        this.status.swarm.failedLastTick = executionResult.failed;

        const performance = evaluateSwarmPerformance({
          registry: swarmRegistry,
          metrics: executionResult.runtimeMetrics,
          previousState: priorityState,
        });
        this.db.kvSet('swarm_priority_state', JSON.stringify(performance.state));
        this.db.addObservation(tickId, 'swarm-performance', performance);

        await this.maybeEvaluateRollback({ tickId, nowIso });
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
        this.db.addAction(tickId, 'swarm_registry', {}, null, registryResult.error ?? registryResult.reason);
      }
      observation.swarm = {
        enabled: this.runtimeEnv.KAMIYO_SWARM_ENABLED,
        registryLoaded: Boolean(swarmRegistry),
      };
    }

    if (this.runtimeEnv.KAMIYO_MODE === 'execute') {
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
        const claimSigner =
          loadOptionalKeypair({
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
    }

    await this.maybeRunRetention({ tickId, nowIso });

    this.status.treasury.spentTodaySol = budget.spentTodaySol;
    this.status.treasury.txToday = budget.txToday;

    observation.budgetsEnd = {
      spentTodaySol: budget.spentTodaySol,
      txToday: budget.txToday,
      dailyCapSol: this.executionPolicy.dailyCapSol,
      txCap: this.executionPolicy.maxTxPerDay,
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
    registry: SwarmRegistry;
    missionPlan: ReturnType<typeof planSwarmMissions>;
    opportunityIntake: SwarmOpportunityIntake;
  }): Promise<{
    budget: BudgetState;
    runtimeMetrics: SwarmAgentRuntimeMetrics[];
    executed: number;
    skipped: number;
    failed: number;
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
    };

    let marginCircuitState = pruneMarginCircuitState({
      state: parseMarginCircuitState(this.db.kvGet('swarm_margin_circuit_state')),
      keepDays: this.runtimeEnv.KAMIYO_SWARM_CIRCUIT_STATE_KEEP_DAYS,
    });

    const rollbackState = pruneRollbackState({
      state: parseRollbackState(this.db.kvGet('swarm_rollback_state')),
    });
    this.db.kvSet('swarm_rollback_state', JSON.stringify(rollbackState));

    const runtimeMetrics: SwarmAgentRuntimeMetrics[] = [];
    let executed = 0;
    let skipped = 0;
    let failed = 0;
    let remainingExecutions = this.executionPolicy.swarmJobExecutionsPerTick;

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
          metadata: { reason: 'rollback_source_disabled', disabledUntil: rollbackStatus.disabledUntil },
        });
        runtimeMetrics.push(metric);
        continue;
      }

      const circuitStatus = this.runtimeEnv.KAMIYO_SWARM_CIRCUIT_BREAKER_ENABLED
        ? isMarginCircuitOpen({ state: marginCircuitState, agentId: agent.id, source: opportunity.source })
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
        runtimeMetrics.push(metric);
        continue;
      }

      const x402BufferSol =
        opportunity.source === 'x402'
          ? this.runtimeEnv.KAMIYO_SWARM_X402_MAX_PRICE_USD / this.runtimeEnv.KAMIYO_SWARM_SOL_PRICE_USD
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
        runtimeMetrics.push(metric);
        continue;
      }

      const agentSigner = agent.claimerKeypairPath
        ? loadOptionalKeypair({ keypairPath: agent.claimerKeypairPath })?.keypair ?? this.operatorKeypair
        : this.operatorKeypair;

      const result = await executeAssignedOpportunity({
        agentId: agent.id,
        opportunity,
        assignment,
        signer: agentSigner,
        timeoutMs: this.runtimeEnv.KAMIYO_SWARM_JOB_HTTP_TIMEOUT_MS,
        solPriceUsd: this.runtimeEnv.KAMIYO_SWARM_SOL_PRICE_USD,
        minMarginSol: this.executionPolicy.swarmJobMinMarginSol,
        estimatedFeeSol: this.runtimeEnv.KAMIYO_SWARM_JOB_ESTIMATED_FEE_SOL,
        requireExpectedRevenue: this.runtimeEnv.KAMIYO_SWARM_JOB_REQUIRE_EXPECTED_REWARD,
        sourceAuth,
        x402Enabled: this.runtimeEnv.KAMIYO_SWARM_X402_ENABLED,
        x402MaxPriceUsd: this.runtimeEnv.KAMIYO_SWARM_X402_MAX_PRICE_USD,
        x402PreferredNetwork: this.runtimeEnv.KAMIYO_SWARM_X402_PREFERRED_NETWORK,
        x402FacilitatorPolicy: this.runtimeEnv.KAMIYO_SWARM_X402_FACILITATOR_POLICY,
      });

      this.db.addAction(params.tickId, 'swarm_execute_opportunity', {
        agentId: agent.id,
        opportunityId: assignment.opportunityId,
        source: opportunity.source,
      }, result, result.error);

      this.db.recordSwarmJob({
        id: `${params.tickId}:${agent.id}:${assignment.opportunityId}`,
        agentId: agent.id,
        source: opportunity.source,
        status: result.status,
        url: result.endpoint,
        paid: result.paid,
        paymentNetwork: result.paymentNetwork,
        paymentAmountUsd: result.paymentAmountUsd,
        revenueSol: result.realizedRevenueSol,
        revenueUsd: result.realizedRevenueUsd,
        error: result.error ?? result.reason,
        metadata: {
          reason: result.reason,
          paymentTransactionId: result.paymentTransactionId,
          httpStatus: result.httpStatus,
          output: result.output,
        },
      });

      const paymentCostSol = result.paid && result.paymentAmountUsd
        ? result.paymentAmountUsd / this.runtimeEnv.KAMIYO_SWARM_SOL_PRICE_USD
        : 0;
      const feeCostSol = result.status === 'skipped' ? 0 : this.runtimeEnv.KAMIYO_SWARM_JOB_ESTIMATED_FEE_SOL;
      const totalCostSol = feeCostSol + paymentCostSol;

      if (result.status !== 'skipped') {
        budget = {
          ...budget,
          ...applyBudget({
            budget,
            spendSol: totalCostSol,
            txs: 1,
          }),
        };
      }

      if (result.realizedRevenueSol > 0) {
        this.db.recordRevenueEvent({
          id: `${params.tickId}:job:${agent.id}:${assignment.opportunityId}`,
          tickId: params.tickId,
          agentId: agent.id,
          lane: revenueLaneForOpportunitySource(opportunity.source),
          kind: 'job',
          amountSol: result.realizedRevenueSol,
          amountUsd: result.realizedRevenueUsd,
          metadata: { source: opportunity.source, status: result.status },
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
            paid: result.paid,
          },
        });
      }

      if (this.runtimeEnv.KAMIYO_SWARM_CIRCUIT_BREAKER_ENABLED && result.status !== 'skipped') {
        const marginSol = result.realizedRevenueSol - totalCostSol;
        const circuitUpdate = updateMarginCircuit({
          state: marginCircuitState,
          agentId: agent.id,
          source: opportunity.source,
          marginSol,
          failed: result.status === 'failed',
          error: result.error ?? result.reason,
          negativeMarginThreshold: this.runtimeEnv.KAMIYO_SWARM_CIRCUIT_NEG_MARGIN_STREAK,
          cooldownMinutes: this.runtimeEnv.KAMIYO_SWARM_CIRCUIT_COOLDOWN_MINUTES,
        });
        marginCircuitState = circuitUpdate.state;
      }

      if (result.status === 'executed') executed += 1;
      if (result.status === 'failed') failed += 1;
      if (result.status === 'skipped') skipped += 1;

      metric.jobExecuted = result.status === 'executed' || result.status === 'failed';
      metric.jobSucceeded = result.status === 'executed';
      metric.jobRevenueSol = result.realizedRevenueSol;
      metric.hadError = result.status === 'failed';

      runtimeMetrics.push(metric);
      remainingExecutions -= 1;
    }

    marginCircuitState = pruneMarginCircuitState({
      state: marginCircuitState,
      keepDays: this.runtimeEnv.KAMIYO_SWARM_CIRCUIT_STATE_KEEP_DAYS,
    });
    this.db.kvSet('swarm_margin_circuit_state', JSON.stringify(marginCircuitState));

    const marginCircuitReceipt = writeOutbox(resolvePath(this.runtimeEnv.KAMIYO_OUTBOX_DIR), 'swarm-margin-circuit', {
      tickId: params.tickId,
      at: new Date().toISOString(),
      state: marginCircuitState,
    });
    this.db.addAction(params.tickId, 'swarm_update_margin_circuit', {}, { marginCircuitReceipt });

    return {
      budget,
      runtimeMetrics,
      executed,
      skipped,
      failed,
    };
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
    const breakdown = await this.rpcRead('read_fee_vault', connection => readFeeVault(connection, feeVault));
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

    this.db.addAction(params.tickId, 'fee_vault_claim', {
      source: 'runtime_auto_claim',
      feeVault: feeVault.toBase58(),
      claimer: userAddress,
      unclaimedLamports: unclaimedLamports.toString(),
    }, claimResult);

    const receiptPath = writeOutbox(resolvePath(this.runtimeEnv.KAMIYO_OUTBOX_DIR), 'fee-claim-receipt', {
      tickId: params.tickId,
      at: new Date().toISOString(),
      source: 'runtime_auto_claim',
      feeVault: feeVault.toBase58(),
      claimer: userAddress,
      unclaimedLamports: unclaimedLamports.toString(),
      signature: claimResult.signature,
      before: claimResult.before,
      after: claimResult.after,
    });
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
    if (!this.runtimeEnv.KAMIYO_KYOSHIN_STAKING_POOL || !this.executionPolicy.kyoshinAutoClaimEnabled) {
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

    const claimer =
      loadOptionalKeypair({
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
    const periodNumbers = getClaimablePeriodNumbers(position, this.runtimeEnv.KAMIYO_KYOSHIN_AUTO_CLAIM_MAX_PERIODS_PER_RUN);

    if (periodNumbers.length === 0) return params.budget;
    if (claimableLamports < BigInt(this.runtimeEnv.KAMIYO_KYOSHIN_AUTO_CLAIM_MIN_LAMPORTS)) return params.budget;

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

    this.db.addAction(params.tickId, 'kyoshin_staking_claim', {
      source: 'runtime_kyoshin_staking_claim',
      pool: this.runtimeEnv.KAMIYO_KYOSHIN_STAKING_POOL,
      claimer: claimer.keypair.publicKey.toBase58(),
      periodNumbers,
      claimableLamports: claimableLamports.toString(),
      keySource: claimer.source,
    }, { claims });

    const receiptPath = writeOutbox(resolvePath(this.runtimeEnv.KAMIYO_OUTBOX_DIR), 'kyoshin-staking-claim-receipt', {
      tickId: params.tickId,
      at: new Date().toISOString(),
      source: 'runtime_kyoshin_staking_claim',
      pool: this.runtimeEnv.KAMIYO_KYOSHIN_STAKING_POOL,
      claimer: claimer.keypair.publicKey.toBase58(),
      periodNumbers,
      claimableLamports: claimableLamports.toString(),
      claims,
    });
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
      await this.rpcRead('read_depositor_balance', connection => connection.getBalance(params.depositor.publicKey, 'confirmed'))
    );

    const reserveLamports = BigInt(this.runtimeEnv.KAMIYO_AUTO_STAKE_RESERVE_LAMPORTS);
    const minLamports = BigInt(this.runtimeEnv.KAMIYO_AUTO_STAKE_MIN_LAMPORTS);
    const availableLamports = balanceLamports > reserveLamports ? balanceLamports - reserveLamports : 0n;
    const targetLamports = (availableLamports * BigInt(this.executionPolicy.autoStakeAvailableBps)) / 10_000n;
    const maxLamportsPerTx = BigInt(this.executionPolicy.autoStakeMaxLamportsPerTx);

    const routeLamports =
      maxLamportsPerTx > 0n && targetLamports > maxLamportsPerTx ? maxLamportsPerTx : targetLamports;

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
    const stakingPeriod = await this.rpcRead('find_latest_open_staking_period', connection =>
      findLatestOpenStakingPeriod(connection, pool)
    );
    if (!stakingPeriod) return params.budget;

    const depositResult = await depositToStakingPeriod({
      connection: this.rpcConnections[0],
      depositor: params.depositor,
      pool,
      stakingPeriod: new PublicKey(stakingPeriod.address),
      amountLamports: routeLamports,
      dryRun: false,
    });

    this.db.addAction(params.tickId, 'staking_period_deposit', {
      source: params.source,
      pool: pool.toBase58(),
      stakingPeriod: stakingPeriod.address,
      routeLamports: routeLamports.toString(),
      routeSol,
      reserveLamports: reserveLamports.toString(),
      availableBps: this.executionPolicy.autoStakeAvailableBps,
    }, depositResult);

    const receiptPath = writeOutbox(resolvePath(this.runtimeEnv.KAMIYO_OUTBOX_DIR), 'staking-deposit-receipt', {
      tickId: params.tickId,
      at: new Date().toISOString(),
      source: params.source,
      pool: pool.toBase58(),
      stakingPeriod: stakingPeriod.address,
      routeLamports: routeLamports.toString(),
      routeSol,
      signature: depositResult.signature,
      periodVault: depositResult.periodVault,
    });
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
      if (Number.isFinite(elapsedMs) && elapsedMs < this.runtimeEnv.KAMIYO_SWARM_ROLLBACK_EVAL_INTERVAL_HOURS * 3_600_000) {
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

    const receiptPath = writeOutbox(resolvePath(this.runtimeEnv.KAMIYO_OUTBOX_DIR), 'swarm-rollback-policy', {
      tickId: params.tickId,
      at: params.nowIso,
      weeklyNetSol,
      sourceStats,
      evaluation: rollbackEvaluation,
    });

    this.db.addAction(params.tickId, 'swarm_rollback_policy', {
      windowDays: this.runtimeEnv.KAMIYO_SWARM_ROLLBACK_WINDOW_DAYS,
      trigger: this.runtimeEnv.KAMIYO_SWARM_ROLLBACK_NET_SOL_TRIGGER,
    }, {
      weeklyNetSol,
      disabledSources: rollbackEvaluation.disabledSources,
      triggered: rollbackEvaluation.triggered,
      receiptPath,
    });
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

    const result = this.db.pruneHistory(cutoffs);
    this.db.kvSet('retention_last_at', params.nowIso);
    this.db.addAction(params.tickId, 'retention_prune', cutoffs, result);
  }

  private deriveSourceQuality(): Partial<Record<'x402' | 'relevance' | 'agent_ai' | 'kore' | 'direct' | 'internal', number>> {
    const since = new Date(Date.now() - this.runtimeEnv.KAMIYO_SWARM_SOURCE_FEEDBACK_WINDOW_HOURS * 3_600_000).toISOString();
    const stats = this.db.swarmSourceStatsSince(since);
    const quality: Partial<Record<'x402' | 'relevance' | 'agent_ai' | 'kore' | 'direct' | 'internal', number>> = {};

    for (const row of stats) {
      if (row.total < this.runtimeEnv.KAMIYO_SWARM_SOURCE_FEEDBACK_MIN_SAMPLES) continue;
      const successRate = row.total > 0 ? row.succeeded / row.total : 0;
      const marginBias = row.revenueSol >= 0 ? 0.25 : -0.25;
      const q = Math.max(0.3, Math.min(1.3, successRate + marginBias));

      if (
        row.source === 'x402' ||
        row.source === 'relevance' ||
        row.source === 'agent_ai' ||
        row.source === 'kore' ||
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

    const opportunitiesById = new Map(intake.opportunities.map(opportunity => [opportunity.id, opportunity]));
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
    const txToday = txTools.reduce((sum, tool) => sum + this.db.actionCountSince(dayStartIso, tool), 0);

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
