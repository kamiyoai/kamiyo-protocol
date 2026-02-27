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

## Conclusion

Credential authorization is now partially fixed: wallet/account creation paths are live and working. The remaining production blocker is API-key scope configuration in CDP for policy management.

## Next action required

1. In CDP Portal, grant `policies#manage` scope to API key `b778836b-29aa-42f4-969d-27fe98d6ee98` (or issue a new key with that scope).
2. If a new key is issued, update:
   - Render `kamiyo-api`: `CDP_API_KEY_ID`, `CDP_API_KEY_SECRET`, `CDP_WALLET_SECRET`
   - GitHub secrets: `KAMIYO_CANARY_CDP_API_KEY_ID`, `KAMIYO_CANARY_CDP_API_KEY_SECRET`, `KAMIYO_CANARY_CDP_WALLET_SECRET`
3. Rerun this same smoke and record the first successful policy receipt (`cdp_create_usdc_policy` + policy attachment).

## Alert webhook note

`KAMIYO_CANARY_ALERT_WEBHOOK` is now set to a working endpoint so canary failure notifications are delivered immediately. Current endpoint is a temporary stopgap and should be replaced with your long-term team channel webhook.
