# @kamiyo-org/selfimprove-example

End-to-end benchmark: `tweet_reply` task, baseline variant vs. auto-mutation.

## What it does

1. Seeds a rubric (tone / relevance / brevity — see [`rubric.md`](./rubric.md))
2. Creates a baseline variant with a plain prompt
3. Runs **40 samples** over real tweet-style inputs (see [`inputs.json`](./inputs.json)), scored by Claude Haiku as judge
4. Runs **3 rounds of auto-mutation**:
   - LLM proposes prompt edits targeting the rubric
   - Param jitter creates temperature/maxTokens variants
   - Each round: 40 more samples, then `evaluateAndPromote` with Welch's t-test
5. Prints before → after lift

## Run

```bash
cd packages/kamiyo-selfimprove/example
pnpm install
ANTHROPIC_API_KEY=sk-ant-... pnpm bench
```

Tunables:

```bash
SAMPLES=60 ROUNDS=5 pnpm bench
```

Expect ~$3–5 in Claude usage per run at defaults (40 samples × (1 agent call + 1 judge call) × 3 rounds + baseline).

## Inspect

```bash
pnpm dashboard
# open http://127.0.0.1:4100
```

Shows leaderboard, promotion events, genome proposals, per-variant lineage.

## Expected output

```
=== Phase 1: baseline (40 samples) ===
........
baseline mean: 0.642 (n=40)

=== Phase 2: auto-mutation (3 rounds) ===

round 1/3: proposing mutations…
  created 4 variants, cost $0.0183
........
  PROMOTED 9a3c7e21: uplift=0.081 p=2.3e-03 n=47

round 2/3: …
round 3/3: …

=== Final leaderboard ===
  9a3c7e21  promoted   mean=0.731  n=47  auto-mutation: ...
  4b2d1f08  active     mean=0.698  n=42  auto-mutation: param jitter
  …
  baseline   archived   mean=0.642  n=40  baseline

Result: baseline=0.642 → best=0.731  (lift: +13.9%)
```

Numbers vary — LLM temperature + judge noise. Re-run to verify.
