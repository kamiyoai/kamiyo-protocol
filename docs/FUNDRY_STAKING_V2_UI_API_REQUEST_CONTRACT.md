# Fundry Staking V2 UI/API Contract (Per-Staker Lock Setting)

This contract is designed to plug into the existing Fundry flow where backend prepares unsigned transactions and the client signs, then submits via `/api/staking/stake/submit`.

## Scope

- Keep legacy `unstake` + `claim` behavior unchanged.
- Add per-wallet lock config as an optional override.
- Add `unstake_v2` with effective cooldown = `user_lock_config.cooldown` when present, otherwise `pool.cooldown`.

## Program + PDA Constants

- `STAKING_PROGRAM_ID`: `CaNvmbFzMhoAYnHijnDQcs57GwveazZETBAv3XUdpTcb`
- `USER_LOCK_CONFIG_SEED`: `"user_lock_config"`
- `UNSTAKE_SEED`: `"unstake"`

`user_lock_config` PDA derivation:

```ts
findProgramAddressSync([
  Buffer.from("user_lock_config"),
  pool.toBuffer(),
  user.toBuffer(),
], STAKING_PROGRAM_ID)
```

## Validation Constants (Backend + UI)

- `MIN_USER_COOLDOWN_SECONDS = 86400` (1 day)
- `MAX_USER_COOLDOWN_SECONDS = 2592000` (30 days)

## Endpoint Contracts

### 1) Read effective lock config

`GET /api/staking/pools/:poolAddress/user-lock-config?wallet=<pubkey>`

Response `200`:

```json
{
  "poolAddress": "<base58>",
  "wallet": "<base58>",
  "poolCooldownSeconds": 604800,
  "userLockConfigAddress": "<base58|null>",
  "userCooldownSeconds": 172800,
  "effectiveCooldownSeconds": 172800,
  "source": "user_lock_config",
  "updatedAt": "2026-02-19T12:34:56.000Z"
}
```

`source` enum:
- `"user_lock_config"`
- `"pool_default"`

### 2) Prepare tx: set user lock config

`POST /api/staking/pools/user-lock-config/set`

Request:

```json
{
  "wallet": "<base58>",
  "poolAddress": "<base58>",
  "cooldownSeconds": 172800
}
```

Validation:
- `cooldownSeconds` integer in `[86400, 2592000]`

Response `200`:

```json
{
  "transaction": "<base64 unsigned tx>",
  "wallet": "<base58>",
  "poolAddress": "<base58>",
  "userLockConfigAddress": "<base58>",
  "cooldownSeconds": 172800,
  "effectiveCooldownSeconds": 172800,
  "instruction": "set_user_lock_config"
}
```

### 3) Prepare tx: clear user lock config

`POST /api/staking/pools/user-lock-config/clear`

Request:

```json
{
  "wallet": "<base58>",
  "poolAddress": "<base58>"
}
```

Response `200`:

```json
{
  "transaction": "<base64 unsigned tx>",
  "wallet": "<base58>",
  "poolAddress": "<base58>",
  "userLockConfigAddress": "<base58>",
  "instruction": "clear_user_lock_config"
}
```

### 4) Prepare tx: unstake v2

`POST /api/staking/unstake-v2`

Request:

```json
{
  "wallet": "<base58>",
  "poolAddress": "<base58>",
  "amountRaw": "1000000000"
}
```

Validation:
- `amountRaw` is u64 string, `> 0`

Response `200`:

```json
{
  "transaction": "<base64 unsigned tx>",
  "wallet": "<base58>",
  "poolAddress": "<base58>",
  "unstakeAddress": "<base58>",
  "userLockConfigAddress": "<base58|null>",
  "amountRaw": "1000000000",
  "poolCooldownSeconds": 604800,
  "effectiveCooldownSeconds": 172800,
  "unlockAtUnix": 1772000000,
  "unlockAtIso": "2026-03-01T00:00:00.000Z",
  "source": "user_lock_config",
  "instruction": "unstake_v2"
}
```

### 5) Submit signed tx (existing endpoint, unchanged)

`POST /api/staking/stake/submit`

Request:

```json
{
  "transaction": "<base64 signed tx>"
}
```

Response `200`:

```json
{
  "signature": "<tx signature>",
  "slot": 123456789
}
```

## Error Contract

All endpoints return:

```json
{
  "error": "<human-readable>",
  "code": "<stable_machine_code>",
  "details": {}
}
```

Recommended `code` values:

- `INVALID_WALLET`
- `INVALID_POOL`
- `INVALID_COOLDOWN`
- `INVALID_AMOUNT`
- `POOL_NOT_FOUND`
- `USER_LOCK_CONFIG_NOT_FOUND`
- `TX_BUILD_FAILED`
- `TX_SUBMIT_FAILED`

Map on-chain errors when available:

- `UserCooldownTooLow`
- `UserCooldownTooHigh`
- `InvalidUserLockConfig`
- `PendingUnlockWouldBeReduced`

## Frontend Request/Response Types (exact)

```ts
export type LockConfigSource = "user_lock_config" | "pool_default";

export type GetUserLockConfigResponse = {
  poolAddress: string;
  wallet: string;
  poolCooldownSeconds: number;
  userLockConfigAddress: string | null;
  userCooldownSeconds: number | null;
  effectiveCooldownSeconds: number;
  source: LockConfigSource;
  updatedAt: string | null;
};

export type SetUserLockConfigRequest = {
  wallet: string;
  poolAddress: string;
  cooldownSeconds: number;
};

export type SetUserLockConfigResponse = {
  transaction: string;
  wallet: string;
  poolAddress: string;
  userLockConfigAddress: string;
  cooldownSeconds: number;
  effectiveCooldownSeconds: number;
  instruction: "set_user_lock_config";
};

export type ClearUserLockConfigRequest = {
  wallet: string;
  poolAddress: string;
};

export type ClearUserLockConfigResponse = {
  transaction: string;
  wallet: string;
  poolAddress: string;
  userLockConfigAddress: string;
  instruction: "clear_user_lock_config";
};

export type UnstakeV2Request = {
  wallet: string;
  poolAddress: string;
  amountRaw: string;
};

export type UnstakeV2Response = {
  transaction: string;
  wallet: string;
  poolAddress: string;
  unstakeAddress: string;
  userLockConfigAddress: string | null;
  amountRaw: string;
  poolCooldownSeconds: number;
  effectiveCooldownSeconds: number;
  unlockAtUnix: number;
  unlockAtIso: string;
  source: LockConfigSource;
  instruction: "unstake_v2";
};

export type SubmitSignedTxRequest = {
  transaction: string;
};

export type SubmitSignedTxResponse = {
  signature: string;
  slot?: number;
};

export type ApiError = {
  error: string;
  code: string;
  details?: Record<string, unknown>;
};
```

## UI Flow (minimal)

1. On pool page load, call `GET user-lock-config`.
2. Show lock selector with:
- selected = `effectiveCooldownSeconds`
- source badge = `Custom` (`user_lock_config`) or `Pool default` (`pool_default`)
3. On save:
- call `POST .../user-lock-config/set`
- wallet signs
- submit to `/api/staking/stake/submit`
- refetch `GET user-lock-config`
4. On clear custom lock:
- call `POST .../user-lock-config/clear`
- sign + submit
- refetch
5. On unstake:
- call `POST /api/staking/unstake-v2`
- show exact unlock timestamp before signature
- sign + submit

## Compatibility Notes

- Existing `unstake` + `claim` remain valid.
- Existing stakers do not need migration.
- `unstake_v2` can be defaulted in UI once backend endpoints are live.
