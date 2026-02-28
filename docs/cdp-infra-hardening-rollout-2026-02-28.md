# CDP Infra Hardening Rollout (2026-02-28)

## Scope Completed

1. Nightly enterprise canary now includes transaction-level CDP attach-path smoke.
2. Weekly CDP create-path smoke workflow added and validated.
3. Weekly secret/env parity audit expanded to include new CDP canary config contract.
4. Parity workflow now uses a dedicated admin token secret so secret listing is operational in CI.
5. Failure notification path validated through failed trial runs.
6. CDP runbook added: `docs/cdp-canary-runbook.md`.

## New / Updated Contracts

Required canary secrets:

1. `KAMIYO_CANARY_CDP_POLICY_ID`
2. `KAMIYO_CANARY_CDP_POLICY_NETWORK`
3. `KAMIYO_CANARY_CDP_POLICY_MAX_SPEND_MICRO_USD`
4. `KAMIYO_CANARY_CDP_ACCOUNT_EVM_NAME`
5. `KAMIYO_CANARY_CDP_ACCOUNT_SOL_NAME`
6. `KAMIYO_CANARY_GH_ADMIN_TOKEN` (for parity workflow secret enumeration)

## Workflow Validation Evidence

### Weekly parity audit

1. Initial failure (expected integration bug): [run 22523806211](https://github.com/kamiyo-ai/kamiyo-protocol/actions/runs/22523806211)
   - Root cause: `github.token` lacks permission for secrets listing.
2. Fixed workflow auth, then success: [run 22523833646](https://github.com/kamiyo-ai/kamiyo-protocol/actions/runs/22523833646)
   - Artifact: `weekly-secret-env-parity/secret-env-parity.json`
   - `ok=true`, `github_present=22/22`, `parity_failures=0`.

### Weekly CDP create-path smoke

1. Initial failures (workflow hardening loop):
   - [run 22523806687](https://github.com/kamiyo-ai/kamiyo-protocol/actions/runs/22523806687) (wrong preflight gate)
   - [run 22523834038](https://github.com/kamiyo-ai/kamiyo-protocol/actions/runs/22523834038) (`@kamiyo/cdp` build missing)
2. Fixed workflow, success: [run 22523859780](https://github.com/kamiyo-ai/kamiyo-protocol/actions/runs/22523859780)
   - Artifact: `cdp-weekly-create-path-smoke/cdp-weekly-create-path-smoke.json`
   - `ok=true`
   - Created policy ID: `245b77e9-6d59-4644-8c97-20c88c8e9a65`
   - Attached policy successfully to both stable canary accounts.

### Nightly enterprise canary (transaction-level CDP attach path)

1. First run after rollout failed: [run 22523885343](https://github.com/kamiyo-ai/kamiyo-protocol/actions/runs/22523885343)
   - Artifact showed `account policy does not exist` on both attach steps.
   - Root cause: stale `KAMIYO_CANARY_CDP_POLICY_ID`.
2. Rotated `KAMIYO_CANARY_CDP_POLICY_ID` to fresh policy from weekly create-path.
3. Consecutive success 1: [run 22523938451](https://github.com/kamiyo-ai/kamiyo-protocol/actions/runs/22523938451)
4. Consecutive success 2: [run 22523984416](https://github.com/kamiyo-ai/kamiyo-protocol/actions/runs/22523984416)

## Final State

1. Nightly attach-path smoke: green (2 consecutive runs).
2. Weekly create-path smoke: green.
3. Weekly parity audit: green with artifact output.
4. Failure alerting path: exercised during rollout failures and now stable.
