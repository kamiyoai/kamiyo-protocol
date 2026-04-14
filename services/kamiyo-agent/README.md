# Kamiyo Agent Execution Runtime

Kamiyo Agent is a Kizuna-powered execution runtime.

Its job is to source work, decide whether a task is worth taking, and execute within payment and treasury guardrails. Kizuna is the payment rail underneath it.

## What Kamiyo Agent does

- sources swarm, marketplace, and inbound paid jobs
- enforces profitability and treasury guardrails before execution
- executes jobs, including x402 flows, on a deterministic path by default
- can switch selected opportunities into a bounded agentic loop backed by an OpenAI-compatible API
- allocates revenue across route, reserve, and operations buckets
- routes capital into configured staking pools with hard caps

## What Kizuna does for Kamiyo Agent

- verifies paid requests before execution
- locks prefund or validates collateral before spend
- settles approved work over the shared rail
- tracks debt, repayment, and billable settlement state where applicable

## Guarantees in this runtime

- Hot-path inference is opt-in. `KAMIYO_AGENTIC_LOOP_ENABLED=false` keeps execution deterministic.
- If the LLM path is enabled, tool selection is capped by turns, timeout, and spend budget.
- Every execution attempt is policy-gated.
- Execute mode has staged caps (`canary_0`, `canary_1`, `canary_2`, `full`).
- Global hard stop disables mutating execution paths.
- Staking route and claim actions can be forced through allowlists.
- Negative margin streaks open circuit breakers per `(agent, source)`.
- Claims and routes emit receipt files in `KAMIYO_OUTBOX_DIR`.

## Runtime Flags

- `KAMIYO_TICK_CHECKPOINT_ENABLED` resumes interrupted ticks from persisted checkpoint state.
- `KAMIYO_STREAMING_EVENTS_ENABLED` and `KAMIYO_EVENTS_SSE_ENABLED` emit runtime events over the in-process bus and SSE surface.
- `KAMIYO_AGENT_MEMORY_ENABLED` injects recent failure and execution patterns into agentic decisions.
- `KAMIYO_MANDATE_CLASSIFICATION_ENABLED` classifies opportunities before execution.
- `KAMIYO_AGENTIC_LOOP_ENABLED` plus `KAMIYO_AGENTIC_LOOP_API_KEY` enables OpenAI-compatible tool selection. `KAMIYO_AGENTIC_LOOP_BASE_URL` targets non-default providers.
- `KAMIYO_AGENT_TEAMS_ENABLED` enables scout/executor/verifier sequencing for multi-agent execution.
- The Render blueprint exposes these flags but keeps them disabled until they are explicitly rolled out.

## API

- `GET /health`
- `GET /ready`
- `GET /metrics`
- `GET /status`
- `POST /jobs`
- `GET /jobs?status=pending|completed|deadletter&limit=100`
- `GET /economics`

## Run

```bash
pnpm --filter @kamiyo/kamiyo-agent build
pnpm --filter @kamiyo/kamiyo-agent start
```
