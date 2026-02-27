import Anthropic from '@anthropic-ai/sdk';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { AgentType, KAMIYO_PROGRAM_ID } from '@kamiyo/sdk';

import { env } from './config.js';
import { identityFromEnv, identityPrompt } from './identity.js';
import { openDb } from './db.js';
import { loadOperatorKeypair } from './wallet.js';
import { KeypairWallet } from './anchorWallet.js';
import { getOrCreateAgentIdentity } from './kamiyo.js';
import { writeOutbox } from './outbox.js';
import { KamiyoAgent, type ToolConfig } from './agent.js';
import { claimFeeVault, readFeeVault } from './tools/feeVault.js';
import {
  claimFundryStakingPeriods,
  getClaimableLamports,
  readFundryUserPosition,
  type FundryUserPosition,
} from './tools/fundryStaking.js';
import { depositToStakingPeriod, ensureOpenStakingPeriod, findLatestOpenStakingPeriod } from './tools/stakingPool.js';
import { fetchTokenStatus } from './tools/tokenStatus.js';
import { createDkgActivityPublisher, type DkgActivityEvent } from './dkgActivity.js';
import { ensureMeishiTrust } from './meishiTrust.js';
import { readTrustedLaunchState } from './trustedLaunch.js';
import { loadSwarmRegistry } from './swarm/registry.js';
import { planSwarmMissions, type SwarmMissionOpportunityHint } from './swarm/planner.js';
import {
  collectSwarmOpportunities,
  type LeadConversionPolicy,
  type MarketplaceFeedConfig,
  type SwarmOpportunitySource,
  type SwarmOpportunityIntake,
} from './swarm/opportunities.js';
import { executeAssignedOpportunity, type SourceAuthMap } from './swarm/jobs.js';
import {
  evaluateSwarmPerformance,
  parsePriorityState,
  type SwarmAgentRuntimeMetrics,
} from './swarm/performance.js';
import {
  isMarginCircuitOpen,
  parseMarginCircuitState,
  pruneMarginCircuitState,
  updateMarginCircuit,
} from './swarm/circuitBreaker.js';
import { revenueLaneForOpportunitySource, summariseLaneStats } from './swarm/revenue.js';
import { buildAutonomySloReport } from './swarm/slo.js';
import {
  evaluateRollbackPolicy,
  isRollbackSourceDisabled,
  parseRollbackState,
  pruneRollbackState,
} from './swarm/rollback.js';
import type { SwarmRegistry } from './swarm/types.js';

const STAKING_PERIOD_MAINTENANCE_INTERVAL_MS = 15 * 60_000;

function startOfUtcDayIso(now = new Date()): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  return d.toISOString();
}

function minutesAgoIso(minutes: number, now = new Date()): string {
  return new Date(now.getTime() - minutes * 60_000).toISOString();
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  if (timeoutMs <= 0) return promise;

  let timer: NodeJS.Timeout | null = null;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

function uniqueNonEmptyStrings(values: string[]): string[] {
  return Array.from(new Set(values.map(value => value.trim()).filter(Boolean)));
}

function resolveAnthropicModelAlias(model: string): {
  model: string;
  aliasedFrom?: string;
} {
  const aliases: Record<string, string> = {
    'claude-3-5-haiku-latest': 'claude-haiku-4-5-20251001',
  };
  const normalized = model.trim();
  const mapped = aliases[normalized];
  if (!mapped) return { model: normalized };
  return { model: mapped, aliasedFrom: normalized };
}

async function postJsonWithTimeout(params: {
  url: string;
  payload: unknown;
  timeoutMs: number;
  headers?: Record<string, string>;
  body?: string;
}): Promise<{ ok: boolean; status: number; body: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), params.timeoutMs);
  const body = params.body ?? JSON.stringify(params.payload);
  try {
    const response = await fetch(params.url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(params.headers ?? {}),
      },
      body,
      signal: controller.signal,
    });
    const responseBody = await response.text();
    return { ok: response.ok, status: response.status, body: responseBody };
  } finally {
    clearTimeout(timeout);
  }
}

function daysAgoIso(days: number, now = new Date()): string {
  return new Date(now.getTime() - days * 86_400_000).toISOString();
}

function parseIsoMillis(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseNonNegativeInt(value: string | undefined, fallback = 0): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return parsed;
}

function hmacSha256Hex(secret: string, payload: string): string {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

function escapePrometheusLabel(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
}

function prometheusLine(name: string, value: number, labels?: Record<string, string>): string {
  const safeValue = Number.isFinite(value) ? value : 0;
  if (!labels || Object.keys(labels).length === 0) {
    return `${name} ${safeValue}`;
  }
  const serializedLabels = Object.entries(labels)
    .map(([key, label]) => `${key}="${escapePrometheusLabel(label)}"`)
    .join(',');
  return `${name}{${serializedLabels}} ${safeValue}`;
}

const FUNDRY_ACTION_TOOLS = ['kyoshin_staking_claim', 'swarm_agent_staking_claim'] as const;
const FUNDRY_ACTION_TOOL_SET = new Set<string>(FUNDRY_ACTION_TOOLS);

function isRateLimitErrorMessage(error: string | null | undefined): boolean {
  if (!error) return false;
  const normalized = error.toLowerCase();
  return (
    normalized.includes('429') ||
    normalized.includes('too many requests') ||
    normalized.includes('rate limit')
  );
}

function fundryTimeoutBudgetMs(params: {
  timeoutMs: number;
  retries: number;
  maxBackoffMs: number;
  requestCount?: number;
  floorMs?: number;
}): number {
  const requests = Math.max(1, params.requestCount ?? 1);
  const attemptsPerRequest = Math.max(1, Math.trunc(params.retries) + 1);
  const retryCount = Math.max(0, attemptsPerRequest - 1);
  const perRequestBudget = params.timeoutMs * attemptsPerRequest + params.maxBackoffMs * retryCount;
  return Math.max(params.floorMs ?? 0, perRequestBudget * requests);
}

function summarizeFundryActions(actions: Array<{ tool: string; error: string | null }>): {
  total: number;
  failed: number;
  rateLimited: number;
  byTool: Record<string, { total: number; failed: number; rateLimited: number }>;
} {
  const byTool: Record<string, { total: number; failed: number; rateLimited: number }> = {};
  let failed = 0;
  let rateLimited = 0;

  for (const action of actions) {
    if (!FUNDRY_ACTION_TOOL_SET.has(action.tool)) continue;
    const toolStats = byTool[action.tool] ?? { total: 0, failed: 0, rateLimited: 0 };
    toolStats.total += 1;
    if (action.error) {
      toolStats.failed += 1;
      failed += 1;
      if (isRateLimitErrorMessage(action.error)) {
        toolStats.rateLimited += 1;
        rateLimited += 1;
      }
    }
    byTool[action.tool] = toolStats;
  }

  const total = Object.values(byTool).reduce((sum, row) => sum + row.total, 0);
  return { total, failed, rateLimited, byTool };
}

function fundryReadTimeoutBudgetMs(): number {
  return fundryTimeoutBudgetMs({
    timeoutMs: env.KAMIYO_RPC_READ_TIMEOUT_MS,
    retries: env.KAMIYO_FUNDRY_HTTP_RETRIES,
    maxBackoffMs: env.KAMIYO_FUNDRY_HTTP_MAX_BACKOFF_MS,
    floorMs: env.KAMIYO_RPC_READ_TIMEOUT_MS,
  });
}

function fundryClaimTimeoutBudgetMs(periodCount: number): number {
  const periods = Math.max(1, periodCount);
  const confirmTimeoutMs = Math.max(env.KAMIYO_RPC_READ_TIMEOUT_MS * 2, 30_000);
  return (
    fundryTimeoutBudgetMs({
      timeoutMs: env.KAMIYO_RPC_READ_TIMEOUT_MS,
      retries: env.KAMIYO_FUNDRY_HTTP_RETRIES,
      maxBackoffMs: env.KAMIYO_FUNDRY_HTTP_MAX_BACKOFF_MS,
      requestCount: periods * 2,
      floorMs: Math.max(env.KAMIYO_RPC_READ_TIMEOUT_MS * 2, 45_000),
    }) +
    confirmTimeoutMs * periods
  );
}

function renderPrometheusMetrics(params: {
  db: ReturnType<typeof openDb>;
  nowIso: string;
}): string {
  const now = new Date(params.nowIso);
  const windowStartIso = daysAgoIso(env.KAMIYO_SWARM_SLO_REPORT_WINDOW_DAYS, now);
  const tickStats = params.db.tickStatsSince(windowStartIso);
  const actions = params.db.actionsSince(windowStartIso);
  const routeActions = params.db.actionsSince(windowStartIso, 'staking_period_deposit');
  const revenueStats = params.db.revenueLaneStatsSince(windowStartIso);
  const revenueSummary = summariseLaneStats(revenueStats);
  const sloReport = buildAutonomySloReport({
    nowIso: params.nowIso,
    windowDays: env.KAMIYO_SWARM_SLO_REPORT_WINDOW_DAYS,
    ticks: params.db.ticksSince(windowStartIso),
    actions,
    routeActions,
    revenueLaneStats: revenueStats,
    interventionTools: ['propose_action'],
  });

  const rollbackState = pruneRollbackState({
    state: parseRollbackState(params.db.kvGet('swarm_rollback_state')),
    nowIso: params.nowIso,
  });
  const rollbackSources = Object.values(rollbackState.sources).filter(value => value != null);
  const fundryWindowStartIso = minutesAgoIso(env.KAMIYO_FUNDRY_METRICS_WINDOW_MINUTES, now);
  const fundryActions = params.db.actionsSince(fundryWindowStartIso);
  const fundryStats = summarizeFundryActions(
    fundryActions.map(action => ({
      tool: action.tool,
      error: action.error,
    }))
  );
  const fundryErrorRate = fundryStats.total > 0 ? fundryStats.failed / fundryStats.total : 0;
  const fundryWindowLabel = String(env.KAMIYO_FUNDRY_METRICS_WINDOW_MINUTES);

  const lines = [
    '# HELP kamiyo_process_up Process health state (1 = up).',
    '# TYPE kamiyo_process_up gauge',
    prometheusLine('kamiyo_process_up', 1),
    '# HELP kamiyo_swarm_tick_total Total ticks in the SLO window by status.',
    '# TYPE kamiyo_swarm_tick_total gauge',
    prometheusLine('kamiyo_swarm_tick_total', tickStats.ok, { status: 'ok' }),
    prometheusLine('kamiyo_swarm_tick_total', tickStats.error, { status: 'error' }),
    prometheusLine('kamiyo_swarm_tick_total', tickStats.running, { status: 'running' }),
    '# HELP kamiyo_swarm_non_intervention_rate Fraction of ticks without manual intervention.',
    '# TYPE kamiyo_swarm_non_intervention_rate gauge',
    prometheusLine('kamiyo_swarm_non_intervention_rate', sloReport.metrics.nonInterventionRate),
    '# HELP kamiyo_swarm_route_success_rate Fraction of successful route actions.',
    '# TYPE kamiyo_swarm_route_success_rate gauge',
    prometheusLine('kamiyo_swarm_route_success_rate', sloReport.metrics.routeSuccessRate),
    '# HELP kamiyo_swarm_decision_loop_uptime Decision loop uptime in the SLO window.',
    '# TYPE kamiyo_swarm_decision_loop_uptime gauge',
    prometheusLine('kamiyo_swarm_decision_loop_uptime', sloReport.metrics.decisionLoopUptime),
    '# HELP kamiyo_swarm_revenue_sol Revenue totals by lane in SOL.',
    '# TYPE kamiyo_swarm_revenue_sol gauge',
    ...revenueSummary.byLane.map(lane =>
      prometheusLine('kamiyo_swarm_revenue_sol', lane.amountSol, { lane: lane.lane })
    ),
    '# HELP kamiyo_swarm_revenue_events Revenue event totals by lane.',
    '# TYPE kamiyo_swarm_revenue_events gauge',
    ...revenueSummary.byLane.map(lane =>
      prometheusLine('kamiyo_swarm_revenue_events', lane.events, { lane: lane.lane })
    ),
    '# HELP kamiyo_fundry_claim_actions_total Fundry claim actions observed in the recent metrics window.',
    '# TYPE kamiyo_fundry_claim_actions_total gauge',
    prometheusLine('kamiyo_fundry_claim_actions_total', fundryStats.total, {
      status: 'total',
      window_minutes: fundryWindowLabel,
    }),
    prometheusLine('kamiyo_fundry_claim_actions_total', fundryStats.failed, {
      status: 'failed',
      window_minutes: fundryWindowLabel,
    }),
    prometheusLine('kamiyo_fundry_claim_actions_total', fundryStats.rateLimited, {
      status: 'rate_limited',
      window_minutes: fundryWindowLabel,
    }),
    '# HELP kamiyo_fundry_claim_error_rate Fundry claim action error rate in the recent metrics window.',
    '# TYPE kamiyo_fundry_claim_error_rate gauge',
    prometheusLine('kamiyo_fundry_claim_error_rate', fundryErrorRate, {
      window_minutes: fundryWindowLabel,
    }),
    '# HELP kamiyo_fundry_claim_actions_by_tool Fundry claim actions by tool and status in the recent metrics window.',
    '# TYPE kamiyo_fundry_claim_actions_by_tool gauge',
    ...(Object.entries(fundryStats.byTool).length === 0
      ? [
          prometheusLine('kamiyo_fundry_claim_actions_by_tool', 0, {
            tool: 'none',
            status: 'total',
            window_minutes: fundryWindowLabel,
          }),
        ]
      : Object.entries(fundryStats.byTool).flatMap(([tool, stats]) => [
          prometheusLine('kamiyo_fundry_claim_actions_by_tool', stats.total, {
            tool,
            status: 'total',
            window_minutes: fundryWindowLabel,
          }),
          prometheusLine('kamiyo_fundry_claim_actions_by_tool', stats.failed, {
            tool,
            status: 'failed',
            window_minutes: fundryWindowLabel,
          }),
          prometheusLine('kamiyo_fundry_claim_actions_by_tool', stats.rateLimited, {
            tool,
            status: 'rate_limited',
            window_minutes: fundryWindowLabel,
          }),
        ])),
    '# HELP kamiyo_swarm_rollback_source_disabled Whether a source is currently disabled by rollback policy.',
    '# TYPE kamiyo_swarm_rollback_source_disabled gauge',
  ];

  if (rollbackSources.length === 0) {
    lines.push(prometheusLine('kamiyo_swarm_rollback_source_disabled', 0, { source: 'none' }));
  } else {
    for (const source of rollbackSources) {
      lines.push(
        prometheusLine('kamiyo_swarm_rollback_source_disabled', 1, {
          source: source.source,
          reason: source.reason,
        })
      );
    }
  }

  return `${lines.join('\n')}\n`;
}

function resolveSwarmClaimerKeypairPath(inputPath: string): {
  resolvedPath?: string;
  candidates: string[];
} {
  const raw = inputPath.trim();
  if (!raw) return { candidates: [] };

  if (path.isAbsolute(raw)) {
    return { resolvedPath: fs.existsSync(raw) ? raw : undefined, candidates: [raw] };
  }

  const repoRoot = path.resolve(SERVICE_DIR, '../..');
  const candidates = [path.resolve(SERVICE_DIR, raw), path.resolve(repoRoot, raw)];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return { resolvedPath: candidate, candidates };
  }

  return { resolvedPath: undefined, candidates };
}

function pruneOutbox(params: { outboxDir: string; olderThanIso: string; maxFiles: number }): {
  deletedByAge: number;
  deletedByCount: number;
  kept: number;
} {
  const { outboxDir, olderThanIso, maxFiles } = params;
  if (!fs.existsSync(outboxDir)) {
    return { deletedByAge: 0, deletedByCount: 0, kept: 0 };
  }

  const cutoffMs = Date.parse(olderThanIso);
  const entries = fs
    .readdirSync(outboxDir, { withFileTypes: true })
    .filter(entry => entry.isFile())
    .flatMap(entry => {
      const filePath = path.join(outboxDir, entry.name);
      try {
        const stat = fs.statSync(filePath);
        return [{ filePath, mtimeMs: stat.mtimeMs }];
      } catch {
        return [];
      }
    })
    .sort((a, b) => a.mtimeMs - b.mtimeMs);

  let deletedByAge = 0;
  const survivors: Array<{ filePath: string; mtimeMs: number }> = [];
  for (const entry of entries) {
    if (Number.isFinite(cutoffMs) && entry.mtimeMs < cutoffMs) {
      try {
        fs.unlinkSync(entry.filePath);
        deletedByAge += 1;
      } catch {
        survivors.push(entry);
      }
      continue;
    }
    survivors.push(entry);
  }

  let deletedByCount = 0;
  if (maxFiles > 0 && survivors.length > maxFiles) {
    const overflow = survivors.length - maxFiles;
    for (let i = 0; i < overflow; i += 1) {
      try {
        fs.unlinkSync(survivors[i].filePath);
        deletedByCount += 1;
      } catch {
        // Best effort.
      }
    }
  }

  const kept = Math.max(0, survivors.length - deletedByCount);
  return { deletedByAge, deletedByCount, kept };
}

type ProcessLock = {
  lockPath: string;
  fd: number;
};

type FeeVaultBreakdown = Awaited<ReturnType<typeof readFeeVault>>;
const SERVICE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function toLamports(value: unknown): bigint {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (!Number.isInteger(value)) throw new Error(`Expected integer lamports, got: ${value}`);
    return BigInt(value);
  }
  if (typeof value === 'string') {
    if (!/^\d+$/.test(value.trim())) throw new Error(`Invalid lamports string: ${value}`);
    return BigInt(value);
  }
  throw new Error(`Unsupported lamports value: ${String(value)}`);
}

function lamportsToSol(lamports: bigint): number {
  return Number(lamports) / 1e9;
}

function getUserUnclaimedLamports(breakdown: FeeVaultBreakdown, address: string): bigint {
  const user = breakdown.userFees.find(entry => entry.address === address);
  if (!user) return 0n;
  return toLamports(user.feeUnclaimed);
}

function parsePeriodNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0) return value;
  if (typeof value === 'string' && /^\d+$/.test(value)) return Number(value);
  return null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function asBool(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

type TrustCheck = {
  id: string;
  required: boolean;
  ok: boolean;
  detail: string;
};

function buildTrustLayerObservation(params: {
  agentExists: boolean;
  agentIdentity: string;
  targetMint?: string;
  meishiEnabled: boolean;
  meishiAgentIdentity?: string;
  meishiAgentIdentitySource?: string;
  meishi?: Record<string, unknown>;
  trustedLaunch?: Record<string, unknown>;
  dkgEnabled: boolean;
  dkgActivity?: Record<string, unknown>;
}): {
  ready: boolean;
  blocking: string[];
  warnings: string[];
  checks: TrustCheck[];
} {
  const checks: TrustCheck[] = [];
  const meishiCompliant =
    asBool(params.meishi?.compliant) === true &&
    asBool(params.meishi?.mandateValid) === true &&
    asBool(params.meishi?.suspended) !== true;

  checks.push({
    id: 'agent_identity_active',
    required: true,
    ok: params.agentExists,
    detail: params.agentExists ? `active:${params.agentIdentity}` : 'agent identity missing',
  });

  if (params.targetMint) {
    const linked = asBool(params.trustedLaunch?.linked) === true;
    const launchReason =
      asString(params.trustedLaunch?.reason) ??
      (linked ? 'launch_record_and_rate_limit_linked' : 'trusted_launch_link_missing');
    checks.push({
      id: 'trusted_launch_link',
      required: true,
      ok: linked,
      detail: launchReason,
    });
  } else {
    checks.push({
      id: 'trusted_launch_link',
      required: false,
      ok: false,
      detail: 'target mint not configured',
    });
  }

  if (params.meishiEnabled) {
    const reason =
      asString(params.meishi?.reason) ??
      asString(params.meishi?.error) ??
      (meishiCompliant ? 'passport verified' : 'passport not fully verified');
    checks.push({
      id: 'meishi_compliance',
      required: true,
      ok: meishiCompliant,
      detail: reason,
    });
  }

  const dkgReason = asString(params.dkgActivity?.reason);
  const dkgHealthy =
    asBool(params.dkgActivity?.published) === true ||
    dkgReason === 'no_events' ||
    dkgReason === 'propose_mode' ||
    dkgReason === 'disabled' ||
    dkgReason === 'missing_config';
  checks.push({
    id: 'dkg_activity_feed',
    required: false,
    ok: !params.dkgEnabled || dkgHealthy,
    detail: params.dkgEnabled ? (dkgReason ?? (dkgHealthy ? 'published' : 'unknown')) : 'disabled',
  });

  if (params.meishiAgentIdentity && params.meishiAgentIdentity !== params.agentIdentity) {
    const dualIdentityMode = params.meishiAgentIdentitySource === 'override' && meishiCompliant;
    checks.push({
      id: 'identity_alignment',
      required: false,
      ok: dualIdentityMode,
      detail: dualIdentityMode
        ? `dual_identity_mode: primary=${params.agentIdentity}, meishi=${params.meishiAgentIdentity}`
        : `primary=${params.agentIdentity}, meishi=${params.meishiAgentIdentity}`,
    });
  } else {
    checks.push({
      id: 'identity_alignment',
      required: false,
      ok: true,
      detail: params.meishiAgentIdentity ? params.agentIdentity : 'single identity',
    });
  }

  const blocking = checks.filter(check => check.required && !check.ok).map(check => check.id);
  const warnings = checks.filter(check => !check.required && !check.ok).map(check => check.id);

  return {
    ready: blocking.length === 0,
    blocking,
    warnings,
    checks,
  };
}

function getClaimablePeriodNumbers(position: FundryUserPosition, maxPeriods: number): number[] {
  const raw = Array.isArray(position.rewards?.claimablePeriods)
    ? position.rewards.claimablePeriods
    : [];
  const numbers = raw.flatMap(period => {
    const payload = period as Record<string, unknown>;
    const direct = parsePeriodNumber(payload.periodNumber);
    if (direct != null) return [direct];

    const nestedPayload = payload.period;
    const nested =
      nestedPayload && typeof nestedPayload === 'object'
        ? parsePeriodNumber((nestedPayload as Record<string, unknown>).periodNumber)
        : null;
    if (nested != null) return [nested];
    return [];
  });
  return [...new Set(numbers)].slice(0, Math.max(1, maxPeriods));
}

async function maintainOpenStakingPeriod(params: {
  connection: Connection;
  db: ReturnType<typeof openDb>;
  tickId: string;
  poolAddress: string;
  admin: Keypair;
  source: string;
}) {
  const meta = {
    source: params.source,
    pool: params.poolAddress,
    wallet: params.admin.publicKey.toBase58(),
  };

  try {
    const pool = new PublicKey(params.poolAddress);
    let period = await withTimeout(
      findLatestOpenStakingPeriod(params.connection, pool),
      env.KAMIYO_RPC_READ_TIMEOUT_MS,
      `find_latest_open_staking_period timed out after ${env.KAMIYO_RPC_READ_TIMEOUT_MS}ms`
    );
    if (period) {
      return { checked: true, maintained: false, reason: 'open_period_exists', period, ...meta };
    }

    const rollover = await withTimeout(
      ensureOpenStakingPeriod({
        connection: params.connection,
        admin: params.admin,
        pool,
      }),
      Math.max(env.KAMIYO_RPC_READ_TIMEOUT_MS * 3, 60_000),
      'ensure_open_staking_period timed out'
    );
    period = rollover.period;

    if (rollover.createSignature || rollover.activateSignature) {
      params.db.addAction(
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
            period,
          },
        }
      );
    }

    if (!period) {
      const error = 'no_open_period_after_rollover';
      params.db.addAction(params.tickId, 'staking_period_rollover', meta, null, error);
      return { checked: true, maintained: false, reason: error, period: null, ...meta };
    }

    return {
      checked: true,
      maintained: Boolean(rollover.createSignature || rollover.activateSignature),
      reason: 'open_period_ready',
      period,
      createSignature: rollover.createSignature,
      activateSignature: rollover.activateSignature,
      ...meta,
    };
  } catch (error) {
    const message = toErrorMessage(error);
    params.db.addAction(params.tickId, 'staking_period_rollover', meta, null, message);
    return { checked: true, maintained: false, reason: 'rollover_failed', error: message, period: null, ...meta };
  }
}

async function runAutoStakePolicy(params: {
  connection: Connection;
  db: ReturnType<typeof openDb>;
  tickId: string;
  dayStart: string;
  outboxDir: string;
  poolAddress: string;
  depositor: Keypair;
  source: string;
  currentBalanceLamports: bigint;
}) {
  const feedsToday = params.db.actionCountSince(params.dayStart, 'staking_period_deposit');
  const minLamports = BigInt(env.KAMIYO_AUTO_STAKE_MIN_LAMPORTS);
  const reserveLamports = BigInt(env.KAMIYO_AUTO_STAKE_RESERVE_LAMPORTS);
  const availableBps = BigInt(env.KAMIYO_AUTO_STAKE_AVAILABLE_BPS);
  const maxLamportsPerTx = BigInt(env.KAMIYO_AUTO_STAKE_MAX_LAMPORTS_PER_TX);
  const availableLamports =
    params.currentBalanceLamports > reserveLamports
      ? params.currentBalanceLamports - reserveLamports
      : 0n;
  const targetLamports = (availableLamports * availableBps) / 10_000n;

  const meta = {
    source: params.source,
    wallet: params.depositor.publicKey.toBase58(),
    pool: params.poolAddress,
    feedsToday,
    dailyCap: env.KAMIYO_AUTO_STAKE_MAX_FEEDS_PER_DAY,
    minLamports: minLamports.toString(),
    reserveLamports: reserveLamports.toString(),
    availableBps: env.KAMIYO_AUTO_STAKE_AVAILABLE_BPS,
    maxLamportsPerTx: maxLamportsPerTx.toString(),
    operatorBalanceLamports: params.currentBalanceLamports.toString(),
    availableLamports: availableLamports.toString(),
    targetLamports: targetLamports.toString(),
  };

  if (feedsToday >= env.KAMIYO_AUTO_STAKE_MAX_FEEDS_PER_DAY) {
    return {
      observation: { executed: false, reason: 'daily_feed_cap_reached', ...meta },
      nextBalanceLamports: params.currentBalanceLamports,
      period: null as unknown,
    };
  }

  if (availableLamports < minLamports) {
    return {
      observation: { executed: false, reason: 'below_threshold', ...meta },
      nextBalanceLamports: params.currentBalanceLamports,
      period: null as unknown,
    };
  }

  try {
    const pool = new PublicKey(params.poolAddress);
    let period = await withTimeout(
      findLatestOpenStakingPeriod(params.connection, pool),
      env.KAMIYO_RPC_READ_TIMEOUT_MS,
      `find_latest_open_staking_period timed out after ${env.KAMIYO_RPC_READ_TIMEOUT_MS}ms`
    );

    let rolloverResult:
      | Awaited<ReturnType<typeof ensureOpenStakingPeriod>>
      | null = null;
    if (!period) {
      rolloverResult = await withTimeout(
        ensureOpenStakingPeriod({
          connection: params.connection,
          admin: params.depositor,
          pool,
        }),
        Math.max(env.KAMIYO_RPC_READ_TIMEOUT_MS * 3, 60_000),
        'ensure_open_staking_period timed out'
      );
      period = rolloverResult.period;

      if (rolloverResult.createSignature || rolloverResult.activateSignature) {
        params.db.addAction(
          params.tickId,
          'staking_period_rollover',
          {
            source: params.source,
            wallet: params.depositor.publicKey.toBase58(),
            pool: pool.toBase58(),
            createdPeriod: rolloverResult.createdPeriod?.address ?? null,
            createdPeriodNumber: rolloverResult.createdPeriod?.periodNumber ?? null,
          },
          {
            success: true,
            data: {
              createSignature: rolloverResult.createSignature,
              activateSignature: rolloverResult.activateSignature,
              period: period,
            },
          }
        );
      }
    }

    if (!period) {
      return {
        observation: { executed: false, reason: 'no_open_period', ...meta },
        nextBalanceLamports: params.currentBalanceLamports,
        period: null as unknown,
      };
    }

    const stakeLamports =
      maxLamportsPerTx > 0n && targetLamports > maxLamportsPerTx
        ? maxLamportsPerTx
        : targetLamports;
    if (stakeLamports < minLamports) {
      return {
        observation: {
          executed: false,
          reason: 'below_threshold_after_policy',
          period,
          ...meta,
        },
        nextBalanceLamports: params.currentBalanceLamports,
        period,
      };
    }

    const depositResult = await withTimeout(
      depositToStakingPeriod({
        connection: params.connection,
        depositor: params.depositor,
        pool,
        stakingPeriod: new PublicKey(period.address),
        amountLamports: stakeLamports,
        dryRun: false,
      }),
      Math.max(env.KAMIYO_RPC_READ_TIMEOUT_MS * 2, 45_000),
      'deposit_to_staking_period timed out'
    );

    params.db.addAction(
      params.tickId,
      'staking_period_deposit',
      {
        source: params.source,
        wallet: params.depositor.publicKey.toBase58(),
        pool: pool.toBase58(),
        stakingPeriod: period.address,
        amountLamports: stakeLamports.toString(),
        reserveLamports: reserveLamports.toString(),
        minLamports: minLamports.toString(),
        availableBps: env.KAMIYO_AUTO_STAKE_AVAILABLE_BPS,
        targetLamports: targetLamports.toString(),
      },
      {
        success: true,
        data: depositResult,
      }
    );

    const receiptPath = writeOutbox(params.outboxDir, 'staking-deposit-receipt', {
      at: new Date().toISOString(),
      mode: 'auto',
      source: params.source,
      depositor: params.depositor.publicKey.toBase58(),
      pool: pool.toBase58(),
      stakingPeriod: period.address,
      periodNumber: period.periodNumber,
      amountLamports: stakeLamports.toString(),
      amountSol: lamportsToSol(stakeLamports),
      reserveLamports: reserveLamports.toString(),
      availableBps: env.KAMIYO_AUTO_STAKE_AVAILABLE_BPS,
      targetLamports: targetLamports.toString(),
      signature: depositResult.signature,
      periodVault: depositResult.periodVault,
      beforeBalanceLamports: String(depositResult.beforeBalanceLamports),
      afterBalanceLamports: String(depositResult.afterBalanceLamports),
      beforePeriod: depositResult.beforePeriod,
      afterPeriod: depositResult.afterPeriod,
    });
    params.db.addAction(params.tickId, 'write_staking_deposit_receipt', {}, { receiptPath });

    return {
      observation: {
        executed: true,
        signature: depositResult.signature,
        receiptPath,
        amountLamports: stakeLamports.toString(),
        amountSol: lamportsToSol(stakeLamports),
        stakingPeriod: period.address,
        periodNumber: period.periodNumber,
        periodVault: depositResult.periodVault,
        ...meta,
      },
      nextBalanceLamports: BigInt(depositResult.afterBalanceLamports),
      period: depositResult.afterPeriod ?? period,
    };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    params.db.addAction(
      params.tickId,
      'staking_period_deposit',
      {
        source: params.source,
        wallet: params.depositor.publicKey.toBase58(),
        pool: params.poolAddress,
      },
      null,
      error
    );

    return {
      observation: { executed: false, reason: 'stake_failed', error, ...meta },
      nextBalanceLamports: params.currentBalanceLamports,
      period: null as unknown,
    };
  }
}

function resolvePath(inputPath: string): string {
  return path.isAbsolute(inputPath) ? inputPath : path.resolve(SERVICE_DIR, inputPath);
}

