# $KAMIYO Token Staking Specification

**Version:** 1.0
**Last Updated:** October 28, 2025
**Status:** Design Phase

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [System Architecture](#system-architecture)
3. [Staking Pool Design](#staking-pool-design)
4. [APY Calculation & Rewards](#apy-calculation--rewards)
5. [Staking Mechanics](#staking-mechanics)
6. [Integration with x402 Platform](#integration-with-x402-platform)
7. [Economic Sustainability Model](#economic-sustainability-model)
8. [Security Considerations](#security-considerations)
9. [Implementation Roadmap](#implementation-roadmap)

---

## Executive Summary

The $KAMIYO staking system is designed to incentivize long-term token holding and reward community members who contribute to platform growth. Built on Solana using the Anchor framework, the staking program offers:

- **Target APY:** 10-25% funded from x402 platform fees
- **Staking Benefits:**
  - Priority access in escrow negotiations
  - Tiered fee discounts (10-30% based on stake)
  - Governance rights (future implementation)
- **Sustainability:** Revenue-backed rewards from USDC payments
- **Flexibility:** No minimum stake, 7-day cooldown period

The staking model follows 2025 best practices, implementing a "real yield" approach where rewards are funded from actual platform revenue rather than inflationary token emissions. This ensures long-term sustainability and aligns staker incentives with platform success.

---

## System Architecture

### High-Level Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    KAMIYO Staking System                     │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────┐         ┌──────────────┐                 │
│  │   User SPL   │────────▶│ Staking Pool │                 │
│  │ Token Account│  Stake  │   (PDA)      │                 │
│  └──────────────┘         └──────────────┘                 │
│         │                        │                          │
│         │                        ▼                          │
│         │              ┌──────────────────┐                │
│         │              │  User Stake PDA  │                │
│         │              │ (Stake Record)   │                │
│         │              └──────────────────┘                │
│         │                        │                          │
│         │                        ▼                          │
│         │              ┌──────────────────┐                │
│         └─────Claim────│ Reward Tracking  │                │
│            Rewards     │   & Distribution │                │
│                        └──────────────────┘                │
│                                 ▲                           │
│                                 │                           │
│                        ┌────────┴────────┐                 │
│                        │   x402 Revenue  │                 │
│                        │  (Platform Fees)│                 │
│                        └─────────────────┘                 │
└─────────────────────────────────────────────────────────────┘
```

### Program Derived Addresses (PDAs)

The staking system uses three primary PDA types:

#### 1. **Staking Pool PDA**
- **Seeds:** `["staking_pool", kamiyo_mint.key()]`
- **Purpose:** Global pool state and configuration
- **Accounts:**
  - Pool metadata (creation time, total staked, reward rate)
  - Vault token account (holds staked KAMIYO)
  - Admin configuration

#### 2. **User Stake PDA**
- **Seeds:** `["user_stake", user.key(), staking_pool.key()]`
- **Purpose:** Individual user stake tracking
- **Accounts:**
  - Stake amount
  - Stake timestamp
  - Accumulated rewards
  - Last claim timestamp
  - Cooldown status

#### 3. **Reward Vault PDA**
- **Seeds:** `["reward_vault", staking_pool.key()]`
- **Purpose:** Hold KAMIYO tokens for reward distribution
- **Accounts:**
  - Reward token balance
  - Distribution schedule

---

## Staking Pool Design

### State Account Structure

```rust
#[account]
pub struct StakingPool {
    /// Pool authority (admin)
    pub authority: Pubkey,

    /// KAMIYO token mint
    pub token_mint: Pubkey,

    /// Vault holding staked tokens
    pub vault: Pubkey,

    /// Reward vault for distributions
    pub reward_vault: Pubkey,

    /// Total tokens staked in pool
    pub total_staked: u64,

    /// Current reward rate (tokens per second per staked token)
    /// Scaled by 1e9 for precision
    pub reward_rate_per_second: u64,

    /// Last update timestamp
    pub last_update_timestamp: i64,

    /// Accumulated reward per token (scaled)
    pub reward_per_token_stored: u128,

    /// Minimum stake amount (0 for no minimum)
    pub min_stake_amount: u64,

    /// Cooldown period in seconds (default: 7 days)
    pub cooldown_period: i64,

    /// Pool creation timestamp
    pub created_at: i64,

    /// Whether pool is active
    pub is_active: bool,

    /// Bump seeds for PDA derivation
    pub pool_bump: u8,
    pub vault_bump: u8,
    pub reward_vault_bump: u8,
}
```

### User Stake Record Structure

```rust
#[account]
pub struct UserStake {
    /// Owner of this stake
    pub owner: Pubkey,

    /// Staking pool this stake belongs to
    pub pool: Pubkey,

    /// Amount of tokens staked
    pub staked_amount: u64,

    /// Timestamp when tokens were staked
    pub staked_at: i64,

    /// Rewards already claimed
    pub rewards_claimed: u64,

    /// Last reward claim timestamp
    pub last_claim_at: i64,

    /// Reward debt (for reward calculation)
    pub reward_debt: u128,

    /// Cooldown activation timestamp (0 if not in cooldown)
    pub cooldown_started_at: i64,

    /// Amount pending withdrawal (during cooldown)
    pub cooldown_amount: u64,

    /// Bump seed for PDA
    pub bump: u8,
}
```

---

## APY Calculation & Rewards

### Dynamic APY Model

The staking APY is dynamically adjusted based on:

1. **Total Platform Revenue:** Monthly x402 USDC payments
2. **Staking Participation Rate:** % of total supply staked
3. **Reward Pool Allocation:** % of revenue allocated to staking

**Formula:**

```
APY = (Annual_Reward_Pool / Total_Staked_Value) * 100

where:
Annual_Reward_Pool = Monthly_Revenue * 12 * Revenue_Allocation_Rate
Total_Staked_Value = Total_Staked_KAMIYO * KAMIYO_Price_USD
```

### Reward Rate Calculation

The reward rate per second is calculated as:

```rust
pub fn calculate_reward_rate(
    monthly_revenue_usdc: u64,
    total_staked_tokens: u64,
    revenue_allocation_percent: u8, // e.g., 30 = 30%
) -> u64 {
    // Convert monthly revenue to annual
    let annual_revenue = monthly_revenue_usdc * 12;

    // Calculate reward pool
    let reward_pool = annual_revenue * (revenue_allocation_percent as u64) / 100;

    // Convert to per-second rate
    let seconds_per_year = 31_536_000u64; // 365 days
    let reward_per_second = reward_pool / seconds_per_year;

    // Scale per staked token
    let reward_rate = if total_staked_tokens > 0 {
        (reward_per_second * 1_000_000_000) / total_staked_tokens
    } else {
        0
    };

    reward_rate
}
```

### Reward Distribution Mechanics

Rewards are calculated using a "reward per token" model similar to Synthetix/Uniswap staking:

```rust
pub fn calculate_pending_rewards(
    user_stake: &UserStake,
    pool: &StakingPool,
    current_timestamp: i64,
) -> u64 {
    // Calculate current reward per token
    let time_elapsed = current_timestamp - pool.last_update_timestamp;
    let reward_per_token = pool.reward_per_token_stored +
        (time_elapsed as u128 * pool.reward_rate_per_second as u128 / pool.total_staked as u128);

    // Calculate user's pending rewards
    let earned = (user_stake.staked_amount as u128 *
        (reward_per_token - user_stake.reward_debt)) / 1_000_000_000;

    earned as u64
}
```

### Target APY Scenarios

Based on revenue projections and staking participation:

| Monthly Revenue | Total Staked (% of 1B) | Reward Allocation | Target APY |
|----------------|------------------------|-------------------|------------|
| $5,000         | 25% (250M tokens)      | 30%               | 7.2%       |
| $10,000        | 25% (250M tokens)      | 30%               | 14.4%      |
| $10,000        | 50% (500M tokens)      | 30%               | 7.2%       |
| $20,000        | 25% (250M tokens)      | 40%               | 38.4%      |
| $50,000        | 50% (500M tokens)      | 25%               | 15.0%      |

**Assumptions:**
- KAMIYO price = $0.01 (market-driven)
- 1B total supply
- Rewards distributed proportionally per second

### APY Range Control

To maintain the 10-25% APY range:

```rust
pub const MIN_APY_BASIS_POINTS: u64 = 1000; // 10%
pub const MAX_APY_BASIS_POINTS: u64 = 2500; // 25%
pub const TARGET_APY_BASIS_POINTS: u64 = 1750; // 17.5%

pub fn adjust_reward_rate(
    current_apy: u64, // basis points
    pool: &mut StakingPool,
) {
    if current_apy < MIN_APY_BASIS_POINTS {
        // Increase reward rate by 10%
        pool.reward_rate_per_second = pool.reward_rate_per_second * 110 / 100;
    } else if current_apy > MAX_APY_BASIS_POINTS {
        // Decrease reward rate by 10%
        pool.reward_rate_per_second = pool.reward_rate_per_second * 90 / 100;
    }
}
```

---

## Staking Mechanics

### 1. Stake Instruction

**Purpose:** Lock KAMIYO tokens into the staking pool

```rust
pub fn stake(ctx: Context<Stake>, amount: u64) -> Result<()> {
    let pool = &mut ctx.accounts.staking_pool;
    let user_stake = &mut ctx.accounts.user_stake;
    let clock = Clock::get()?;

    require!(pool.is_active, ErrorCode::PoolInactive);
    require!(amount >= pool.min_stake_amount, ErrorCode::BelowMinimum);

    // Update pool rewards before changing stake
    update_pool_rewards(pool, clock.unix_timestamp)?;

    // If first stake, initialize user stake account
    if user_stake.staked_amount == 0 {
        user_stake.owner = ctx.accounts.user.key();
        user_stake.pool = pool.key();
        user_stake.staked_at = clock.unix_timestamp;
    }

    // Calculate and store current rewards before increasing stake
    let pending = calculate_pending_rewards(user_stake, pool, clock.unix_timestamp);
    if pending > 0 {
        // Add to claimable rewards without distributing
        user_stake.rewards_claimed += pending;
    }

    // Transfer tokens from user to vault
    token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.user_token_account.to_account_info(),
                to: ctx.accounts.vault.to_account_info(),
                authority: ctx.accounts.user.to_account_info(),
            },
        ),
        amount,
    )?;

    // Update user stake
    user_stake.staked_amount += amount;
    user_stake.reward_debt = (user_stake.staked_amount as u128 *
        pool.reward_per_token_stored) / 1_000_000_000;

    // Update pool
    pool.total_staked += amount;

    emit!(StakeEvent {
        user: ctx.accounts.user.key(),
        amount,
        total_staked: user_stake.staked_amount,
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}
```

**Accounts:**
```rust
#[derive(Accounts)]
pub struct Stake<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        mut,
        seeds = [b"staking_pool", token_mint.key().as_ref()],
        bump = staking_pool.pool_bump,
    )]
    pub staking_pool: Account<'info, StakingPool>,

    #[account(
        init_if_needed,
        payer = user,
        space = 8 + std::mem::size_of::<UserStake>(),
        seeds = [b"user_stake", user.key().as_ref(), staking_pool.key().as_ref()],
        bump,
    )]
    pub user_stake: Account<'info, UserStake>,

    #[account(mut)]
    pub user_token_account: Account<'info, TokenAccount>,

    #[account(mut)]
    pub vault: Account<'info, TokenAccount>,

    pub token_mint: Account<'info, Mint>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}
```

### 2. Unstake Instruction (Initiate Cooldown)

**Purpose:** Begin cooldown period before withdrawing tokens

```rust
pub fn initiate_unstake(ctx: Context<InitiateUnstake>, amount: u64) -> Result<()> {
    let pool = &ctx.accounts.staking_pool;
    let user_stake = &mut ctx.accounts.user_stake;
    let clock = Clock::get()?;

    require!(user_stake.staked_amount >= amount, ErrorCode::InsufficientStake);
    require!(user_stake.cooldown_started_at == 0, ErrorCode::CooldownActive);

    // Claim any pending rewards before unstaking
    let pending = calculate_pending_rewards(user_stake, pool, clock.unix_timestamp);
    if pending > 0 {
        // Auto-claim rewards
        claim_rewards_internal(ctx.accounts, pending)?;
    }

    // Start cooldown
    user_stake.cooldown_started_at = clock.unix_timestamp;
    user_stake.cooldown_amount = amount;

    emit!(UnstakeInitiatedEvent {
        user: ctx.accounts.user.key(),
        amount,
        cooldown_ends_at: clock.unix_timestamp + pool.cooldown_period,
    });

    Ok(())
}
```

### 3. Complete Unstake Instruction

**Purpose:** Withdraw tokens after cooldown period

```rust
pub fn complete_unstake(ctx: Context<CompleteUnstake>) -> Result<()> {
    let pool = &mut ctx.accounts.staking_pool;
    let user_stake = &mut ctx.accounts.user_stake;
    let clock = Clock::get()?;

    require!(user_stake.cooldown_started_at > 0, ErrorCode::NoCooldownActive);

    let cooldown_elapsed = clock.unix_timestamp - user_stake.cooldown_started_at;
    require!(cooldown_elapsed >= pool.cooldown_period, ErrorCode::CooldownNotComplete);

    let amount = user_stake.cooldown_amount;

    // Transfer tokens from vault to user
    let seeds = &[
        b"staking_pool",
        pool.token_mint.as_ref(),
        &[pool.pool_bump],
    ];
    let signer = &[&seeds[..]];

    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.vault.to_account_info(),
                to: ctx.accounts.user_token_account.to_account_info(),
                authority: pool.to_account_info(),
            },
            signer,
        ),
        amount,
    )?;

    // Update user stake
    user_stake.staked_amount -= amount;
    user_stake.cooldown_started_at = 0;
    user_stake.cooldown_amount = 0;

    // Update pool
    pool.total_staked -= amount;

    emit!(UnstakeCompletedEvent {
        user: ctx.accounts.user.key(),
        amount,
        remaining_staked: user_stake.staked_amount,
    });

    Ok(())
}
```

### 4. Claim Rewards Instruction

**Purpose:** Withdraw accrued staking rewards

```rust
pub fn claim_rewards(ctx: Context<ClaimRewards>) -> Result<()> {
    let pool = &mut ctx.accounts.staking_pool;
    let user_stake = &mut ctx.accounts.user_stake;
    let clock = Clock::get()?;

    // Update pool rewards
    update_pool_rewards(pool, clock.unix_timestamp)?;

    // Calculate pending rewards
    let pending = calculate_pending_rewards(user_stake, pool, clock.unix_timestamp);
    require!(pending > 0, ErrorCode::NoRewardsToClaim);

    // Transfer rewards from reward vault to user
    let seeds = &[
        b"staking_pool",
        pool.token_mint.as_ref(),
        &[pool.pool_bump],
    ];
    let signer = &[&seeds[..]];

    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.reward_vault.to_account_info(),
                to: ctx.accounts.user_token_account.to_account_info(),
                authority: pool.to_account_info(),
            },
            signer,
        ),
        pending,
    )?;

    // Update user stake
    user_stake.rewards_claimed += pending;
    user_stake.last_claim_at = clock.unix_timestamp;
    user_stake.reward_debt = (user_stake.staked_amount as u128 *
        pool.reward_per_token_stored) / 1_000_000_000;

    emit!(RewardClaimedEvent {
        user: ctx.accounts.user.key(),
        amount: pending,
        total_claimed: user_stake.rewards_claimed,
    });

    Ok(())
}
```

### 5. Fund Pool Instruction (Admin)

**Purpose:** Add KAMIYO tokens to reward vault from platform fees

```rust
pub fn fund_pool(ctx: Context<FundPool>, amount: u64) -> Result<()> {
    let pool = &mut ctx.accounts.staking_pool;

    require!(ctx.accounts.admin.key() == pool.authority, ErrorCode::Unauthorized);

    // Transfer KAMIYO from admin to reward vault
    token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.admin_token_account.to_account_info(),
                to: ctx.accounts.reward_vault.to_account_info(),
                authority: ctx.accounts.admin.to_account_info(),
            },
        ),
        amount,
    )?;

    emit!(PoolFundedEvent {
        admin: ctx.accounts.admin.key(),
        amount,
        timestamp: Clock::get()?.unix_timestamp,
    });

    Ok(())
}
```

---

## Integration with x402 Platform

### FastAPI Middleware Integration

The staking system integrates with the existing x402 middleware to provide fee discounts based on stake amount.

#### 1. Query User Stake from Solana

```python
# api/x402/staking_checker.py

