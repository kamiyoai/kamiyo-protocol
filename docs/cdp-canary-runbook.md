# CDP Canary Runbook

Date: 2026-02-28
Owner: Protocol engineering

## Purpose

Keep CDP production wiring continuously verified with two distinct checks:

1. Nightly stable attach-path validation (no policy churn).
2. Weekly create-path validation (scope check for `policies#manage`).

## Config Contract

Required GitHub secrets:

1. `KAMIYO_CANARY_CDP_API_KEY_ID`
2. `KAMIYO_CANARY_CDP_API_KEY_SECRET`
3. `KAMIYO_CANARY_CDP_WALLET_SECRET`
4. `KAMIYO_CANARY_CDP_POLICY_ID`
5. `KAMIYO_CANARY_CDP_POLICY_NETWORK`
6. `KAMIYO_CANARY_CDP_POLICY_MAX_SPEND_MICRO_USD`
7. `KAMIYO_CANARY_CDP_ACCOUNT_EVM_NAME`
8. `KAMIYO_CANARY_CDP_ACCOUNT_SOL_NAME`

Defaults expected by workflow if optional secrets are not explicitly set:

1. `KAMIYO_CANARY_CDP_POLICY_NETWORK=base-sepolia`
2. `KAMIYO_CANARY_CDP_POLICY_MAX_SPEND_MICRO_USD=250000`
3. `KAMIYO_CANARY_CDP_ACCOUNT_EVM_NAME=kmy-canary-evm`
4. `KAMIYO_CANARY_CDP_ACCOUNT_SOL_NAME=kmy-canary-sol`

## Workflow Modes

### Nightly canary

Workflow: `.github/workflows/nightly-enterprise-canary.yml`

Behavior:

1. Runs enterprise preflight and live smoke.
2. Runs MCP CDP transaction smoke in attach mode (`KAMIYO_CDP_SMOKE_CREATE_POLICY=false`).
3. Reuses stable account names.
4. Requires `KAMIYO_CANARY_CDP_POLICY_ID`.
5. Emits `reports/cdp-nightly-transaction-smoke.json` from MCP package cwd and uploads `packages/kamiyo-mcp/reports/cdp-nightly-transaction-smoke.json`.

### Weekly deep smoke

Workflow: `.github/workflows/weekly-cdp-create-path.yml`

Behavior:

1. Runs MCP CDP smoke with create mode (`KAMIYO_CDP_SMOKE_CREATE_POLICY=true`).
2. CDP readiness is validated inside the smoke via `cdp_env_status`.
3. Creates a fresh USDC policy and attaches it to both stable canary accounts.
4. Emits `reports/cdp-weekly-create-path-smoke.json` from MCP package cwd and uploads `packages/kamiyo-mcp/reports/cdp-weekly-create-path-smoke.json`.

## Artifact Contract

Both smoke modes emit JSON artifacts with:

1. `at`
2. `ok`
3. `mode`
4. `config`
5. `accounts`
6. `policyId`
7. `steps` (per-step status and failure details)

## Expected Failure Patterns and Owner Action

1. `Missing KAMIYO_CANARY_CDP_POLICY_ID...` in nightly:
   - Set `KAMIYO_CANARY_CDP_POLICY_ID` secret, rerun nightly manually.
2. `Missing required scope: policies#manage` in weekly:
   - Add `policies#manage` scope to CDP API key, rerun weekly create-path.
3. Auth/key-format failures:
   - Regenerate CDP API key + wallet secret, update GitHub secrets, rerun nightly.
4. Attach failure after successful account fetch:
   - Verify policy ID exists and network/scope match expected account type.

## Manual Operations

Run nightly path locally:

```bash
pnpm --filter @kamiyo/mcp-server run test:live-config
KAMIYO_CDP_SMOKE_CREATE_POLICY=false \
KAMIYO_CDP_SMOKE_ARTIFACT_PATH=reports/cdp-nightly-transaction-smoke.json \
pnpm --filter @kamiyo/mcp-server run test:live-cdp-transaction
```

Run weekly create-path locally:

```bash
pnpm --filter @kamiyo/mcp-server run test:live-config
KAMIYO_CDP_SMOKE_CREATE_POLICY=true \
KAMIYO_CDP_SMOKE_ARTIFACT_PATH=reports/cdp-weekly-create-path-smoke.json \
pnpm --filter @kamiyo/mcp-server run test:live-cdp-transaction
```

## Alerting Posture

`KAMIYO_CANARY_ALERT_WEBHOOK` is treated as temporary until replaced with the long-term team endpoint.

Replacement procedure:

1. Set new webhook in GitHub secret `KAMIYO_CANARY_ALERT_WEBHOOK`.
2. Manually dispatch:
   - `Nightly Enterprise Canary`
   - `Weekly Secret Env Parity Audit`
3. Trigger a controlled failure and confirm message delivery in the target channel.
4. Remove old webhook endpoint.
