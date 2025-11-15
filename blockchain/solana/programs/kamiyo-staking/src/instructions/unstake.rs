use anchor_lang::prelude::*;

use crate::constants::*;
use crate::errors::StakingError;
use crate::state::{StakePool, UserStake, calculate_tier};

/// Initiate unstaking process
/// Starts 14-day cooldown period before tokens can be withdrawn
/// User loses tier benefits immediately and cannot stake more until withdrawal
#[derive(Accounts)]
pub struct Unstake<'info> {
    /// User initiating unstake
    #[account(mut)]
    pub user: Signer<'info>,

    /// Staking pool
    #[account(
        seeds = [STAKE_POOL_SEED, stake_pool.mint.as_ref()],
        bump = stake_pool.bump,
    )]
    pub stake_pool: Account<'info, StakePool>,

    /// User stake account
    #[account(
        mut,
        seeds = [USER_STAKE_SEED, stake_pool.key().as_ref(), user.key().as_ref()],
        bump = user_stake.bump,
        constraint = user_stake.owner == user.key() @ StakingError::Unauthorized
    )]
    pub user_stake: Account<'info, UserStake>,
}

pub fn handler(ctx: Context<Unstake>, amount: u64) -> Result<()> {
    let stake_pool = &ctx.accounts.stake_pool;
    let user_stake = &mut ctx.accounts.user_stake;
    let clock = Clock::get()?;

    // Validation checks
    require!(amount > 0, StakingError::InvalidAmount);
    require!(user_stake.staked_amount >= amount, StakingError::InsufficientStake);
    require!(!user_stake.is_in_cooldown(), StakingError::CooldownAlreadyActive);

    // Calculate cooldown end timestamp (14 days from now)
    let cooldown_end = clock
        .unix_timestamp
        .checked_add(stake_pool.cooldown_period)
        .ok_or(StakingError::MathOverflow)?;

    // Set cooldown parameters
    user_stake.cooldown_end = Some(cooldown_end);
    user_stake.cooldown_amount = amount;

    // User immediately loses tier benefits during cooldown
    // Deduct the unstaking amount from staked_amount for tier calculation
    let active_stake = user_stake
        .staked_amount
        .checked_sub(amount)
        .ok_or(StakingError::CalculationUnderflow)?;

    let old_tier = user_stake.tier;
    user_stake.tier = calculate_tier(active_stake);

    // Emit event
    emit!(UnstakeEvent {
        user: ctx.accounts.user.key(),
        amount,
        cooldown_end,
        old_tier,
        new_tier: user_stake.tier,
        timestamp: clock.unix_timestamp,
    });

    msg!("Initiated unstake of {} KAMIYO", amount as f64 / 1e9);
    msg!("Cooldown ends at: {} (Unix timestamp)", cooldown_end);
    msg!("Tier downgraded from {:?} to {:?}", old_tier, user_stake.tier);
    msg!("You can withdraw after {} days", stake_pool.cooldown_period / 86400);

    Ok(())
}

/// Event emitted when user initiates unstaking
#[event]
pub struct UnstakeEvent {
    pub user: Pubkey,
    pub amount: u64,
    pub cooldown_end: i64,
    pub old_tier: crate::state::Tier,
    pub new_tier: crate::state::Tier,
    pub timestamp: i64,
}
