# Live CDP Transaction-Path Smoke (2026-02-27)

## Scope

Run one real CDP transaction-path smoke via MCP CDP tool handlers and record output receipts.

Tool handlers exercised:

- `cdp_env_status`
- `cdp_evm_get_or_create_account`
- `cdp_solana_get_or_create_account`
- `cdp_create_usdc_policy`
- `cdp_evm_set_account_policy` (conditional on upstream success)
- `cdp_solana_set_account_policy` (conditional on upstream success)

## Receipts

- `docs/artifacts/cdp-live-smoke-20260227T212205Z.json`
- `docs/artifacts/cdp-live-smoke-manual-20260227T212658Z.json`
- `docs/artifacts/cdp-live-smoke-scope-check-20260227T215605Z.json`
- `docs/artifacts/cdp-live-smoke-post-scope-20260227T220942Z-shortname.json`

## Results

1. Live env was initially configured but CDP calls failed on key parsing:
   - Error: `Invalid key format - must be either PEM EC key or base64 Ed25519 key`
2. CDP secrets were normalized:
   - `CDP_API_KEY_SECRET` converted to PEM PKCS8 format
   - `CDP_WALLET_SECRET` restored from provided credential
3. Real MCP CDP handler smoke rerun with normalized credentials:
   - `cdp_env_status.ok = true`
   - All live transaction-path calls still returned `Unauthorized.`
4. New CDP keypair + wallet secret from latest downloads were applied to GitHub canary secrets and Render live env.
5. Real MCP CDP handler smoke after credential replacement:
   - `cdp_env_status.ok = true`
   - `cdp_evm_get_or_create_account.success = true`
   - `cdp_solana_get_or_create_account.success = true`
   - `cdp_create_usdc_policy.success = false` with:
     - `Missing required scope: policies#manage`

## Final verification (scope fixed)

After `policies#manage` scope was added and smoke rerun:

- `cdp_evm_get_or_create_account.success = true`
- `cdp_solana_get_or_create_account.success = true`
- `cdp_create_usdc_policy.success = true`
- `cdp_evm_set_account_policy.success = true`
- `cdp_solana_set_account_policy.success = true`

## Conclusion

Live CDP transaction path is now fully operational end-to-end for account creation, policy creation, and policy attachment through MCP CDP handlers.

## Next action required

1. Keep current key scopes aligned in CDP (do not remove `policies#manage`).
2. Retain weekly parity audit job to catch secret/env drift.
3. Continue appending fresh receipt artifacts for each credential rotation.

## Alert webhook note

`KAMIYO_CANARY_ALERT_WEBHOOK` is now set to a working endpoint so canary failure notifications are delivered immediately. Current endpoint is a temporary stopgap and should be replaced with your long-term team channel webhook.
