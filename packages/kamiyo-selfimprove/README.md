# @kamiyo/selfimprove

Drop-in self-improvement loop for LLM agents. Wrap your call site once; the library then:

- tracks **variant genomes** (prompt / model / tools / temperature / max-tokens / guardrails) in SQLite
- routes live traffic via **Thompson-sampling bandit** across active variants
- scores outputs with an **LLM-as-judge** against a per-task rubric, caches by hash, enforces daily USD budgets
- auto-promotes winners using **Welch's t-test** at `p<0.05` with `n≥50` samples
- exposes metrics + events for Grafana / any Prometheus-compatible stack

Zero external ML dependencies. SQLite + TypeScript. Judge is provider-agnostic (Anthropic, OpenAI, Google, local — see `JudgeLLM` adapter).

## Status: 0.1 — extraction in progress

This package is being extracted from the [kamiyo-protocol](https://github.com/kamiyoai/kamiyo-protocol) monorepo, where it has been running in production against the KAMIYO Twitter bot since 2026-04.

### What's shipped in 0.1

- `@kamiyo/selfimprove/genome` — canonical genome hashing, validation, mutation
- `@kamiyo/selfimprove/stats` — Welch's t-test, two-sided p-value, Thompson gamma/beta sampling helpers
- Adapter interfaces (`DatabaseAdapter`, `JudgeLLM`, `Logger`, `MetricsAdapter`) + context init

### Remaining extraction (planned, one PR each)

- `service.ts` — variant CRUD, leaderboard, Thompson sampling, promotion
- `tournament.ts` — standing/adhoc tournaments
- `bandit.ts` — live routing
- `judge.ts` — LLM-as-judge with multi-provider adapter
- `routing.ts` — convenience wrapper for call sites
- `sweep-worker.ts` — periodic promotion sweep
- SQL schema migrations bundled with package

### Roadmap post-extraction

- **Pairwise judge**: Bradley-Terry / Elo on top of pairwise preference (research shows big win over absolute scoring)
- **Auto-mutation**: LLM proposes variant edits from top genomes; parameter jitter; crossover
- **Lineage viz**: genome ancestry tree in the dashboard
- **Cold start**: offline eval suite for new task types before bandit goes live

## Usage (0.1)

```ts
import {
  initSelfImprove,
  validateGenome,
  hashGenome,
  sampleStats,
  welchT,
  welchPTwoSided,
} from '@kamiyo/selfimprove';
import Database from 'better-sqlite3';

// Initialize the shared context once at app boot.
initSelfImprove({
  db: new Database('variants.db'),
  // logger, metrics, judgeLLM are optional — defaults are no-ops.
});

const genome = validateGenome({
  promptTemplate: 'You are concise.',
  modelId: 'claude-sonnet-4-5',
  toolAllowlist: [],
  temperature: 0.7,
  maxTokens: 200,
  systemGuardrails: '',
});

hashGenome(genome); // stable sha256

const scores = [0.62, 0.71, 0.80, 0.55, 0.67];
const stats = sampleStats(scores);
// → { n: 5, mean: 0.67, variance: ... }
```

More usage examples land as the remaining modules migrate.

## License

MIT
