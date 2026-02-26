# Live CDP + Paranet Credential Audit (2026-02-26)

## Scope

Validate whether live CDP and live Paranet transaction paths can run true production calls with the credentials/endpoints available in the current workspace.

## Findings

1. Paranet/DKG credentials are partially present in local operator config:
   - `KAMIYO_DKG_ENDPOINT`: set
   - `KAMIYO_DKG_PORT`: set
   - `KAMIYO_DKG_BLOCKCHAIN`: set
   - `KAMIYO_DKG_PRIVATE_KEY`: set
2. Missing for full Paranet write/read context:
   - `PARANET_UAL` / `DKG_PARANET_UAL` / `KAMIYO_DKG_PARANET_UAL`
   - `PARANET_OPERATOR_GLOBAL_ID` / `PARANET_CLIENT_GLOBAL_ID` / `KAMIYO_DKG_AGENT_ID`
   - `PARANET_ATTESTOR_GLOBAL_ID` (or fallback equivalent)
3. CDP production credentials are not currently available in scanned local env files:
   - `CDP_API_KEY_ID`
   - `CDP_API_KEY_SECRET`
   - `CDP_WALLET_SECRET`

## Implemented Fixes

1. Added alias-aware CDP env resolution in `@kamiyo/cdp`.
   - Canonical keys still supported.
   - Coinbase alias keys are now accepted.
   - Missing-env errors now list accepted aliases.
2. Upgraded MCP `cdp_env_status` output:
   - reports configured state
   - reports which env key actually resolved each field
   - reports missing fields explicitly
3. Added MCP `paranet_env_status` tool:
   - validates endpoint/blockchain/port parsing
   - reports read/write readiness for read, publish, attest, and trust paths
   - reports env source key for each resolved field
4. Added Paranet alias support in MCP runtime:
   - supports `PARANET_*`, `DKG_*`, and `KAMIYO_DKG_*` naming families
5. Added alias support in API Paranet/DKG routes to use existing operator env names.
6. Added alias support in `@kamiyo/agent-paranet` pre-deploy verifier script.
7. Added one-command MCP live preflight:
   - `pnpm --filter @kamiyo/mcp-server run test:live-config`

## Validation Results (After Fixes)

1. `pnpm --filter @kamiyo/cdp run test`: pass.
2. `pnpm --filter @kamiyo/mcp-server run build`: pass.
3. `pnpm --filter @kamiyo/agent-paranet run verify-deployment` (with operator env loaded): pass with warnings:
   - paranet UAL missing
   - Redis not configured
4. `pnpm --filter @kamiyo/mcp-server run test:live-config` (with operator env loaded): fail as expected due missing:
   - CDP credentials
   - Paranet UAL
   - Paranet operator/attestor global IDs

## Remaining Blockers For True Production Calls

1. CDP live call path remains blocked until real CDP credentials are provided.
2. Paranet publish/attest/trust paths remain blocked until:
   - Paranet UAL is configured
   - operator/attestor global IDs are configured

## Operational Plan

1. Inject CDP credentials from your secret manager into runtime env.
2. Inject missing Paranet IDs and UAL from your deployed Paranet profile.
3. Run:
   - `pnpm --filter @kamiyo/mcp-server run test:live-config`
   - `pnpm --filter @kamiyo/agent-paranet run verify-deployment`
4. Execute live MCP tools:
   - `cdp_evm_get_or_create_account`
   - `paranet_publish_task_completion`
   - `paranet_attest_capability`
   - `paranet_record_trust`
