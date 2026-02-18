import Anthropic from '@anthropic-ai/sdk';
import { Connection, PublicKey } from '@solana/web3.js';

import { AgentType } from '@kamiyo/sdk';

import { env } from './config.js';
import { openDb } from './db.js';
import { loadOperatorKeypair } from './wallet.js';
import { KeypairWallet } from './anchorWallet.js';
import { getOrCreateAgentIdentity } from './kamiyo.js';
import { writeOutbox } from './outbox.js';
import { KisoAgent } from './agent.js';
import { readFeeVault } from './tools/feeVault.js';

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
  if (typeof parsed !== 'number') throw new Error(`Invalid KISO_AGENT_TYPE: ${value}`);
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
    llmMaxTurnsPerDay: number;
    llmMaxInputTokensPerDay: number;
    llmMaxOutputTokensPerDay: number;
  };
}) {
  const targetLine = params.targetMint ? `Target mint: ${params.targetMint}` : 'Target mint: (not set yet)';

  return `You are Kiso Operator: an autonomous agent that operates ONE token over time.

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

async function main(): Promise<void> {
  const db = openDb(env.KISO_DB_PATH);

  const { keypair } = loadOperatorKeypair(env);
  const wallet = new KeypairWallet(keypair);
  const connection = new Connection(env.SOLANA_RPC_URL, { commitment: 'confirmed', disableRetryOnRateLimit: true });

  const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

  const allowedChannels = Array.from(new Set(env.KISO_ANNOUNCE_CHANNELS));

  const agent = new KisoAgent({
    db,
    outboxDir: env.KISO_OUTBOX_DIR,
    mode: env.KISO_MODE,
    client: anthropic,
    model: env.ANTHROPIC_MODEL,
    maxOutputTokens: env.KISO_MAX_OUTPUT_TOKENS_PER_TURN,
    maxTurnsPerTick: env.KISO_MAX_TURNS_PER_TICK,
    allowedChannels,
  });

  process.on('SIGINT', () => {
    db.close();
    process.exit(0);
  });

  while (true) {
    const tickId = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : String(Date.now());
    db.startTick(tickId);

    try {
      const dayStart = startOfUtcDayIso();
      const llmCallsToday = db.llmCallCountSince(dayStart);
      const llmUsageToday = db.llmUsageSince(dayStart);

      const budgetState = {
        llmCallsToday,
        llmUsageToday,
        llmAllowed: {
          calls: env.KISO_LLM_MAX_TURNS_PER_DAY,
          inputTokens: env.KISO_LLM_MAX_INPUT_TOKENS_PER_DAY,
          outputTokens: env.KISO_LLM_MAX_OUTPUT_TOKENS_PER_DAY,
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
          mode: env.KISO_MODE,
          solDailyCap: env.KISO_SOL_DAILY_CAP,
          solPerTxCap: env.KISO_SOL_PER_TX_CAP,
          maxTxPerDay: env.KISO_MAX_TX_PER_DAY,
          llm: budgetState,
        },
        token: env.KISO_TARGET_MINT ? { mint: env.KISO_TARGET_MINT } : { mint: null },
      };

      const agentType = agentTypeFromEnv(env.KISO_AGENT_TYPE);
      const agentState = await getOrCreateAgentIdentity({
        connection,
        wallet,
        name: env.KAMIYO_AGENT_NAME,
        agentType,
        stakeSol: env.KISO_AGENT_STAKE_SOL,
        createIfMissing: env.KISO_AUTO_CREATE_AGENT,
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

      if (env.KISO_TARGET_MINT) {
        try {
          const mint = new PublicKey(env.KISO_TARGET_MINT);
          const info = await connection.getParsedAccountInfo(mint, 'confirmed');
          observation.token = {
            mint: mint.toBase58(),
            exists: info.value !== null,
            owner: info.value?.owner?.toBase58() ?? null,
          };
        } catch (e) {
          observation.token = { mint: env.KISO_TARGET_MINT, error: e instanceof Error ? e.message : String(e) };
        }
      }

      if (env.KISO_FEE_VAULT) {
        try {
          const feeVault = new PublicKey(env.KISO_FEE_VAULT);
          observation.feeVault = {
            address: feeVault.toBase58(),
            breakdown: await readFeeVault(connection, feeVault),
          };
        } catch (e) {
          observation.feeVault = { address: env.KISO_FEE_VAULT, error: e instanceof Error ? e.message : String(e) };
        }
      }

      db.addObservation(tickId, 'snapshot', observation);

      const llmOverBudget =
        llmCallsToday >= env.KISO_LLM_MAX_TURNS_PER_DAY ||
        llmUsageToday.inputTokens >= env.KISO_LLM_MAX_INPUT_TOKENS_PER_DAY ||
        llmUsageToday.outputTokens >= env.KISO_LLM_MAX_OUTPUT_TOKENS_PER_DAY;

      if (llmOverBudget) {
        const filePath = writeOutbox(env.KISO_OUTBOX_DIR, 'report', {
          at: new Date().toISOString(),
          reason: 'LLM daily budget exhausted',
          observation,
        });
        db.addAction(tickId, 'write_report', { reason: 'budget_exhausted' }, { filePath });
        db.finishTick(tickId, 'ok');
        await sleep(env.KISO_LOOP_INTERVAL_SECONDS * 1000);
        continue;
      }

      const systemPrompt = buildSystemPrompt({
        observation,
        mode: env.KISO_MODE,
        allowedChannels,
        targetMint: env.KISO_TARGET_MINT,
        budgets: {
          solDailyCap: env.KISO_SOL_DAILY_CAP,
          solPerTxCap: env.KISO_SOL_PER_TX_CAP,
          maxTxPerDay: env.KISO_MAX_TX_PER_DAY,
          llmMaxTurnsPerDay: env.KISO_LLM_MAX_TURNS_PER_DAY,
          llmMaxInputTokensPerDay: env.KISO_LLM_MAX_INPUT_TOKENS_PER_DAY,
          llmMaxOutputTokensPerDay: env.KISO_LLM_MAX_OUTPUT_TOKENS_PER_DAY,
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
      const reportPath = writeOutbox(env.KISO_OUTBOX_DIR, 'summary', {
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

    await sleep(env.KISO_LOOP_INTERVAL_SECONDS * 1000);
  }
}

main().catch(err => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