from solana.rpc.async_api import AsyncClient
from solders.pubkey import Pubkey
from anchorpy import Provider, Wallet
import struct

class StakingChecker:
    """Check user staking status on Solana"""

    def __init__(self, rpc_url: str, staking_program_id: str):
        self.client = AsyncClient(rpc_url)
        self.program_id = Pubkey.from_string(staking_program_id)

    async def get_user_stake_pda(self, user_pubkey: str, pool_pubkey: str) -> Pubkey:
        """Derive user stake PDA"""
        user_key = Pubkey.from_string(user_pubkey)
        pool_key = Pubkey.from_string(pool_pubkey)

        seeds = [
            b"user_stake",
            bytes(user_key),
            bytes(pool_key)
        ]

        pda, bump = Pubkey.find_program_address(seeds, self.program_id)
        return pda

    async def get_stake_amount(self, user_pubkey: str, pool_pubkey: str) -> int:
        """Get user's staked KAMIYO amount"""
        try:
            stake_pda = await self.get_user_stake_pda(user_pubkey, pool_pubkey)

            account_info = await self.client.get_account_info(stake_pda)
            if not account_info.value:
                return 0

            # Parse account data (simplified - use anchorpy for production)
            data = account_info.value.data
            # Skip discriminator (8 bytes), owner (32), pool (32)
            staked_amount = struct.unpack('<Q', data[72:80])[0]

            return staked_amount

        except Exception as e:
            logger.error(f"Error checking stake: {e}")
            return 0

    async def calculate_discount_tier(self, staked_amount: int) -> dict:
        """
        Calculate fee discount based on stake

        Tiers:
        - 0-100k KAMIYO: 0% discount
        - 100k-500k: 10% discount
        - 500k-1M: 20% discount
        - 1M+: 30% discount
        """
        if staked_amount >= 1_000_000_000_000:  # 1M tokens (9 decimals)
            return {'tier': 'platinum', 'discount_percent': 30}
        elif staked_amount >= 500_000_000_000:  # 500k tokens
            return {'tier': 'gold', 'discount_percent': 20}
        elif staked_amount >= 100_000_000_000:  # 100k tokens
            return {'tier': 'silver', 'discount_percent': 10}
        else:
            return {'tier': 'none', 'discount_percent': 0}
