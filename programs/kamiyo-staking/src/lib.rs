//! KAMIYO Staking
//!
//! Single-sided staking with duration-based multipliers (1x-2x over 180 days).
//! multiplier curve from l1000 agent behavior simulation
//!
//! Copyright (c) 2026 KAMIYO
//! SPDX-License-Identifier: MIT

use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token_interface::{
    self, Mint as MintInterface, TokenAccount as TokenAccountInterface, TokenInterface,
};

declare_id!("9QZGdEZ13j8fASEuhpj3eVwUPT4BpQjXSabVjRppJW2N");

#[cfg(kani)]
mod kani_proofs;

/// Burn rate for reward distributions: 1% (100 basis points)
const REWARD_BURN_RATE_BPS: u64 = 100;

/// Calculate burn and distribution amounts for rewards
fn calculate_reward_split(total_reward: u64) -> (u64, u64) {
    let burn_amount = ((total_reward as u128) * (REWARD_BURN_RATE_BPS as u128) / 10_000) as u64;
    let distribution_amount = total_reward - burn_amount;
    (burn_amount, distribution_amount)
}

// ============================================================================
// Constants
// ============================================================================

/// Minimum stake amount (100,000 KAMIYO = 100,000 * 10^6)
const MIN_STAKE_AMOUNT: u64 = 100_000_000_000;

/// Base APY in basis points (1200 = 12%)
const BASE_APY_BPS: u64 = 1200;

/// Seconds per year for reward calculations
const SECONDS_PER_YEAR: u64 = 31_536_000;

/// Duration thresholds (in seconds)
const THIRTY_DAYS: i64 = 30 * 24 * 60 * 60;
const NINETY_DAYS: i64 = 90 * 24 * 60 * 60;
const ONE_EIGHTY_DAYS: i64 = 180 * 24 * 60 * 60;

/// Multipliers (in basis points, 10000 = 1.0x)
const MULTIPLIER_BASE: u64 = 10000; // 1.0x
const MULTIPLIER_30D: u64 = 12000; // 1.2x
const MULTIPLIER_90D: u64 = 15000; // 1.5x
const MULTIPLIER_180D: u64 = 20000; // 2.0x

/// Revenue share percentage (10% of platform fees go to stakers)
const REVENUE_SHARE_BPS: u64 = 1000; // 10%

// ============================================================================
// Errors
// ============================================================================

#[error_code]
pub enum StakingError {
    #[msg("Stake amount below minimum")]
    BelowMinimumStake,

    #[msg("Insufficient staked balance")]
    InsufficientBalance,

    #[msg("No rewards to claim")]
    NoRewardsToClaim,

    #[msg("Staking pool is paused")]
    PoolPaused,

    #[msg("Invalid authority")]
    InvalidAuthority,

    #[msg("Math overflow")]
    MathOverflow,
}

// ============================================================================
// State Accounts
// ============================================================================

/// Global staking pool configuration
#[account]
pub struct StakingPool {
    /// Admin authority
    pub admin: Pubkey,

    /// KAMIYO token mint
    pub token_mint: Pubkey,

    /// Pool token vault (holds all staked tokens)
    pub token_vault: Pubkey,

    /// Rewards vault (holds tokens for distribution)
    pub rewards_vault: Pubkey,

    /// Total tokens staked
    pub total_staked: u64,

    /// Total weighted stake (for reward distribution)
    pub total_weighted_stake: u64,

    /// Accumulated rewards per weighted share
    pub accumulated_rewards_per_share: u128,

    /// Last time rewards were distributed
    pub last_distribution_time: i64,

    /// Total rewards distributed all time
    pub total_rewards_distributed: u64,

    /// Whether the pool is paused
    pub is_paused: bool,

    /// Bump seed
    pub bump: u8,
}

impl StakingPool {
    pub const LEN: usize = 8 + // discriminator
        32 + // admin
        32 + // token_mint
        32 + // token_vault
        32 + // rewards_vault
        8 +  // total_staked
        8 +  // total_weighted_stake
        16 + // accumulated_rewards_per_share
        8 +  // last_distribution_time
        8 +  // total_rewards_distributed
        1 +  // is_paused
        1; // bump
}

