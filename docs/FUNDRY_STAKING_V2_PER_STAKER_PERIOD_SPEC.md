# Fundry Staking V2: Per-Staker Period Selection (No Unstake Migration)

## Decision
Yes, we can upgrade the existing program in place and add per-staker period/cooldown selection without forcing current stakers to unstake.

This assumes we keep the same program ID:
- `CaNvmbFzMhoAYnHijnDQcs57GwveazZETBAv3XUdpTcb`

## Current On-Chain Constraints (Verified from Mainnet IDL)

1. Pool cooldown is global per pool.
- `Pool.cooldown: u64`
- `update_pool(SetPoolConfig::UpdateCooldown { cooldown })` updates a single value for everyone.

2. Unstake is represented by a per-user PDA, not by stake-position migration state.
- `unstake` PDA seeds: `["unstake", pool, user]`
- `Unstake` fields: `user`, `pool`, `amount`, `expirated_at`

3. Current pool (`9mEd5iRcdbNUwaCmkPqYggLfg25B2DsTn1w6gNrgvC9d`) cooldown is 604800s (7 days).

Implication: existing staked balances stay valid if we introduce new instructions/accounts and keep legacy paths intact.

## Product Goal
Allow each staker to choose their own unstake period (for example 1d/7d/30d) while preserving current positions and claims.

## V2 Design

### New Account
`UserLockConfig`
- PDA seeds: `["user_lock_config", pool, user]`
- Fields:
  - `user: Pubkey`
  - `pool: Pubkey`
  - `cooldown_seconds: u64`
  - `updated_at: i64`
  - `bump: u8`
  - `reserved: [u8; ...]`

### New Instructions
1. `set_user_lock_config(cooldown_seconds: u64)`
- signer: user
- creates or updates `UserLockConfig`
- validates min/max bounds

2. `clear_user_lock_config()`
- signer: user
- closes config account or resets to default behavior

3. `unstake_v2(amount: u64)`
- same core accounts as `unstake`
- reads `UserLockConfig` if present, else uses `Pool.cooldown`
- writes expiry into existing `Unstake.expirated_at`

### Legacy Compatibility
- Keep existing `unstake` and `claim` instructions unchanged.
- Existing unstake records continue to claim normally.
- Frontend/API switch to `unstake_v2` for new requests.

## Required Guardrails

1. Bounds:
- `MIN_COOLDOWN_SECONDS` (for example `86400`)
- `MAX_COOLDOWN_SECONDS` (for example `31536000`)

2. Expiry safety when user unstakes multiple times:
- `new_expiry = max(current_unstake.expirated_at, now + effective_cooldown)`
- prevents shortening lock by changing config before another unstake.

3. Existing pending unstake is immutable in effect:
- changing config later does not retroactively alter `expirated_at` already stored.

4. Authorization:
- only `user` can set/clear their config.

## Optional Extension (Phase 2)
Pool-defined allowed tiers
- Store allowed cooldown tiers in `Pool.reserved`.
- Extend `update_pool` enum with `UpdateAllowedCooldowns`.
- Enforce user-selected cooldown is one of allowed tiers.

This can be deferred. V1 of this upgrade works with min/max bounds only.

## Migration Strategy
No forced unstake migration.

1. Upgrade the same program ID.
2. Do not modify existing account layout in a way that breaks deserialization of current `Pool` and `Unstake`.
3. Add new instruction handlers and new account type only.
4. Roll frontend/API to call:
- `set_user_lock_config`
- `unstake_v2`
5. Keep fallback path to legacy `unstake` for safety rollout.

## Rollout Plan

1. Devnet
- Deploy upgraded program under same devnet program ID
- Integration tests for legacy and v2 flows

2. Mainnet staged
- Upgrade program
- Keep UI defaulting to existing pool cooldown for first 24h
- Enable per-staker selector after health checks

3. Monitoring
- counts for `set_user_lock_config`
- `unstake_v2` failures
- abnormal churn in `claim` volume after cooldown boundaries

## Test Matrix (Must Pass)

1. Legacy compatibility
- Existing staker can still `unstake` and `claim` with old behavior.

2. New config path
- User sets 1d, unstakes via `unstake_v2`, gets ~1d expiry.
- User sets 30d, unstakes via `unstake_v2`, gets ~30d expiry.

3. Config changes vs pending unstake
- User unstakes with 30d, changes config to 1d, pending expiry remains 30d.

4. Multiple unstake requests
- second request cannot reduce earliest claim time.

5. Unauthorized actions
- third party cannot set or clear another user's config.

6. Bounds
- reject cooldown < min or > max.

## API / UX Requirements

1. Add endpoints
- `GET /api/staking/pools/:pool/user-lock-config?wallet=...`
- `POST /api/staking/pools/:pool/set-lock-config`
- `POST /api/staking/pools/:pool/unstake-v2`

2. UI
- add lock selector before unstake action
- show effective cooldown + exact unlock timestamp before signing
- show "applies to new unstake requests only"

## Recommendation
Implement the minimal safe upgrade now:
- `UserLockConfig`
- `set_user_lock_config`
- `unstake_v2`
- no changes to claim logic
- no migration requirement

Then evaluate tier-based reward weighting separately.
