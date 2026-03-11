# Kyoshin Execution Runtime

Kyoshin is a Kizuna-powered execution runtime.

Its job is to source work, decide whether a task is worth taking, and execute within payment and treasury guardrails. Kizuna is the payment rail underneath it.

## What Kyoshin does

- sources swarm, marketplace, and inbound paid jobs
- enforces profitability and treasury guardrails before execution
- executes jobs, including x402 flows, without inference in the hot path
- allocates revenue across route, reserve, and operations buckets
- routes capital into configured staking pools with hard caps

## What Kizuna does for Kyoshin

- verifies paid requests before execution
- locks prefund or validates collateral before spend
- settles approved work over the shared rail
- tracks debt, repayment, and billable settlement state where applicable

## Guarantees in this runtime

- No Anthropic or OpenAI inference calls in the hot path.
- Every execution attempt is policy-gated.
- Execute mode has staged caps (`canary_0`, `canary_1`, `canary_2`, `full`).
- Global hard stop disables mutating execution paths.
- Staking route and claim actions can be forced through allowlists.
- Negative margin streaks open circuit breakers per `(agent, source)`.
- Claims and routes emit receipt files in `KAMIYO_OUTBOX_DIR`.

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
pnpm --filter @kamiyo/kyoshin build
pnpm --filter @kamiyo/kyoshin start
```