```

#### 2. Modify x402 Middleware

```python
# api/x402/middleware.py (additions)

from .staking_checker import StakingChecker

class X402Middleware(BaseHTTPMiddleware):
    def __init__(self, app, payment_tracker: PaymentTracker):
        super().__init__(app)
        self.payment_tracker = payment_tracker
        self.config = get_x402_config()

        # Initialize staking checker
        self.staking_checker = StakingChecker(
            rpc_url=self.config.solana_rpc_url,
            staking_program_id=os.getenv('KAMIYO_STAKING_PROGRAM_ID')
        )

    async def _get_payment_config(self, request: Request) -> Optional[Dict[str, Any]]:
        """Get payment configuration with staking discount applied"""
        base_config = self._get_base_payment_config(request)

        if not base_config:
            return None

        # Check for staking discount
        wallet_address = request.headers.get('x-wallet-address')
        if wallet_address:
            try:
                stake_amount = await self.staking_checker.get_stake_amount(
                    wallet_address,
                    self.config.staking_pool_address
                )

                discount_info = await self.staking_checker.calculate_discount_tier(stake_amount)

                if discount_info['discount_percent'] > 0:
                    # Apply discount
                    original_price = base_config['price']
                    discounted_price = original_price * (100 - discount_info['discount_percent']) / 100

                    base_config['price'] = discounted_price
                    base_config['discount_applied'] = discount_info
                    base_config['original_price'] = original_price

                    logger.info(f"Applied {discount_info['discount_percent']}% discount for {wallet_address}")

            except Exception as e:
                logger.error(f"Error checking staking discount: {e}")
                # Continue without discount on error

        return base_config
