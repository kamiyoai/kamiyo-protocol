# Kyoshin Cloud Execute Runbook

## Objective

Run Kyoshin in cloud `execute` mode with explicit safety gates:

- staged canary execution caps,
- hard-stop kill switch,
- staking pool allowlist enforcement,
- strict daily/per-tx/tx-count budget guards.

## Required environment

- `KAMIYO_MODE=execute`
- `KAMIYO_EXECUTION_STAGE=canary_1` (initial)
- `KAMIYO_EXECUTION_HARD_STOP=false`
- `KAMIYO_REQUIRE_STAKING_POOL_ALLOWLIST=true`
- `KAMIYO_ALLOWED_STAKING_POOLS=<pool_a>,<pool_b>`
- `KAMIYO_SWARM_JOB_REQUIRE_EXPECTED_REWARD=true`

## Staged rollout

1. `canary_0` (30-60 min): no mutations, verify health/status/metrics and feed intake quality.
2. `canary_1` (12-24 h): limited paid-job execution, no route/claim operations.
3. `canary_2` (24-72 h): controlled route/claim enabled with tighter auto-stake caps.
4. `full`: only after sustained positive net SOL and stable SLOs.

## Stage caps (runtime enforced)

- `canary_0`
  - daily cap: `0.005 SOL`
  - per-tx cap: `0.001 SOL`
  - tx/day cap: `1`
  - job execution: disabled
  - claim/route: disabled
- `canary_1`
  - daily cap: `0.02 SOL`
  - per-tx cap: `0.003 SOL`
  - tx/day cap: `4`
  - max jobs/tick: `1`
  - claim/route: disabled
- `canary_2`
  - daily cap: `0.05 SOL`
  - per-tx cap: `0.01 SOL`
  - tx/day cap: `10`
  - max jobs/tick: `1`
  - auto-stake bps cap: `1000` (10%)
  - auto-stake tx cap: `25,000,000 lamports`

## Promotion gates

- Non-intervention rate >= 0.95 over rolling 24h.
- Route success rate >= 0.95 over rolling 24h.
- Weekly net SOL >= 0.
- No unresolved `staking_pool_not_allowlisted` or budget-guard errors.

## Immediate rollback

Set:

- `KAMIYO_EXECUTION_HARD_STOP=true`

This disables all job execution, claim, and route mutations while keeping the runtime online for observation.
