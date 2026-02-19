import Anthropic from '@anthropic-ai/sdk';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import fs from 'node:fs';
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
import { depositToStakingPeriod, findLatestOpenStakingPeriod } from './tools/stakingPool.js';
import { fetchTokenStatus } from './tools/tokenStatus.js';
import { createDkgActivityPublisher, type DkgActivityEvent } from './dkgActivity.js';
import { ensureMeishiTrust } from './meishiTrust.js';
import { readTrustedLaunchState } from './trustedLaunch.js';

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

function daysAgoIso(days: number, now = new Date()): string {
  return new Date(now.getTime() - days * 86_400_000).toISOString();
}

function parseIsoMillis(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function pruneOutbox(params: {
  outboxDir: string;
  olderThanIso: string;
  maxFiles: number;
}): { deletedByAge: number; deletedByCount: number; kept: number } {
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
    detail: params.dkgEnabled ? dkgReason ?? (dkgHealthy ? 'published' : 'unknown') : 'disabled',
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
  const raw = Array.isArray(position.rewards?.claimablePeriods) ? position.rewards.claimablePeriods : [];
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
    params.currentBalanceLamports > reserveLamports ? params.currentBalanceLamports - reserveLamports : 0n;
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
    const period = await findLatestOpenStakingPeriod(params.connection, pool);
    if (!period) {
      return {
        observation: { executed: false, reason: 'no_open_period', ...meta },
        nextBalanceLamports: params.currentBalanceLamports,
        period: null as unknown,
      };
    }

    const stakeLamports = maxLamportsPerTx > 0n && targetLamports > maxLamportsPerTx ? maxLamportsPerTx : targetLamports;
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

    const depositResult = await depositToStakingPeriod({
      connection: params.connection,
      depositor: params.depositor,
      pool,
      stakingPeriod: new PublicKey(period.address),
      amountLamports: stakeLamports,
      dryRun: false,
    });

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
  const targetLine = params.targetMint ? `Target mint: ${params.targetMint}` : 'Target mint: (not set yet)';

  return `${params.identity}

You are Kamiyo Operator: an autonomous agent that operates ONE token over time.

NON-NEGOTIABLE CONSTRAINTS:
- Do NOT mint or launch new tokens.
- Do NOT propose actions that require discretionary trading.
- If an action moves funds or changes on-chain state, use propose_action unless it is explicitly safe and within execution mode.
- Routine fee-vault claims and staking-pool feeds are runtime-managed in execute mode. Do not create routine proposals for them.

Execution mode: ${params.mode}
Allowed announcement channels: ${params.allowedChannels.join(', ')}
${targetLine}

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

function toolTokenStatus(params: {
  connection: Connection;
  defaultMint?: string;
}): ToolConfig {
  return {
    name: 'token_status',
    description: 'Fetch on-chain status for a token mint (supply, decimals, authorities, Metaplex metadata).',
    parameters: {
      mint: { type: 'string', description: 'Mint address (defaults to KAMIYO_TARGET_MINT).' },
    },
    handler: async input => {
      const mintStr = String((input.mint ?? params.defaultMint ?? '') as string).trim();
      if (!mintStr) return { success: false, error: 'Missing mint. Set KAMIYO_TARGET_MINT or pass mint.' };

      let mint: PublicKey;
      try {
        mint = new PublicKey(mintStr);
      } catch {
        return { success: false, error: 'Invalid mint public key' };
      }

      const status = await fetchTokenStatus({ connection: params.connection, mint });
      return { success: true, data: status };
    },
  };
}

function toolFeeVaultRead(params: {
  connection: Connection;
  defaultVault?: string;
}): ToolConfig {
  return {
    name: 'fee_vault_read',
    description: 'Read the Meteora fee vault breakdown for a given vault (no signing).',
    parameters: {
      feeVault: { type: 'string', description: 'Fee vault address (defaults to KAMIYO_FEE_VAULT).' },
    },
    handler: async input => {
      const vaultStr = String((input.feeVault ?? params.defaultVault ?? '') as string).trim();
      if (!vaultStr) return { success: false, error: 'Missing feeVault. Set KAMIYO_FEE_VAULT or pass feeVault.' };

      let feeVault: PublicKey;
      try {
        feeVault = new PublicKey(vaultStr);
      } catch {
        return { success: false, error: 'Invalid feeVault public key' };
      }

      const breakdown = await readFeeVault(params.connection, feeVault);
      return { success: true, data: { feeVault: feeVault.toBase58(), breakdown } };
    },
  };
}

function toolFeeVaultClaim(params: {
  connection: Connection;
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
      feeVault: { type: 'string', description: 'Fee vault address (defaults to KAMIYO_FEE_VAULT).' },
      dryRun: { type: 'boolean', description: 'If true, do not broadcast; return before/after snapshot only.' },
    },
    handler: async input => {
      const vaultStr = String((input.feeVault ?? params.defaultVault ?? '') as string).trim();
      if (!vaultStr) return { success: false, error: 'Missing feeVault. Set KAMIYO_FEE_VAULT or pass feeVault.' };

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

      const balanceLamports = await params.connection.getBalance(params.user.publicKey, 'confirmed');
      if (balanceLamports < 0.01 * 1e9) {
        return { success: false, error: 'Operator SOL balance too low to reliably pay fees (< 0.01 SOL)' };
      }

      const dryRun = normalizeBoolean(input.dryRun);
      const userAddress = params.user.publicKey.toBase58();
      const minClaimLamports = BigInt(env.KAMIYO_AUTO_CLAIM_MIN_LAMPORTS);

      if (!dryRun) {
        const beforeSnapshot = await readFeeVault(params.connection, feeVault);
        const unclaimedLamports = getUserUnclaimedLamports(beforeSnapshot, userAddress);
        if (unclaimedLamports < minClaimLamports) {
          return {
            success: false,
            error: `Unclaimed fees below threshold (${unclaimedLamports.toString()} < ${minClaimLamports.toString()} lamports)`,
          };
        }
      }

      const result = await claimFeeVault({
        connection: params.connection,
        feeVault,
        user: params.user,
        payer: params.user,
        dryRun,
      });

      const beforeUserLamports = getUserUnclaimedLamports(result.before, userAddress);
      const afterUserLamports = getUserUnclaimedLamports(result.after, userAddress);
      const claimedLamports = beforeUserLamports > afterUserLamports ? beforeUserLamports - afterUserLamports : 0n;
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
      hypothesis: { type: 'string', description: 'What you believed would improve revenue.', required: true },
      action: { type: 'string', description: 'What you did or proposed.', required: true },
      result: { type: 'string', description: 'Observed result from the action.', required: true },
      nextStep: { type: 'string', description: 'Best next step based on the result.', required: true },
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
  let cleanedUp = false;

  const cleanup = () => {
    if (cleanedUp) return;
    cleanedUp = true;
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
  const connection = new Connection(env.SOLANA_RPC_URL, { commitment: 'confirmed', disableRetryOnRateLimit: true });
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

  const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

  const allowedChannels = Array.from(new Set(env.KAMIYO_ANNOUNCE_CHANNELS));

  const identity = identityFromEnv(env.KAMIYO_IDENTITY);
  const identityBlock = identityPrompt(identity);

  const toolChoice = (() => {
    const disableParallel = env.ANTHROPIC_DISABLE_PARALLEL_TOOL_USE ? true : undefined;
    switch (env.ANTHROPIC_TOOL_CHOICE) {
      case 'auto':
        return { type: 'auto' as const, ...(disableParallel != null ? { disable_parallel_tool_use: disableParallel } : {}) };
      case 'any':
        return { type: 'any' as const, ...(disableParallel != null ? { disable_parallel_tool_use: disableParallel } : {}) };
      case 'none':
        return { type: 'none' as const };
    }
  })();

  const thinking = (() => {
    const budget = env.ANTHROPIC_THINKING_BUDGET_TOKENS;
    if (budget <= 0) return undefined;
    if (budget < 1024) throw new Error('ANTHROPIC_THINKING_BUDGET_TOKENS must be >= 1024');
    if (budget >= env.KAMIYO_MAX_OUTPUT_TOKENS_PER_TURN) {
      throw new Error('ANTHROPIC_THINKING_BUDGET_TOKENS must be < KAMIYO_MAX_OUTPUT_TOKENS_PER_TURN');
    }
    return { type: 'enabled' as const, budget_tokens: budget };
  })();

  const agent = new KamiyoAgent({
    db,
    outboxDir,
    mode: env.KAMIYO_MODE,
    client: anthropic,
    model: env.ANTHROPIC_MODEL,
    maxOutputTokens: env.KAMIYO_MAX_OUTPUT_TOKENS_PER_TURN,
    maxTurnsPerTick: env.KAMIYO_MAX_TURNS_PER_TICK,
    allowedChannels,
    temperature: env.ANTHROPIC_TEMPERATURE,
    thinking,
    toolChoice,
  });

  agent.registerTool(toolTokenStatus({ connection, defaultMint: env.KAMIYO_TARGET_MINT }));
  agent.registerTool(toolFeeVaultRead({ connection, defaultVault: env.KAMIYO_FEE_VAULT }));
  agent.registerTool(toolFeeVaultClaim({
    connection,
    user: keypair,
    defaultVault: env.KAMIYO_FEE_VAULT,
    db,
    outboxDir,
  }));
  agent.registerTool(toolRecordLearning({ db, outboxDir }));

  const shutdown = () => {
    cleanup();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  while (true) {
    const tickId =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : String(Date.now());
    db.startTick(tickId);
    const tickTimeoutMinutes = env.KAMIYO_TICK_TIMEOUT_MINUTES;
    const tickTimeoutMs = tickTimeoutMinutes * 60_000;
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

      let operatorBalanceLamports = BigInt(await connection.getBalance(wallet.publicKey, 'confirmed'));
      let kyoshinClaimerBalanceLamports: bigint | undefined =
        kyoshinClaimerIsOperator ? operatorBalanceLamports : undefined;
      const dkgEvents: DkgActivityEvent[] = [];
      const dkgAgentId = env.KAMIYO_DKG_AGENT_ID ?? kyoshinClaimerKeypair.publicKey.toBase58();

      const observation: Record<string, unknown> = {
        at: new Date().toISOString(),
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

      observation.agent =
        agentState.exists
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
          const allowMeishiAgentCreate = env.KAMIYO_MODE === 'execute' && env.KAMIYO_MEISHI_AUTO_CREATE_AGENT;
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

          observation.meishiAgentIdentity =
            overrideState.exists
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
          observation.meishi = { enabled: env.KAMIYO_MEISHI_ENABLED, error: e instanceof Error ? e.message : String(e) };
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
          const info = await connection.getParsedAccountInfo(mint, 'confirmed');
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
            const launchAgentExists = (await connection.getAccountInfo(launchAgentIdentity, 'confirmed')) !== null;
            const trustedLaunch = await readTrustedLaunchState({
              connection,
              programId: KAMIYO_PROGRAM_ID,
              agentIdentity: launchAgentIdentity,
              mint,
            });

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
              trustedLaunch.linked ? undefined : trustedLaunch.reason ?? 'trusted_launch_link_missing'
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
          observation.token = { mint: env.KAMIYO_TARGET_MINT, error: e instanceof Error ? e.message : String(e) };
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
          feeVaultBreakdown = await readFeeVault(connection, feeVault);
          observation.feeVault = {
            address: feeVault.toBase58(),
            breakdown: feeVaultBreakdown,
          };
        } catch (e) {
          observation.feeVault = { address: env.KAMIYO_FEE_VAULT, error: e instanceof Error ? e.message : String(e) };
        }
      }

      if (env.KAMIYO_STAKING_POOL) {
        observation.stakingPool = {
          address: env.KAMIYO_STAKING_POOL,
          autoStakeEnabled: env.KAMIYO_AUTO_STAKE_ENABLED,
        };
      }

      if (env.KAMIYO_KYOSHIN_STAKING_POOL) {
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
          observation.autoClaim = { executed: false, reason: 'daily_claim_cap_reached', ...autoClaimMeta };
        } else if (operatorBalanceLamports < 10_000_000n) {
          observation.autoClaim = { executed: false, reason: 'low_sol_balance', ...autoClaimMeta };
        } else if (unclaimedLamports < thresholdLamports) {
          observation.autoClaim = { executed: false, reason: 'below_threshold', ...autoClaimMeta };
        } else {
          try {
            const feeVault = new PublicKey(env.KAMIYO_FEE_VAULT);
            const claimResult = await claimFeeVault({
              connection,
              feeVault,
              user: keypair,
              payer: keypair,
              dryRun: false,
            });

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
            operatorBalanceLamports = BigInt(await connection.getBalance(wallet.publicKey, 'confirmed'));
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
            observation.autoClaim = { executed: false, reason: 'claim_failed', error, ...autoClaimMeta };
          }
        }
      }

      if (env.KAMIYO_MODE === 'execute' && env.KAMIYO_KYOSHIN_STAKING_POOL) {
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
            const position = await readFundryUserPosition({
              apiBase: env.KAMIYO_FUNDRY_API_BASE_URL,
              poolAddress: kyoshinPool,
              wallet: claimerAddress,
            });
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
              observation.kyoshinAutoClaim = { executed: false, reason: 'no_claimable_periods', ...claimMeta };
            } else if (claimableLamports < minClaimLamports) {
              observation.kyoshinAutoClaim = { executed: false, reason: 'below_threshold', ...claimMeta };
            } else {
              kyoshinClaimerBalanceLamports ??= BigInt(await connection.getBalance(kyoshinClaimerKeypair.publicKey, 'confirmed'));
              if (kyoshinClaimerBalanceLamports < 10_000_000n) {
                observation.kyoshinAutoClaim = { executed: false, reason: 'low_sol_balance', ...claimMeta };
              } else {
                const claims = await claimFundryStakingPeriods({
                  connection,
                  apiBase: env.KAMIYO_FUNDRY_API_BASE_URL,
                  poolAddress: kyoshinPool,
                  signer: kyoshinClaimerKeypair,
                  periodNumbers,
                });

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
                  await connection.getBalance(kyoshinClaimerKeypair.publicKey, 'confirmed')
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
                dkgEvents.push({
                  type: 'kyoshin_staking_claim',
                  signatures: claims
                    .map(claim => claim.signature)
                    .filter((value): value is string => typeof value === 'string' && value.length > 0),
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

      if (env.KAMIYO_MODE === 'execute' && env.KAMIYO_AUTO_STAKE_ENABLED) {
        if (!env.KAMIYO_STAKING_POOL) {
          observation.autoStake = { executed: false, reason: 'staking_pool_not_configured' };
          if (env.KAMIYO_KYOSHIN_STAKING_POOL) {
            observation.kyoshinRoute = { executed: false, reason: 'target_staking_pool_not_configured' };
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

          if (env.KAMIYO_KYOSHIN_STAKING_POOL) {
            if (kyoshinClaimerIsOperator) {
              observation.kyoshinRoute = {
                executed: false,
                reason: 'same_wallet_as_operator',
                wallet: kyoshinClaimerKeypair.publicKey.toBase58(),
                pool: env.KAMIYO_STAKING_POOL,
              };
            } else {
              kyoshinClaimerBalanceLamports ??= BigInt(
                await connection.getBalance(kyoshinClaimerKeypair.publicKey, 'confirmed')
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

      if (env.KAMIYO_MODE === 'execute' && !env.KAMIYO_AUTO_STAKE_ENABLED && env.KAMIYO_KYOSHIN_STAKING_POOL) {
        observation.kyoshinRoute = { executed: false, reason: 'auto_stake_disabled' };
      }

      if (env.KAMIYO_KYOSHIN_STAKING_POOL) {
        if (kyoshinClaimerIsOperator) {
          kyoshinClaimerBalanceLamports = operatorBalanceLamports;
        }
        kyoshinClaimerBalanceLamports ??= BigInt(await connection.getBalance(kyoshinClaimerKeypair.publicKey, 'confirmed'));
        observation.kyoshinClaimer = {
          publicKey: kyoshinClaimerKeypair.publicKey.toBase58(),
          solBalance: lamportsToSol(kyoshinClaimerBalanceLamports),
          isOperatorWallet: kyoshinClaimerIsOperator,
        };
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
            const retryAtIso = new Date(Date.now() + env.KAMIYO_DKG_RATE_LIMIT_COOLDOWN_SECONDS * 1000).toISOString();
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
        meishiAgentIdentitySource: asString(asRecord(observation.meishiAgentIdentity)?.source) ?? undefined,
        meishi: asRecord(observation.meishi) ?? undefined,
        trustedLaunch: asRecord(observation.trustedLaunch) ?? undefined,
        dkgEnabled: env.KAMIYO_DKG_ACTIVITY_ENABLED,
        dkgActivity: asRecord(observation.dkgActivity) ?? undefined,
      });

      db.addObservation(tickId, 'snapshot', observation);

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

      const systemPrompt = buildSystemPrompt({
        identity: identityBlock,
        observation,
        mode: env.KAMIYO_MODE,
        allowedChannels,
        primeDirective: env.KAMIYO_PRIME_DIRECTIVE,
        targetMint: env.KAMIYO_TARGET_MINT,
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
      const userPrompt = `Run one operator tick now.

Priority: maximize net SOL revenue routed to $KAMIYO stakers.
If a direct execute action is not safe or not allowed, create a concrete proposal with measurable upside.
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
