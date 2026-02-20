# Fundry Staking V2 Scaffold

This folder contains implementation scaffolding for per-staker lock periods:

- `backend/routes-express.ts`:
  - Express route skeleton for:
    - `GET /api/staking/pools/:poolAddress/user-lock-config`
    - `POST /api/staking/pools/user-lock-config/set`
    - `POST /api/staking/pools/user-lock-config/clear`
    - `POST /api/staking/unstake-v2`
    - `POST /api/staking/stake/submit` (existing submit pattern)
  - Builds unsigned transactions for new instructions.

- `frontend/client.ts`:
  - Typed API client for all new endpoints.
  - Wallet `signAndSubmitTx` helper.

- `frontend/hooks.tsx`:
  - `useUserLockConfig` loader hook.
  - `useStakingV2Actions` for set/clear/unstake-v2 execution.

## Integration Notes

1. Keep existing `unstake` + `claim` endpoints untouched for backward compatibility.
2. After deploying upgraded program, switch UI unstake CTA to `unstake-v2` and show exact unlock timestamp before signing.

## Runtime Dependencies

- Backend scaffold: `express`, `zod`, `@solana/web3.js`, `@solana/spl-token`
- Frontend scaffold: `react`, `@solana/web3.js`

## Program Assumptions

- Program ID: `CaNvmbFzMhoAYnHijnDQcs57GwveazZETBAv3XUdpTcb`
- Added instructions:
  - `set_user_lock_config`
  - `clear_user_lock_config`
  - `unstake_v2`

See also:
- `../FUNDRY_STAKING_V2_IDL_JSON_PATCH.json`
- `../FUNDRY_STAKING_V2_UI_API_REQUEST_CONTRACT.md`