```

#### 3. Priority Escrow Access

```python
# api/x402/escrow_priority.py

async def check_escrow_priority(user_wallet: str) -> dict:
    """
    Determine user's priority level in escrow negotiations

    Returns:
    - priority_tier: 'standard', 'priority', 'premium'
    - max_escrow_slots: Number of concurrent escrows allowed
    - negotiation_timeout: Extended timeout for negotiations
    """
    staking_checker = StakingChecker(...)
    stake_amount = await staking_checker.get_stake_amount(user_wallet, pool_address)

    if stake_amount >= 1_000_000_000_000:  # 1M+ KAMIYO
        return {
            'priority_tier': 'premium',
            'max_escrow_slots': 10,
            'negotiation_timeout_hours': 48,
            'auto_mediation': True
        }
    elif stake_amount >= 500_000_000_000:  # 500k+ KAMIYO
        return {
            'priority_tier': 'priority',
            'max_escrow_slots': 5,
            'negotiation_timeout_hours': 36,
            'auto_mediation': False
        }
    else:
        return {
            'priority_tier': 'standard',
            'max_escrow_slots': 2,
            'negotiation_timeout_hours': 24,
            'auto_mediation': False
        }
```

---

## Economic Sustainability Model

### Revenue Allocation Strategy

Platform x402 fees are allocated as follows:

```
100% Platform Revenue (USDC)
│
├─ 30% → Staking Rewards (converted to KAMIYO)
├─ 20% → Development & Operations
├─ 15% → Marketing & Growth
├─ 15% → Treasury Reserve
├─ 10% → Token Buyback (for reward conversion)
└─ 10% → Team & Contributors
```

### USDC to KAMIYO Conversion Flow

```
┌─────────────────┐
│  Monthly x402   │
│ Revenue (USDC)  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  30% Allocated  │
│  for Staking    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Market Buy of  │
│  KAMIYO tokens  │
│  (via DEX/CEX)  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   Transfer to   │
│  Reward Vault   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   Distributed   │
│   to Stakers    │
└─────────────────┘
```

### Sustainability Projections

**Scenario 1: Conservative Growth**
- Monthly Revenue: $10,000
- Staking Allocation: 30% = $3,000/month
- Annual Reward Pool: $36,000
- KAMIYO Price: $0.01
- Tokens Purchased: 3,600,000 KAMIYO/year
- Total Staked: 250M tokens (25%)
- **APY: 14.4%** ✓ Within target range

**Scenario 2: Moderate Growth**
- Monthly Revenue: $25,000
- Staking Allocation: 30% = $7,500/month
- Annual Reward Pool: $90,000
- KAMIYO Price: $0.015
- Tokens Purchased: 6,000,000 KAMIYO/year
- Total Staked: 400M tokens (40%)
- **APY: 15.0%** ✓ Within target range

**Scenario 3: Aggressive Growth**
- Monthly Revenue: $50,000
- Staking Allocation: 25% = $12,500/month (reduced % due to scale)
- Annual Reward Pool: $150,000
- KAMIYO Price: $0.02
- Tokens Purchased: 7,500,000 KAMIYO/year
- Total Staked: 500M tokens (50%)
- **APY: 15.0%** ✓ Within target range

### Reserve Strategy

To handle revenue volatility:

1. **Build Reserve:** First 6 months, allocate 40% to staking, 10% to reserve
2. **Maintain Buffer:** Keep 3 months of reward obligations in reserve
3. **Adjust Dynamically:** If reserve falls below 2 months, reduce APY
4. **Surplus Distribution:** If reserve exceeds 6 months, increase APY or buyback

### Price Impact Mitigation

To avoid pumping token price with large buys:

```python
# Automated buyback strategy
def execute_monthly_buyback(usdc_amount: int):
    """
    Execute KAMIYO buyback across 30 days to minimize slippage
    """
    daily_amount = usdc_amount / 30

    # Use TWAP (Time-Weighted Average Price) strategy
    for day in range(30):
        # Split into 4 hourly purchases
        hourly_amount = daily_amount / 4

        for hour in [0, 6, 12, 18]:  # 6-hour intervals
            execute_limit_order(
                amount_usdc=hourly_amount,
                max_slippage=0.5,  # 0.5% max slippage
                timeout_hours=6
            )
