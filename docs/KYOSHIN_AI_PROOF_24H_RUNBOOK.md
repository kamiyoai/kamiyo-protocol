# Kyoshin 24h AI Proof Runbook

This runbook defines an accelerated 24h qualification that can be published transparently while the 30-day proof is still in progress.

Important:

- 24h qualification is **not** a replacement for 30-day autonomy proof.
- Publish both the pass/fail verdict and the raw metrics.

## 1) Apply 24h Proof Runtime Profile

Use the overlay values in:

- `services/kamiyo-operator/config/ai-proof-24h.env`

These settings tighten the loop and observability:

- execute mode enabled
- 60s decision interval
- swarm execution enabled
- source contract validation enabled
- rollback + circuit breaker enabled
- hourly SLO reporting
- Prometheus metrics endpoint enabled

## 2) Run Operator for 24h Uninterrupted

Start Kyoshin with proof profile values applied and keep it running for a full 24h window.

## 3) Generate Public Proof Artifacts

Run these commands:

```bash
pnpm --filter @kamiyo/kamiyo-operator proof:refresh
```

or run step-by-step:

```bash
pnpm --filter @kamiyo/kamiyo-operator soak:swarm -- --opportunities 2500 --iterations 10 --agents 8
pnpm --filter @kamiyo/kamiyo-operator benchmark:autonomy -- --days 1
pnpm --filter @kamiyo/kamiyo-operator proof:24h
```

Proof bundle output:

- `output/kamiyo-operator/public-proof/<run-id>/proof-summary.json`
- `output/kamiyo-operator/public-proof/<run-id>/proof-summary.md`
- `output/kamiyo-operator/public-proof/<run-id>/manifest.json`

## 4) Publish the Correct Claim

Allowed claim:

- "Passed/failed accelerated 24h autonomy qualification."

Disallowed claim:

- "30-day autonomy proven."

## 5) Pass Criteria in `proof:24h`

- ticks sample >= 300
- manual interventions <= 0
- non-intervention rate >= 99%
- route success rate >= 95%
- decision-loop uptime >= 95%
- max tick gap <= 5 minutes