/// Individual staker position
#[account]
pub struct StakePosition {
    /// Owner of this stake position
    pub owner: Pubkey,

    /// Amount staked
    pub staked_amount: u64,

    /// Timestamp when stake was created
    pub stake_start_time: i64,

    /// Last time rewards were claimed
    pub last_claim_time: i64,

    /// Accumulated rewards debt (for accurate reward calculation)
    pub rewards_debt: u128,

    /// Total rewards claimed
    pub total_claimed: u64,

    /// Bump seed
    pub bump: u8,
}

impl StakePosition {
    pub const LEN: usize = 8 + // discriminator
        32 + // owner
        8 +  // staked_amount
        8 +  // stake_start_time
        8 +  // last_claim_time
        16 + // rewards_debt
        8 +  // total_claimed
        1; // bump
}

// ============================================================================
// Instructions
// ============================================================================

#[program]
pub mod kamiyo_staking {
    use super::*;

    /// Initialize the staking pool
    pub fn initialize_pool(ctx: Context<InitializePool>) -> Result<()> {
        let pool = &mut ctx.accounts.pool;
        pool.admin = ctx.accounts.admin.key();
        pool.token_mint = ctx.accounts.token_mint.key();
        pool.token_vault = ctx.accounts.token_vault.key();
        pool.rewards_vault = ctx.accounts.rewards_vault.key();
        pool.total_staked = 0;
        pool.total_weighted_stake = 0;
        pool.accumulated_rewards_per_share = 0;
        pool.last_distribution_time = Clock::get()?.unix_timestamp;
        pool.total_rewards_distributed = 0;
        pool.is_paused = false;
        pool.bump = ctx.bumps.pool;

        msg!("Staking pool initialized");
        Ok(())
    }

