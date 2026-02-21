# Fundry Staking V2 Anchor Skeleton (Per-Staker Lock Setting)

This is a paste-ready skeleton for the staking program repo behind:
- Program ID: `CaNvmbFzMhoAYnHijnDQcs57GwveazZETBAv3XUdpTcb`

Goal:
- Keep existing pool and unstake accounts valid.
- Add per-user lock settings for future unstake actions.
- Preserve legacy instructions (`unstake`, `claim`) untouched.

---

## 1) New seeds and limits

```rust
pub const USER_LOCK_CONFIG_SEED: &[u8] = b"user_lock_config";
pub const MIN_USER_COOLDOWN_SECONDS: u64 = 24 * 60 * 60;      // 1 day
pub const MAX_USER_COOLDOWN_SECONDS: u64 = 365 * 24 * 60 * 60; // 365 days
```

---

## 2) New account

```rust
#[account(zero_copy)]
#[repr(C)]
pub struct UserLockConfig {
    pub user: Pubkey,
    pub pool: Pubkey,
    pub cooldown_seconds: u64,
    pub updated_at: i64,
    pub bump: u8,
    pub _padding: [u8; 7],
    pub reserved: [u8; 128],
}

impl UserLockConfig {
    pub const INIT_SPACE: usize = 32 + 32 + 8 + 8 + 1 + 7 + 128;
}
```

---

## 3) New errors

```rust
#[error_code]
pub enum StakingError {
    #[msg("User cooldown is below minimum")]
    UserCooldownTooLow,

    #[msg("User cooldown exceeds maximum")]
    UserCooldownTooHigh,

    #[msg("Invalid user lock config account")]
    InvalidUserLockConfig,

    #[msg("Unauthorized")]
    Unauthorized,
}
```

---

## 4) New events

```rust
#[event]
pub struct UserLockConfigSet {
    pub user: Pubkey,
    pub pool: Pubkey,
    pub cooldown_seconds: u64,
    pub updated_at: i64,
}

#[event]
pub struct UserLockConfigCleared {
    pub user: Pubkey,
    pub pool: Pubkey,
    pub cleared_at: i64,
}
```

---

## 5) New instructions

### 5.1 set_user_lock_config

```rust
pub fn set_user_lock_config(ctx: Context<SetUserLockConfig>, cooldown_seconds: u64) -> Result<()> {
    require!(cooldown_seconds >= MIN_USER_COOLDOWN_SECONDS, StakingError::UserCooldownTooLow);
    require!(cooldown_seconds <= MAX_USER_COOLDOWN_SECONDS, StakingError::UserCooldownTooHigh);

    let now = Clock::get()?.unix_timestamp;
    let cfg = &mut ctx.accounts.user_lock_config;

    if cfg.user == Pubkey::default() {
        cfg.user = ctx.accounts.user.key();
        cfg.pool = ctx.accounts.pool.key();
        cfg.bump = ctx.bumps.user_lock_config;
    } else {
        require_keys_eq!(cfg.user, ctx.accounts.user.key(), StakingError::Unauthorized);
        require_keys_eq!(cfg.pool, ctx.accounts.pool.key(), StakingError::InvalidUserLockConfig);
    }

    cfg.cooldown_seconds = cooldown_seconds;
    cfg.updated_at = now;

    emit!(UserLockConfigSet {
        user: ctx.accounts.user.key(),
        pool: ctx.accounts.pool.key(),
        cooldown_seconds,
        updated_at: now,
    });

    Ok(())
}
```

### 5.2 clear_user_lock_config

```rust
pub fn clear_user_lock_config(_ctx: Context<ClearUserLockConfig>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;

    emit!(UserLockConfigCleared {
        user: _ctx.accounts.user.key(),
        pool: _ctx.accounts.pool.key(),
        cleared_at: now,
    });

    Ok(())
}
```

### 5.3 unstake_v2

Use the same accounts/state mutations as legacy `unstake`, but replace cooldown selection logic.

