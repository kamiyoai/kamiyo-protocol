# @kamiyo-org/selfimprove

Drop-in self-improvement loop for LLM agents. Wrap your call site once; the library then:

- tracks **variant genomes** (prompt / model / tools / temperature / max-tokens / guardrails) in SQLite
- routes live traffic via **Thompson-sampling bandit** across active variants
- scores outputs with an **LLM-as-judge** against a per-task rubric, caches by hash, enforces daily USD budgets
- auto-promotes winners using **Welch's t-test** at `p<0.05` with `n≥50` samples
- exposes metrics + events for Grafana / any Prometheus-compatible stack

Zero external ML dependencies. SQLite + TypeScript. Judge is provider-agnostic (Anthropic, OpenAI, Google, local — see `JudgeLLM` adapter).

Extracted from [kamiyo-protocol](https://github.com/kamiyoai/kamiyo-protocol), the stack powering the KAMIYO agent fleet in production since 2026-04.

## Install

```bash
npm install @kamiyo-org/selfimprove better-sqlite3
```

## Quickstart

```ts
import Database from 'better-sqlite3';
import Anthropic from '@anthropic-ai/sdk';
import {
  applySchema,
  initSelfImprove,
  createVariant,
  routeVariant,
  recordJudgedEntry,
  upsertRubric,
  type JudgeLLM,
} from '@kamiyo-org/selfimprove';

const db = new Database('./agents.db');
applySchema(db);

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
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

initSelfImprove({ db, judgeLLM });

upsertRubric({
  taskType: 'tweet_reply',
  rubric: 'Score on tone, relevance, brevity. 1.0 = perfect.',
  dailyBudgetUsd: 5,
});

createVariant({
  agentId: 'reply-bot',
  taskType: 'tweet_reply',
  genome: {
    promptTemplate: 'Reply in one witty sentence.',
    modelId: 'claude-sonnet-4-6',
    toolAllowlist: [],
    temperature: 0.7,
    maxTokens: 200,
    systemGuardrails: '',
  },
});

const decision = routeVariant('tweet_reply');
if (decision) {
  const output = await runAgent(decision.variant.genome, input);

  await recordJudgedEntry({
    tournamentId: decision.tournamentId,
    variantId: decision.variant.id,
    input,
    output,
    latencyMs: 340,
  });
}
```

Run the sweep worker so promotions happen automatically:

```ts
import { startVariantSweepWorker } from '@kamiyo-org/selfimprove';
process.env.VARIANT_SWEEP_ENABLED = 'true';
startVariantSweepWorker(); // checks every 24h by default
```

## Adapters

The package is provider-agnostic. Pass your own implementations via `initSelfImprove`:

- **`db: DatabaseAdapter`** — any `better-sqlite3`-shaped driver (`prepare`, `transaction`, `exec`).
- **`judgeLLM: JudgeLLM | null`** — wraps any provider SDK. Shape: `generate({ model, system, messages, maxTokens, temperature }) => { text, inputTokens, outputTokens }`.
- **`metrics: MetricsAdapter`** — 9 Prometheus-shaped counters/histograms. Defaults to no-op.
- **`logger: Logger`** — `info/warn/error`. Defaults to no-op.

See [`src/adapters.ts`](./src/adapters.ts) for full interfaces.

## What's inside

| Module | Role |
|---|---|
| `genome` | validate, canonicalize, hash, mutate variants |
| `stats` | sample stats, Welch's t-test, two-sided p-value |
| `service` | variant CRUD, leaderboard, Thompson sampling, promotion |
| `tournament` | standing tournaments, status transitions, budget caps |
| `bandit` | routing, standing-tournament bookkeeping, sweep |
| `judge` | LLM-as-judge with rubric, sha256 cache, daily USD budget |
| `pairwise` | pairwise LLM judge, Elo online update, Bradley-Terry MLE |
| `mutator` | LLM-proposed prompt edits, parameter jitter, crossover |
| `coldstart` | seed variants from prompt lists, offline eval harness |
| `cli` | `kamiyo-si` command-line tool for init / inspect / sweep |
| `routing` | convenience wrappers for request-path wiring |
| `sweep-worker` | periodic `evaluateAndPromote` across all task types |

## Why it works

- **Thompson sampling** explores new variants while exploiting known winners without needing a hand-tuned epsilon.
- **Welch's t-test** handles unequal variances — no need for matched sample counts or equal noise across variants.
- **LLM-as-judge + hash cache** turns quality signal from hand-labeled rare into automatic and cheap. Cache keyed on `(taskType, input, output, modelId)`; budget-gated per task type per day.
- **Promotion is atomic** under a SQLite transaction with a re-check of the baseline, so concurrent sweeps can't race into an inconsistent state.

## Pairwise judge (Elo + Bradley-Terry)

Absolute scores drift. Pairwise comparison is what research consistently finds more stable:

```ts
import { comparePair, recordPairwiseMatch, fitBradleyTerry } from '@kamiyo-org/selfimprove';

const cmp = await comparePair({
  taskType: 'tweet_reply',
  input,
  outputA: replyFromVariantX,
  outputB: replyFromVariantY,
});
if (cmp.ok) {
  recordPairwiseMatch({
    taskType: 'tweet_reply',
    variantIdA: 'variant-x',
    variantIdB: 'variant-y',
    winner: cmp.winner,
  });
}

const skill = fitBradleyTerry(matches);
```

- **Online Elo** updates `agent_variants.elo_rating` on every match (k=32 default).
- **Bradley-Terry MLE** fits a skill vector from batch match history; use for calibrated leaderboards.

## Auto-mutation

Evolve variants without hand-tuning prompts:

```ts
import { autoMutateTaskType } from '@kamiyo-org/selfimprove';

const result = await autoMutateTaskType('tweet_reply', { topK: 3 });
// For each of the top 3 variants:
//   - LLM proposes a prompt-template edit against the rubric
//   - Deterministic param jitter fork (temperature + maxTokens)
// Both new variants enter the bandit under the parent's lineage.
```

- **LLM-proposed prompts**: `proposeMutations(taskType)` sends rubric + current prompt + sample count → model returns a focused edit with rationale.
- **Param jitter**: `jitterGenome(g)` — pure random walk on `temperature` and `maxTokens`, clamped in-bounds.
- **Crossover**: `crossoverGenomes(a, b)` — picks discrete fields from either parent, averages numeric ones.
- Every proposal is logged in `genome_proposals` (kind + parent + cost).

## Cold start

Seed a new task type with candidate prompts, then run an offline eval before exposing them to live traffic:

```ts
import { seedFromPrompts, coldStartRank } from '@kamiyo-org/selfimprove';

const variants = seedFromPrompts({
  agentId: 'reply-bot',
  taskType: 'tweet_reply',
  prompts: [
    'Reply in one witty sentence.',
    'Reply with a question that nudges engagement.',
    'Reply concisely, match their tone.',
  ],
  baseGenome: {
    modelId: 'claude-sonnet-4-6',
    toolAllowlist: [],
    temperature: 0.7,
    maxTokens: 200,
    systemGuardrails: '',
  },
});

const ranked = await coldStartRank({
  taskType: 'tweet_reply',
  evalSet: [{ input: 'just launched something cool!' }, { input: 'big layoffs today' }],
  runVariant: async (genome, input) => runAgent(genome, input),
  minScore: 0.5,
  archiveFailures: true,
});
```

- **`seedFromPrompts`** creates one variant per prompt, reusing a shared `baseGenome`.
- **`offlineEval`** runs a single variant against an eval set and scores with the judge.
- **`coldStartRank`** ranks all active variants; optionally archives ones below `minScore`.

Offline eval rows persist in `coldstart_evals` for audit.

## CLI

```bash
npm i -g @kamiyo-org/selfimprove better-sqlite3
kamiyo-si init --db ./agents.db

kamiyo-si rubric set --task tweet_reply --file ./rubric.md --budget 5
kamiyo-si variants list --task tweet_reply
kamiyo-si leaderboard --task tweet_reply
kamiyo-si sweep run                           # all task types
kamiyo-si variants lineage <variant-id>       # ancestry chain
```

Set `SELFIMPROVE_DB=/path/to.db` to skip `--db` on every call.

## Roadmap

- **Dashboard**: web UI for variants + lineage + promotion events
- **Multi-objective**: pareto frontier promotion across (quality, cost, latency)
- **Benchmark suite**: standard task harness to measure auto-mutation lift

## Status

`0.5.0` — API may shift before `1.0`. Schema migrations are stable.

## License

MIT