    /// Stake KAMIYO tokens
    pub fn stake(ctx: Context<Stake>, amount: u64) -> Result<()> {
        let pool = &ctx.accounts.pool;
        require!(!pool.is_paused, StakingError::PoolPaused);
        require!(amount >= MIN_STAKE_AMOUNT, StakingError::BelowMinimumStake);

        let clock = Clock::get()?;
        let position = &mut ctx.accounts.position;

        // If existing position, claim pending rewards first
        if position.staked_amount > 0 {
            let pending = calculate_pending_rewards(pool, position, clock.unix_timestamp)?;
            if pending > 0 {
                // Transfer pending rewards
                let seeds = &[b"pool".as_ref(), &[pool.bump]];
                let signer = &[&seeds[..]];

                token_interface::transfer(
                    CpiContext::new_with_signer(
                        ctx.accounts.token_program.to_account_info(),
                        token_interface::Transfer {
                            from: ctx.accounts.rewards_vault.to_account_info(),
                            to: ctx.accounts.user_token_account.to_account_info(),
                            authority: ctx.accounts.pool.to_account_info(),
                        },
                        signer,
                    ),
                    pending,
                )?;

                position.total_claimed = position
                    .total_claimed
                    .checked_add(pending)
                    .ok_or(StakingError::MathOverflow)?;
            }
        } else {
            // New position
            position.owner = ctx.accounts.user.key();
            position.stake_start_time = clock.unix_timestamp;
            position.bump = ctx.bumps.position;
        }

        // Transfer tokens to vault
        token_interface::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                token_interface::Transfer {
                    from: ctx.accounts.user_token_account.to_account_info(),
                    to: ctx.accounts.token_vault.to_account_info(),
                    authority: ctx.accounts.user.to_account_info(),
                },
            ),
            amount,
        )?;

        // Update position
        position.staked_amount = position
            .staked_amount
            .checked_add(amount)
            .ok_or(StakingError::MathOverflow)?;
        position.last_claim_time = clock.unix_timestamp;

        // Update pool
        let pool = &mut ctx.accounts.pool;
        pool.total_staked = pool
            .total_staked
            .checked_add(amount)
            .ok_or(StakingError::MathOverflow)?;

        // Update weighted stake
        let multiplier = get_multiplier(clock.unix_timestamp - position.stake_start_time);
        let weighted_amount = (amount as u128)
            .checked_mul(multiplier as u128)
            .ok_or(StakingError::MathOverflow)?
            .checked_div(MULTIPLIER_BASE as u128)
            .ok_or(StakingError::MathOverflow)?;
        let weighted_amount: u64 = weighted_amount
            .try_into()
            .map_err(|_| StakingError::MathOverflow)?;

        pool.total_weighted_stake = pool
            .total_weighted_stake
            .checked_add(weighted_amount)
            .ok_or(StakingError::MathOverflow)?;

        // Update rewards debt
        position.rewards_debt = (position.staked_amount as u128)
            .checked_mul(pool.accumulated_rewards_per_share)
            .ok_or(StakingError::MathOverflow)?;

        emit!(Staked {
            user: ctx.accounts.user.key(),
            amount,
            total_staked: position.staked_amount,
            multiplier,
            timestamp: clock.unix_timestamp,
        });

        Ok(())
    }

    /// Unstake KAMIYO tokens
    pub fn unstake(ctx: Context<Unstake>, amount: u64) -> Result<()> {
        let position = &ctx.accounts.position;
        require!(
            amount <= position.staked_amount,
            StakingError::InsufficientBalance
        );

        let clock = Clock::get()?;
        let pool = &ctx.accounts.pool;

        // Calculate and transfer pending rewards
        let pending = calculate_pending_rewards(pool, position, clock.unix_timestamp)?;

        let seeds = &[b"pool".as_ref(), &[pool.bump]];
        let signer = &[&seeds[..]];

        if pending > 0 {
            token_interface::transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    token_interface::Transfer {
                        from: ctx.accounts.rewards_vault.to_account_info(),
                        to: ctx.accounts.user_token_account.to_account_info(),
                        authority: ctx.accounts.pool.to_account_info(),
                    },
                    signer,
                ),
                pending,
            )?;
        }

        // Transfer staked tokens back to user
        token_interface::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                token_interface::Transfer {
                    from: ctx.accounts.token_vault.to_account_info(),
                    to: ctx.accounts.user_token_account.to_account_info(),
                    authority: ctx.accounts.pool.to_account_info(),
                },
                signer,
            ),
            amount,
        )?;

        // Update position
        let position = &mut ctx.accounts.position;
        position.staked_amount = position
            .staked_amount
            .checked_sub(amount)
            .ok_or(StakingError::MathOverflow)?;
        position.last_claim_time = clock.unix_timestamp;
        position.total_claimed = position
            .total_claimed
            .checked_add(pending)
            .ok_or(StakingError::MathOverflow)?;

        // Update pool
        let pool = &mut ctx.accounts.pool;
        pool.total_staked = pool
            .total_staked
            .checked_sub(amount)
            .ok_or(StakingError::MathOverflow)?;

        // Update weighted stake
        let multiplier = get_multiplier(clock.unix_timestamp - position.stake_start_time);
        let weighted_amount = (amount as u128)
            .checked_mul(multiplier as u128)
            .ok_or(StakingError::MathOverflow)?
            .checked_div(MULTIPLIER_BASE as u128)
            .ok_or(StakingError::MathOverflow)?;
        let weighted_amount: u64 = weighted_amount
            .try_into()
            .map_err(|_| StakingError::MathOverflow)?;

        pool.total_weighted_stake = pool.total_weighted_stake.saturating_sub(weighted_amount);

        // Update rewards debt
        position.rewards_debt = (position.staked_amount as u128)
            .checked_mul(pool.accumulated_rewards_per_share)
            .ok_or(StakingError::MathOverflow)?;

        // Reset stake start time if fully unstaked
        if position.staked_amount == 0 {
            position.stake_start_time = 0;
        }

        emit!(Unstaked {
            user: ctx.accounts.user.key(),
            amount,
            remaining_staked: position.staked_amount,
            rewards_claimed: pending,
            timestamp: clock.unix_timestamp,
        });

        Ok(())
    }

    /// Claim pending rewards without unstaking
    pub fn claim_rewards(ctx: Context<ClaimRewards>) -> Result<()> {
        let pool = &ctx.accounts.pool;
        let position = &ctx.accounts.position;
        let clock = Clock::get()?;

        let pending = calculate_pending_rewards(pool, position, clock.unix_timestamp)?;
        if pending == 0 {
            msg!("No rewards to claim");
            return Ok(());
        }

        let seeds = &[b"pool".as_ref(), &[pool.bump]];
        let signer = &[&seeds[..]];

        // Transfer rewards
        token_interface::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                token_interface::Transfer {
                    from: ctx.accounts.rewards_vault.to_account_info(),
                    to: ctx.accounts.user_token_account.to_account_info(),
                    authority: ctx.accounts.pool.to_account_info(),
                },
                signer,
            ),
            pending,
        )?;

        // Update position
        let position = &mut ctx.accounts.position;
        let pool = &ctx.accounts.pool;

        position.last_claim_time = clock.unix_timestamp;
        position.total_claimed = position
            .total_claimed
            .checked_add(pending)
            .ok_or(StakingError::MathOverflow)?;
        position.rewards_debt = (position.staked_amount as u128)
            .checked_mul(pool.accumulated_rewards_per_share)
            .ok_or(StakingError::MathOverflow)?;

        emit!(RewardsClaimed {
            user: ctx.accounts.user.key(),
            amount: pending,
            total_claimed: position.total_claimed,
            timestamp: clock.unix_timestamp,
        });

        Ok(())
    }

    /// Distribute rewards to the pool (called by platform)
    /// Burns 1% of rewards, distributes 99% to stakers
    pub fn distribute_rewards(ctx: Context<DistributeRewards>, amount: u64) -> Result<()> {
        let pool = &mut ctx.accounts.pool;
        let clock = Clock::get()?;

        require!(
            pool.total_weighted_stake > 0,
            StakingError::NoRewardsToClaim
        );

        // Calculate burn (1%) and distribution (99%) amounts
        let (burn_amount, distribution_amount) = calculate_reward_split(amount);

        // Burn 1% of rewards
        let decimals = ctx.accounts.token_mint.decimals;
        token_interface::burn(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                token_interface::Burn {
                    mint: ctx.accounts.token_mint.to_account_info(),
                    from: ctx.accounts.distributor_token_account.to_account_info(),
                    authority: ctx.accounts.distributor.to_account_info(),
                },
            ),
            burn_amount,
        )?;

        // Transfer 99% to rewards vault
        token_interface::transfer_checked(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                token_interface::TransferChecked {
                    from: ctx.accounts.distributor_token_account.to_account_info(),
                    mint: ctx.accounts.token_mint.to_account_info(),
                    to: ctx.accounts.rewards_vault.to_account_info(),
                    authority: ctx.accounts.distributor.to_account_info(),
                },
            ),
            distribution_amount,
            decimals,
        )?;

        // Update accumulated rewards per share (based on distribution amount, not total)
        let reward_per_share = (distribution_amount as u128)
            .checked_mul(1_000_000_000_000) // Precision factor
            .ok_or(StakingError::MathOverflow)?
            .checked_div(pool.total_weighted_stake as u128)
            .ok_or(StakingError::MathOverflow)?;

        pool.accumulated_rewards_per_share = pool
            .accumulated_rewards_per_share
            .checked_add(reward_per_share)
            .ok_or(StakingError::MathOverflow)?;

        pool.last_distribution_time = clock.unix_timestamp;
        pool.total_rewards_distributed = pool
            .total_rewards_distributed
            .checked_add(distribution_amount)
            .ok_or(StakingError::MathOverflow)?;

        emit!(RewardsDistributed {
            amount: distribution_amount,
            total_weighted_stake: pool.total_weighted_stake,
            accumulated_per_share: pool.accumulated_rewards_per_share,
            timestamp: clock.unix_timestamp,
        });

        emit!(RewardsBurned {
            burn_amount,
            distribution_amount,
            timestamp: clock.unix_timestamp,
        });

        Ok(())
    }

    /// Pause the staking pool (admin only)
    pub fn pause_pool(ctx: Context<AdminAction>) -> Result<()> {
        ctx.accounts.pool.is_paused = true;
        msg!("Staking pool paused");
        Ok(())
    }

    /// Unpause the staking pool (admin only)
    pub fn unpause_pool(ctx: Context<AdminAction>) -> Result<()> {
        ctx.accounts.pool.is_paused = false;
        msg!("Staking pool unpaused");
        Ok(())
    }

    /// Admin force-unstake: return all staked tokens to user (admin only)
    ///
    /// Used for migration — returns the full staked amount plus any pending
    /// rewards to the position owner's token account.
    pub fn admin_force_unstake(ctx: Context<AdminForceUnstake>) -> Result<()> {
        let position = &ctx.accounts.position;
        let amount = position.staked_amount;

        if amount == 0 {
            msg!("Position already empty, skipping");
            return Ok(());
        }

        let clock = Clock::get()?;
        let pool = &ctx.accounts.pool;

        // Calculate pending rewards
        let pending = calculate_pending_rewards(pool, position, clock.unix_timestamp)?;

        let seeds = &[b"pool".as_ref(), &[pool.bump]];
        let signer = &[&seeds[..]];

        // Transfer pending rewards (if any and vault has balance)
        if pending > 0 {
            let rewards_balance = ctx.accounts.rewards_vault.amount;
            let reward_transfer = pending.min(rewards_balance);
            if reward_transfer > 0 {
                token_interface::transfer(
                    CpiContext::new_with_signer(
                        ctx.accounts.token_program.to_account_info(),
                        token_interface::Transfer {
                            from: ctx.accounts.rewards_vault.to_account_info(),
                            to: ctx.accounts.staker_token_account.to_account_info(),
                            authority: ctx.accounts.pool.to_account_info(),
                        },
                        signer,
                    ),
                    reward_transfer,
                )?;
            }
        }

        // Transfer staked tokens back to user
        token_interface::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                token_interface::Transfer {
                    from: ctx.accounts.token_vault.to_account_info(),
                    to: ctx.accounts.staker_token_account.to_account_info(),
                    authority: ctx.accounts.pool.to_account_info(),
                },
                signer,
            ),
            amount,
        )?;

        // Capture stake_start_time before mutation for multiplier calc
        let stake_start_time = ctx.accounts.position.stake_start_time;

        // Update position
        let position = &mut ctx.accounts.position;
        position.staked_amount = 0;
        position.stake_start_time = 0;
        position.last_claim_time = clock.unix_timestamp;
        position.total_claimed = position
            .total_claimed
            .checked_add(pending)
            .ok_or(StakingError::MathOverflow)?;
        position.rewards_debt = 0;

        // Update pool
        let pool = &mut ctx.accounts.pool;
        pool.total_staked = pool.total_staked.saturating_sub(amount);

        let multiplier = get_multiplier(clock.unix_timestamp - stake_start_time);
        let weighted_amount = (amount as u128)
            .checked_mul(multiplier as u128)
            .ok_or(StakingError::MathOverflow)?
            .checked_div(MULTIPLIER_BASE as u128)
            .ok_or(StakingError::MathOverflow)?;
        let weighted_amount: u64 = weighted_amount
            .try_into()
            .map_err(|_| StakingError::MathOverflow)?;
        pool.total_weighted_stake = pool.total_weighted_stake.saturating_sub(weighted_amount);

        emit!(Unstaked {
            user: ctx.accounts.staker.key(),
            amount,
            remaining_staked: 0,
            rewards_claimed: pending,
            timestamp: clock.unix_timestamp,
        });

        Ok(())
    }
}