```

---

## Security Considerations

### 1. Reentrancy Protection

All state-changing instructions use Anchor's built-in protections and follow checks-effects-interactions pattern.

### 2. Overflow Protection

Use checked arithmetic for all calculations:

```rust
use checked_math::CheckedMath;

let new_total = pool.total_staked
    .checked_add(amount)
    .ok_or(ErrorCode::MathOverflow)?;
```

### 3. PDA Validation

Always verify PDA derivation in account constraints:

```rust
#[account(
    seeds = [b"user_stake", user.key().as_ref(), pool.key().as_ref()],
    bump = user_stake.bump,
)]
pub user_stake: Account<'info, UserStake>,
```

### 4. Admin Access Control

```rust
#[access_control(is_admin(&ctx.accounts.admin, &ctx.accounts.staking_pool))]
pub fn fund_pool(ctx: Context<FundPool>, amount: u64) -> Result<()> {
    // ...
}

fn is_admin(admin: &Signer, pool: &Account<StakingPool>) -> Result<()> {
    require!(admin.key() == pool.authority, ErrorCode::Unauthorized);
    Ok(())
}
```

### 5. Reward Vault Solvency

Implement checks to prevent over-distribution:

```rust
pub fn claim_rewards(ctx: Context<ClaimRewards>) -> Result<()> {
    let pending = calculate_pending_rewards(...);

    let vault_balance = ctx.accounts.reward_vault.amount;
    require!(vault_balance >= pending, ErrorCode::InsufficientRewardFunds);

    // ...
}
```

### 6. Rate Limiting

Prevent spam attacks:

```rust
pub fn stake(ctx: Context<Stake>, amount: u64) -> Result<()> {
    let user_stake = &ctx.accounts.user_stake;
    let clock = Clock::get()?;

    // Require 1 hour between stakes
    if user_stake.staked_at > 0 {
        require!(
            clock.unix_timestamp - user_stake.staked_at >= 3600,
            ErrorCode::StakeTooFrequent
        );
    }

    // ...
}
```

---

## Implementation Roadmap

### Phase 1: Core Development (Weeks 1-2)
- [ ] Set up Anchor project structure
- [ ] Implement StakingPool and UserStake account structs
- [ ] Develop initialize_pool instruction
- [ ] Implement stake instruction with tests
- [ ] Implement unstake instructions (initiate + complete)

### Phase 2: Rewards System (Weeks 3-4)
- [ ] Implement reward calculation logic
- [ ] Develop claim_rewards instruction
- [ ] Create fund_pool instruction (admin)
- [ ] Implement APY adjustment mechanism
- [ ] Write comprehensive unit tests

### Phase 3: Integration (Week 5)
- [ ] Deploy to Solana devnet
- [ ] Integrate StakingChecker into FastAPI
- [ ] Modify x402 middleware for discounts
- [ ] Implement escrow priority system
- [ ] Create admin dashboard for pool management

### Phase 4: Testing & Audit (Week 6)
- [ ] Integration tests with x402 flow
- [ ] Load testing (1000+ concurrent stakers)
- [ ] Security audit (internal)
- [ ] Economic model stress testing
- [ ] Bug bounty program

### Phase 5: Mainnet Launch (Week 7)
- [ ] Deploy to Solana mainnet
- [ ] Initialize staking pool with initial rewards
- [ ] Launch announcement & documentation
- [ ] Monitor APY and adjust as needed
- [ ] Gather community feedback

---

## Appendix

### Error Codes

```rust
#[error_code]
pub enum ErrorCode {
    #[msg("Staking pool is not active")]
    PoolInactive,

