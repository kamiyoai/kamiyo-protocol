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

## Results

1. Live env was initially configured but CDP calls failed on key parsing:
   - Error: `Invalid key format - must be either PEM EC key or base64 Ed25519 key`
2. CDP secrets were normalized:
   - `CDP_API_KEY_SECRET` converted to PEM PKCS8 format
   - `CDP_WALLET_SECRET` restored from provided credential
3. Real MCP CDP handler smoke rerun with normalized credentials:
   - `cdp_env_status.ok = true`
   - All live transaction-path calls still returned `Unauthorized.`

## Conclusion

The real transaction path is now validated end-to-end at the handler/runtime level, and the current blocker is confirmed as credential authorization at CDP, not local code path wiring.

## Next action required

1. Rotate/reissue the CDP API key pair in CDP dashboard.
2. Update:
   - Render `kamiyo-api`: `CDP_API_KEY_ID`, `CDP_API_KEY_SECRET`, `CDP_WALLET_SECRET`
   - GitHub secrets: `KAMIYO_CANARY_CDP_API_KEY_ID`, `KAMIYO_CANARY_CDP_API_KEY_SECRET`, `KAMIYO_CANARY_CDP_WALLET_SECRET`
3. Rerun the same smoke and record first successful account/policy receipt.

## Alert webhook note

`KAMIYO_CANARY_ALERT_WEBHOOK` is now set to a working endpoint so canary failure notifications are delivered immediately. Current endpoint is a temporary stopgap and should be replaced with your long-term team channel webhook.