// ============================================================================
// Helper Functions
// ============================================================================

/// Get multiplier based on stake duration
fn get_multiplier(duration_seconds: i64) -> u64 {
    if duration_seconds >= ONE_EIGHTY_DAYS {
        MULTIPLIER_180D
    } else if duration_seconds >= NINETY_DAYS {
        MULTIPLIER_90D
    } else if duration_seconds >= THIRTY_DAYS {
        MULTIPLIER_30D
    } else {
        MULTIPLIER_BASE
    }
}

/// Calculate pending rewards for a position
fn calculate_pending_rewards(
    pool: &StakingPool,
    position: &StakePosition,
    current_time: i64,
) -> Result<u64> {
    if position.staked_amount == 0 {
        return Ok(0);
    }

    let duration = current_time - position.stake_start_time;
    let multiplier = get_multiplier(duration);

    let weighted_stake = (position.staked_amount as u128)
        .checked_mul(multiplier as u128)
        .ok_or(StakingError::MathOverflow)?
        .checked_div(MULTIPLIER_BASE as u128)
        .ok_or(StakingError::MathOverflow)?;

    let accumulated = weighted_stake
        .checked_mul(pool.accumulated_rewards_per_share)
        .ok_or(StakingError::MathOverflow)?
        .checked_div(1_000_000_000_000) // Precision factor
        .ok_or(StakingError::MathOverflow)?;

    let pending = accumulated
        .checked_sub(
            position
                .rewards_debt
                .checked_div(1_000_000_000_000)
                .unwrap_or(0),
        )
        .unwrap_or(0);
    let pending: u64 = pending.try_into().map_err(|_| StakingError::MathOverflow)?;

    Ok(pending)
}

