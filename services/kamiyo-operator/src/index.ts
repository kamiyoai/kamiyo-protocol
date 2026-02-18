import Anthropic from '@anthropic-ai/sdk';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';

import { AgentType } from '@kamiyo/sdk';

import { env } from './config.js';
import { openDb } from './db.js';
import { loadOperatorKeypair } from './wallet.js';
import { KeypairWallet } from './anchorWallet.js';
import { getOrCreateAgentIdentity } from './kamiyo.js';
import { writeOutbox } from './outbox.js';
import { KamiyoAgent, type ToolConfig } from './agent.js';
import { claimFeeVault, readFeeVault } from './tools/feeVault.js';
import { fetchTokenStatus } from './tools/tokenStatus.js';

function startOfUtcDayIso(now = new Date()): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  return d.toISOString();
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function agentTypeFromEnv(value: string): AgentType {
  const key = value as keyof typeof AgentType;
  const parsed = AgentType[key];
  if (typeof parsed !== 'number') throw new Error(`Invalid KAMIYO_AGENT_TYPE: ${value}`);
  return parsed;
}

function buildSystemPrompt(params: {
  observation: unknown;
  mode: 'propose' | 'execute';
  allowedChannels: string[];
  targetMint?: string;
  budgets: {
    solDailyCap: number;
    solPerTxCap: number;
    maxTxPerDay: number;
    maxFeeClaimsPerDay: number;
    llmMaxTurnsPerDay: number;
    llmMaxInputTokensPerDay: number;
    llmMaxOutputTokensPerDay: number;
  };
}) {
  const targetLine = params.targetMint ? `Target mint: ${params.targetMint}` : 'Target mint: (not set yet)';

  return `You are Kamiyo Operator: an autonomous agent that operates ONE token over time.

NON-NEGOTIABLE CONSTRAINTS:
- Do NOT mint or launch new tokens.
- Do NOT propose actions that require discretionary trading.
- If an action moves funds or changes on-chain state, use propose_action unless it is explicitly safe and within execution mode.

Execution mode: ${params.mode}
Allowed announcement channels: ${params.allowedChannels.join(', ')}
${targetLine}

Budgets (hard limits):
- SOL/day: ${params.budgets.solDailyCap}
- SOL/tx: ${params.budgets.solPerTxCap}
- tx/day: ${params.budgets.maxTxPerDay}
- fee claims/day: ${params.budgets.maxFeeClaimsPerDay}
- LLM turns/day: ${params.budgets.llmMaxTurnsPerDay}
- LLM input tokens/day: ${params.budgets.llmMaxInputTokensPerDay}
- LLM output tokens/day: ${params.budgets.llmMaxOutputTokensPerDay}

Current observation (JSON):
${JSON.stringify(params.observation, null, 2)}

Operating style:
- Be specific. Prefer measurable actions.
- Keep announcements concise. No fluff.
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
      const result = await claimFeeVault({
        connection: params.connection,
        feeVault,
        user: params.user,
        payer: params.user,
        dryRun,
      });

      return {
        success: true,
        data: {
          feeVault: feeVault.toBase58(),
          signature: result.signature,
          before: result.before,
          after: result.after,
        },
      };
    },
  };
}

async function main(): Promise<void> {
  const db = openDb(env.KAMIYO_DB_PATH);

  const { keypair } = loadOperatorKeypair(env);
  const wallet = new KeypairWallet(keypair);
  const connection = new Connection(env.SOLANA_RPC_URL, { commitment: 'confirmed', disableRetryOnRateLimit: true });

  const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

  const allowedChannels = Array.from(new Set(env.KAMIYO_ANNOUNCE_CHANNELS));

  const agent = new KamiyoAgent({
    db,
    outboxDir: env.KAMIYO_OUTBOX_DIR,
    mode: env.KAMIYO_MODE,
    client: anthropic,
    model: env.ANTHROPIC_MODEL,
    maxOutputTokens: env.KAMIYO_MAX_OUTPUT_TOKENS_PER_TURN,
    maxTurnsPerTick: env.KAMIYO_MAX_TURNS_PER_TICK,
    allowedChannels,
  });

  agent.registerTool(toolTokenStatus({ connection, defaultMint: env.KAMIYO_TARGET_MINT }));
  agent.registerTool(toolFeeVaultRead({ connection, defaultVault: env.KAMIYO_FEE_VAULT }));
  agent.registerTool(toolFeeVaultClaim({
    connection,
    user: keypair,
    defaultVault: env.KAMIYO_FEE_VAULT,
    db,
    outboxDir: env.KAMIYO_OUTBOX_DIR,
  }));

  const shutdown = () => {
    db.close();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  while (true) {
    const tickId =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : String(Date.now());
    db.startTick(tickId);

    try {
      const dayStart = startOfUtcDayIso();
      const llmCallsToday = db.llmCallCountSince(dayStart);
      const llmUsageToday = db.llmUsageSince(dayStart);

      const budgetState = {
        llmCallsToday,
        llmUsageToday,
        llmAllowed: {
          calls: env.KAMIYO_LLM_MAX_TURNS_PER_DAY,
          inputTokens: env.KAMIYO_LLM_MAX_INPUT_TOKENS_PER_DAY,
          outputTokens: env.KAMIYO_LLM_MAX_OUTPUT_TOKENS_PER_DAY,
        },
      };

      const balanceLamports = await connection.getBalance(wallet.publicKey, 'confirmed');

      const observation: Record<string, unknown> = {
        at: new Date().toISOString(),
        operator: {
          publicKey: wallet.publicKey.toBase58(),
          solBalance: balanceLamports / 1e9,
        },
        budgets: {
          mode: env.KAMIYO_MODE,
          solDailyCap: env.KAMIYO_SOL_DAILY_CAP,
          solPerTxCap: env.KAMIYO_SOL_PER_TX_CAP,
          maxTxPerDay: env.KAMIYO_MAX_TX_PER_DAY,
          maxFeeClaimsPerDay: env.KAMIYO_MAX_FEE_CLAIMS_PER_DAY,
          llm: budgetState,
        },
        token: env.KAMIYO_TARGET_MINT ? { mint: env.KAMIYO_TARGET_MINT } : { mint: null },
      };

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
          observation.feeVault = {
            address: feeVault.toBase58(),
            breakdown: await readFeeVault(connection, feeVault),
          };
        } catch (e) {
          observation.feeVault = { address: env.KAMIYO_FEE_VAULT, error: e instanceof Error ? e.message : String(e) };
        }
      }

      db.addObservation(tickId, 'snapshot', observation);

      const llmOverBudget =
        llmCallsToday >= env.KAMIYO_LLM_MAX_TURNS_PER_DAY ||
        llmUsageToday.inputTokens >= env.KAMIYO_LLM_MAX_INPUT_TOKENS_PER_DAY ||
        llmUsageToday.outputTokens >= env.KAMIYO_LLM_MAX_OUTPUT_TOKENS_PER_DAY;

      if (llmOverBudget) {
        const filePath = writeOutbox(env.KAMIYO_OUTBOX_DIR, 'report', {
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
        observation,
        mode: env.KAMIYO_MODE,
        allowedChannels,
        targetMint: env.KAMIYO_TARGET_MINT,
        budgets: {
          solDailyCap: env.KAMIYO_SOL_DAILY_CAP,
          solPerTxCap: env.KAMIYO_SOL_PER_TX_CAP,
          maxTxPerDay: env.KAMIYO_MAX_TX_PER_DAY,
          maxFeeClaimsPerDay: env.KAMIYO_MAX_FEE_CLAIMS_PER_DAY,
          llmMaxTurnsPerDay: env.KAMIYO_LLM_MAX_TURNS_PER_DAY,
          llmMaxInputTokensPerDay: env.KAMIYO_LLM_MAX_INPUT_TOKENS_PER_DAY,
          llmMaxOutputTokensPerDay: env.KAMIYO_LLM_MAX_OUTPUT_TOKENS_PER_DAY,
        },
      });

      const last = db.kvGet('last_summary');
      const userPrompt = `Run one operator tick now.\n\nPrevious summary (if any):\n${last ?? '(none)'}\n`;

      const result = await agent.runTick({
        tickId,
        systemPrompt,
        userPrompt,
      });

      db.kvSet('last_summary', result.finalText);
      const reportPath = writeOutbox(env.KAMIYO_OUTBOX_DIR, 'summary', {
        at: new Date().toISOString(),
        summary: result.finalText,
        warning: 'warning' in result ? result.warning : null,
      });
      db.addAction(tickId, 'write_summary', {}, { reportPath });

      db.finishTick(tickId, 'ok');
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      db.finishTick(tickId, 'error', err);
    }

    if (env.KAMIYO_RUN_ONCE) break;
    await sleep(env.KAMIYO_LOOP_INTERVAL_SECONDS * 1000);
  }

  db.close();
}

main().catch(err => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