function isProcessRunning(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function acquireProcessLock(lockPathInput: string): ProcessLock {
  const lockPath = resolvePath(lockPathInput);
  fs.mkdirSync(path.dirname(lockPath), { recursive: true });

  const writeLock = (): ProcessLock => {
    const fd = fs.openSync(lockPath, 'wx', 0o600);
    const payload = {
      pid: process.pid,
      startedAt: new Date().toISOString(),
      cwd: process.cwd(),
    };
    fs.writeFileSync(fd, JSON.stringify(payload));
    return { lockPath, fd };
  };

  try {
    return writeLock();
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    if (e.code !== 'EEXIST') throw err;

    let existingPid: number | undefined;
    try {
      const raw = fs.readFileSync(lockPath, 'utf8');
      const parsed = JSON.parse(raw) as { pid?: number };
      existingPid = parsed.pid;
    } catch {
      existingPid = undefined;
    }

    if (existingPid && isProcessRunning(existingPid)) {
      throw new Error(`operator lock already held by pid ${existingPid}`);
    }

    try {
      fs.unlinkSync(lockPath);
    } catch {
      // Best effort cleanup of stale lock.
    }

    return writeLock();
  }
}

function releaseProcessLock(lock: ProcessLock): void {
  try {
    fs.closeSync(lock.fd);
  } catch {
    // Best effort.
  }
  try {
    fs.unlinkSync(lock.lockPath);
  } catch {
    // Best effort.
  }
}

function agentTypeFromEnv(value: string): AgentType {
  const key = value as keyof typeof AgentType;
  const parsed = AgentType[key];
  if (typeof parsed !== 'number') throw new Error(`Invalid KAMIYO_AGENT_TYPE: ${value}`);
  return parsed;
}

function buildSystemPrompt(params: {
  identity: string;
  observation: unknown;
  mode: 'propose' | 'execute';
  allowedChannels: string[];
  primeDirective: string;
  targetMint?: string;
  swarm: {
    enabled: boolean;
    proposeOnly: boolean;
    missionsPerTick: number;
    maxActiveAgents: number;
  };
  budgets: {
    solDailyCap: number;
    solPerTxCap: number;
    maxTxPerDay: number;
    maxFeeClaimsPerDay: number;
    maxStakeFeedsPerDay: number;
    llmMaxTurnsPerDay: number;
    llmMaxInputTokensPerDay: number;
    llmMaxOutputTokensPerDay: number;
  };
}) {
  const targetLine = params.targetMint
    ? `Target mint: ${params.targetMint}`
    : 'Target mint: (not set yet)';
  const swarmLine = params.swarm.enabled
    ? `Swarm mode: enabled (propose-only=${params.swarm.proposeOnly}, max active agents=${params.swarm.maxActiveAgents}, missions per tick=${params.swarm.missionsPerTick})`
    : 'Swarm mode: disabled';
  const swarmConstraintLine = params.swarm.enabled
    ? params.swarm.proposeOnly
      ? '- Subagent swarm execution is proposal-only in this phase. Plan and assign missions, but do not execute swarm financial actions directly.'
      : '- Swarm execution is enabled. Respect all existing guardrails and receipt requirements.'
    : '- Swarm planning is disabled unless explicitly enabled by config.';

  return `${params.identity}

You are Kamiyo Operator: Kyoshin parent runtime for revenue-focused subagent operations.

NON-NEGOTIABLE CONSTRAINTS:
- Do NOT mint or launch tokens directly from this runtime tick.
- Do NOT propose actions that require discretionary trading.
- If an action moves funds or changes on-chain state, use propose_action unless it is explicitly safe and within execution mode.
- Routine fee-vault claims and staking-pool feeds are runtime-managed in execute mode. Do not create routine proposals for them.
${swarmConstraintLine}

Execution mode: ${params.mode}
Allowed announcement channels: ${params.allowedChannels.join(', ')}
${targetLine}
${swarmLine}

PRIMARY DIRECTIVE (single objective):
${params.primeDirective}

Success is:
- More realized SOL fees/revenue.
- More SOL routed to $KAMIYO staking for $KAMIYO stakers.
- A more reliable repeatable revenue loop.

Budgets (hard limits):
- SOL/day: ${params.budgets.solDailyCap}
- SOL/tx: ${params.budgets.solPerTxCap}
- tx/day: ${params.budgets.maxTxPerDay}
- fee claims/day: ${params.budgets.maxFeeClaimsPerDay}
- staking feeds/day: ${params.budgets.maxStakeFeedsPerDay}
- LLM turns/day: ${params.budgets.llmMaxTurnsPerDay}
- LLM input tokens/day: ${params.budgets.llmMaxInputTokensPerDay}
- LLM output tokens/day: ${params.budgets.llmMaxOutputTokensPerDay}

Current observation (JSON):
${JSON.stringify(params.observation, null, 2)}

Operating style:
- Be specific. Prefer measurable actions.
- Keep announcements concise. No fluff.
- Run a hypothesis loop every tick: hypothesis -> action/proposal -> measured result -> next step.
- Call record_learning once per tick with what you learned.
- Always end with a short operator summary: what changed, what to do next, and what you need from humans.
`;
}

function normalizeBoolean(input: unknown): boolean {
  if (typeof input === 'boolean') return input;
  if (typeof input === 'string') return input.trim().toLowerCase() === 'true';
  return false;
}

function toolTokenStatus(params: { getConnection: () => Connection; defaultMint?: string }): ToolConfig {
  return {
    name: 'token_status',
    description:
      'Fetch on-chain status for a token mint (supply, decimals, authorities, Metaplex metadata).',
    parameters: {
      mint: { type: 'string', description: 'Mint address (defaults to KAMIYO_TARGET_MINT).' },
    },
    handler: async input => {
      const mintStr = String((input.mint ?? params.defaultMint ?? '') as string).trim();
      if (!mintStr)
        return { success: false, error: 'Missing mint. Set KAMIYO_TARGET_MINT or pass mint.' };

      let mint: PublicKey;
      try {
        mint = new PublicKey(mintStr);
      } catch {
        return { success: false, error: 'Invalid mint public key' };
      }

      const status = await withTimeout(
        fetchTokenStatus({ connection: params.getConnection(), mint }),
        env.KAMIYO_RPC_READ_TIMEOUT_MS,
        'token_status timed out'
      );
      return { success: true, data: status };
    },
  };
}

function toolFeeVaultRead(params: {
  getConnection: () => Connection;
  defaultVault?: string;
}): ToolConfig {
  return {
    name: 'fee_vault_read',
    description: 'Read the Meteora fee vault breakdown for a given vault (no signing).',
    parameters: {
      feeVault: {
        type: 'string',
        description: 'Fee vault address (defaults to KAMIYO_FEE_VAULT).',
      },
    },
    handler: async input => {
      const vaultStr = String((input.feeVault ?? params.defaultVault ?? '') as string).trim();
      if (!vaultStr)
        return {
          success: false,
          error: 'Missing feeVault. Set KAMIYO_FEE_VAULT or pass feeVault.',
        };

      let feeVault: PublicKey;
      try {
        feeVault = new PublicKey(vaultStr);
      } catch {
        return { success: false, error: 'Invalid feeVault public key' };
      }

      const breakdown = await withTimeout(
        readFeeVault(params.getConnection(), feeVault),
        env.KAMIYO_RPC_READ_TIMEOUT_MS,
        'fee_vault_read timed out'
      );
      return { success: true, data: { feeVault: feeVault.toBase58(), breakdown } };
    },
  };
}

function toolFeeVaultClaim(params: {
  getConnection: () => Connection;
  user: Keypair;
  defaultVault?: string;
  db: ReturnType<typeof openDb>;
  outboxDir: string;
}): ToolConfig {
  return {
    name: 'fee_vault_claim',
    description:
      'Claim fees from a Meteora fee vault. In propose mode, writes a proposal to the outbox. In execute mode, signs and submits the claim tx (guarded).',
    parameters: {
      feeVault: {
        type: 'string',
        description: 'Fee vault address (defaults to KAMIYO_FEE_VAULT).',
      },
      dryRun: {
        type: 'boolean',
        description: 'If true, do not broadcast; return before/after snapshot only.',
      },
    },
    handler: async input => {
      const vaultStr = String((input.feeVault ?? params.defaultVault ?? '') as string).trim();
      if (!vaultStr)
        return {
          success: false,
          error: 'Missing feeVault. Set KAMIYO_FEE_VAULT or pass feeVault.',
        };

      let feeVault: PublicKey;
      try {
        feeVault = new PublicKey(vaultStr);
      } catch {
        return { success: false, error: 'Invalid feeVault public key' };
      }

      if (env.KAMIYO_MODE !== 'execute') {
        const filePath = writeOutbox(params.outboxDir, 'proposal-fee-claim', {
          title: 'Claim Meteora fee vault',
          rationale: 'Accrued fees can be claimed from the vault; proposing claim for review.',
          steps: `Claim fees from vault ${feeVault.toBase58()} as ${params.user.publicKey.toBase58()}.`,
          risk: 'Low (one claim tx), but still moves funds; keep propose-only until custody is finalized.',
          createdAt: new Date().toISOString(),
        });
        return { success: true, data: { mode: 'propose', filePath } };
      }

      const dayStart = startOfUtcDayIso();
      const claimsToday = params.db.actionCountSince(dayStart, 'fee_vault_claim');
      if (claimsToday >= env.KAMIYO_MAX_FEE_CLAIMS_PER_DAY) {
        return {
          success: false,
          error: `Daily fee claim cap reached (${claimsToday}/${env.KAMIYO_MAX_FEE_CLAIMS_PER_DAY})`,
        };
      }

      const balanceLamports = await withTimeout(
        params.getConnection().getBalance(params.user.publicKey, 'confirmed'),
        env.KAMIYO_RPC_READ_TIMEOUT_MS,
        'fee_vault_claim balance lookup timed out'
      );
      if (balanceLamports < 0.01 * 1e9) {
        return {
          success: false,
          error: 'Operator SOL balance too low to reliably pay fees (< 0.01 SOL)',
        };
      }

      const dryRun = normalizeBoolean(input.dryRun);
      const userAddress = params.user.publicKey.toBase58();
      const minClaimLamports = BigInt(env.KAMIYO_AUTO_CLAIM_MIN_LAMPORTS);

      if (!dryRun) {
        const beforeSnapshot = await withTimeout(
          readFeeVault(params.getConnection(), feeVault),
          env.KAMIYO_RPC_READ_TIMEOUT_MS,
          'fee_vault_claim pre-check timed out'
        );
        const unclaimedLamports = getUserUnclaimedLamports(beforeSnapshot, userAddress);
        if (unclaimedLamports < minClaimLamports) {
          return {
            success: false,
            error: `Unclaimed fees below threshold (${unclaimedLamports.toString()} < ${minClaimLamports.toString()} lamports)`,
          };
        }
      }

      const result = await withTimeout(
        claimFeeVault({
          connection: params.getConnection(),
          feeVault,
          user: params.user,
          payer: params.user,
          dryRun,
        }),
        Math.max(env.KAMIYO_RPC_READ_TIMEOUT_MS * 2, 45_000),
        'fee_vault_claim execution timed out'
      );

      const beforeUserLamports = getUserUnclaimedLamports(result.before, userAddress);
      const afterUserLamports = getUserUnclaimedLamports(result.after, userAddress);
      const claimedLamports =
        beforeUserLamports > afterUserLamports ? beforeUserLamports - afterUserLamports : 0n;
      const receiptPath = writeOutbox(params.outboxDir, 'fee-claim-receipt', {
        at: new Date().toISOString(),
        mode: dryRun ? 'dry-run' : 'tool-execute',
        feeVault: feeVault.toBase58(),
        claimer: userAddress,
        minClaimLamports: minClaimLamports.toString(),
        unclaimedLamportsBefore: beforeUserLamports.toString(),
        unclaimedLamportsAfter: afterUserLamports.toString(),
        claimedLamports: claimedLamports.toString(),
        signature: result.signature,
        before: result.before,
        after: result.after,
      });

      return {
        success: true,
        data: {
          feeVault: feeVault.toBase58(),
          signature: result.signature,
          receiptPath,
          claimedLamports: claimedLamports.toString(),
          claimedSol: Number(claimedLamports) / 1e9,
          before: result.before,
          after: result.after,
        },
      };
    },
  };
}

function toolRecordLearning(params: {
  db: ReturnType<typeof openDb>;
  outboxDir: string;
}): ToolConfig {
  return {
    name: 'record_learning',
    description:
      'Record one strategic learning from this tick so the operator can evolve toward higher SOL revenue for $KAMIYO stakers.',
    parameters: {
      hypothesis: {
        type: 'string',
        description: 'What you believed would improve revenue.',
        required: true,
      },
      action: { type: 'string', description: 'What you did or proposed.', required: true },
      result: { type: 'string', description: 'Observed result from the action.', required: true },
      nextStep: {
        type: 'string',
        description: 'Best next step based on the result.',
        required: true,
      },
      confidence: { type: 'number', description: 'Confidence in the next step (0-1).' },
      expectedImpactSol: {
        type: 'number',
        description: 'Expected daily SOL impact if nextStep succeeds.',
      },
    },
    handler: async input => {
      const hypothesis = String(input.hypothesis ?? '').trim();
      const action = String(input.action ?? '').trim();
      const result = String(input.result ?? '').trim();
      const nextStep = String(input.nextStep ?? '').trim();

      if (!hypothesis || !action || !result || !nextStep) {
        return { success: false, error: 'hypothesis, action, result, and nextStep are required.' };
      }

      const confidenceInput = input.confidence;
      const confidence =
        typeof confidenceInput === 'number' && Number.isFinite(confidenceInput)
          ? Math.max(0, Math.min(1, confidenceInput))
          : undefined;

      const expectedImpactInput = input.expectedImpactSol;
      const expectedImpactSol =
        typeof expectedImpactInput === 'number' && Number.isFinite(expectedImpactInput)
          ? expectedImpactInput
          : undefined;

      const entry = {
        at: new Date().toISOString(),
        hypothesis,
        action,
        result,
        nextStep,
        ...(confidence != null ? { confidence } : {}),
        ...(expectedImpactSol != null ? { expectedImpactSol } : {}),
      };

      let history: unknown[] = [];
      const existing = params.db.kvGet('learning_log');
      if (existing) {
        try {
          const parsed = JSON.parse(existing);
          if (Array.isArray(parsed)) history = parsed;
        } catch {
          history = [];
        }
      }

      const nextHistory = [...history, entry].slice(-200);
      params.db.kvSet('learning_log', JSON.stringify(nextHistory));
      params.db.kvSet('learning_last', JSON.stringify(entry));

      const filePath = writeOutbox(params.outboxDir, 'learning', entry);
      return { success: true, data: { filePath, entriesStored: nextHistory.length } };
    },
  };
}

async function main(): Promise<void> {
  const dbPath = resolvePath(env.KAMIYO_DB_PATH);
  const outboxDir = resolvePath(env.KAMIYO_OUTBOX_DIR);
  const processLock = acquireProcessLock(env.KAMIYO_LOCK_PATH);
  const db = openDb(dbPath);
  let metricsServer: http.Server | null = null;
  let cleanedUp = false;

  const cleanup = () => {
    if (cleanedUp) return;
    cleanedUp = true;
    if (metricsServer) {
      metricsServer.close();
      metricsServer = null;
    }
    db.close();
    releaseProcessLock(processLock);
  };

  process.on('exit', cleanup);
  const staleTickCutoff = minutesAgoIso(env.KAMIYO_STUCK_TICK_TIMEOUT_MINUTES);
  const recoveredTickIds = db.recoverStaleRunningTicks(
    staleTickCutoff,
    `Recovered stale running tick on startup (timeout=${env.KAMIYO_STUCK_TICK_TIMEOUT_MINUTES}m)`
  );
  if (recoveredTickIds.length > 0) {
    console.warn(
      `[kamiyo-operator] recovered ${recoveredTickIds.length} stale running tick(s): ${recoveredTickIds.join(', ')}`
    );
  }

  const { keypair } = loadOperatorKeypair(env);
  const kyoshinClaimerKeypair =
    env.KAMIYO_KYOSHIN_CLAIMER_KEYPAIR_PATH || env.KAMIYO_KYOSHIN_CLAIMER_PRIVATE_KEY
      ? loadOperatorKeypair({
          KAMIYO_OPERATOR_KEYPAIR_PATH: env.KAMIYO_KYOSHIN_CLAIMER_KEYPAIR_PATH,
          KAMIYO_OPERATOR_PRIVATE_KEY: env.KAMIYO_KYOSHIN_CLAIMER_PRIVATE_KEY,
        }).keypair
      : keypair;
  const kyoshinClaimerIsOperator = kyoshinClaimerKeypair.publicKey.equals(keypair.publicKey);
  const wallet = new KeypairWallet(keypair);
  const rpcUrls = uniqueNonEmptyStrings([env.SOLANA_RPC_URL, ...env.SOLANA_RPC_FALLBACK_URLS]);
  if (rpcUrls.length === 0) {
    throw new Error('No RPC URL configured. Set SOLANA_RPC_URL (and optional fallbacks).');
  }

  const makeConnection = (url: string) =>
    new Connection(url, {
      commitment: 'confirmed',
      disableRetryOnRateLimit: true,
    });

  const rpcConnections = rpcUrls.map(url => makeConnection(url));
  let activeRpcIndex = 0;
  let connection = rpcConnections[activeRpcIndex];
  const rpcRead = async <T>(
    label: string,
    request: (candidate: Connection) => Promise<T>
  ): Promise<T> => {
    const maxAttempts = Math.max(1, Math.min(rpcUrls.length + env.KAMIYO_RPC_READ_RETRIES, 8));
    let lastError: unknown = new Error('rpc request failed');

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const index = (activeRpcIndex + attempt) % rpcConnections.length;
      const candidate = rpcConnections[index];
      const url = rpcUrls[index] ?? 'unknown';
      try {
        const result = await withTimeout(
          request(candidate),
          env.KAMIYO_RPC_READ_TIMEOUT_MS,
          `[rpc] ${label} timed out after ${env.KAMIYO_RPC_READ_TIMEOUT_MS}ms (${url})`
        );
        if (index !== activeRpcIndex) {
          activeRpcIndex = index;
          connection = candidate;
          console.warn(`[kamiyo-operator] RPC failover: now using ${url} (${label})`);
        }
        return result;
      } catch (error) {
        lastError = error;
      }
    }

    throw new Error(`[rpc] ${label} failed: ${toErrorMessage(lastError)}`);
  };
  const dkgParanetUAL =
    env.KAMIYO_DKG_PARANET_UAL ??
    process.env.MEISHI_PARANET_UAL?.trim() ??
    process.env.DKG_PARANET_UAL?.trim() ??
    process.env.PARANET_UAL?.trim();
  const dkgActivityPublisher = createDkgActivityPublisher({
    enabled: env.KAMIYO_DKG_ACTIVITY_ENABLED,
    endpoint: env.KAMIYO_DKG_ENDPOINT ?? process.env.DKG_ENDPOINT?.trim(),
    port: env.KAMIYO_DKG_PORT,
    blockchain: env.KAMIYO_DKG_BLOCKCHAIN,
    privateKey: env.KAMIYO_DKG_PRIVATE_KEY ?? process.env.DKG_PRIVATE_KEY?.trim(),
    paranetUAL: dkgParanetUAL,
    source: env.KAMIYO_DKG_AUDIT_SOURCE,
    jurisdiction: env.KAMIYO_DKG_JURISDICTION,
    epochs: env.KAMIYO_DKG_EPOCHS,
  });
  await rpcRead('startup_rpc_healthcheck', candidate => candidate.getSlot('processed'));
  console.log(`[kamiyo-operator] RPC endpoint ready: ${rpcUrls[activeRpcIndex]}`);

  if (env.KAMIYO_METRICS_HTTP_ENABLED) {
    const metricsPath = env.KAMIYO_METRICS_HTTP_PATH.startsWith('/')
      ? env.KAMIYO_METRICS_HTTP_PATH
      : `/${env.KAMIYO_METRICS_HTTP_PATH}`;
    metricsServer = http.createServer((req, res) => {
      const requestPath = (req.url ?? '').split('?')[0] || '/';
      if (req.method !== 'GET' || requestPath !== metricsPath) {
        res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
        res.end('not found');
        return;
      }

      try {
        const payload = renderPrometheusMetrics({
          db,
          nowIso: new Date().toISOString(),
        });
        res.writeHead(200, {
          'content-type': 'text/plain; version=0.0.4; charset=utf-8',
          'cache-control': 'no-store',
        });
        res.end(payload);
      } catch (error) {
        res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
        res.end(error instanceof Error ? error.message : String(error));
      }
    });

    await new Promise<void>((resolve, reject) => {
      const onError = (error: Error) => reject(error);
      metricsServer?.once('error', onError);
      metricsServer?.listen(env.KAMIYO_METRICS_HTTP_PORT, env.KAMIYO_METRICS_HTTP_HOST, () => {
        metricsServer?.off('error', onError);
        resolve();
      });
    });
  }

  const allowedChannels = Array.from(new Set(env.KAMIYO_ANNOUNCE_CHANNELS));

  const identity = identityFromEnv(env.KAMIYO_IDENTITY);
  const identityBlock = identityPrompt(identity);
  let agent: KamiyoAgent | null = null;
  if (env.KAMIYO_LLM_ENABLED) {
    if (!env.ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY is required when KAMIYO_LLM_ENABLED=true');
    }
    const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
    const modelSelection = resolveAnthropicModelAlias(env.ANTHROPIC_MODEL);
    if (modelSelection.aliasedFrom) {
      console.warn(
        `[kamiyo-operator] remapped deprecated model ${modelSelection.aliasedFrom} -> ${modelSelection.model}`
      );
    }

    const toolChoice = (() => {
      const disableParallel = env.ANTHROPIC_DISABLE_PARALLEL_TOOL_USE ? true : undefined;
      switch (env.ANTHROPIC_TOOL_CHOICE) {
        case 'auto':
          return {
            type: 'auto' as const,
            ...(disableParallel != null ? { disable_parallel_tool_use: disableParallel } : {}),
          };
        case 'any':
          return {
            type: 'any' as const,
            ...(disableParallel != null ? { disable_parallel_tool_use: disableParallel } : {}),
          };
        case 'none':
          return { type: 'none' as const };
      }
    })();

    const thinking = (() => {
      const budget = env.ANTHROPIC_THINKING_BUDGET_TOKENS;
      if (budget <= 0) return undefined;
      if (budget < 1024) throw new Error('ANTHROPIC_THINKING_BUDGET_TOKENS must be >= 1024');
      if (budget >= env.KAMIYO_MAX_OUTPUT_TOKENS_PER_TURN) {
        throw new Error(
          'ANTHROPIC_THINKING_BUDGET_TOKENS must be < KAMIYO_MAX_OUTPUT_TOKENS_PER_TURN'
        );
      }
      return { type: 'enabled' as const, budget_tokens: budget };
    })();

    agent = new KamiyoAgent({
      db,
      outboxDir,
      mode: env.KAMIYO_MODE,
      client: anthropic,
      model: modelSelection.model,
      maxOutputTokens: env.KAMIYO_MAX_OUTPUT_TOKENS_PER_TURN,
      maxTurnsPerTick: env.KAMIYO_MAX_TURNS_PER_TICK,
      allowedChannels,
      temperature: env.ANTHROPIC_TEMPERATURE,
      thinking,
      toolChoice,
      requestTimeoutMs: env.KAMIYO_ANTHROPIC_REQUEST_TIMEOUT_MS,
    });

    agent.registerTool(
      toolTokenStatus({ getConnection: () => connection, defaultMint: env.KAMIYO_TARGET_MINT })
    );
    agent.registerTool(
      toolFeeVaultRead({ getConnection: () => connection, defaultVault: env.KAMIYO_FEE_VAULT })
    );
    agent.registerTool(
      toolFeeVaultClaim({
        getConnection: () => connection,
        user: keypair,
        defaultVault: env.KAMIYO_FEE_VAULT,
        db,
        outboxDir,
      })
    );
    agent.registerTool(toolRecordLearning({ db, outboxDir }));
  } else {
    console.warn(
      '[kamiyo-operator] KAMIYO_LLM_ENABLED=false; running deterministic policy loop without Anthropic calls.'
    );
  }

  const shutdown = () => {
    cleanup();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  let lastStakingPeriodMaintenanceMs = 0;

  for (;;) {
    const tickId =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : String(Date.now());
    db.startTick(tickId);
    const tickTimeoutMinutes = env.KAMIYO_TICK_TIMEOUT_MINUTES;
    const tickTimeoutMs = tickTimeoutMinutes * 60_000;
    const tickSoftBufferMs = Math.min(
      env.KAMIYO_TICK_SOFT_TIMEOUT_BUFFER_SECONDS * 1000,
      Math.max(0, tickTimeoutMs - 1_000)
    );
    const tickSoftDeadlineMs = Date.now() + tickTimeoutMs - tickSoftBufferMs;
    const tickRemainingMs = () => Math.max(0, tickSoftDeadlineMs - Date.now());
    const hasTickBudget = (requiredMs: number) => tickRemainingMs() > requiredMs;
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      const err = `Tick timed out after ${tickTimeoutMinutes}m`;
      try {
        db.finishTick(tickId, 'error', err);
      } catch {
        // Best effort.
      }
      console.error(`[kamiyo-operator] ${err}; exiting for clean restart`);
      process.exit(1);
    }, tickTimeoutMs);
    timeout.unref();

    try {
      const dayStart = startOfUtcDayIso();
      const llmCallsToday = db.llmCallCountSince(dayStart);
      const llmUsageToday = db.llmUsageSince(dayStart);
      let feeVaultBreakdown: FeeVaultBreakdown | undefined;

      const budgetState = {
        llmCallsToday,
        llmUsageToday,
        llmAllowed: {
          calls: env.KAMIYO_LLM_MAX_TURNS_PER_DAY,
          inputTokens: env.KAMIYO_LLM_MAX_INPUT_TOKENS_PER_DAY,
          outputTokens: env.KAMIYO_LLM_MAX_OUTPUT_TOKENS_PER_DAY,
        },
      };

      let operatorBalanceLamports = BigInt(
        await rpcRead('get_operator_balance', candidate =>
          candidate.getBalance(wallet.publicKey, 'confirmed')
        )
      );
      let kyoshinClaimerBalanceLamports: bigint | undefined = kyoshinClaimerIsOperator
        ? operatorBalanceLamports
        : undefined;
      const dkgEvents: DkgActivityEvent[] = [];
      const dkgAgentId = env.KAMIYO_DKG_AGENT_ID ?? kyoshinClaimerKeypair.publicKey.toBase58();
      const swarmExecutionEnabled = env.KAMIYO_SWARM_ENABLED && !env.KAMIYO_SWARM_PROPOSE_ONLY;
      let swarmRegistry: SwarmRegistry | null = null;
      let swarmOpportunityIntake: SwarmOpportunityIntake | null = null;

      const observation: Record<string, unknown> = {
        at: new Date().toISOString(),
        runtime: {
          tickTimeoutMinutes,
          softDeadlineBufferSeconds: env.KAMIYO_TICK_SOFT_TIMEOUT_BUFFER_SECONDS,
          softDeadlineRemainingMs: tickRemainingMs(),
          rpc: {
            activeUrl: rpcUrls[activeRpcIndex] ?? env.SOLANA_RPC_URL,
            fallbackCount: Math.max(0, rpcUrls.length - 1),
            readTimeoutMs: env.KAMIYO_RPC_READ_TIMEOUT_MS,
            readRetries: env.KAMIYO_RPC_READ_RETRIES,
          },
        },
        operator: {
          publicKey: wallet.publicKey.toBase58(),
          solBalance: lamportsToSol(operatorBalanceLamports),
        },
        budgets: {
          mode: env.KAMIYO_MODE,
          solDailyCap: env.KAMIYO_SOL_DAILY_CAP,
          solPerTxCap: env.KAMIYO_SOL_PER_TX_CAP,
          maxTxPerDay: env.KAMIYO_MAX_TX_PER_DAY,
          maxFeeClaimsPerDay: env.KAMIYO_MAX_FEE_CLAIMS_PER_DAY,
          maxStakeFeedsPerDay: env.KAMIYO_AUTO_STAKE_MAX_FEEDS_PER_DAY,
          autoStake: {
            enabled: env.KAMIYO_AUTO_STAKE_ENABLED,
            minLamports: env.KAMIYO_AUTO_STAKE_MIN_LAMPORTS,
            reserveLamports: env.KAMIYO_AUTO_STAKE_RESERVE_LAMPORTS,
            availableBps: env.KAMIYO_AUTO_STAKE_AVAILABLE_BPS,
            maxLamportsPerTx: env.KAMIYO_AUTO_STAKE_MAX_LAMPORTS_PER_TX,
          },
          kyoshinAutoClaim: env.KAMIYO_KYOSHIN_STAKING_POOL
            ? {
                enabled: env.KAMIYO_KYOSHIN_AUTO_CLAIM_ENABLED,
                pool: env.KAMIYO_KYOSHIN_STAKING_POOL,
                minLamports: env.KAMIYO_KYOSHIN_AUTO_CLAIM_MIN_LAMPORTS,
                maxPeriodsPerRun: env.KAMIYO_KYOSHIN_AUTO_CLAIM_MAX_PERIODS_PER_RUN,
              }
            : null,
          dkgActivity: {
            enabled: env.KAMIYO_DKG_ACTIVITY_ENABLED,
            source: env.KAMIYO_DKG_AUDIT_SOURCE,
            endpoint: env.KAMIYO_DKG_ENDPOINT ?? process.env.DKG_ENDPOINT?.trim() ?? null,
            paranetUAL: dkgParanetUAL ?? null,
            agentId: dkgAgentId,
            rateLimitCooldownSeconds: env.KAMIYO_DKG_RATE_LIMIT_COOLDOWN_SECONDS,
          },
          llm: budgetState,
        },
        token: env.KAMIYO_TARGET_MINT ? { mint: env.KAMIYO_TARGET_MINT } : { mint: null },
      };

      if (env.KAMIYO_SWARM_ENABLED) {
        const swarmProposeOnly = env.KAMIYO_SWARM_PROPOSE_ONLY;
        const registryPath = resolvePath(env.KAMIYO_SWARM_REGISTRY_PATH);
        const registryResult = loadSwarmRegistry(registryPath);

        if (!registryResult.ok) {
          const error = registryResult.error ?? registryResult.reason;
          db.addAction(
            tickId,
            'swarm_plan_missions',
            {
              registryPath,
              missionsPerTick: env.KAMIYO_SWARM_MISSIONS_PER_TICK,
              maxActiveAgents: env.KAMIYO_SWARM_MAX_ACTIVE_AGENTS,
            },
            null,
            error
          );
          observation.swarm = {
            enabled: true,
            executionEnabled: swarmExecutionEnabled,
            proposeOnly: swarmProposeOnly,
            path: registryPath,
            planned: false,
            reason: registryResult.reason,
            error: registryResult.error ?? null,
          };
        } else {
          swarmRegistry = registryResult.registry;
          const cursorKey = 'swarm_mission_cursor';
          const cursor = parseNonNegativeInt(db.kvGet(cursorKey), 0);
          const priorityState = parsePriorityState(db.kvGet('swarm_priority_state'));
          const opportunityHintsByAgent: Record<string, SwarmMissionOpportunityHint> = {};
          let opportunityIntakeSummary: Record<string, unknown> | null = null;

          if (env.KAMIYO_SWARM_JOB_INTAKE_ENABLED) {
            const feedPath = env.KAMIYO_SWARM_JOB_FEED_PATH
              ? resolvePath(env.KAMIYO_SWARM_JOB_FEED_PATH)
              : undefined;
            const marketplaceFeeds: MarketplaceFeedConfig[] = [];
            if (env.KAMIYO_SWARM_RELEVANCE_FEED_URL) {
              marketplaceFeeds.push({
                source: 'relevance',
                url: env.KAMIYO_SWARM_RELEVANCE_FEED_URL,
                apiKey: env.KAMIYO_SWARM_RELEVANCE_API_KEY,
                authHeader: env.KAMIYO_SWARM_RELEVANCE_AUTH_HEADER,
              });
            }
            if (env.KAMIYO_SWARM_AGENTAI_FEED_URL) {
              marketplaceFeeds.push({
                source: 'agent_ai',
                url: env.KAMIYO_SWARM_AGENTAI_FEED_URL,
                apiKey: env.KAMIYO_SWARM_AGENTAI_API_KEY,
                authHeader: env.KAMIYO_SWARM_AGENTAI_AUTH_HEADER,
              });
            }
            if (env.KAMIYO_SWARM_KORE_FEED_URL) {
              marketplaceFeeds.push({
                source: 'kore',
                url: env.KAMIYO_SWARM_KORE_FEED_URL,
                apiKey: env.KAMIYO_SWARM_KORE_API_KEY,
                authHeader: env.KAMIYO_SWARM_KORE_AUTH_HEADER,
              });
            }
            try {
              const sourceFeedbackSince = minutesAgoIso(
                env.KAMIYO_SWARM_SOURCE_FEEDBACK_WINDOW_HOURS * 60
              );
              const sourceFeedback = db.swarmSourceStatsSince(sourceFeedbackSince);
              const sourceQualityBySource: Partial<Record<SwarmOpportunitySource, number>> = {};
              for (const row of sourceFeedback) {
                if (row.total < env.KAMIYO_SWARM_SOURCE_FEEDBACK_MIN_SAMPLES) continue;
                const successRatio = row.total > 0 ? row.succeeded / row.total : 0;
                const avgRevenueSol = row.total > 0 ? row.revenueSol / row.total : 0;
                const revenueScore = Math.min(1, avgRevenueSol / 0.05);
                const quality = Math.max(
                  0.4,
                  Math.min(1.35, 0.2 + successRatio * 0.5 + revenueScore * 0.5)
                );
                if (
                  row.source === 'x402' ||
                  row.source === 'relevance' ||
                  row.source === 'agent_ai' ||
                  row.source === 'kore' ||
                  row.source === 'direct' ||
                  row.source === 'internal'
                ) {
                  sourceQualityBySource[row.source] = quality;
                }
              }
              const rollbackStateForIntake = pruneRollbackState({
                state: parseRollbackState(db.kvGet('swarm_rollback_state')),
                nowIso: new Date().toISOString(),
              });
              db.kvSet('swarm_rollback_state', JSON.stringify(rollbackStateForIntake));
              const disabledSources = Object.values(rollbackStateForIntake.sources)
                .map(sourceState => sourceState?.source)
                .filter(
                  (source): source is SwarmOpportunitySource =>
                    source === 'x402' ||
                    source === 'relevance' ||
                    source === 'agent_ai' ||
                    source === 'kore' ||
                    source === 'direct' ||
                    source === 'internal'
                );

              const leadConversionPolicy: LeadConversionPolicy = {
                enabled: env.KAMIYO_SWARM_LEAD_CONVERSION_ENABLED,
                maxConversions: env.KAMIYO_SWARM_LEAD_CONVERSION_MAX_PER_TICK,
                defaultPayoutUsd: env.KAMIYO_SWARM_LEAD_CONVERSION_DEFAULT_PAYOUT_USD,
                requireEndpoint: env.KAMIYO_SWARM_LEAD_CONVERSION_REQUIRE_ENDPOINT,
                simulateOnly: env.KAMIYO_SWARM_LEAD_CONVERSION_SIMULATE_ONLY,
                estimatedFeeSol: env.KAMIYO_SWARM_JOB_ESTIMATED_FEE_SOL,
                minConfidence: env.KAMIYO_SWARM_LEAD_CONVERSION_MIN_CONFIDENCE,
                validateSourceContracts: env.KAMIYO_SWARM_LEAD_CONTRACT_VALIDATION_ENABLED,
              };
              const intake = await collectSwarmOpportunities({
                registry: registryResult.registry,
                feedPath,
                feedUrls: env.KAMIYO_SWARM_JOB_FEED_URLS,
                marketplaceFeeds,
                leadConversionPolicy,
                disabledSources,
                sourceQualityBySource,
                minRewardUsd: env.KAMIYO_SWARM_JOB_MIN_REWARD_USD,
                maxOpen: env.KAMIYO_SWARM_JOB_MAX_OPEN,
                assignmentLimit: env.KAMIYO_SWARM_MISSIONS_PER_TICK,
                solPriceUsd: env.KAMIYO_SWARM_SOL_PRICE_USD,
                fetchTimeoutMs: env.KAMIYO_SWARM_JOB_FETCH_TIMEOUT_MS,
              });
              swarmOpportunityIntake = intake;

              const opportunitiesById = new Map(
                intake.opportunities.map(opportunity => [opportunity.id, opportunity])
              );
              for (const assignment of intake.assignments) {
                const opportunity = opportunitiesById.get(assignment.opportunityId);
                if (!opportunity) continue;
                opportunityHintsByAgent[assignment.agentId] = {
                  id: opportunity.id,
                  source: opportunity.source,
                  title: opportunity.title,
                  summary: opportunity.summary,
                  expectedRewardSol: assignment.expectedRewardSol,
                  assignmentReason: assignment.reason,
                };
              }

              const intakePayload = {
                at: intake.at,
                tickId,
                feedPath: feedPath ?? null,
                feedUrls: env.KAMIYO_SWARM_JOB_FEED_URLS,
                marketplaceFeeds: marketplaceFeeds.map(feed => ({
                  source: feed.source,
                  url: feed.url,
                  hasApiKey: Boolean(feed.apiKey),
                })),
                minRewardUsd: env.KAMIYO_SWARM_JOB_MIN_REWARD_USD,
                maxOpen: env.KAMIYO_SWARM_JOB_MAX_OPEN,
                assignmentLimit: env.KAMIYO_SWARM_MISSIONS_PER_TICK,
                opportunities: intake.opportunities,
                assignments: intake.assignments,
                leadConversions: intake.leadConversions,
                disabledSources,
                sourceQualityBySource,
                sourceStats: intake.sourceStats,
              };
              const intakeReceiptPath = writeOutbox(
                outboxDir,
                'swarm-opportunity-intake',
                intakePayload
              );
              db.addAction(
                tickId,
                'swarm_collect_opportunities',
                {
                  feedPath: feedPath ?? null,
                  feedUrlCount: env.KAMIYO_SWARM_JOB_FEED_URLS.length,
                  marketplaceFeedCount: marketplaceFeeds.length,
                  minRewardUsd: env.KAMIYO_SWARM_JOB_MIN_REWARD_USD,
                  maxOpen: env.KAMIYO_SWARM_JOB_MAX_OPEN,
                  assignmentLimit: env.KAMIYO_SWARM_MISSIONS_PER_TICK,
                },
                {
                  success: true,
                  data: {
                    discovered: intake.discovered,
                    accepted: intake.accepted,
                    leadConversions: intake.leadConversions,
                    disabledSources,
                    sourceQualityBySource,
                    assignmentCount: intake.assignments.length,
                    receiptPath: intakeReceiptPath,
                  },
                }
              );

              opportunityIntakeSummary = {
                enabled: true,
                collected: true,
                discovered: intake.discovered,
                accepted: intake.accepted,
                leadConversions: intake.leadConversions,
                disabledSources,
                sourceQualityBySource,
                assignmentCount: intake.assignments.length,
                receiptPath: intakeReceiptPath,
                sourceStats: intake.sourceStats,
                assignments: intake.assignments.map(assignment => ({
                  opportunityId: assignment.opportunityId,
                  agentId: assignment.agentId,
                  score: Number(assignment.score.toFixed(4)),
                  expectedRewardSol: assignment.expectedRewardSol,
                })),
              };
            } catch (error) {
              const message = error instanceof Error ? error.message : String(error);
              db.addAction(
                tickId,
                'swarm_collect_opportunities',
                {
                  feedPath: feedPath ?? null,
                  feedUrlCount: env.KAMIYO_SWARM_JOB_FEED_URLS.length,
                  marketplaceFeedCount: marketplaceFeeds.length,
                  minRewardUsd: env.KAMIYO_SWARM_JOB_MIN_REWARD_USD,
                  maxOpen: env.KAMIYO_SWARM_JOB_MAX_OPEN,
                  assignmentLimit: env.KAMIYO_SWARM_MISSIONS_PER_TICK,
                },
                null,
                message
              );
              opportunityIntakeSummary = {
                enabled: true,
                collected: false,
                error: message,
              };
            }
          } else {
            opportunityIntakeSummary = {
              enabled: false,
              collected: false,
              reason: 'disabled',
            };
          }

          const missionPlan = planSwarmMissions({
            registry: registryResult.registry,
            tickId,
            maxMissions: env.KAMIYO_SWARM_MISSIONS_PER_TICK,
            maxActiveAgents: env.KAMIYO_SWARM_MAX_ACTIVE_AGENTS,
            cursor,
            primeDirective: env.KAMIYO_PRIME_DIRECTIVE,
            opportunityHintsByAgent,
            priorityOverridesByAgent: priorityState.overrides,
          });

          db.kvSet(cursorKey, String(missionPlan.nextCursor));

          const registryAgentById = new Map(
            registryResult.registry.agents.map(agent => [agent.id, agent])
          );
          const channelStatusByAgent = registryResult.registry.agents.map(agent => {
            const approvedMarketplaceCount = agent.marketplaceProfiles.filter(
              profile => profile.state === 'approved'
            ).length;
            return {
              agentId: agent.id,
              role: agent.role,
              status: agent.status,
              jobSources: agent.jobSources,
              approvedMarketplaceCount,
              marketplaceProfiles: agent.marketplaceProfiles.map(profile => ({
                source: profile.source,
                state: profile.state,
                listingUrl: profile.listingUrl ?? null,
                ownerContact: profile.ownerContact ?? null,
                lastUpdatedAt: profile.lastUpdatedAt ?? null,
              })),
            };
          });

          const channelCoverage = {
            machinePayReadyAgents: channelStatusByAgent.filter(
              agent =>
                agent.status === 'active' &&
                agent.jobSources.some(source => source === 'x402' || source === 'direct_api')
            ).length,
            approvedMarketplaceListings: channelStatusByAgent.reduce(
              (sum, agent) => sum + agent.approvedMarketplaceCount,
              0
            ),
            submittedMarketplaceListings: channelStatusByAgent.reduce(
              (sum, agent) =>
                sum +
                agent.marketplaceProfiles.filter(profile => profile.state === 'submitted').length,
              0
            ),
          };

          const missionSummary = missionPlan.missions.map(mission => {
            const profile = registryAgentById.get(mission.agentId);
            return {
              missionId: mission.missionId,
              agentId: mission.agentId,
              role: mission.role,
              mint: mission.mint,
              successMetric: mission.successMetric,
              opportunityId: mission.opportunityId ?? null,
              expectedRewardSol: mission.expectedRewardSol ?? null,
              jobSources: profile?.jobSources ?? [],
              marketplaceProfiles:
                profile?.marketplaceProfiles.map(item => ({
                  source: item.source,
                  state: item.state,
                  listingUrl: item.listingUrl ?? null,
                })) ?? [],
            };
          });

          if (missionPlan.missions.length === 0) {
            db.addAction(
              tickId,
              'swarm_plan_missions',
              {
                registryPath,
                parent: missionPlan.parent,
                activeAgents: missionPlan.activeAgents,
                selectedAgents: missionPlan.selectedAgents,
                cursor,
                nextCursor: missionPlan.nextCursor,
              },
              {
                success: true,
                data: { reason: 'no_active_agents' },
              }
            );
            observation.swarm = {
              enabled: true,
              executionEnabled: swarmExecutionEnabled,
              proposeOnly: swarmProposeOnly,
              path: registryPath,
              parent: missionPlan.parent,
              registryVersion: missionPlan.registryVersion,
              activeAgents: missionPlan.activeAgents,
              selectedAgents: missionPlan.selectedAgents,
              planned: false,
              reason: 'no_active_agents',
              nextCursor: missionPlan.nextCursor,
              opportunities: opportunityIntakeSummary,
              priorityOverrides: priorityState.overrides,
              channelCoverage,
              channelsByAgent: channelStatusByAgent,
            };
          } else {
            const swarmPlanPayload = {
              at: new Date().toISOString(),
              tickId,
              mode: env.KAMIYO_MODE,
              phase: 'phase1_control_plane',
              executionEnabled: swarmExecutionEnabled,
              proposeOnly: swarmProposeOnly,
              registryPath,
              parent: missionPlan.parent,
              registryVersion: missionPlan.registryVersion,
              activeAgents: missionPlan.activeAgents,
              selectedAgents: missionPlan.selectedAgents,
              cursor,
              nextCursor: missionPlan.nextCursor,
              missions: missionPlan.missions,
              opportunities: opportunityIntakeSummary,
              priorityOverrides: priorityState.overrides,
              channelCoverage,
              channelsByAgent: channelStatusByAgent,
            };
            const receiptPath = writeOutbox(outboxDir, 'swarm-mission-plan', swarmPlanPayload);
            db.addAction(
              tickId,
              'swarm_plan_missions',
              {
                registryPath,
                parent: missionPlan.parent,
                activeAgents: missionPlan.activeAgents,
                selectedAgents: missionPlan.selectedAgents,
                cursor,
                nextCursor: missionPlan.nextCursor,
              },
              {
                success: true,
                data: {
                  executionEnabled: swarmExecutionEnabled,
                  proposeOnly: swarmProposeOnly,
                  receiptPath,
                },
              }
            );
            observation.swarm = {
              enabled: true,
              executionEnabled: swarmExecutionEnabled,
              proposeOnly: swarmProposeOnly,
              path: registryPath,
              parent: missionPlan.parent,
              registryVersion: missionPlan.registryVersion,
              activeAgents: missionPlan.activeAgents,
              selectedAgents: missionPlan.selectedAgents,
              planned: true,
              receiptPath,
              nextCursor: missionPlan.nextCursor,
              missions: missionSummary,
              opportunities: opportunityIntakeSummary,
              priorityOverrides: priorityState.overrides,
              channelCoverage,
              channelsByAgent: channelStatusByAgent,
            };
          }
        }
      } else {
        observation.swarm = { enabled: false, planned: false, reason: 'disabled' };
      }

      if (env.KAMIYO_RETENTION_ENABLED) {
        const now = new Date();
        const nowIso = now.toISOString();
        const minIntervalMs = env.KAMIYO_RETENTION_INTERVAL_MINUTES * 60_000;
        const lastRunAt = db.kvGet('retention_last_run_at');
        const lastRunMs = parseIsoMillis(lastRunAt);
        const shouldRun = lastRunMs == null || now.getTime() - lastRunMs >= minIntervalMs;

        if (shouldRun) {
          const cutoffs = {
            ticksBeforeIso: daysAgoIso(env.KAMIYO_RETENTION_TICKS_DAYS, now),
            observationsBeforeIso: daysAgoIso(env.KAMIYO_RETENTION_OBSERVATIONS_DAYS, now),
            actionsBeforeIso: daysAgoIso(env.KAMIYO_RETENTION_ACTIONS_DAYS, now),
            usageBeforeIso: daysAgoIso(env.KAMIYO_RETENTION_LLM_USAGE_DAYS, now),
            outboxBeforeIso: daysAgoIso(env.KAMIYO_RETENTION_OUTBOX_DAYS, now),
          };
          const dbRetention = db.pruneHistory({
            ticksBeforeIso: cutoffs.ticksBeforeIso,
            observationsBeforeIso: cutoffs.observationsBeforeIso,
            actionsBeforeIso: cutoffs.actionsBeforeIso,
            usageBeforeIso: cutoffs.usageBeforeIso,
          });
          const outboxRetention = pruneOutbox({
            outboxDir,
            olderThanIso: cutoffs.outboxBeforeIso,
            maxFiles: env.KAMIYO_RETENTION_OUTBOX_MAX_FILES,
          });
          const retentionResult = {
            at: nowIso,
            cutoffs,
            db: dbRetention,
            outbox: outboxRetention,
          };
          db.kvSet('retention_last_run_at', nowIso);
          db.addAction(
            tickId,
            'retention_run',
            {
              intervalMinutes: env.KAMIYO_RETENTION_INTERVAL_MINUTES,
              ticksDays: env.KAMIYO_RETENTION_TICKS_DAYS,
              observationsDays: env.KAMIYO_RETENTION_OBSERVATIONS_DAYS,
              actionsDays: env.KAMIYO_RETENTION_ACTIONS_DAYS,
              llmUsageDays: env.KAMIYO_RETENTION_LLM_USAGE_DAYS,
              outboxDays: env.KAMIYO_RETENTION_OUTBOX_DAYS,
              outboxMaxFiles: env.KAMIYO_RETENTION_OUTBOX_MAX_FILES,
            },
            retentionResult
          );
          observation.retention = { executed: true, ...retentionResult };
        } else {
          observation.retention = {
            executed: false,
            reason: 'interval_not_elapsed',
            lastRunAt,
            intervalMinutes: env.KAMIYO_RETENTION_INTERVAL_MINUTES,
          };
        }
      } else {
        observation.retention = { executed: false, reason: 'disabled' };
      }

      const agentType = agentTypeFromEnv(env.KAMIYO_AGENT_TYPE);
      const agentState = await getOrCreateAgentIdentity({
        connection,
        wallet,
        name: env.KAMIYO_AGENT_NAME,
        agentType,
        stakeSol: env.KAMIYO_AGENT_STAKE_SOL,
        createIfMissing: env.KAMIYO_AUTO_CREATE_AGENT,
      });

      observation.agent = agentState.exists
        ? {
            name: agentState.agent.name,
            pda: agentState.pda.toBase58(),
            created: agentState.created,
            ...(agentState.created ? { signature: agentState.signature } : {}),
          }
        : {
            exists: false,
            pda: agentState.pda.toBase58(),
            desiredName: env.KAMIYO_AGENT_NAME,
            autoCreate: false,
          };

      let meishiAgentState = agentState;
      if (env.KAMIYO_MEISHI_AGENT_PROGRAM_ID) {
        try {
          const meishiAgentProgramId = new PublicKey(env.KAMIYO_MEISHI_AGENT_PROGRAM_ID);
          const allowMeishiAgentCreate =
            env.KAMIYO_MODE === 'execute' && env.KAMIYO_MEISHI_AUTO_CREATE_AGENT;
          const overrideState = await getOrCreateAgentIdentity({
            connection,
            wallet,
            name: env.KAMIYO_AGENT_NAME,
            agentType,
            stakeSol: env.KAMIYO_AGENT_STAKE_SOL,
            createIfMissing: allowMeishiAgentCreate,
            programId: meishiAgentProgramId,
          });
          meishiAgentState = overrideState;

          observation.meishiAgentIdentity = overrideState.exists
            ? {
                source: 'override',
                programId: meishiAgentProgramId.toBase58(),
                name: overrideState.agent.name,
                pda: overrideState.pda.toBase58(),
                created: overrideState.created,
                ...(overrideState.created ? { signature: overrideState.signature } : {}),
              }
            : {
                source: 'override',
                programId: meishiAgentProgramId.toBase58(),
                exists: false,
                pda: overrideState.pda.toBase58(),
                desiredName: env.KAMIYO_AGENT_NAME,
                autoCreate: allowMeishiAgentCreate,
              };
        } catch (e) {
          meishiAgentState = { exists: false, pda: agentState.pda };
          observation.meishiAgentIdentity = {
            source: 'override',
            programId: env.KAMIYO_MEISHI_AGENT_PROGRAM_ID,
            error: e instanceof Error ? e.message : String(e),
          };
        }
      } else {
        observation.meishiAgentIdentity = {
          source: 'primary',
          pda: agentState.pda.toBase58(),
        };
      }

      if (meishiAgentState.exists) {
        try {
          const meishiState = await ensureMeishiTrust({
            connection,
            signer: keypair,
            agentIdentity: meishiAgentState.pda,
            tickId,
            config: {
              enabled: env.KAMIYO_MEISHI_ENABLED,
              mode: env.KAMIYO_MODE,
              programId: env.KAMIYO_MEISHI_PROGRAM_ID,
              kamiyoProgramId: env.KAMIYO_MEISHI_AGENT_PROGRAM_ID,
              jurisdiction: env.KAMIYO_MEISHI_JURISDICTION,
              autoCreatePassport: env.KAMIYO_MEISHI_AUTO_CREATE_PASSPORT,
              autoSetMandate: env.KAMIYO_MEISHI_AUTO_SET_MANDATE,
              autoBaselineAudit: env.KAMIYO_MEISHI_AUTO_BASELINE_AUDIT,
              baselineScore: env.KAMIYO_MEISHI_BASELINE_SCORE,
              mandateDurationDays: env.KAMIYO_MEISHI_MANDATE_DURATION_DAYS,
              txLimitUsd: env.KAMIYO_MEISHI_TX_LIMIT_USD,
              dailyLimitUsd: env.KAMIYO_MEISHI_DAILY_LIMIT_USD,
              monthlyLimitUsd: env.KAMIYO_MEISHI_MONTHLY_LIMIT_USD,
              humanApprovalUsd: env.KAMIYO_MEISHI_HUMAN_APPROVAL_USD,
              findingsPrefix: env.KAMIYO_MEISHI_FINDINGS_PREFIX,
              categoryWhitelistHex: env.KAMIYO_MEISHI_CATEGORY_WHITELIST_HEX,
              merchantWhitelistHex: env.KAMIYO_MEISHI_MERCHANT_WHITELIST_HEX,
            },
          });
          observation.meishi = {
            ...meishiState,
            agentIdentitySource: env.KAMIYO_MEISHI_AGENT_PROGRAM_ID ? 'override' : 'primary',
          };

          for (const action of meishiState.actions) {
            db.addAction(
              tickId,
              `meishi_${action.type}`,
              {
                agentIdentity: meishiState.agentIdentity,
                passportAddress: meishiState.passportAddress,
              },
              { success: true, data: action }
            );
            const receiptPath = writeOutbox(outboxDir, `meishi-${action.type}-receipt`, {
              at: new Date().toISOString(),
              tickId,
              mode: env.KAMIYO_MODE,
              agentIdentity: meishiState.agentIdentity,
              passportAddress: meishiState.passportAddress,
              action,
            });
            db.addAction(tickId, `write_meishi_${action.type}_receipt`, {}, { receiptPath });

            if (action.type === 'create_passport') {
              dkgEvents.push({ type: 'meishi_passport_create', signature: action.signature });
            } else if (action.type === 'update_mandate') {
              dkgEvents.push({ type: 'meishi_mandate_update', signature: action.signature });
            } else if (action.type === 'record_audit') {
              dkgEvents.push({ type: 'meishi_audit_record', signature: action.signature });
            }
          }
        } catch (e) {
          observation.meishi = {
            enabled: env.KAMIYO_MEISHI_ENABLED,
            error: e instanceof Error ? e.message : String(e),
          };
        }
      } else {
        observation.meishi = {
          enabled: env.KAMIYO_MEISHI_ENABLED,
          reason: 'agent_identity_missing',
          agentIdentity: meishiAgentState.pda.toBase58(),
          agentIdentitySource: env.KAMIYO_MEISHI_AGENT_PROGRAM_ID ? 'override' : 'primary',
        };
      }

      if (env.KAMIYO_TARGET_MINT) {
        try {
          const mint = new PublicKey(env.KAMIYO_TARGET_MINT);
          const info = await rpcRead('read_target_mint', candidate =>
            candidate.getParsedAccountInfo(mint, 'confirmed')
          );
          observation.token = {
            mint: mint.toBase58(),
            exists: info.value !== null,
            owner: info.value?.owner?.toBase58() ?? null,
          };

          {
            const launchOwner = kyoshinClaimerKeypair.publicKey;
            const [launchAgentIdentity] = PublicKey.findProgramAddressSync(
              [Buffer.from('agent'), launchOwner.toBuffer()],
              KAMIYO_PROGRAM_ID
            );
            const launchAgentExists =
              (await rpcRead('read_launch_agent_identity', candidate =>
                candidate.getAccountInfo(launchAgentIdentity, 'confirmed')
              )) !== null;
            const trustedLaunch = await withTimeout(
              readTrustedLaunchState({
                connection,
                programId: KAMIYO_PROGRAM_ID,
                agentIdentity: launchAgentIdentity,
                mint,
              }),
              env.KAMIYO_RPC_READ_TIMEOUT_MS,
              'trusted_launch_verify timed out'
            );

            db.addAction(
              tickId,
              'trusted_launch_verify',
              {
                programId: KAMIYO_PROGRAM_ID.toBase58(),
                ownerWallet: launchOwner.toBase58(),
                agentIdentity: launchAgentIdentity.toBase58(),
                agentExists: launchAgentExists,
                mint: mint.toBase58(),
                launchRecordPda: trustedLaunch.launchRecordPda,
                launchRateLimitPda: trustedLaunch.launchRateLimitPda,
              },
              {
                success: trustedLaunch.linked,
                data: trustedLaunch,
              },
              trustedLaunch.linked
                ? undefined
                : (trustedLaunch.reason ?? 'trusted_launch_link_missing')
            );

            const receiptPath = writeOutbox(outboxDir, 'trusted-launch-check', {
              at: new Date().toISOString(),
              tickId,
              mode: env.KAMIYO_MODE,
              ownerWallet: launchOwner.toBase58(),
              launchAgentIdentity: launchAgentIdentity.toBase58(),
              trustedLaunch,
            });
            db.addAction(tickId, 'write_trusted_launch_check_receipt', {}, { receiptPath });
            observation.trustedLaunch = {
              ...trustedLaunch,
              ownerWallet: launchOwner.toBase58(),
              launchAgentIdentity: launchAgentIdentity.toBase58(),
              launchAgentExists,
              receiptPath,
            };
          }
        } catch (e) {
          observation.token = {
            mint: env.KAMIYO_TARGET_MINT,
            error: e instanceof Error ? e.message : String(e),
          };
          observation.trustedLaunch = {
            linked: false,
            reason: 'token_lookup_failed',
            mint: env.KAMIYO_TARGET_MINT,
            error: e instanceof Error ? e.message : String(e),
          };
        }
      } else {
        observation.trustedLaunch = { linked: false, reason: 'target_mint_not_configured' };
      }

      if (env.KAMIYO_FEE_VAULT) {
        try {
          const feeVault = new PublicKey(env.KAMIYO_FEE_VAULT);
          feeVaultBreakdown = await rpcRead('read_fee_vault', candidate =>
            readFeeVault(candidate, feeVault)
          );
          observation.feeVault = {
            address: feeVault.toBase58(),
            breakdown: feeVaultBreakdown,
          };
        } catch (e) {
          observation.feeVault = {
            address: env.KAMIYO_FEE_VAULT,
            error: e instanceof Error ? e.message : String(e),
          };
        }
      }

      if (env.KAMIYO_STAKING_POOL) {
        observation.stakingPool = {
          address: env.KAMIYO_STAKING_POOL,
          autoStakeEnabled: env.KAMIYO_AUTO_STAKE_ENABLED,
        };
      }

      if (env.KAMIYO_KYOSHIN_STAKING_POOL && !swarmExecutionEnabled) {
        observation.kyoshinStakingSource = {
          pool: env.KAMIYO_KYOSHIN_STAKING_POOL,
          claimer: kyoshinClaimerKeypair.publicKey.toBase58(),
          claimerIsOperator: kyoshinClaimerIsOperator,
          autoClaimEnabled: env.KAMIYO_KYOSHIN_AUTO_CLAIM_ENABLED,
        };
      }

      if (
        env.KAMIYO_MODE === 'execute' &&
        env.KAMIYO_AUTO_CLAIM_ENABLED &&
        env.KAMIYO_FEE_VAULT &&
        feeVaultBreakdown
      ) {
        const claimsToday = db.actionCountSince(dayStart, 'fee_vault_claim');
        const thresholdLamports = BigInt(env.KAMIYO_AUTO_CLAIM_MIN_LAMPORTS);
        const userAddress = keypair.publicKey.toBase58();
        const unclaimedLamports = getUserUnclaimedLamports(feeVaultBreakdown, userAddress);
        const autoClaimMeta = {
          feeVault: env.KAMIYO_FEE_VAULT,
          user: userAddress,
          unclaimedLamports: unclaimedLamports.toString(),
          thresholdLamports: thresholdLamports.toString(),
          claimsToday,
          dailyCap: env.KAMIYO_MAX_FEE_CLAIMS_PER_DAY,
        };

        if (claimsToday >= env.KAMIYO_MAX_FEE_CLAIMS_PER_DAY) {
          observation.autoClaim = {
            executed: false,
            reason: 'daily_claim_cap_reached',
            ...autoClaimMeta,
          };
        } else if (operatorBalanceLamports < 10_000_000n) {
          observation.autoClaim = { executed: false, reason: 'low_sol_balance', ...autoClaimMeta };
        } else if (unclaimedLamports < thresholdLamports) {
          observation.autoClaim = { executed: false, reason: 'below_threshold', ...autoClaimMeta };
        } else {
          try {
            const feeVault = new PublicKey(env.KAMIYO_FEE_VAULT);
            const claimResult = await withTimeout(
              claimFeeVault({
                connection,
                feeVault,
                user: keypair,
                payer: keypair,
                dryRun: false,
              }),
              Math.max(env.KAMIYO_RPC_READ_TIMEOUT_MS * 2, 45_000),
              'runtime_auto_claim timed out'
            );

            db.addAction(
              tickId,
              'fee_vault_claim',
              {
                feeVault: feeVault.toBase58(),
                source: 'runtime_auto_claim',
                thresholdLamports: thresholdLamports.toString(),
              },
              {
                success: true,
                data: {
                  signature: claimResult.signature,
                  before: claimResult.before,
                  after: claimResult.after,
                },
              }
            );

            const receiptPath = writeOutbox(outboxDir, 'fee-claim-receipt', {
              at: new Date().toISOString(),
              mode: 'auto',
              feeVault: feeVault.toBase58(),
              claimer: userAddress,
              unclaimedLamportsBefore: unclaimedLamports.toString(),
              thresholdLamports: thresholdLamports.toString(),
              signature: claimResult.signature,
              before: claimResult.before,
              after: claimResult.after,
            });
            db.addAction(tickId, 'write_fee_claim_receipt', {}, { receiptPath });

            feeVaultBreakdown = claimResult.after;
            operatorBalanceLamports = BigInt(
              await rpcRead('refresh_operator_balance_after_claim', candidate =>
                candidate.getBalance(wallet.publicKey, 'confirmed')
              )
            );
            observation.feeVault = {
              address: feeVault.toBase58(),
              breakdown: feeVaultBreakdown,
            };
            observation.autoClaim = {
              executed: true,
              signature: claimResult.signature,
              receiptPath,
              ...autoClaimMeta,
            };
            db.recordRevenueEvent({
              id: `${tickId}:claim:operator:fee_vault`,
              tickId,
              agentId: 'operator',
              lane: 'trading',
              kind: 'claim',
              amountSol: lamportsToSol(unclaimedLamports),
              amountUsd: lamportsToSol(unclaimedLamports) * env.KAMIYO_SWARM_SOL_PRICE_USD,
              metadata: {
                source: 'fee_vault',
                feeVault: feeVault.toBase58(),
                signature: claimResult.signature,
              },
            });
            dkgEvents.push({
              type: 'fee_vault_claim',
              signature: claimResult.signature ?? undefined,
              amountLamports: unclaimedLamports.toString(),
            });
          } catch (e) {
            const error = e instanceof Error ? e.message : String(e);
            db.addAction(
              tickId,
              'fee_vault_claim',
              {
                feeVault: env.KAMIYO_FEE_VAULT,
                source: 'runtime_auto_claim',
                thresholdLamports: thresholdLamports.toString(),
              },
              null,
              error
            );
            observation.autoClaim = {
              executed: false,
              reason: 'claim_failed',
              error,
              ...autoClaimMeta,
            };
          }
        }
      }

      if (
        env.KAMIYO_MODE === 'execute' &&
        env.KAMIYO_KYOSHIN_STAKING_POOL &&
        !swarmExecutionEnabled
      ) {
        const kyoshinPool = env.KAMIYO_KYOSHIN_STAKING_POOL;
        const claimerAddress = kyoshinClaimerKeypair.publicKey.toBase58();
        const minClaimLamports = BigInt(env.KAMIYO_KYOSHIN_AUTO_CLAIM_MIN_LAMPORTS);
        const maxPeriodsPerRun = env.KAMIYO_KYOSHIN_AUTO_CLAIM_MAX_PERIODS_PER_RUN;

        if (!env.KAMIYO_KYOSHIN_AUTO_CLAIM_ENABLED) {
          observation.kyoshinAutoClaim = {
            executed: false,
            reason: 'disabled',
            pool: kyoshinPool,
            claimer: claimerAddress,
          };
        } else {
          try {
            const position = await withTimeout(
              readFundryUserPosition({
                apiBase: env.KAMIYO_FUNDRY_API_BASE_URL,
                poolAddress: kyoshinPool,
                wallet: claimerAddress,
                timeoutMs: env.KAMIYO_RPC_READ_TIMEOUT_MS,
                retries: env.KAMIYO_FUNDRY_HTTP_RETRIES,
                retryBaseDelayMs: env.KAMIYO_FUNDRY_HTTP_BASE_BACKOFF_MS,
                retryMaxDelayMs: env.KAMIYO_FUNDRY_HTTP_MAX_BACKOFF_MS,
              }),
              fundryReadTimeoutBudgetMs(),
              'read_kyoshin_staking_position timed out'
            );
            const claimableLamports = getClaimableLamports(position);
            const periodNumbers = getClaimablePeriodNumbers(position, maxPeriodsPerRun);
            const claimMeta = {
              pool: kyoshinPool,
              claimer: claimerAddress,
              claimableLamports: claimableLamports.toString(),
              minClaimLamports: minClaimLamports.toString(),
              maxPeriodsPerRun,
              periodNumbers,
            };

            if (periodNumbers.length === 0) {
              observation.kyoshinAutoClaim = {
                executed: false,
                reason: 'no_claimable_periods',
                ...claimMeta,
              };
            } else if (claimableLamports < minClaimLamports) {
              observation.kyoshinAutoClaim = {
                executed: false,
                reason: 'below_threshold',
                ...claimMeta,
              };
            } else {
              kyoshinClaimerBalanceLamports ??= BigInt(
                await rpcRead('read_kyoshin_claimer_balance', candidate =>
                  candidate.getBalance(kyoshinClaimerKeypair.publicKey, 'confirmed')
                )
              );
              if (kyoshinClaimerBalanceLamports < 10_000_000n) {
                observation.kyoshinAutoClaim = {
                  executed: false,
                  reason: 'low_sol_balance',
                  ...claimMeta,
                };
              } else {
                const claims = await withTimeout(
                  claimFundryStakingPeriods({
                    connection,
                    apiBase: env.KAMIYO_FUNDRY_API_BASE_URL,
                    poolAddress: kyoshinPool,
                    signer: kyoshinClaimerKeypair,
                    periodNumbers,
                    requestTimeoutMs: env.KAMIYO_RPC_READ_TIMEOUT_MS,
                    confirmTimeoutMs: Math.max(env.KAMIYO_RPC_READ_TIMEOUT_MS * 2, 30_000),
                    retries: env.KAMIYO_FUNDRY_HTTP_RETRIES,
                    retryBaseDelayMs: env.KAMIYO_FUNDRY_HTTP_BASE_BACKOFF_MS,
                    retryMaxDelayMs: env.KAMIYO_FUNDRY_HTTP_MAX_BACKOFF_MS,
                  }),
                  fundryClaimTimeoutBudgetMs(periodNumbers.length),
                  'claim_kyoshin_staking_periods timed out'
                );

                db.addAction(
                  tickId,
                  'kyoshin_staking_claim',
                  {
                    source: 'runtime_kyoshin_staking_claim',
                    pool: kyoshinPool,
                    claimer: claimerAddress,
                    periodNumbers,
                    minClaimLamports: minClaimLamports.toString(),
                    maxPeriodsPerRun,
                  },
                  {
                    success: true,
                    data: { claims },
                  }
                );

                const receiptPath = writeOutbox(outboxDir, 'kyoshin-staking-claim-receipt', {
                  at: new Date().toISOString(),
                  mode: 'auto',
                  source: 'runtime_kyoshin_staking_claim',
                  pool: kyoshinPool,
                  claimer: claimerAddress,
                  claimableLamports: claimableLamports.toString(),
                  minClaimLamports: minClaimLamports.toString(),
                  periodNumbers,
                  claims,
                });
                db.addAction(tickId, 'write_kyoshin_staking_claim_receipt', {}, { receiptPath });

                kyoshinClaimerBalanceLamports = BigInt(
                  await rpcRead('refresh_kyoshin_claimer_balance', candidate =>
                    candidate.getBalance(kyoshinClaimerKeypair.publicKey, 'confirmed')
                  )
                );
                if (kyoshinClaimerIsOperator) {
                  operatorBalanceLamports = kyoshinClaimerBalanceLamports;
                }

                observation.kyoshinAutoClaim = {
                  executed: true,
                  receiptPath,
                  signatures: claims.map(claim => claim.signature).filter(Boolean),
                  claimsCount: claims.length,
                  ...claimMeta,
                };
                db.recordRevenueEvent({
                  id: `${tickId}:claim:kyoshin:${kyoshinPool}`,
                  tickId,
                  lane: 'trading',
                  kind: 'claim',
                  amountSol: lamportsToSol(claimableLamports),
                  amountUsd: lamportsToSol(claimableLamports) * env.KAMIYO_SWARM_SOL_PRICE_USD,
                  metadata: {
                    source: 'kyoshin_staking',
                    pool: kyoshinPool,
                    claimer: claimerAddress,
                  },
                });
                dkgEvents.push({
                  type: 'kyoshin_staking_claim',
                  signatures: claims
                    .map(claim => claim.signature)
                    .filter(
                      (value): value is string => typeof value === 'string' && value.length > 0
                    ),
                  amountLamports: claimableLamports.toString(),
                });
              }
            }
          } catch (e) {
            const error = e instanceof Error ? e.message : String(e);
            db.addAction(
              tickId,
              'kyoshin_staking_claim',
              {
                source: 'runtime_kyoshin_staking_claim',
                pool: kyoshinPool,
                claimer: claimerAddress,
              },
              null,
              error
            );
            observation.kyoshinAutoClaim = {
              executed: false,
              reason: 'claim_failed',
              error,
              pool: kyoshinPool,
              claimer: claimerAddress,
            };
          }
        }
      }

      if (env.KAMIYO_MODE === 'execute' && env.KAMIYO_STAKING_POOL) {
        const nowMs = Date.now();
        if (nowMs - lastStakingPeriodMaintenanceMs >= STAKING_PERIOD_MAINTENANCE_INTERVAL_MS) {
          lastStakingPeriodMaintenanceMs = nowMs;
          observation.stakingPeriodMaintenance = await maintainOpenStakingPeriod({
            connection,
            db,
            tickId,
            poolAddress: env.KAMIYO_STAKING_POOL,
            admin: keypair,
            source: 'runtime_period_maintenance',
          });
        }
      }

      if (env.KAMIYO_MODE === 'execute' && env.KAMIYO_AUTO_STAKE_ENABLED) {
        if (!env.KAMIYO_STAKING_POOL) {
          observation.autoStake = { executed: false, reason: 'staking_pool_not_configured' };
          if (env.KAMIYO_KYOSHIN_STAKING_POOL && !swarmExecutionEnabled) {
            observation.kyoshinRoute = {
              executed: false,
              reason: 'target_staking_pool_not_configured',
            };
          }
        } else {
          const operatorStake = await runAutoStakePolicy({
            connection,
            db,
            tickId,
            dayStart,
            outboxDir,
            poolAddress: env.KAMIYO_STAKING_POOL,
            depositor: keypair,
            source: 'runtime_auto_stake_operator',
            currentBalanceLamports: operatorBalanceLamports,
          });
          operatorBalanceLamports = operatorStake.nextBalanceLamports;
          observation.autoStake = operatorStake.observation;
          {
            const stakeObservation = operatorStake.observation as Record<string, unknown>;
            if (stakeObservation.executed === true) {
              const routeAmountSol =
                asNumber(stakeObservation.amountSol) ??
                (typeof stakeObservation.amountLamports === 'string'
                  ? lamportsToSol(toLamports(stakeObservation.amountLamports))
                  : 0);
              if (routeAmountSol > 0) {
                db.recordRevenueEvent({
                  id: `${tickId}:route:operator`,
                  tickId,
                  agentId: 'operator',
                  lane: 'trading',
                  kind: 'route',
                  amountSol: routeAmountSol,
                  amountUsd: routeAmountSol * env.KAMIYO_SWARM_SOL_PRICE_USD,
                  metadata: {
                    source: 'runtime_auto_stake_operator',
                    pool: env.KAMIYO_STAKING_POOL,
                  },
                });
              }
              dkgEvents.push({
                type: 'staking_period_deposit',
                signature:
                  typeof stakeObservation.signature === 'string'
                    ? stakeObservation.signature
                    : undefined,
                amountLamports:
                  typeof stakeObservation.amountLamports === 'string'
                    ? stakeObservation.amountLamports
                    : undefined,
              });
            }
          }

          if (operatorStake.period) {
            observation.stakingPool = {
              address: env.KAMIYO_STAKING_POOL,
              autoStakeEnabled: true,
              period: operatorStake.period,
            };
          }

          if (env.KAMIYO_KYOSHIN_STAKING_POOL && !swarmExecutionEnabled) {
            if (kyoshinClaimerIsOperator) {
              observation.kyoshinRoute = {
                executed: false,
                reason: 'same_wallet_as_operator',
                wallet: kyoshinClaimerKeypair.publicKey.toBase58(),
                pool: env.KAMIYO_STAKING_POOL,
              };
            } else {
              kyoshinClaimerBalanceLamports ??= BigInt(
                await rpcRead('read_kyoshin_route_balance', candidate =>
                  candidate.getBalance(kyoshinClaimerKeypair.publicKey, 'confirmed')
                )
              );
              const kyoshinRoute = await runAutoStakePolicy({
                connection,
                db,
                tickId,
                dayStart,
                outboxDir,
                poolAddress: env.KAMIYO_STAKING_POOL,
                depositor: kyoshinClaimerKeypair,
                source: 'runtime_auto_stake_kyoshin_route',
                currentBalanceLamports: kyoshinClaimerBalanceLamports,
              });
              kyoshinClaimerBalanceLamports = kyoshinRoute.nextBalanceLamports;
              observation.kyoshinRoute = kyoshinRoute.observation;
              {
                const routeObservation = kyoshinRoute.observation as Record<string, unknown>;
                if (routeObservation.executed === true) {
                  const routeAmountSol =
                    asNumber(routeObservation.amountSol) ??
                    (typeof routeObservation.amountLamports === 'string'
                      ? lamportsToSol(toLamports(routeObservation.amountLamports))
                      : 0);
                  if (routeAmountSol > 0) {
                    db.recordRevenueEvent({
                      id: `${tickId}:route:kyoshin`,
                      tickId,
                      lane: 'trading',
                      kind: 'route',
                      amountSol: routeAmountSol,
                      amountUsd: routeAmountSol * env.KAMIYO_SWARM_SOL_PRICE_USD,
                      metadata: {
                        source: 'runtime_auto_stake_kyoshin_route',
                        pool: env.KAMIYO_STAKING_POOL,
                        wallet: kyoshinClaimerKeypair.publicKey.toBase58(),
                      },
                    });
                  }
                  dkgEvents.push({
                    type: 'kyoshin_route_deposit',
                    signature:
                      typeof routeObservation.signature === 'string'
                        ? routeObservation.signature
                        : undefined,
                    amountLamports:
                      typeof routeObservation.amountLamports === 'string'
                        ? routeObservation.amountLamports
                        : undefined,
                  });
                }
              }
            }
          }
        }
      }

      if (
        env.KAMIYO_MODE === 'execute' &&
        !env.KAMIYO_AUTO_STAKE_ENABLED &&
        env.KAMIYO_KYOSHIN_STAKING_POOL &&
        !swarmExecutionEnabled
      ) {
        observation.kyoshinRoute = { executed: false, reason: 'auto_stake_disabled' };
      }

      if (env.KAMIYO_KYOSHIN_STAKING_POOL && !swarmExecutionEnabled) {
        if (kyoshinClaimerIsOperator) {
          kyoshinClaimerBalanceLamports = operatorBalanceLamports;
        }
        kyoshinClaimerBalanceLamports ??= BigInt(
          await rpcRead('read_kyoshin_claimer_snapshot_balance', candidate =>
            candidate.getBalance(kyoshinClaimerKeypair.publicKey, 'confirmed')
          )
        );
        observation.kyoshinClaimer = {
          publicKey: kyoshinClaimerKeypair.publicKey.toBase58(),
          solBalance: lamportsToSol(kyoshinClaimerBalanceLamports),
          isOperatorWallet: kyoshinClaimerIsOperator,
        };
      }

      if (env.KAMIYO_MODE === 'execute' && swarmExecutionEnabled) {
        if (!hasTickBudget(env.KAMIYO_TICK_MIN_REMAINING_MS_FOR_SWARM_AGENT)) {
          observation.swarmExecution = {
            executed: false,
            reason: 'tick_budget_exhausted',
            remainingMs: tickRemainingMs(),
            requiredRemainingMs: env.KAMIYO_TICK_MIN_REMAINING_MS_FOR_SWARM_AGENT,
          };
        } else if (!swarmRegistry) {
          observation.swarmExecution = { executed: false, reason: 'registry_unavailable' };
        } else if (!env.KAMIYO_STAKING_POOL) {
          observation.swarmExecution = {
            executed: false,
            reason: 'target_staking_pool_not_configured',
          };
        } else {
          const activeAgents = swarmRegistry.agents.filter(agent => agent.status === 'active');
          if (activeAgents.length === 0) {
            observation.swarmExecution = {
              executed: false,
              reason: 'no_active_agents',
              agentCount: 0,
            };
          } else {
            const agentResults: Array<Record<string, unknown>> = [];
            const minClaimLamports = BigInt(env.KAMIYO_KYOSHIN_AUTO_CLAIM_MIN_LAMPORTS);
            const maxPeriodsPerRun = env.KAMIYO_KYOSHIN_AUTO_CLAIM_MAX_PERIODS_PER_RUN;
            const opportunitiesById = new Map(
              (swarmOpportunityIntake?.opportunities ?? []).map(opportunity => [
                opportunity.id,
                opportunity,
              ])
            );
            const assignmentsByAgent = new Map(
              (swarmOpportunityIntake?.assignments ?? []).map(assignment => [
                assignment.agentId,
                assignment,
              ])
            );
            const sourceAuth: SourceAuthMap = {
              relevance: env.KAMIYO_SWARM_RELEVANCE_API_KEY
                ? {
                    apiKey: env.KAMIYO_SWARM_RELEVANCE_API_KEY,
                    authHeader: env.KAMIYO_SWARM_RELEVANCE_AUTH_HEADER,
                  }
                : undefined,
              agent_ai: env.KAMIYO_SWARM_AGENTAI_API_KEY
                ? {
                    apiKey: env.KAMIYO_SWARM_AGENTAI_API_KEY,
                    authHeader: env.KAMIYO_SWARM_AGENTAI_AUTH_HEADER,
                  }
                : undefined,
              kore: env.KAMIYO_SWARM_KORE_API_KEY
                ? {
                    apiKey: env.KAMIYO_SWARM_KORE_API_KEY,
                    authHeader: env.KAMIYO_SWARM_KORE_AUTH_HEADER,
                  }
                : undefined,
            };
            let jobExecutionsRemaining = env.KAMIYO_SWARM_JOB_EXECUTIONS_PER_TICK;
            const performanceMetrics: SwarmAgentRuntimeMetrics[] = [];
            let totalJobRevenueSol = 0;
            let marginCircuitState = parseMarginCircuitState(
              db.kvGet('swarm_margin_circuit_state')
            );
            const marginCircuitEvents: Array<Record<string, unknown>> = [];
            let rollbackState = parseRollbackState(db.kvGet('swarm_rollback_state'));
            rollbackState = pruneRollbackState({
              state: rollbackState,
              nowIso: new Date().toISOString(),
            });
            db.kvSet('swarm_rollback_state', JSON.stringify(rollbackState));
            let swarmAbortedForBudget = false;

            for (const agentProfile of activeAgents) {
              if (!hasTickBudget(env.KAMIYO_TICK_MIN_REMAINING_MS_FOR_SWARM_AGENT)) {
                swarmAbortedForBudget = true;
                break;
              }
              const agentResult: Record<string, unknown> = {
                agentId: agentProfile.id,
                name: agentProfile.name,
                role: agentProfile.role,
                mint: agentProfile.mint,
              };
              let jobExecuted = false;
              let jobSucceeded = false;
              let jobRevenueSol = 0;
              let claimExecuted = false;
              let routeExecuted = false;
              let hadError = false;

              let agentSigner = keypair;
              let signerSource: 'operator' | 'agent' = 'operator';
              if (agentProfile.claimerKeypairPath) {
                const resolved = resolveSwarmClaimerKeypairPath(agentProfile.claimerKeypairPath);
                if (!resolved.resolvedPath) {
                  agentResult.executed = false;
                  agentResult.reason = 'claimer_keypair_missing';
                  agentResult.keypairCandidates = resolved.candidates;
                  agentResults.push(agentResult);
                  performanceMetrics.push({
                    agentId: agentProfile.id,
                    basePriority: agentProfile.priority,
                    jobRevenueSol: 0,
                    jobExecuted: false,
                    jobSucceeded: false,
                    routeExecuted: false,
                    claimExecuted: false,
                    hadError: true,
                  });
                  continue;
                }

                try {
                  agentSigner = loadOperatorKeypair({
                    KAMIYO_OPERATOR_KEYPAIR_PATH: resolved.resolvedPath,
                  }).keypair;
                  signerSource = 'agent';
                  agentResult.claimerKeypairPath = resolved.resolvedPath;
                } catch (e) {
                  agentResult.executed = false;
                  agentResult.reason = 'claimer_keypair_invalid';
                  agentResult.error = e instanceof Error ? e.message : String(e);
                  agentResults.push(agentResult);
                  performanceMetrics.push({
                    agentId: agentProfile.id,
                    basePriority: agentProfile.priority,
                    jobRevenueSol: 0,
                    jobExecuted: false,
                    jobSucceeded: false,
                    routeExecuted: false,
                    claimExecuted: false,
                    hadError: true,
                  });
                  continue;
                }
              }

              const claimerAddress = agentSigner.publicKey.toBase58();
              agentResult.claimer = claimerAddress;
              agentResult.claimerSource = signerSource;

              let agentBalanceLamports = BigInt(
                await rpcRead(`read_agent_balance:${agentProfile.id}`, candidate =>
                  candidate.getBalance(agentSigner.publicKey, 'confirmed')
                )
              );
              const assignedOpportunity = assignmentsByAgent.get(agentProfile.id);
              if (
                env.KAMIYO_SWARM_JOB_EXECUTION_ENABLED &&
                assignedOpportunity &&
                jobExecutionsRemaining > 0
              ) {
                const opportunity = opportunitiesById.get(assignedOpportunity.opportunityId);
                if (opportunity) {
                  const nowIso = new Date().toISOString();
                  const rollbackStatus = env.KAMIYO_SWARM_ROLLBACK_ENABLED
                    ? isRollbackSourceDisabled({
                        state: rollbackState,
                        source: opportunity.source,
                        nowIso,
                      })
                    : { disabled: false as const, disabledUntil: undefined, reason: undefined };
                  if (rollbackStatus.disabled) {
                    const skippedResult = {
                      agentId: agentProfile.id,
                      opportunityId: assignedOpportunity.opportunityId,
                      source: opportunity.source,
                      status: 'skipped' as const,
                      reason: 'rollback_source_disabled',
                      paid: false,
                      realizedRevenueSol: 0,
                      realizedRevenueUsd: 0,
                      output: {
                        disabledUntil: rollbackStatus.disabledUntil ?? null,
                        rollbackReason: rollbackStatus.reason ?? null,
                      },
                    };
                    db.addAction(
                      tickId,
                      'swarm_execute_opportunity',
                      {
                        agentId: agentProfile.id,
                        opportunityId: assignedOpportunity.opportunityId,
                        source: opportunity.source,
                        endpoint: opportunity.url,
                      },
                      {
                        success: false,
                        data: skippedResult,
                      },
                      'rollback_source_disabled'
                    );
                    db.recordSwarmJob({
                      id: `${tickId}:${agentProfile.id}:${assignedOpportunity.opportunityId}`,
                      agentId: agentProfile.id,
                      source: opportunity.source,
                      status: skippedResult.status,
                      url: opportunity.url,
                      paid: false,
                      revenueSol: 0,
                      revenueUsd: 0,
                      error: skippedResult.reason,
                      metadata: {
                        assignment: assignedOpportunity,
                        response: skippedResult.output,
                      },
                    });
                    agentResult.job = skippedResult;
                    agentResult.jobRollback = {
                      disabled: true,
                      source: opportunity.source,
                      disabledUntil: rollbackStatus.disabledUntil ?? null,
                      reason: rollbackStatus.reason ?? null,
                    };
                  } else {
                    const circuitStatus = env.KAMIYO_SWARM_CIRCUIT_BREAKER_ENABLED
                      ? isMarginCircuitOpen({
                          state: marginCircuitState,
                          agentId: agentProfile.id,
                          source: opportunity.source,
                          nowIso,
                        })
                      : { open: false as const, openUntil: undefined };
                    if (circuitStatus.open) {
                      const skippedResult = {
                        agentId: agentProfile.id,
                        opportunityId: assignedOpportunity.opportunityId,
                        source: opportunity.source,
                        status: 'skipped' as const,
                        reason: 'margin_circuit_open',
                        paid: false,
                        realizedRevenueSol: 0,
                        realizedRevenueUsd: 0,
                        output: {
                          openUntil: circuitStatus.openUntil ?? null,
                        },
                      };
                      db.addAction(
                        tickId,
                        'swarm_execute_opportunity',
                        {
                          agentId: agentProfile.id,
                          opportunityId: assignedOpportunity.opportunityId,
                          source: opportunity.source,
                          endpoint: opportunity.url,
                        },
                        {
                          success: false,
                          data: skippedResult,
                        },
                        'margin_circuit_open'
                      );
                      db.recordSwarmJob({
                        id: `${tickId}:${agentProfile.id}:${assignedOpportunity.opportunityId}`,
                        agentId: agentProfile.id,
                        source: opportunity.source,
                        status: skippedResult.status,
                        url: opportunity.url,
                        paid: false,
                        revenueSol: 0,
                        revenueUsd: 0,
                        error: skippedResult.reason,
                        metadata: {
                          assignment: assignedOpportunity,
                          response: skippedResult.output,
                        },
                      });
                      agentResult.job = skippedResult;
                      agentResult.jobCircuit = {
                        open: true,
                        source: opportunity.source,
                        openUntil: circuitStatus.openUntil ?? null,
                      };
                    } else {
                      const jobResult = await executeAssignedOpportunity({
                        agentId: agentProfile.id,
                        opportunity,
                        assignment: assignedOpportunity,
                        signer: agentSigner,
                        timeoutMs: env.KAMIYO_SWARM_JOB_HTTP_TIMEOUT_MS,
                        solPriceUsd: env.KAMIYO_SWARM_SOL_PRICE_USD,
                        minMarginSol: env.KAMIYO_SWARM_JOB_MIN_MARGIN_SOL,
                        estimatedFeeSol: env.KAMIYO_SWARM_JOB_ESTIMATED_FEE_SOL,
                        requireExpectedRevenue: env.KAMIYO_SWARM_JOB_REQUIRE_EXPECTED_REWARD,
                        sourceAuth,
                        x402Enabled: env.KAMIYO_SWARM_X402_ENABLED,
                        x402MaxPriceUsd: env.KAMIYO_SWARM_X402_MAX_PRICE_USD,
                        x402PreferredNetwork: env.KAMIYO_SWARM_X402_PREFERRED_NETWORK,
                        x402FacilitatorPolicy: env.KAMIYO_SWARM_X402_FACILITATOR_POLICY,
                      });

                      const jobReceiptPath = writeOutbox(outboxDir, 'swarm-job-execution', {
                        at: new Date().toISOString(),
                        tickId,
                        agentId: agentProfile.id,
                        role: agentProfile.role,
                        assignment: assignedOpportunity,
                        result: jobResult,
                      });
                      db.addAction(
                        tickId,
                        'swarm_execute_opportunity',
                        {
                          agentId: agentProfile.id,
                          opportunityId: assignedOpportunity.opportunityId,
                          source: opportunity.source,
                          endpoint: opportunity.url,
                        },
                        {
                          success: jobResult.status === 'executed',
                          data: { ...jobResult, receiptPath: jobReceiptPath },
                        },
                        jobResult.status === 'failed'
                          ? (jobResult.error ?? jobResult.reason ?? 'job_failed')
                          : undefined
                      );
                      db.recordSwarmJob({
                        id: `${tickId}:${agentProfile.id}:${assignedOpportunity.opportunityId}`,
                        agentId: agentProfile.id,
                        source: opportunity.source,
                        status: jobResult.status,
                        url: opportunity.url,
                        paid: jobResult.paid,
                        paymentNetwork: jobResult.paymentNetwork,
                        paymentAmountUsd: jobResult.paymentAmountUsd,
                        revenueSol: jobResult.realizedRevenueSol,
                        revenueUsd: jobResult.realizedRevenueUsd,
                        error: jobResult.error ?? jobResult.reason,
                        metadata: {
                          assignment: assignedOpportunity,
                          response: jobResult.output ?? null,
                        },
                      });

                      const balanceAfterJobLamports = BigInt(
                        await rpcRead(`read_agent_balance_after_job:${agentProfile.id}`, candidate =>
                          candidate.getBalance(agentSigner.publicKey, 'confirmed')
                        )
                      );
                      const balanceDeltaLamports = balanceAfterJobLamports - agentBalanceLamports;
                      agentBalanceLamports = balanceAfterJobLamports;
                      const onchainRevenueSol =
                        balanceDeltaLamports > 0n ? lamportsToSol(balanceDeltaLamports) : 0;

                      jobExecuted = jobResult.status !== 'skipped';
                      jobSucceeded = jobResult.status === 'executed';
                      jobRevenueSol =
                        onchainRevenueSol > 0 ? onchainRevenueSol : jobResult.realizedRevenueSol;
                      totalJobRevenueSol += jobRevenueSol;
                      agentResult.job = {
                        ...jobResult,
                        receiptPath: jobReceiptPath,
                        onchainBalanceDeltaLamports: balanceDeltaLamports.toString(),
                      };

                      const paymentCostSol =
                        typeof jobResult.paymentAmountUsd === 'number'
                          ? jobResult.paymentAmountUsd / env.KAMIYO_SWARM_SOL_PRICE_USD
                          : 0;
                      const feeEstimateSol =
                        jobResult.status === 'executed' || jobResult.status === 'failed'
                          ? env.KAMIYO_SWARM_JOB_ESTIMATED_FEE_SOL
                          : 0;
                      const totalCostSol = paymentCostSol + feeEstimateSol;
                      const lane = revenueLaneForOpportunitySource(opportunity.source);
                      if (jobResult.status === 'executed' && jobRevenueSol > 0) {
                        const amountUsd =
                          jobResult.realizedRevenueUsd > 0
                            ? jobResult.realizedRevenueUsd
                            : jobRevenueSol * env.KAMIYO_SWARM_SOL_PRICE_USD;
                        db.recordRevenueEvent({
                          id: `${tickId}:job:${agentProfile.id}:${assignedOpportunity.opportunityId}`,
                          tickId,
                          agentId: agentProfile.id,
                          lane,
                          kind: 'job',
                          amountSol: jobRevenueSol,
                          amountUsd,
                          metadata: {
                            source: opportunity.source,
                            paid: jobResult.paid,
                            paymentNetwork: jobResult.paymentNetwork ?? null,
                          },
                        });
                      }
                      if (totalCostSol > 0) {
                        db.recordRevenueEvent({
                          id: `${tickId}:job_cost:${agentProfile.id}:${assignedOpportunity.opportunityId}`,
                          tickId,
                          agentId: agentProfile.id,
                          lane,
                          kind: 'job_cost',
                          amountSol: -totalCostSol,
                          amountUsd: -totalCostSol * env.KAMIYO_SWARM_SOL_PRICE_USD,
                          metadata: {
                            source: opportunity.source,
                            paid: jobResult.paid,
                            paymentAmountUsd: jobResult.paymentAmountUsd ?? null,
                            estimatedFeeSol: feeEstimateSol,
                          },
                        });
                      }

                      if (
                        env.KAMIYO_SWARM_CIRCUIT_BREAKER_ENABLED &&
                        jobResult.status !== 'skipped'
                      ) {
                        const marginSol =
                          jobRevenueSol - env.KAMIYO_SWARM_JOB_ESTIMATED_FEE_SOL - paymentCostSol;
                        const circuitUpdate = updateMarginCircuit({
                          state: marginCircuitState,
                          agentId: agentProfile.id,
                          source: opportunity.source,
                          marginSol,
                          failed: jobResult.status === 'failed',
                          error: jobResult.error ?? jobResult.reason,
                          negativeMarginThreshold: env.KAMIYO_SWARM_CIRCUIT_NEG_MARGIN_STREAK,
                          cooldownMinutes: env.KAMIYO_SWARM_CIRCUIT_COOLDOWN_MINUTES,
                          nowIso,
                        });
                        marginCircuitState = circuitUpdate.state;
                        if (circuitUpdate.event) {
                          marginCircuitEvents.push(circuitUpdate.event);
                        }
                        agentResult.jobCircuit = {
                          key: circuitUpdate.key,
                          negativeMarginStreak: circuitUpdate.entry.negativeMarginStreak,
                          openUntil: circuitUpdate.entry.openUntil ?? null,
                          lastMarginSol: circuitUpdate.entry.lastMarginSol ?? null,
                        };
                      }

                      if (jobResult.status === 'failed') hadError = true;
                      if (jobExecuted) {
                        jobExecutionsRemaining = Math.max(0, jobExecutionsRemaining - 1);
                      }
                    }
                  }
                }
              }

              if (agentProfile.sourceStakingPool && env.KAMIYO_KYOSHIN_AUTO_CLAIM_ENABLED) {
                try {
                  const position = await withTimeout(
                    readFundryUserPosition({
                      apiBase: env.KAMIYO_FUNDRY_API_BASE_URL,
                      poolAddress: agentProfile.sourceStakingPool,
                      wallet: claimerAddress,
                      timeoutMs: env.KAMIYO_RPC_READ_TIMEOUT_MS,
                      retries: env.KAMIYO_FUNDRY_HTTP_RETRIES,
                      retryBaseDelayMs: env.KAMIYO_FUNDRY_HTTP_BASE_BACKOFF_MS,
                      retryMaxDelayMs: env.KAMIYO_FUNDRY_HTTP_MAX_BACKOFF_MS,
                    }),
                    fundryReadTimeoutBudgetMs(),
                    `read_swarm_agent_staking_position timed out (${agentProfile.id})`
                  );
                  const claimableLamports = getClaimableLamports(position);
                  const periodNumbers = getClaimablePeriodNumbers(position, maxPeriodsPerRun);

                  agentResult.claim = {
                    sourcePool: agentProfile.sourceStakingPool,
                    claimableLamports: claimableLamports.toString(),
                    minClaimLamports: minClaimLamports.toString(),
                    periodNumbers,
                  };

                  if (periodNumbers.length === 0) {
                    agentResult.claim = {
                      ...(agentResult.claim as Record<string, unknown>),
                      executed: false,
                      reason: 'no_claimable_periods',
                    };
                  } else if (claimableLamports < minClaimLamports) {
                    agentResult.claim = {
                      ...(agentResult.claim as Record<string, unknown>),
                      executed: false,
                      reason: 'below_threshold',
                    };
                  } else if (agentBalanceLamports < 10_000_000n) {
                    agentResult.claim = {
                      ...(agentResult.claim as Record<string, unknown>),
                      executed: false,
                      reason: 'low_sol_balance',
                    };
                  } else {
                    const claims = await withTimeout(
                      claimFundryStakingPeriods({
                        connection,
                        apiBase: env.KAMIYO_FUNDRY_API_BASE_URL,
                        poolAddress: agentProfile.sourceStakingPool,
                        signer: agentSigner,
                        periodNumbers,
                        requestTimeoutMs: env.KAMIYO_RPC_READ_TIMEOUT_MS,
                        confirmTimeoutMs: Math.max(env.KAMIYO_RPC_READ_TIMEOUT_MS * 2, 30_000),
                        retries: env.KAMIYO_FUNDRY_HTTP_RETRIES,
                        retryBaseDelayMs: env.KAMIYO_FUNDRY_HTTP_BASE_BACKOFF_MS,
                        retryMaxDelayMs: env.KAMIYO_FUNDRY_HTTP_MAX_BACKOFF_MS,
                      }),
                      fundryClaimTimeoutBudgetMs(periodNumbers.length),
                      `claim_swarm_agent_staking_periods timed out (${agentProfile.id})`
                    );

                    db.addAction(
                      tickId,
                      'swarm_agent_staking_claim',
                      {
                        source: `swarm_agent:${agentProfile.id}`,
                        agentId: agentProfile.id,
                        pool: agentProfile.sourceStakingPool,
                        claimer: claimerAddress,
                        periodNumbers,
                      },
                      {
                        success: true,
                        data: { claims },
                      }
                    );

                    const receiptPath = writeOutbox(
                      outboxDir,
                      'swarm-agent-staking-claim-receipt',
                      {
                        at: new Date().toISOString(),
                        mode: 'auto',
                        source: `swarm_agent:${agentProfile.id}`,
                        agentId: agentProfile.id,
                        pool: agentProfile.sourceStakingPool,
                        claimer: claimerAddress,
                        periodNumbers,
                        claims,
                      }
                    );
                    db.addAction(
                      tickId,
                      'write_swarm_agent_staking_claim_receipt',
                      {},
                      { receiptPath }
                    );

                    agentBalanceLamports = BigInt(
                      await rpcRead(`read_agent_balance_after_claim:${agentProfile.id}`, candidate =>
                        candidate.getBalance(agentSigner.publicKey, 'confirmed')
                      )
                    );
                    agentResult.claim = {
                      ...(agentResult.claim as Record<string, unknown>),
                      executed: true,
                      claimsCount: claims.length,
                      signatures: claims
                        .map(claim => claim.signature)
                        .filter(
                          (value): value is string => typeof value === 'string' && value.length > 0
                        ),
                      receiptPath,
                    };
                    claimExecuted = true;
                    db.recordRevenueEvent({
                      id: `${tickId}:claim:${agentProfile.id}:${agentProfile.sourceStakingPool}`,
                      tickId,
                      agentId: agentProfile.id,
                      lane: 'trading',
                      kind: 'claim',
                      amountSol: lamportsToSol(claimableLamports),
                      amountUsd: lamportsToSol(claimableLamports) * env.KAMIYO_SWARM_SOL_PRICE_USD,
                      metadata: {
                        sourcePool: agentProfile.sourceStakingPool,
                        periodNumbers,
                      },
                    });

                    dkgEvents.push({
                      type: 'kyoshin_staking_claim',
                      signatures: claims
                        .map(claim => claim.signature)
                        .filter(
                          (value): value is string => typeof value === 'string' && value.length > 0
                        ),
                      amountLamports: claimableLamports.toString(),
                    });
                  }
                } catch (e) {
                  const error = e instanceof Error ? e.message : String(e);
                  db.addAction(
                    tickId,
                    'swarm_agent_staking_claim',
                    {
                      source: `swarm_agent:${agentProfile.id}`,
                      agentId: agentProfile.id,
                      pool: agentProfile.sourceStakingPool,
                      claimer: claimerAddress,
                    },
                    null,
                    error
                  );
                  agentResult.claim = {
                    executed: false,
                    reason: 'claim_failed',
                    error,
                  };
                  hadError = true;
                }
              } else if (agentProfile.sourceStakingPool) {
                agentResult.claim = {
                  executed: false,
                  reason: 'auto_claim_disabled',
                  sourcePool: agentProfile.sourceStakingPool,
                };
              } else {
                agentResult.claim = {
                  executed: false,
                  reason: 'source_pool_not_configured',
                };
              }

              if (!env.KAMIYO_AUTO_STAKE_ENABLED) {
                agentResult.route = { executed: false, reason: 'auto_stake_disabled' };
                agentResult.finalBalanceLamports = agentBalanceLamports.toString();
                agentResults.push(agentResult);
                performanceMetrics.push({
                  agentId: agentProfile.id,
                  basePriority: agentProfile.priority,
                  jobRevenueSol,
                  jobExecuted,
                  jobSucceeded,
                  routeExecuted: false,
                  claimExecuted,
                  hadError,
                });
                continue;
              }

              const route = await runAutoStakePolicy({
                connection,
                db,
                tickId,
                dayStart,
                outboxDir,
                poolAddress: env.KAMIYO_STAKING_POOL,
                depositor: agentSigner,
                source: `runtime_auto_stake_swarm_agent:${agentProfile.id}`,
                currentBalanceLamports: agentBalanceLamports,
              });
              agentResult.route = route.observation;
              agentBalanceLamports = route.nextBalanceLamports;
              if (agentSigner.publicKey.equals(keypair.publicKey)) {
                operatorBalanceLamports = agentBalanceLamports;
              }

              const routeObservation = route.observation as Record<string, unknown>;
              if (routeObservation.executed === true) {
                routeExecuted = true;
                const routeAmountSol =
                  asNumber(routeObservation.amountSol) ??
                  (typeof routeObservation.amountLamports === 'string'
                    ? lamportsToSol(toLamports(routeObservation.amountLamports))
                    : 0);
                if (routeAmountSol > 0) {
                  db.recordRevenueEvent({
                    id: `${tickId}:route:${agentProfile.id}`,
                    tickId,
                    agentId: agentProfile.id,
                    lane: 'trading',
                    kind: 'route',
                    amountSol: routeAmountSol,
                    amountUsd: routeAmountSol * env.KAMIYO_SWARM_SOL_PRICE_USD,
                    metadata: {
                      pool: env.KAMIYO_STAKING_POOL,
                      source: `swarm_agent:${agentProfile.id}`,
                    },
                  });
                }
                dkgEvents.push({
                  type: 'staking_period_deposit',
                  signature:
                    typeof routeObservation.signature === 'string'
                      ? routeObservation.signature
                      : undefined,
                  amountLamports:
                    typeof routeObservation.amountLamports === 'string'
                      ? routeObservation.amountLamports
                      : undefined,
                });
              } else if (routeObservation.reason === 'stake_failed') {
                hadError = true;
              }

              agentResult.finalBalanceLamports = agentBalanceLamports.toString();
              agentResult.executed = true;
              agentResults.push(agentResult);
              performanceMetrics.push({
                agentId: agentProfile.id,
                basePriority: agentProfile.priority,
                jobRevenueSol,
                jobExecuted,
                jobSucceeded,
                routeExecuted,
                claimExecuted,
                hadError,
              });
            }

            if (env.KAMIYO_SWARM_CIRCUIT_BREAKER_ENABLED) {
              marginCircuitState = pruneMarginCircuitState({
                state: marginCircuitState,
                keepDays: env.KAMIYO_SWARM_CIRCUIT_STATE_KEEP_DAYS,
              });
              db.kvSet('swarm_margin_circuit_state', JSON.stringify(marginCircuitState));
              const marginCircuitReceiptPath = writeOutbox(outboxDir, 'swarm-margin-circuit', {
                at: new Date().toISOString(),
                tickId,
                state: marginCircuitState,
                events: marginCircuitEvents,
              });
              db.addAction(
                tickId,
                'swarm_update_margin_circuit',
                {
                  events: marginCircuitEvents.length,
                  entryCount: Object.keys(marginCircuitState.entries).length,
                },
                {
                  success: true,
                  data: {
                    receiptPath: marginCircuitReceiptPath,
                    events: marginCircuitEvents,
                  },
                }
              );
              observation.swarmCircuitBreaker = {
                enabled: true,
                eventCount: marginCircuitEvents.length,
                entryCount: Object.keys(marginCircuitState.entries).length,
                events: marginCircuitEvents,
                receiptPath: marginCircuitReceiptPath,
              };
            } else {
              observation.swarmCircuitBreaker = {
                enabled: false,
              };
            }

            const recentWindowStartIso = minutesAgoIso(24 * 60);
            const recentJobStats = db.swarmJobStatsSince(recentWindowStartIso);
            const recentJobStatsByAgent = new Map(recentJobStats.map(stat => [stat.agentId, stat]));
            const blendedMetrics: SwarmAgentRuntimeMetrics[] = performanceMetrics.map(metric => {
              const historical = recentJobStatsByAgent.get(metric.agentId);
              const historicalTotal = historical?.total ?? 0;
              const historicalSuccessRatio =
                historicalTotal > 0 ? (historical?.succeeded ?? 0) / historicalTotal : 0;
              const historicalAvgRevenueSol =
                historicalTotal > 0 ? (historical?.revenueSol ?? 0) / historicalTotal : 0;

              return {
                ...metric,
                jobRevenueSol: metric.jobRevenueSol + historicalAvgRevenueSol * 0.5,
                jobExecuted: metric.jobExecuted || historicalTotal > 0,
                jobSucceeded: metric.jobSucceeded || historicalSuccessRatio >= 0.6,
                hadError: metric.hadError || (historicalTotal >= 3 && historicalSuccessRatio < 0.3),
              };
            });

            const performancePreviousState = parsePriorityState(db.kvGet('swarm_priority_state'));
            const performance = evaluateSwarmPerformance({
              registry: swarmRegistry,
              metrics: blendedMetrics,
              previousState: performancePreviousState,
            });
            db.kvSet('swarm_priority_state', JSON.stringify(performance.state));

            const performanceReceiptPath = writeOutbox(outboxDir, 'swarm-performance', {
              at: new Date().toISOString(),
              tickId,
              aggregate: performance.aggregate,
              agents: performance.agents,
              recentWindowStartIso,
              recentJobStats,
              blendedMetrics,
              previousState: performancePreviousState,
              nextState: performance.state,
            });
            db.addAction(
              tickId,
              'swarm_update_priority_state',
              {
                previousUpdatedAt: performancePreviousState.updatedAt,
                agentCount: performance.agents.length,
              },
              {
                success: true,
                data: {
                  aggregate: performance.aggregate,
                  receiptPath: performanceReceiptPath,
                },
              }
            );

            observation.swarmPerformance = {
              ...performance.aggregate,
              recentWindowStartIso,
              recentJobStats,
              receiptPath: performanceReceiptPath,
              agents: performance.agents.map(agent => ({
                agentId: agent.agentId,
                score: Number(agent.score.toFixed(4)),
                recommendation: agent.recommendation,
                previousPriority: agent.previousPriority,
                nextPriority: agent.nextPriority,
              })),
            };

            if (env.KAMIYO_SWARM_WEEKLY_SUMMARY_ENABLED) {
              const weeklyLastAt = db.kvGet('swarm_weekly_summary_last_at');
              const weeklyLastMs = parseIsoMillis(weeklyLastAt);
              const weeklyIntervalMs = env.KAMIYO_SWARM_WEEKLY_SUMMARY_INTERVAL_HOURS * 3_600_000;
              const shouldEmitWeeklySummary =
                weeklyLastMs == null || Date.now() - weeklyLastMs >= weeklyIntervalMs;

              if (shouldEmitWeeklySummary) {
                const weeklyStartIso = daysAgoIso(7);
                const weeklyStats = db.swarmJobStatsSince(weeklyStartIso);
                const weeklyStatsByAgent = new Map(weeklyStats.map(stat => [stat.agentId, stat]));
                const performanceByAgent = new Map(
                  performance.agents.map(agent => [agent.agentId, agent])
                );
                const decisions = activeAgents.map(agent => {
                  const perf = performanceByAgent.get(agent.id);
                  const stats = weeklyStatsByAgent.get(agent.id);
                  const total = stats?.total ?? 0;
                  const successRatio = total > 0 ? (stats?.succeeded ?? 0) / total : 0;
                  const score = perf?.score ?? 0;
                  let recommendation: 'keep' | 'scale' | 'pause' = 'keep';
                  if (score >= 0.75 || successRatio >= 0.8) {
                    recommendation = 'scale';
                  } else if (score <= 0.4 || (total >= 3 && successRatio < 0.35)) {
                    recommendation = 'pause';
                  }
                  return {
                    agentId: agent.id,
                    role: agent.role,
                    score,
                    successRatio,
                    revenueSol: stats?.revenueSol ?? 0,
                    recommendation,
                  };
                });

                const weeklySummaryPayload = {
                  at: new Date().toISOString(),
                  tickId,
                  weeklyStartIso,
                  decisions,
                };
                const weeklyReceiptPath = writeOutbox(
                  outboxDir,
                  'swarm-weekly-summary',
                  weeklySummaryPayload
                );
                db.addAction(
                  tickId,
                  'swarm_weekly_summary',
                  {
                    weeklyStartIso,
                    intervalHours: env.KAMIYO_SWARM_WEEKLY_SUMMARY_INTERVAL_HOURS,
                  },
                  {
                    success: true,
                    data: {
                      receiptPath: weeklyReceiptPath,
                      decisions,
                    },
                  }
                );
                db.kvSet('swarm_weekly_summary_last_at', new Date().toISOString());
                observation.swarmWeeklySummary = {
                  executed: true,
                  receiptPath: weeklyReceiptPath,
                  decisions,
                };
              } else {
                observation.swarmWeeklySummary = {
                  executed: false,
                  reason: 'interval_not_elapsed',
                  intervalHours: env.KAMIYO_SWARM_WEEKLY_SUMMARY_INTERVAL_HOURS,
                  lastRunAt: weeklyLastAt ?? null,
                };
              }
            } else {
              observation.swarmWeeklySummary = {
                executed: false,
                reason: 'disabled',
              };
            }

            if (env.KAMIYO_SWARM_ROLLBACK_ENABLED) {
              const rollbackLastAt = db.kvGet('swarm_rollback_last_at');
              const rollbackLastMs = parseIsoMillis(rollbackLastAt);
              const rollbackIntervalMs = env.KAMIYO_SWARM_ROLLBACK_EVAL_INTERVAL_HOURS * 3_600_000;
              const shouldEvaluateRollback =
                rollbackLastMs == null || Date.now() - rollbackLastMs >= rollbackIntervalMs;

              if (shouldEvaluateRollback) {
                const nowIso = new Date().toISOString();
                const weeklyStartIso = daysAgoIso(env.KAMIYO_SWARM_ROLLBACK_WINDOW_DAYS);
                const weeklyRevenue = db.revenueLaneStatsSince(weeklyStartIso);
                const weeklyNetSol = weeklyRevenue.reduce((sum, row) => sum + row.amountSol, 0);
                const weeklySourceStats = db.swarmSourceStatsSince(weeklyStartIso);
                const evaluation = evaluateRollbackPolicy({
                  state: rollbackState,
                  nowIso,
                  weeklyNetSol,
                  weeklySourceStats,
                  minJobs: env.KAMIYO_SWARM_ROLLBACK_MIN_JOBS,
                  sourceMinJobs: env.KAMIYO_SWARM_ROLLBACK_SOURCE_MIN_JOBS,
                  netSolTrigger: env.KAMIYO_SWARM_ROLLBACK_NET_SOL_TRIGGER,
                  maxDisabledSources: env.KAMIYO_SWARM_ROLLBACK_MAX_DISABLED_SOURCES,
                  cooldownHours: env.KAMIYO_SWARM_ROLLBACK_COOLDOWN_HOURS,
                  recoveryNetSol: env.KAMIYO_SWARM_ROLLBACK_RECOVERY_NET_SOL,
                });
                rollbackState = evaluation.state;
                db.kvSet('swarm_rollback_state', JSON.stringify(rollbackState));
                db.kvSet('swarm_rollback_last_at', nowIso);

                const rollbackPayload = {
                  at: nowIso,
                  tickId,
                  windowDays: env.KAMIYO_SWARM_ROLLBACK_WINDOW_DAYS,
                  weeklyStartIso,
                  weeklyNetSol,
                  trigger: env.KAMIYO_SWARM_ROLLBACK_NET_SOL_TRIGGER,
                  disabledSources: evaluation.disabledSources,
                  reason: evaluation.reason ?? null,
                  sourceStats: weeklySourceStats,
                  state: rollbackState,
                };
                const rollbackReceiptPath = writeOutbox(
                  outboxDir,
                  'swarm-rollback-policy',
                  rollbackPayload
                );
                db.addAction(
                  tickId,
                  'swarm_rollback_policy',
                  {
                    windowDays: env.KAMIYO_SWARM_ROLLBACK_WINDOW_DAYS,
                    intervalHours: env.KAMIYO_SWARM_ROLLBACK_EVAL_INTERVAL_HOURS,
                    trigger: env.KAMIYO_SWARM_ROLLBACK_NET_SOL_TRIGGER,
                  },
                  {
                    success: true,
                    data: {
                      receiptPath: rollbackReceiptPath,
                      triggered: evaluation.triggered,
                      disabledSources: evaluation.disabledSources,
                      reason: evaluation.reason ?? null,
                      weeklyNetSol,
                    },
                  }
                );
                observation.swarmRollback = {
                  executed: true,
                  triggered: evaluation.triggered,
                  disabledSources: evaluation.disabledSources,
                  reason: evaluation.reason ?? null,
                  weeklyNetSol,
                  receiptPath: rollbackReceiptPath,
                };
              } else {
                observation.swarmRollback = {
                  executed: false,
                  reason: 'interval_not_elapsed',
                  intervalHours: env.KAMIYO_SWARM_ROLLBACK_EVAL_INTERVAL_HOURS,
                  lastRunAt: rollbackLastAt ?? null,
                };
              }
            } else {
              observation.swarmRollback = {
                executed: false,
                reason: 'disabled',
              };
            }

            observation.swarmExecution = {
              executed: true,
              partial: swarmAbortedForBudget,
              partialReason: swarmAbortedForBudget ? 'tick_budget_exhausted' : null,
              targetPool: env.KAMIYO_STAKING_POOL,
              agentCount: activeAgents.length,
              opportunityAssignments: assignmentsByAgent.size,
              jobExecutionsRemaining,
              totalJobRevenueSol,
              remainingMs: tickRemainingMs(),
              results: agentResults,
            };
          }
        }
      }

      observation.operator = {
        publicKey: wallet.publicKey.toBase58(),
        solBalance: lamportsToSol(operatorBalanceLamports),
      };

      {
        const rateLimitCooldownKey = 'dkg_activity_rate_limit_retry_at';
        const cooldownRetryAtIso = db.kvGet(rateLimitCooldownKey);
        const cooldownRetryAtMs = parseIsoMillis(cooldownRetryAtIso);
        const nowMs = Date.now();

        let activity =
          env.KAMIYO_DKG_ACTIVITY_ENABLED &&
          env.KAMIYO_MODE === 'execute' &&
          dkgEvents.length > 0 &&
          cooldownRetryAtMs != null &&
          nowMs < cooldownRetryAtMs
            ? {
                enabled: true,
                published: false,
                source: env.KAMIYO_DKG_AUDIT_SOURCE,
                agentId: dkgAgentId,
                eventCount: dkgEvents.length,
                signatures: [] as string[],
                reason: 'rate_limit_cooldown',
                retryAt: new Date(cooldownRetryAtMs).toISOString(),
                error: undefined,
              }
            : await dkgActivityPublisher.publish({
                tickId,
                observedAt: new Date().toISOString(),
                mode: env.KAMIYO_MODE,
                agentId: dkgAgentId,
                agentName: env.KAMIYO_AGENT_NAME,
                events: dkgEvents,
              });

        if (activity.published) {
          db.kvSet(rateLimitCooldownKey, '');
          const receiptPath = writeOutbox(outboxDir, 'dkg-activity-receipt', {
            at: new Date().toISOString(),
            tickId,
            mode: env.KAMIYO_MODE,
            agentId: dkgAgentId,
            events: dkgEvents,
            activity,
          });
          db.addAction(
            tickId,
            'dkg_activity_publish',
            {
              source: env.KAMIYO_DKG_AUDIT_SOURCE,
              agentId: dkgAgentId,
              eventCount: dkgEvents.length,
            },
            {
              success: true,
              data: activity,
            }
          );
          db.addAction(tickId, 'write_dkg_activity_receipt', {}, { receiptPath });
          observation.dkgActivity = { ...activity, receiptPath };
        } else {
          if (activity.reason === 'rate_limited') {
            const retryAtIso = new Date(
              Date.now() + env.KAMIYO_DKG_RATE_LIMIT_COOLDOWN_SECONDS * 1000
            ).toISOString();
            db.kvSet(rateLimitCooldownKey, retryAtIso);
            activity = { ...activity, retryAt: retryAtIso };
            db.addAction(
              tickId,
              'dkg_activity_publish',
              {
                source: env.KAMIYO_DKG_AUDIT_SOURCE,
                agentId: dkgAgentId,
                eventCount: dkgEvents.length,
                retryAt: retryAtIso,
              },
              null,
              activity.error || 'rate_limited'
            );
          } else if (activity.reason === 'publish_failed') {
            db.kvSet(rateLimitCooldownKey, '');
            db.addAction(
              tickId,
              'dkg_activity_publish',
              {
                source: env.KAMIYO_DKG_AUDIT_SOURCE,
                agentId: dkgAgentId,
                eventCount: dkgEvents.length,
              },
              null,
              activity.error || 'publish_failed'
            );
          } else if (activity.reason !== 'rate_limit_cooldown') {
            db.kvSet(rateLimitCooldownKey, '');
          }
          observation.dkgActivity = activity;
        }
      }

      observation.trustLayer = buildTrustLayerObservation({
        agentExists: agentState.exists,
        agentIdentity: agentState.pda.toBase58(),
        targetMint: env.KAMIYO_TARGET_MINT,
        meishiEnabled: env.KAMIYO_MEISHI_ENABLED,
        meishiAgentIdentity: asString(asRecord(observation.meishiAgentIdentity)?.pda) ?? undefined,
        meishiAgentIdentitySource:
          asString(asRecord(observation.meishiAgentIdentity)?.source) ?? undefined,
        meishi: asRecord(observation.meishi) ?? undefined,
        trustedLaunch: asRecord(observation.trustedLaunch) ?? undefined,
        dkgEnabled: env.KAMIYO_DKG_ACTIVITY_ENABLED,
        dkgActivity: asRecord(observation.dkgActivity) ?? undefined,
      });

      if (env.KAMIYO_SWARM_REVENUE_REPORT_ENABLED) {
        const revenueStatsDay = db.revenueLaneStatsSince(dayStart);
        const revenueSummary = summariseLaneStats(revenueStatsDay);
        const revenueLastAt = db.kvGet('swarm_revenue_report_last_at');
        const revenueLastMs = parseIsoMillis(revenueLastAt);
        const revenueIntervalMs = env.KAMIYO_SWARM_REVENUE_REPORT_INTERVAL_MINUTES * 60_000;
        const shouldEmitRevenueReceipt =
          revenueLastMs == null || Date.now() - revenueLastMs >= revenueIntervalMs;

        observation.swarmRevenue = {
          dayStart,
          ...revenueSummary,
        };

        if (shouldEmitRevenueReceipt) {
          const receiptPath = writeOutbox(outboxDir, 'swarm-revenue-report', {
            at: new Date().toISOString(),
            tickId,
            dayStart,
            ...revenueSummary,
          });
          db.addAction(
            tickId,
            'swarm_revenue_report',
            {
              dayStart,
              intervalMinutes: env.KAMIYO_SWARM_REVENUE_REPORT_INTERVAL_MINUTES,
            },
            {
              success: true,
              data: {
                receiptPath,
                totals: revenueSummary.totals,
              },
            }
          );
          db.kvSet('swarm_revenue_report_last_at', new Date().toISOString());
          observation.swarmRevenue = {
            ...(asRecord(observation.swarmRevenue) ?? {}),
            receiptPath,
          };
        }
      } else {
        observation.swarmRevenue = { enabled: false };
      }

      if (env.KAMIYO_SWARM_SLO_REPORT_ENABLED) {
        const nowIso = new Date().toISOString();
        const windowStart = daysAgoIso(env.KAMIYO_SWARM_SLO_REPORT_WINDOW_DAYS);
        const sloLastAt = db.kvGet('swarm_slo_report_last_at');
        const sloLastMs = parseIsoMillis(sloLastAt);
        const sloIntervalMs = env.KAMIYO_SWARM_SLO_REPORT_INTERVAL_HOURS * 3_600_000;
        const shouldEmitSloReceipt = sloLastMs == null || Date.now() - sloLastMs >= sloIntervalMs;

        const ticksWindow = db.ticksSince(windowStart);
        const actionsWindow = db.actionsSince(windowStart);
        const routeActionsWindow = db.actionsSince(windowStart, 'staking_period_deposit');
        const revenueWindow = db.revenueLaneStatsSince(windowStart);
        const sloReport = buildAutonomySloReport({
          nowIso,
          windowDays: env.KAMIYO_SWARM_SLO_REPORT_WINDOW_DAYS,
          ticks: ticksWindow,
          actions: actionsWindow,
          routeActions: routeActionsWindow,
          revenueLaneStats: revenueWindow,
          interventionTools: ['propose_action'],
        });
        observation.swarmAutonomySlo = sloReport;

        if (env.KAMIYO_SWARM_SLO_ALERT_ENABLED) {
          const failedTargets = Object.entries(sloReport.meetsTargets)
            .filter(([key, ok]) => key !== 'overall' && ok === false)
            .map(([key]) => key);
          const alertLastAt = db.kvGet('swarm_slo_alert_last_at');
          const alertLastMs = parseIsoMillis(alertLastAt);
          const alertCooldownMs = env.KAMIYO_SWARM_SLO_ALERT_COOLDOWN_HOURS * 3_600_000;
          const shouldEmitAlert =
            failedTargets.length > 0 &&
            (alertLastMs == null || Date.now() - alertLastMs >= alertCooldownMs);

          if (shouldEmitAlert) {
            const alertId = `${tickId}:${Date.now()}`;
            const alertPayload = {
              id: alertId,
              at: nowIso,
              tickId,
              failedTargets,
              metrics: sloReport.metrics,
              targets: sloReport.targets,
            };
            const serializedAlertPayload = JSON.stringify(alertPayload);
            let webhookDelivery: {
              delivered: boolean;
              status?: number;
              error?: string;
              signed?: boolean;
              signatureTimestamp?: string;
            } | null = null;
            if (env.KAMIYO_SWARM_SLO_ALERT_WEBHOOK_URL) {
              try {
                const webhookHeaders: Record<string, string> = {};
                if (env.KAMIYO_SWARM_SLO_ALERT_WEBHOOK_SECRET) {
                  const timestamp = Math.floor(Date.now() / 1000).toString();
                  const signature = hmacSha256Hex(
                    env.KAMIYO_SWARM_SLO_ALERT_WEBHOOK_SECRET,
                    `${timestamp}.${serializedAlertPayload}`
                  );
                  webhookHeaders['x-kamiyo-timestamp'] = timestamp;
                  webhookHeaders['x-kamiyo-signature'] = `sha256=${signature}`;
                }
                const webhookResponse = await postJsonWithTimeout({
                  url: env.KAMIYO_SWARM_SLO_ALERT_WEBHOOK_URL,
                  payload: alertPayload,
                  body: serializedAlertPayload,
                  timeoutMs: env.KAMIYO_SWARM_SLO_ALERT_WEBHOOK_TIMEOUT_MS,
                  headers: webhookHeaders,
                });
                webhookDelivery = {
                  delivered: webhookResponse.ok,
                  status: webhookResponse.status,
                  error: webhookResponse.ok
                    ? undefined
                    : `HTTP ${webhookResponse.status}: ${webhookResponse.body.slice(0, 300)}`,
                  signed: Boolean(env.KAMIYO_SWARM_SLO_ALERT_WEBHOOK_SECRET),
                  signatureTimestamp: webhookHeaders['x-kamiyo-timestamp'],
                };
              } catch (error) {
                webhookDelivery = {
                  delivered: false,
                  error: error instanceof Error ? error.message : String(error),
                  signed: Boolean(env.KAMIYO_SWARM_SLO_ALERT_WEBHOOK_SECRET),
                };
              }
            }
            const alertReceiptPath = writeOutbox(outboxDir, 'swarm-autonomy-alert', alertPayload);
            db.addAction(
              tickId,
              'swarm_slo_alert',
              {
                failedTargets,
                cooldownHours: env.KAMIYO_SWARM_SLO_ALERT_COOLDOWN_HOURS,
                webhookUrlConfigured: Boolean(env.KAMIYO_SWARM_SLO_ALERT_WEBHOOK_URL),
              },
              {
                success: true,
                data: {
                  receiptPath: alertReceiptPath,
                  metrics: sloReport.metrics,
                  webhookDelivery,
                },
              }
            );
            db.kvSet('swarm_slo_alert_last_at', nowIso);
            observation.swarmAutonomyAlert = {
              triggered: true,
              failedTargets,
              webhookDelivery,
              receiptPath: alertReceiptPath,
            };
          } else {
            observation.swarmAutonomyAlert = {
              triggered: false,
              failedTargets,
            };
          }
        } else {
          observation.swarmAutonomyAlert = { enabled: false };
        }

        if (shouldEmitSloReceipt) {
          const receiptPath = writeOutbox(outboxDir, 'swarm-autonomy-slo', {
            at: nowIso,
            tickId,
            report: sloReport,
          });
          db.addAction(
            tickId,
            'swarm_slo_report',
            {
              windowDays: env.KAMIYO_SWARM_SLO_REPORT_WINDOW_DAYS,
              intervalHours: env.KAMIYO_SWARM_SLO_REPORT_INTERVAL_HOURS,
            },
            {
              success: true,
              data: {
                receiptPath,
                metrics: sloReport.metrics,
                meetsTargets: sloReport.meetsTargets,
              },
            }
          );
          db.kvSet('swarm_slo_report_last_at', nowIso);
          observation.swarmAutonomySlo = {
            ...(asRecord(observation.swarmAutonomySlo) ?? {}),
            receiptPath,
          };
        }
      } else {
        observation.swarmAutonomySlo = { enabled: false };
      }

      const runtimeObservation = asRecord(observation.runtime);
      if (runtimeObservation) {
        runtimeObservation.softDeadlineRemainingMs = tickRemainingMs();
        runtimeObservation.rpc = {
          ...(asRecord(runtimeObservation.rpc) ?? {}),
          activeUrl: rpcUrls[activeRpcIndex] ?? env.SOLANA_RPC_URL,
        };
      }

      db.addObservation(tickId, 'snapshot', observation);

      if (!agent) {
        const summaryText =
          'LLM disabled: completed deterministic operator tick (claims/routing/policy) without Anthropic.';
        db.kvSet('last_summary', summaryText);
        const reportPath = writeOutbox(outboxDir, 'summary', {
          at: new Date().toISOString(),
          summary: summaryText,
          warning: 'llm_disabled',
        });
        db.addAction(tickId, 'write_summary', { reason: 'llm_disabled' }, { reportPath });
        db.finishTick(tickId, 'ok');
        if (env.KAMIYO_RUN_ONCE) break;
        await sleep(env.KAMIYO_LOOP_INTERVAL_SECONDS * 1000);
        continue;
      }

      const llmOverBudget =
        llmCallsToday >= env.KAMIYO_LLM_MAX_TURNS_PER_DAY ||
        llmUsageToday.inputTokens >= env.KAMIYO_LLM_MAX_INPUT_TOKENS_PER_DAY ||
        llmUsageToday.outputTokens >= env.KAMIYO_LLM_MAX_OUTPUT_TOKENS_PER_DAY;

      if (llmOverBudget) {
        const filePath = writeOutbox(outboxDir, 'report', {
          at: new Date().toISOString(),
          reason: 'LLM daily budget exhausted',
          observation,
        });
        db.addAction(tickId, 'write_report', { reason: 'budget_exhausted' }, { filePath });
        db.finishTick(tickId, 'ok');
        if (env.KAMIYO_RUN_ONCE) break;
        await sleep(env.KAMIYO_LOOP_INTERVAL_SECONDS * 1000);
        continue;
      }

      const remainingForLlmMs = tickRemainingMs();
      if (remainingForLlmMs <= env.KAMIYO_TICK_MIN_REMAINING_MS_FOR_LLM) {
        const filePath = writeOutbox(outboxDir, 'report', {
          at: new Date().toISOString(),
          reason: 'tick_soft_deadline_near',
          remainingForLlmMs,
          requiredRemainingMs: env.KAMIYO_TICK_MIN_REMAINING_MS_FOR_LLM,
          observation,
        });
        db.addAction(
          tickId,
          'write_report',
          {
            reason: 'tick_soft_deadline_near',
            remainingForLlmMs,
            requiredRemainingMs: env.KAMIYO_TICK_MIN_REMAINING_MS_FOR_LLM,
          },
          { filePath }
        );
        db.finishTick(tickId, 'ok');
        if (env.KAMIYO_RUN_ONCE) break;
        await sleep(env.KAMIYO_LOOP_INTERVAL_SECONDS * 1000);
        continue;
      }

      const systemPrompt = buildSystemPrompt({
        identity: identityBlock,
        observation,
        mode: env.KAMIYO_MODE,
        allowedChannels,
        primeDirective: env.KAMIYO_PRIME_DIRECTIVE,
        targetMint: env.KAMIYO_TARGET_MINT,
        swarm: {
          enabled: env.KAMIYO_SWARM_ENABLED,
          proposeOnly: env.KAMIYO_SWARM_PROPOSE_ONLY,
          missionsPerTick: env.KAMIYO_SWARM_MISSIONS_PER_TICK,
          maxActiveAgents: env.KAMIYO_SWARM_MAX_ACTIVE_AGENTS,
        },
        budgets: {
          solDailyCap: env.KAMIYO_SOL_DAILY_CAP,
          solPerTxCap: env.KAMIYO_SOL_PER_TX_CAP,
          maxTxPerDay: env.KAMIYO_MAX_TX_PER_DAY,
          maxFeeClaimsPerDay: env.KAMIYO_MAX_FEE_CLAIMS_PER_DAY,
          maxStakeFeedsPerDay: env.KAMIYO_AUTO_STAKE_MAX_FEEDS_PER_DAY,
          llmMaxTurnsPerDay: env.KAMIYO_LLM_MAX_TURNS_PER_DAY,
          llmMaxInputTokensPerDay: env.KAMIYO_LLM_MAX_INPUT_TOKENS_PER_DAY,
          llmMaxOutputTokensPerDay: env.KAMIYO_LLM_MAX_OUTPUT_TOKENS_PER_DAY,
        },
      });

      const last = db.kvGet('last_summary');
      const swarmLine = env.KAMIYO_SWARM_ENABLED
        ? 'Swarm mode is enabled. Use observation.swarm missions as the control-plane backlog and keep actions proposal-oriented for subagent operations.'
        : 'Swarm mode is disabled this tick.';
      const userPrompt = `Run one operator tick now.

Priority: maximize net SOL revenue routed to $KAMIYO stakers.
If a direct execute action is not safe or not allowed, create a concrete proposal with measurable upside.
${swarmLine}
Record exactly one learning update with record_learning.

Previous summary (if any):
${last ?? '(none)'}
`;

      const result = await agent.runTick({
        tickId,
        systemPrompt,
        userPrompt,
      });

      db.kvSet('last_summary', result.finalText);
      const reportPath = writeOutbox(outboxDir, 'summary', {
        at: new Date().toISOString(),
        summary: result.finalText,
        warning: 'warning' in result ? result.warning : null,
      });
      db.addAction(tickId, 'write_summary', {}, { reportPath });

      db.finishTick(tickId, 'ok');
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      db.finishTick(tickId, 'error', err);
    } finally {
      if (!timedOut) {
        clearTimeout(timeout);
      }
    }

    if (env.KAMIYO_RUN_ONCE) break;
    await sleep(env.KAMIYO_LOOP_INTERVAL_SECONDS * 1000);
  }

  cleanup();
}

main().catch(err => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