// ============================================================================
// Events
// ============================================================================

#[event]
pub struct Staked {
    pub user: Pubkey,
    pub amount: u64,
    pub total_staked: u64,
    pub multiplier: u64,
    pub timestamp: i64,
}

#[event]
pub struct Unstaked {
    pub user: Pubkey,
    pub amount: u64,
    pub remaining_staked: u64,
    pub rewards_claimed: u64,
    pub timestamp: i64,
}

#[event]
pub struct RewardsClaimed {
    pub user: Pubkey,
    pub amount: u64,
    pub total_claimed: u64,
    pub timestamp: i64,
}

#[event]
pub struct RewardsDistributed {
    pub amount: u64,
    pub total_weighted_stake: u64,
    pub accumulated_per_share: u128,
    pub timestamp: i64,
}

#[event]
pub struct RewardsBurned {
    pub burn_amount: u64,
    pub distribution_amount: u64,
    pub timestamp: i64,
}

// ============================================================================
// Contexts
// ============================================================================

#[derive(Accounts)]
pub struct InitializePool<'info> {
    #[account(
        init,
        payer = admin,
        space = StakingPool::LEN,
        seeds = [b"pool"],
        bump
    )]
    pub pool: Account<'info, StakingPool>,

    pub token_mint: InterfaceAccount<'info, MintInterface>,

    #[account(
        init,
        payer = admin,
        token::mint = token_mint,
        token::authority = pool,
        seeds = [b"vault"],
        bump
    )]
    pub token_vault: InterfaceAccount<'info, TokenAccountInterface>,

    #[account(
        init,
        payer = admin,
        token::mint = token_mint,
        token::authority = pool,
        seeds = [b"rewards"],
        bump
    )]
    pub rewards_vault: InterfaceAccount<'info, TokenAccountInterface>,

    #[account(mut)]
    pub admin: Signer<'info>,

    pub system_program: Program<'info, System>,
    pub token_program: Interface<'info, TokenInterface>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct Stake<'info> {
    #[account(
        mut,
        seeds = [b"pool"],
        bump = pool.bump
    )]
    pub pool: Account<'info, StakingPool>,

    #[account(
        init_if_needed,
        payer = user,
        space = StakePosition::LEN,
        seeds = [b"position", user.key().as_ref()],
        bump
    )]
    pub position: Account<'info, StakePosition>,

    #[account(
        mut,
        seeds = [b"vault"],
        bump
    )]
    pub token_vault: InterfaceAccount<'info, TokenAccountInterface>,

    #[account(
        mut,
        seeds = [b"rewards"],
        bump
    )]
    pub rewards_vault: InterfaceAccount<'info, TokenAccountInterface>,

    #[account(
        mut,
        associated_token::mint = pool.token_mint,
        associated_token::authority = user,
        associated_token::token_program = token_program
    )]
    pub user_token_account: InterfaceAccount<'info, TokenAccountInterface>,

    #[account(mut)]
    pub user: Signer<'info>,

    pub system_program: Program<'info, System>,
    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct Unstake<'info> {
    #[account(
        mut,
        seeds = [b"pool"],
        bump = pool.bump
    )]
    pub pool: Account<'info, StakingPool>,

    #[account(
        mut,
        seeds = [b"position", user.key().as_ref()],
        bump = position.bump,
        has_one = owner @ StakingError::InvalidAuthority
    )]
    pub position: Account<'info, StakePosition>,

    #[account(
        mut,
        seeds = [b"vault"],
        bump
    )]
    pub token_vault: InterfaceAccount<'info, TokenAccountInterface>,

    #[account(
        mut,
        seeds = [b"rewards"],
        bump
    )]
    pub rewards_vault: InterfaceAccount<'info, TokenAccountInterface>,

    #[account(
        mut,
        associated_token::mint = pool.token_mint,
        associated_token::authority = user,
        associated_token::token_program = token_program
    )]
    pub user_token_account: InterfaceAccount<'info, TokenAccountInterface>,

    /// CHECK: validated by position.owner constraint
    pub owner: UncheckedAccount<'info>,

    #[account(mut)]
    pub user: Signer<'info>,

    pub token_program: Interface<'info, TokenInterface>,
}

