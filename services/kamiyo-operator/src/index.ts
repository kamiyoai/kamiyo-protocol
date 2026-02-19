import Anthropic from '@anthropic-ai/sdk';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { AgentType } from '@kamiyo/sdk';

import { env } from './config.js';
import { identityFromEnv, identityPrompt } from './identity.js';
import { openDb } from './db.js';
import { loadOperatorKeypair } from './wallet.js';
import { KeypairWallet } from './anchorWallet.js';
import { getOrCreateAgentIdentity } from './kamiyo.js';
import { writeOutbox } from './outbox.js';
import { KamiyoAgent, type ToolConfig } from './agent.js';
import { claimFeeVault, readFeeVault } from './tools/feeVault.js';
import { depositToStakingPeriod, findLatestOpenStakingPeriod } from './tools/stakingPool.js';
import { fetchTokenStatus } from './tools/tokenStatus.js';

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
  const wallet = new KeypairWallet(keypair);
  const connection = new Connection(env.SOLANA_RPC_URL, { commitment: 'confirmed', disableRetryOnRateLimit: true });

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

      if (env.KAMIYO_TARGET_MINT) {
        try {
          const mint = new PublicKey(env.KAMIYO_TARGET_MINT);
          const info = await connection.getParsedAccountInfo(mint, 'confirmed');
          observation.token = {
            mint: mint.toBase58(),
            exists: info.value !== null,
            owner: info.value?.owner?.toBase58() ?? null,
          };
        } catch (e) {
          observation.token = { mint: env.KAMIYO_TARGET_MINT, error: e instanceof Error ? e.message : String(e) };
        }
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

      if (env.KAMIYO_MODE === 'execute' && env.KAMIYO_AUTO_STAKE_ENABLED) {
        if (!env.KAMIYO_STAKING_POOL) {
          observation.autoStake = { executed: false, reason: 'staking_pool_not_configured' };
        } else {
          const feedsToday = db.actionCountSince(dayStart, 'staking_period_deposit');
          const minLamports = BigInt(env.KAMIYO_AUTO_STAKE_MIN_LAMPORTS);
          const reserveLamports = BigInt(env.KAMIYO_AUTO_STAKE_RESERVE_LAMPORTS);
          const availableBps = BigInt(env.KAMIYO_AUTO_STAKE_AVAILABLE_BPS);
          const maxLamportsPerTx = BigInt(env.KAMIYO_AUTO_STAKE_MAX_LAMPORTS_PER_TX);
          const availableLamports =
            operatorBalanceLamports > reserveLamports ? operatorBalanceLamports - reserveLamports : 0n;
          const targetLamports = (availableLamports * availableBps) / 10_000n;

          const autoStakeMeta = {
            pool: env.KAMIYO_STAKING_POOL,
            feedsToday,
            dailyCap: env.KAMIYO_AUTO_STAKE_MAX_FEEDS_PER_DAY,
            minLamports: minLamports.toString(),
            reserveLamports: reserveLamports.toString(),
            availableBps: env.KAMIYO_AUTO_STAKE_AVAILABLE_BPS,
            maxLamportsPerTx: maxLamportsPerTx.toString(),
            operatorBalanceLamports: operatorBalanceLamports.toString(),
            availableLamports: availableLamports.toString(),
            targetLamports: targetLamports.toString(),
          };

          if (feedsToday >= env.KAMIYO_AUTO_STAKE_MAX_FEEDS_PER_DAY) {
            observation.autoStake = { executed: false, reason: 'daily_feed_cap_reached', ...autoStakeMeta };
          } else if (availableLamports < minLamports) {
            observation.autoStake = { executed: false, reason: 'below_threshold', ...autoStakeMeta };
          } else {
            try {
              const pool = new PublicKey(env.KAMIYO_STAKING_POOL);
              const period = await findLatestOpenStakingPeriod(connection, pool);
              if (!period) {
                observation.autoStake = { executed: false, reason: 'no_open_period', ...autoStakeMeta };
              } else {
                const stakeLamports =
                  maxLamportsPerTx > 0n && targetLamports > maxLamportsPerTx ? maxLamportsPerTx : targetLamports;
                if (stakeLamports < minLamports) {
                  observation.autoStake = {
                    executed: false,
                    reason: 'below_threshold_after_policy',
                    period,
                    ...autoStakeMeta,
                  };
                } else {
                  const depositResult = await depositToStakingPeriod({
                    connection,
                    depositor: keypair,
                    pool,
                    stakingPeriod: new PublicKey(period.address),
                    amountLamports: stakeLamports,
                    dryRun: false,
                  });

                  db.addAction(
                    tickId,
                    'staking_period_deposit',
                    {
                      source: 'runtime_auto_stake',
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

                  const receiptPath = writeOutbox(outboxDir, 'staking-deposit-receipt', {
                    at: new Date().toISOString(),
                    mode: 'auto',
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
                  db.addAction(tickId, 'write_staking_deposit_receipt', {}, { receiptPath });

                  operatorBalanceLamports = BigInt(depositResult.afterBalanceLamports);
                  observation.stakingPool = {
                    address: pool.toBase58(),
                    autoStakeEnabled: true,
                    period: depositResult.afterPeriod ?? period,
                  };
                  observation.autoStake = {
                    executed: true,
                    signature: depositResult.signature,
                    receiptPath,
                    amountLamports: stakeLamports.toString(),
                    amountSol: lamportsToSol(stakeLamports),
                    stakingPeriod: period.address,
                    periodNumber: period.periodNumber,
                    periodVault: depositResult.periodVault,
                    ...autoStakeMeta,
                  };
                }
              }
            } catch (e) {
              const error = e instanceof Error ? e.message : String(e);
              db.addAction(
                tickId,
                'staking_period_deposit',
                {
                  source: 'runtime_auto_stake',
                  pool: env.KAMIYO_STAKING_POOL,
                },
                null,
                error
              );
              observation.autoStake = { executed: false, reason: 'stake_failed', error, ...autoStakeMeta };
            }
          }
        }
      }

      observation.operator = {
        publicKey: wallet.publicKey.toBase58(),
        solBalance: lamportsToSol(operatorBalanceLamports),
      };

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
