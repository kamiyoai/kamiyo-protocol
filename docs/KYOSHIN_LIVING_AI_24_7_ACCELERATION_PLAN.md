# Kyoshin Living AI 24/7 Acceleration Plan (2026-02-20)

## Objective

Operate Kyoshin as a persistent autonomous runtime (`24/7`) where Claude is the decision engine and the swarm is the execution engine.

Target claim tiers:

1. `24h qualification`: accelerated pass/fail proof.
2. `30d certification`: production-grade autonomy proof.

The 24h tier is useful, but it is not equivalent to 30d certification.

## Current Reality (Live Runtime Data)

From `output/kamiyo-operator/state.db` (last 24h):

- total ticks: `81`
- ok: `32`
- error: `49`

Top failure causes (last 7d):

- `Tick timed out after 10m`: `31`
- recovered stale running ticks: `9`
- RPC/provider balance fetch failures (`403`, blocked endpoint, fetch failures)
- stale Anthropic model alias (`claude-3-5-haiku-latest`) in historical runs

Conclusion: the dominant blocker is loop reliability and timeout handling, not swarm logic correctness.

## What Was Implemented Now

### 1) Tick survival and soft-deadline control

Implemented in `services/kamiyo-operator/src/index.ts`:

- soft-deadline budget inside each tick (buffer before hard timeout)
- swarm execution now stops gracefully when remaining tick budget is too low
- LLM turn is skipped when remaining budget is too low (tick completes cleanly instead of timeout crash)
- runtime snapshot now records active RPC endpoint and soft-deadline state

### 2) RPC read failover and timeout/retry

Implemented in `services/kamiyo-operator/src/index.ts` + config:

- primary + fallback RPC URL list
- read-path timeout/retry with automatic endpoint failover
- startup RPC health check
- dynamic tool connection binding so tool calls use the current active endpoint

New env controls:

- `SOLANA_RPC_FALLBACK_URLS`
- `KAMIYO_RPC_READ_TIMEOUT_MS`
- `KAMIYO_RPC_READ_RETRIES`

### 3) Model alias hygiene

Implemented in `services/kamiyo-operator/src/index.ts`:

- deprecated alias remap (`claude-3-5-haiku-latest` -> `claude-haiku-4-5-20251001`)
- warning emitted on startup when alias remap happens

### 4) External call timeout hardening

Implemented in:

- `services/kamiyo-operator/src/index.ts`
- `services/kamiyo-operator/src/tools/fundryStaking.ts`

Changes:

- bounded timeout wrappers for fee vault reads/claims, fundry user-position reads, and claim submit/confirm paths
- avoids unbounded hangs that previously consumed whole ticks

### 5) 24h proof profile tuning

Updated `services/kamiyo-operator/config/ai-proof-24h.env` with tighter runtime controls:

- faster loop cadence
- RPC timeout/retry profile
- explicit soft-deadline thresholds
- explicit Anthropic request timeout

## 24h Acceleration Run (Operational)

1. Apply base `.env` and overlay `services/kamiyo-operator/config/ai-proof-24h.env`.
2. Run operator continuously for `24h`.
3. Publish proof bundle with:
   - `pnpm --filter @kamiyo/kamiyo-operator proof:refresh`
4. Publish both verdict and raw metrics.

Pass threshold for accelerated qualification:

- sample ticks `>=300`
- manual interventions `<=0`
- non-intervention rate `>=99%`
- route success rate `>=95%`
- decision-loop uptime `>=95%`
- max tick gap `<=5m`

## What Still Has To Be Done (Next)

1. Add write-path retry strategy with idempotency guards for selected operations.
2. Add automated canary + rollback for RPC endpoint quality.
3. Add token-budget/context compaction and prompt caching strategy for long-running cost/latency stability.
4. Run uninterrupted 24h qualification under real load and publish bundle.
5. Continue 30d run in parallel and publish weekly truth reports.

## Research References

- Anthropic model reference: [docs.anthropic.com/en/docs/about-claude/models/all-models](https://docs.anthropic.com/en/docs/about-claude/models/all-models)
- Anthropic API rate limits: [docs.anthropic.com/en/api/rate-limits](https://docs.anthropic.com/en/api/rate-limits)
- Anthropic prompt caching: [docs.anthropic.com/en/docs/build-with-claude/prompt-caching](https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching)
- Anthropic context editing/memory: [docs.anthropic.com/en/docs/build-with-claude/context-windows#context-editing](https://docs.anthropic.com/en/docs/build-with-claude/context-windows#context-editing)
- Anthropic tool use/stop reasons: [docs.anthropic.com/en/docs/agents-and-tools/tool-use/implement-tool-use](https://docs.anthropic.com/en/docs/agents-and-tools/tool-use/implement-tool-use)
- Anthropic status page: [status.anthropic.com](https://status.anthropic.com/)