#[derive(Accounts)]
pub struct ClaimRewards<'info> {
    #[account(seeds = [b"pool"], bump = pool.bump)]
    pub pool: Account<'info, StakingPool>,

    #[account(
        mut,
        seeds = [b"position", user.key().as_ref()],
        bump = position.bump,
        has_one = owner @ StakingError::InvalidAuthority
    )]
    pub position: Account<'info, StakePosition>,

    #[account(
        mut,
        seeds = [b"rewards"],
        bump
    )]
    pub rewards_vault: InterfaceAccount<'info, TokenAccountInterface>,

    #[account(
        mut,
        associated_token::mint = pool.token_mint,
        associated_token::authority = user,
        associated_token::token_program = token_program
    )]
    pub user_token_account: InterfaceAccount<'info, TokenAccountInterface>,

    /// CHECK: validated by position.owner constraint
    pub owner: UncheckedAccount<'info>,

    pub user: Signer<'info>,

    pub token_program: Interface<'info, TokenInterface>,
}

#[derive(Accounts)]
pub struct DistributeRewards<'info> {
    #[account(
        mut,
        seeds = [b"pool"],
        bump = pool.bump
    )]
    pub pool: Account<'info, StakingPool>,

    /// Token mint for burning 1% of rewards
    #[account(
        mut,
        constraint = token_mint.key() == pool.token_mint
    )]
    pub token_mint: InterfaceAccount<'info, MintInterface>,

    #[account(
        mut,
        seeds = [b"rewards"],
        bump
    )]
    pub rewards_vault: InterfaceAccount<'info, TokenAccountInterface>,

    #[account(mut)]
    pub distributor_token_account: InterfaceAccount<'info, TokenAccountInterface>,

    pub distributor: Signer<'info>,

    pub token_program: Interface<'info, TokenInterface>,
}