    #[msg("Amount below minimum stake requirement")]
    BelowMinimum,

    #[msg("Insufficient staked amount")]
    InsufficientStake,

    #[msg("Cooldown period already active")]
    CooldownActive,

    #[msg("No cooldown currently active")]
    NoCooldownActive,

    #[msg("Cooldown period not yet complete")]
    CooldownNotComplete,

    #[msg("No rewards available to claim")]
    NoRewardsToClaim,

    #[msg("Unauthorized access")]
    Unauthorized,

    #[msg("Math overflow occurred")]
    MathOverflow,

    #[msg("Insufficient reward funds in vault")]
    InsufficientRewardFunds,

    #[msg("Stake operations too frequent")]
    StakeTooFrequent,
}
```

### Events

```rust
#[event]
pub struct StakeEvent {
    pub user: Pubkey,
    pub amount: u64,
    pub total_staked: u64,
    pub timestamp: i64,
}

#[event]
pub struct UnstakeInitiatedEvent {
    pub user: Pubkey,
    pub amount: u64,
    pub cooldown_ends_at: i64,
}

#[event]
pub struct UnstakeCompletedEvent {
    pub user: Pubkey,
    pub amount: u64,
    pub remaining_staked: u64,
}

#[event]
pub struct RewardClaimedEvent {
    pub user: Pubkey,
    pub amount: u64,
    pub total_claimed: u64,
}

#[event]
pub struct PoolFundedEvent {
    pub admin: Pubkey,
    pub amount: u64,
    pub timestamp: i64,
}
```

---

**End of Staking Specification**
