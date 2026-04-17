# @kamiyo-org/selfimprove

Drop-in self-improvement loop for LLM agents. Wrap your call site once; the library then:

- tracks **variant genomes** (prompt / model / tools / temperature / max-tokens / guardrails) in SQLite
- routes live traffic via **Thompson-sampling bandit** across active variants
- scores outputs with an **LLM-as-judge** against a per-task rubric, caches by hash, enforces daily USD budgets
- auto-promotes winners using **Welch's t-test** at `p<0.05` with `n≥50` samples
- exposes metrics + events for Grafana / any Prometheus-compatible stack

- gradual **canary rollouts** with auto-rollback on regression
- zero-dep **multi-provider judge adapters** (Anthropic, OpenAI, Gemini, or any custom gateway)

Zero external ML dependencies. SQLite + TypeScript.

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
  recordScore,
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

const { variant } = createVariant({
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
// variant: AgentVariant — .created is true if new, false if genome already existed

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

Or skip manual tournament wiring and record a score directly:

```ts
import { recordScore } from '@kamiyo-org/selfimprove';

recordScore({ variantId: variant.id, qualityScore: 0.85, cost: 0.001, latencyMs: 340 });
// Finds or creates a standing tournament for the variant's task type, then records the entry.
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
| `dashboard` | read-only local web UI over the SQLite DB |
| `pareto` | non-dominated frontier across (quality, cost, latency) |
| `shadow` | parallel candidate scoring on live traffic, no user exposure |
| `replay` | re-run variants on historical inputs + rescore on rubric change |
| `routing` | convenience wrappers for request-path wiring |
| `canary` | gradual traffic shift from baseline → candidate, auto-rollback on regression |
| `judge-adapters` | zero-dep wrappers for Anthropic / OpenAI / Gemini SDK clients |
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
kamiyo-si leaderboard --task tweet_reply --json  # machine-readable output
```

All read commands accept `--json` for scripting / piping into `jq`.

Set `SELFIMPROVE_DB=/path/to.db` to skip `--db` on every call.

## Dashboard

Read-only local web UI over the same SQLite DB:

```bash
kamiyo-si dashboard --db ./agents.db --port 4100
```

Then open <http://127.0.0.1:4100/>. Pages:

- `/` — task types with top mean + sample count
- `/tasks/:taskType` — leaderboard, promotion events, genome proposals
- `/variants/:id` — genome JSON, lineage chain, descendants, recent scores

Zero build step. Server-rendered HTML. No external deps beyond `better-sqlite3`.

## Shadow mode

Run N candidate variants in parallel with the primary on the same input. Score them all, return only the primary's output. Use this to evaluate new variants on live traffic without exposing users to unproven changes.

```ts
import { shadowRun } from '@kamiyo-org/selfimprove';

const summary = await shadowRun({
  taskType: 'tweet_reply',
  input: 'What do you think of SOL?',
  runVariant: async (genome, input) => {
    const t0 = Date.now();
    const output = await callLLM(genome.modelId, genome.promptTemplate, input);
    return { output, latencyMs: Date.now() - t0, costUsd: 0.0012 };
  },
  candidateLimit: 3,
  concurrency: 3,
});

// Return summary.primaryOutput to the user.
// summary.runs contains scores for all variants (primary + shadows).
```

Shadow results persist in `shadow_runs`. Inspect via:

```bash
kamiyo-si shadow stats --task tweet_reply --hours 24
```

## Replay + rescore

Re-run a variant against historical inputs (pulled from `shadow_runs`) without waiting for live traffic. Useful for: promotion of candidates with low organic sample count, regression testing after a prompt edit, or validating a new variant on yesterday's queries.

```ts
import { replayVariant, rescoreShadowRuns } from '@kamiyo-org/selfimprove';

// Forward-replay: target variant runs on sourceVariant's historical inputs.
const replay = await replayVariant({
  variantId: 'cand-b',
  sourceVariantId: 'primary-a',
  taskType: 'tweet_reply',
  runVariant: myRunner,
  limit: 100,
  concurrency: 3,
});
// -> { inputs: 100, scored: 98, meanScore: 0.82, totalCostUsd: 0.07 }

// Rescore: re-judge existing (input, output) pairs after a rubric update.
// Drops judge_cache for the task and re-runs all scores.
const rescore = await rescoreShadowRuns({
  taskType: 'tweet_reply',
  limit: 500,
});
// -> { rescored: 500, meanBefore: 0.71, meanAfter: 0.68, delta: -0.03 }
```

## Canary rollout

After auto-promotion (or manually), you can ramp a candidate into production behind a traffic split with automatic rollback on regression:

```ts
import { startCanary, stepCanary, pickCanaryArm, recordJudgedEntry } from '@kamiyo-org/selfimprove';

startCanary({
  taskType: 'tweet_reply',
  canaryVariantId: 'cand-b',
  trafficPct: 0.1,
  minSamples: 50,
  rollbackThreshold: 0.05,
});

// on each request, route via canary pick:
const pick = pickCanaryArm('tweet_reply');
if (pick) {
  const output = await runAgent(pick.variant.genome, input);
  await recordJudgedEntry({ ... }); // scored normally
}

// run periodically (cron / sweep):
const step = stepCanary({ taskType: 'tweet_reply' });
// -> 'held' | 'ramped' | 'promoted' | 'rolled_back'
```

Default ramp path: 10% → 25% → 50% → 100%. Rolls back automatically if canary mean drops below baseline by more than `rollbackThreshold` (default 5 points). Promotes via Welch's t-test at `p<0.05` once canary mean is significantly ahead.

Inspect from CLI:

```bash
kamiyo-si canary start --task tweet_reply --variant cand-b --traffic 0.1
kamiyo-si canary status --task tweet_reply
kamiyo-si canary step --task tweet_reply
kamiyo-si canary rollback --task tweet_reply --reason "manual"
```

## Multi-provider judge

Zero-dependency wrappers for popular SDKs. Pass your own client instance — no new deps pulled in.

```ts
import { anthropicJudge, openaiJudge, geminiJudge } from '@kamiyo-org/selfimprove';
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Anthropic
const judgeLLM = anthropicJudge(new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! }));

// OpenAI
const judgeLLM = openaiJudge(new OpenAI({ apiKey: process.env.OPENAI_API_KEY! }));

// Gemini
const gen = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);
const judgeLLM = geminiJudge(gen.getGenerativeModel({ model: 'gemini-2.5-pro' }));

// Or roll your own (local model, custom gateway):
import { genericChatJudge } from '@kamiyo-org/selfimprove';
const judgeLLM = genericChatJudge(async ({ model, messages, temperature, max_tokens }) => {
  const r = await fetch('http://localhost:11434/v1/chat/completions', {
    method: 'POST',
    body: JSON.stringify({ model, messages, temperature, max_tokens }),
  }).then(r => r.json());
  return { text: r.choices[0].message.content, inputTokens: r.usage.prompt_tokens, outputTokens: r.usage.completion_tokens };
});
```

## Roadmap

- **Lineage viz**: graphical ancestry tree on dashboard (currently table)
- **Contextual bandit**: route by input features (LinUCB / neural) alongside Thompson

## Status

`1.1.0` — public API stable. `createVariant` return type changed (breaking from 1.0.x). Semver from here. Schema migrations are additive.

## License

MIT