#[derive(Accounts)]
pub struct AdminAction<'info> {
    #[account(
        mut,
        seeds = [b"pool"],
        bump = pool.bump,
        has_one = admin @ StakingError::InvalidAuthority
    )]
    pub pool: Account<'info, StakingPool>,

    pub admin: Signer<'info>,
}

#[derive(Accounts)]
pub struct AdminForceUnstake<'info> {
    #[account(
        mut,
        seeds = [b"pool"],
        bump = pool.bump,
        has_one = admin @ StakingError::InvalidAuthority
    )]
    pub pool: Account<'info, StakingPool>,

    #[account(
        mut,
        seeds = [b"position", staker.key().as_ref()],
        bump = position.bump,
    )]
    pub position: Account<'info, StakePosition>,

    #[account(
        mut,
        seeds = [b"vault"],
        bump
    )]
    pub token_vault: InterfaceAccount<'info, TokenAccountInterface>,

    #[account(
        mut,
        seeds = [b"rewards"],
        bump
    )]
    pub rewards_vault: InterfaceAccount<'info, TokenAccountInterface>,

    #[account(
        mut,
        associated_token::mint = pool.token_mint,
        associated_token::authority = staker,
        associated_token::token_program = token_program
    )]
    pub staker_token_account: InterfaceAccount<'info, TokenAccountInterface>,

    /// CHECK: the position owner — validated by position PDA seeds derivation
    pub staker: UncheckedAccount<'info>,

    pub admin: Signer<'info>,

    pub token_program: Interface<'info, TokenInterface>,
}