```rust
pub fn unstake_v2(ctx: Context<UnstakeV2>, amount: u64) -> Result<()> {
    // existing unstake validations stay unchanged

    let now = Clock::get()?.unix_timestamp;
    let pool = &mut ctx.accounts.pool;
    let unstake = &mut ctx.accounts.unstake;

    // If user config exists and is valid, use it. Otherwise fallback to pool.cooldown.
    let effective_cooldown = match &ctx.accounts.user_lock_config {
        Some(cfg) => {
            require_keys_eq!(cfg.user, ctx.accounts.user.key(), StakingError::Unauthorized);
            require_keys_eq!(cfg.pool, pool.key(), StakingError::InvalidUserLockConfig);
            cfg.cooldown_seconds
        }
        None => pool.cooldown,
    };

    let target_expiry = now
        .checked_add(i64::try_from(effective_cooldown).map_err(|_| error!(StakingError::UserCooldownTooHigh))?)
        .ok_or(error!(StakingError::UserCooldownTooHigh))?;

    // Preserve security invariant: do not shorten an existing pending lock.
    unstake.expirated_at = std::cmp::max(unstake.expirated_at, target_expiry);

    // keep all existing amount/accounting logic from legacy unstake

    Ok(())
}
```

---

## 6) New contexts

```rust
#[derive(Accounts)]
pub struct SetUserLockConfig<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    pub pool: AccountLoader<'info, Pool>,

    #[account(
        init_if_needed,
        payer = user,
        space = 8 + UserLockConfig::INIT_SPACE,
        seeds = [
            USER_LOCK_CONFIG_SEED,
            pool.key().as_ref(),
            user.key().as_ref(),
        ],
        bump,
    )]
    pub user_lock_config: Account<'info, UserLockConfig>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ClearUserLockConfig<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    pub pool: AccountLoader<'info, Pool>,

    #[account(
        mut,
        close = user,
        seeds = [
            USER_LOCK_CONFIG_SEED,
            pool.key().as_ref(),
            user.key().as_ref(),
        ],
        bump = user_lock_config.bump,
        constraint = user_lock_config.user == user.key() @ StakingError::Unauthorized,
        constraint = user_lock_config.pool == pool.key() @ StakingError::InvalidUserLockConfig,
    )]
    pub user_lock_config: Account<'info, UserLockConfig>,
}

#[derive(Accounts)]
pub struct UnstakeV2<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(mut)]
    pub user_wrapped_token_account: AccountInfo<'info>,

    #[account(mut)]
    pub pool: AccountLoader<'info, Pool>,

    #[account(
        mut,
        seeds = [b"unstake", pool.key().as_ref(), user.key().as_ref()],
        bump,
    )]
    pub unstake: Account<'info, Unstake>,

    pub wrapped_mint: AccountInfo<'info>,
    pub wrapped_token_program: AccountInfo<'info>,
    pub system_program: Program<'info, System>,

    // Optional PDA for per-user cooldown override.
    // If omitted, fallback to pool.cooldown.
    #[account(
        seeds = [USER_LOCK_CONFIG_SEED, pool.key().as_ref(), user.key().as_ref()],
        bump,
    )]
    pub user_lock_config: Option<Account<'info, UserLockConfig>>,
}
```

If your Anchor version has trouble with `Option<Account<...>>` + seeds, keep `unstake_v2` with no optional account and read config from remaining accounts manually.

---

## 7) IDL additions (high-level)

Add instructions:
- `set_user_lock_config(cooldown_seconds: u64)`
- `clear_user_lock_config()`
- `unstake_v2(amount: u64)`

Add account type:
- `UserLockConfig`

Do not remove or rename existing instructions/accounts.

---

## 8) TS client skeleton

```ts
import { PublicKey } from '@solana/web3.js';

const USER_LOCK_CONFIG_SEED = Buffer.from('user_lock_config', 'utf8');

export function getUserLockConfigPda(programId: PublicKey, pool: PublicKey, user: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [USER_LOCK_CONFIG_SEED, pool.toBuffer(), user.toBuffer()],
    programId,
  );
}

// 1) set_user_lock_config
// program.methods.setUserLockConfig(new BN(cooldownSeconds)).accounts({...}).rpc()

// 2) clear_user_lock_config
// program.methods.clearUserLockConfig().accounts({...}).rpc()

// 3) unstake_v2
// program.methods.unstakeV2(new BN(amount)).accounts({... userLockConfig? ...}).rpc()
```

---

## 9) Backward compatibility checklist

1. Keep legacy `unstake` callable.
2. Keep `claim` unchanged.
3. Existing pending `Unstake.expirated_at` values remain honored.
4. Existing staked balances/wrapped supply untouched.
5. No forced unstake/re-stake required.

---

## 10) Recommended rollout

1. Deploy upgrade on devnet and run full legacy + v2 tests.
2. Mainnet upgrade in place.
3. Frontend defaults to pool cooldown unless user sets custom lock.
4. Show exact unlock timestamp in UI before signing.

