# Kyoshin Execution Runtime

Kyoshin is an execution-first cloud worker for:

- sourcing swarm jobs from file/URL/marketplace feeds,
<<<<<<< HEAD
- enforcing profitability and treasury guardrails before execution,
- executing jobs (including x402 flows) without LLM inference,
- self-tuning agent priorities from realized outcomes,
=======
- sourcing + bidding on NEAR Agent Market jobs with deferred settlement accounting,
- auto-submitting accepted NEAR assignments with deterministic deliverable artifacts,
- accepting inbound paid jobs over authenticated HTTP intake,
- enforcing profitability and treasury guardrails before execution,
- executing jobs (including x402 flows) without LLM inference,
- self-tuning agent priorities from realized outcomes,
- adaptive self-improvement that tightens/loosens execution policy from live outcomes,
- revenue allocation ledger hooks for route/reserve/operations splits,
>>>>>>> origin/kamiyo/kyoshin-exec-canary
- routing SOL into configured staking pools with hard caps.

## Guarantees in this runtime

- No Anthropic/OpenAI inference calls in the hot path.
- Every execution attempt is policy-gated (margin, tx cap, daily cap).
- Execute mode has staged caps (`canary_0`, `canary_1`, `canary_2`, `full`) with deterministic limit clamps.
- Global hard stop (`KAMIYO_EXECUTION_HARD_STOP=true`) disables all mutating execution paths.
- Staking route/claim actions can be forced through pool allowlists (`KAMIYO_ALLOWED_STAKING_POOLS`).
- Negative margin streaks open a circuit breaker per `(agent, source)`.
- Weekly rollback can disable underperforming sources automatically.
- Claims and routes emit receipt files in `KAMIYO_OUTBOX_DIR`.

## Canary stages

- `canary_0`: execute runtime online, all mutations disabled.
- `canary_1`: low-cap job execution, routing and claims disabled.
- `canary_2`: controlled routing/claims enabled with stricter caps.
- `full`: use configured caps directly.

## API

- `GET /health`
- `GET /ready`
- `GET /metrics`
- `GET /status` (token-gated if `KYOSHIN_HTTP_TOKEN` is set)
<<<<<<< HEAD
=======
- `POST /jobs` (token-gated; enqueue one or many inbound jobs)
- `GET /jobs?status=pending|completed|deadletter&limit=100` (token-gated)
- `GET /economics` (token-gated; revenue lane and self-improve snapshot)
>>>>>>> origin/kamiyo/kyoshin-exec-canary

## Run

```bash
pnpm --filter @kamiyo/kyoshin build
pnpm --filter @kamiyo/kyoshin start
```

Use `services/kyoshin/.env.example` as the baseline config.
