import Anthropic from '@anthropic-ai/sdk';
import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  type AgentGenome,
  type JudgeLLM,
  applySchema,
  autoMutateTaskType,
  createTournament,
  createVariant,
  evaluateAndPromote,
  getLeaderboard,
  initSelfImprove,
  listActiveVariants,
  recordJudgedEntry,
  upsertRubric,
} from '@kamiyo-org/selfimprove';

const DB_PATH = process.env.SELFIMPROVE_DB ?? './agents.db';
const API_KEY = process.env.ANTHROPIC_API_KEY;
if (!API_KEY) {
  console.error('ANTHROPIC_API_KEY required');
  process.exit(1);
}

const SAMPLES_PER_RUN = Number(process.env.SAMPLES ?? 40);
const MUTATION_ROUNDS = Number(process.env.ROUNDS ?? 3);

const anthropic = new Anthropic({ apiKey: API_KEY });

const judgeLLM: JudgeLLM = {
  async generate(p) {
    const r = await anthropic.messages.create({
      model: p.model,
      max_tokens: p.maxTokens,
      temperature: p.temperature,
      system: p.system,
      messages: p.messages,
    });
    const text = r.content.find(c => c.type === 'text');
    return {
      text: text?.type === 'text' ? text.text : '',
      inputTokens: r.usage.input_tokens,
      outputTokens: r.usage.output_tokens,
    };
  },
};

async function runAgent(genome: AgentGenome, input: string): Promise<{ output: string; latencyMs: number; costUsd: number }> {
  const started = Date.now();
  const r = await anthropic.messages.create({
    model: genome.modelId,
    max_tokens: genome.maxTokens,
    temperature: genome.temperature,
    system: genome.systemGuardrails || undefined,
    messages: [{ role: 'user', content: `${genome.promptTemplate}\n\nTweet: ${input}` }],
  });
  const text = r.content.find(c => c.type === 'text');
  const output = text?.type === 'text' ? text.text.trim() : '';
  const costUsd = (r.usage.input_tokens * 3 + r.usage.output_tokens * 15) / 1_000_000;
  return { output, latencyMs: Date.now() - started, costUsd };
}

function seededShuffle<T>(arr: T[], seed: number): T[] {
  const a = [...arr];
  let rnd = seed;
  for (let i = a.length - 1; i > 0; i--) {
    rnd = (rnd * 1664525 + 1013904223) >>> 0;
    const j = rnd % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function runSamples(inputs: string[], n: number, tournamentId: string, taskType: string): Promise<void> {
  const variants = listActiveVariants(taskType);
  if (variants.length === 0) throw new Error('no active variants');
  const dir = (process.cwd());

  for (let i = 0; i < n; i++) {
    const input = inputs[i % inputs.length];
    const variant = variants[i % variants.length];
    const { output, latencyMs, costUsd } = await runAgent(variant.genome, input);
    await recordJudgedEntry({
      tournamentId,
      variantId: variant.id,
      input,
      output,
      latencyMs,
      costOverride: costUsd,
    });
    if (i % 5 === 0) process.stdout.write('.');
  }
  process.stdout.write('\n');
}

async function main(): Promise<void> {
  const db = new Database(DB_PATH);
  applySchema(db);
  initSelfImprove({ db, judgeLLM });

  const rubric = readFileSync(join(__dirname, 'rubric.md'), 'utf-8');
  upsertRubric({
    taskType: 'tweet_reply',
    rubric,
    modelId: 'claude-haiku-4-5-20251001',
    dailyBudgetUsd: 20,
  });

  const baselineGenome: AgentGenome = {
    promptTemplate:
      'You are replying to a tweet. Write a single concise reply (< 240 chars). Match the tone. Be specific. No hashtags, no emoji unless they reinforce the joke.',
    modelId: 'claude-haiku-4-5-20251001',
    toolAllowlist: [],
    temperature: 0.7,
    maxTokens: 200,
    systemGuardrails: '',
  };

  const baseline = createVariant({
    agentId: 'reply-bot',
    taskType: 'tweet_reply',
    genome: baselineGenome,
    notes: 'baseline',
  });

  const inputs = seededShuffle(
    JSON.parse(readFileSync(join(__dirname, 'inputs.json'), 'utf-8')) as string[],
    42
  );

  console.log(`\n=== Phase 1: baseline (${SAMPLES_PER_RUN} samples) ===`);
  const t0 = createTournament({
    taskType: 'tweet_reply',
    maxParticipants: 1,
    budgetCap: 5,
  });
  await runSamples(inputs, SAMPLES_PER_RUN, t0.id, 'tweet_reply');

  let baselineMean = getLeaderboard('tweet_reply', 1)[0]?.mean ?? 0;
  console.log(`baseline mean: ${baselineMean.toFixed(3)} (n=${SAMPLES_PER_RUN})`);

  console.log(`\n=== Phase 2: auto-mutation (${MUTATION_ROUNDS} rounds) ===`);
  for (let round = 1; round <= MUTATION_ROUNDS; round++) {
    console.log(`\nround ${round}/${MUTATION_ROUNDS}: proposing mutations…`);
    const res = await autoMutateTaskType('tweet_reply', { topK: 2, includeJitter: true });
    console.log(`  created ${res.createdVariantIds.length} variants, cost $${res.totalCostUsd.toFixed(4)}`);

    const t = createTournament({
      taskType: 'tweet_reply',
      maxParticipants: 8,
      budgetCap: 5,
    });
    await runSamples(inputs, SAMPLES_PER_RUN, t.id, 'tweet_reply');

    const promoted = evaluateAndPromote('tweet_reply', { minSamples: Math.min(10, SAMPLES_PER_RUN / 2) });
    if (promoted.promoted) {
      console.log(
        `  PROMOTED ${promoted.variantId.slice(0, 8)}: uplift=${promoted.uplift.toFixed(3)} p=${promoted.pValue.toExponential(2)} n=${promoted.sampleCount}`
      );
    } else {
      console.log(`  no promotion: ${promoted.reason}`);
    }
  }

  const final = getLeaderboard('tweet_reply', 5);
  console.log('\n=== Final leaderboard ===');
  for (const e of final) {
    console.log(
      `  ${e.variantId.slice(0, 8)}  ${e.status.padEnd(9)}  mean=${e.mean.toFixed(3)}  n=${e.sampleCount}  ${e.notes ?? ''}`
    );
  }

  const best = final[0];
  const lift = best ? ((best.mean - baselineMean) / Math.max(baselineMean, 0.001)) * 100 : 0;
  console.log(
    `\nResult: baseline=${baselineMean.toFixed(3)} → best=${best?.mean.toFixed(3) ?? '?'}  (lift: ${lift >= 0 ? '+' : ''}${lift.toFixed(1)}%)`
  );
  console.log(`Inspect in dashboard: pnpm dashboard`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
