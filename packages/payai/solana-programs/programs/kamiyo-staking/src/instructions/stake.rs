use anchor_lang::prelude::*;
use anchor_spl::token_2022::{self, Token2022, Transfer as Transfer2022};
use anchor_spl::token_interface::{Mint, TokenAccount};

use crate::constants::*;
use crate::errors::StakingError;
use crate::state::{StakePool, UserStake, calculate_tier, calculate_rewards};

/// Stake KAMIYO tokens into the pool
/// Creates or updates user stake position and calculates tier
#[derive(Accounts)]
pub struct Stake<'info> {
    /// User staking tokens
    #[account(mut)]
    pub user: Signer<'info>,

    /// Staking pool
    #[account(
        mut,
        seeds = [STAKE_POOL_SEED, mint.key().as_ref()],
        bump = stake_pool.bump,
    )]
    pub stake_pool: Account<'info, StakePool>,

    /// User stake account (PDA, init_if_needed)
    #[account(
        init_if_needed,
        payer = user,
        space = UserStake::LEN,
        seeds = [USER_STAKE_SEED, stake_pool.key().as_ref(), user.key().as_ref()],
        bump
    )]
    pub user_stake: Account<'info, UserStake>,

    /// User's token account (source of stake)
    #[account(
        mut,
        constraint = user_token_account.mint == mint.key() @ StakingError::MintMismatch,
        constraint = user_token_account.owner == user.key() @ StakingError::InvalidTokenAccountOwner
    )]
    pub user_token_account: InterfaceAccount<'info, TokenAccount>,

    /// Stake vault (receives staked tokens)
    #[account(
        mut,
        seeds = [STAKE_VAULT_SEED, stake_pool.key().as_ref()],
        bump = stake_pool.stake_vault_bump,
        constraint = stake_vault.key() == stake_pool.stake_vault @ StakingError::InvalidPDA
    )]
    pub stake_vault: InterfaceAccount<'info, TokenAccount>,

    /// KAMIYO mint
    pub mint: InterfaceAccount<'info, Mint>,

    /// Token-2022 program
    pub token_program: Program<'info, Token2022>,

    /// System program
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<Stake>, amount: u64) -> Result<()> {
    let stake_pool = &mut ctx.accounts.stake_pool;
    let user_stake = &mut ctx.accounts.user_stake;
    let clock = Clock::get()?;

    // Validation checks
    require!(stake_pool.is_active, StakingError::PoolInactive);
    require!(amount > 0, StakingError::InvalidAmount);
    require!(amount >= stake_pool.min_stake_amount, StakingError::BelowMinimumStake);
    require!(!user_stake.is_in_cooldown(), StakingError::CannotStakeDuringCooldown);

    // Check user has sufficient balance
    require!(
        ctx.accounts.user_token_account.amount >= amount,
        StakingError::InsufficientTokenBalance
    );

    // If this is a new stake account, initialize it
    let is_new_staker = user_stake.staked_amount == 0;
    if is_new_staker {
        user_stake.owner = ctx.accounts.user.key();
        user_stake.pool = stake_pool.key();
        user_stake.staked_amount = 0;
        user_stake.total_rewards_earned = 0;
        user_stake.rewards_claimed = 0;
        user_stake.stake_timestamp = clock.unix_timestamp;
        user_stake.last_claim_timestamp = clock.unix_timestamp;
        user_stake.tier = calculate_tier(0);
        user_stake.reward_debt = 0;
        user_stake.cooldown_end = None;
        user_stake.cooldown_amount = 0;
        user_stake.bump = ctx.bumps.user_stake;

        // Increment staker count
        stake_pool.total_stakers = stake_pool
            .total_stakers
            .checked_add(1)
            .ok_or(StakingError::MathOverflow)?;
    } else {
        // Claim any pending rewards before increasing stake
        let time_elapsed = clock.unix_timestamp - user_stake.last_claim_timestamp;
        if time_elapsed > 0 && user_stake.staked_amount > 0 {
            let apy = stake_pool.get_apy_for_tier(user_stake.tier);
            let pending_rewards = calculate_rewards(
                user_stake.staked_amount,
                apy,
                time_elapsed
            );

            if pending_rewards > 0 {
                user_stake.total_rewards_earned = user_stake
                    .total_rewards_earned
                    .checked_add(pending_rewards)
                    .ok_or(StakingError::MathOverflow)?;

                msg!("Accrued {} KAMIYO in rewards before staking", pending_rewards as f64 / 1e9);
            }

            user_stake.last_claim_timestamp = clock.unix_timestamp;
        }
    }

    // Transfer tokens from user to stake vault
    let transfer_ctx = CpiContext::new(
        ctx.accounts.token_program.to_account_info(),
        Transfer2022 {
            from: ctx.accounts.user_token_account.to_account_info(),
            to: ctx.accounts.stake_vault.to_account_info(),
            authority: ctx.accounts.user.to_account_info(),
        },
    );

    token_2022::transfer(transfer_ctx, amount)?;

    // Update user stake amount
    user_stake.staked_amount = user_stake
        .staked_amount
        .checked_add(amount)
        .ok_or(StakingError::MathOverflow)?;

    // Recalculate tier based on new total stake
    let old_tier = user_stake.tier;
    user_stake.tier = calculate_tier(user_stake.staked_amount);

    // Update pool total staked
    stake_pool.total_staked = stake_pool
        .total_staked
        .checked_add(amount)
        .ok_or(StakingError::MathOverflow)?;

    stake_pool.last_update_timestamp = clock.unix_timestamp;

    // Emit event
    emit!(StakeEvent {
        user: ctx.accounts.user.key(),
        amount,
        total_staked: user_stake.staked_amount,
        tier: user_stake.tier,
        old_tier,
        timestamp: clock.unix_timestamp,
    });

    msg!("Staked {} KAMIYO", amount as f64 / 1e9);
    msg!("Total staked: {} KAMIYO", user_stake.staked_amount as f64 / 1e9);
    msg!("Tier: {:?}", user_stake.tier);
    msg!("APY: {}%", stake_pool.get_apy_for_tier(user_stake.tier) as f64 / 100.0);

    Ok(())
}

/// Event emitted when user stakes tokens
#[event]
pub struct StakeEvent {
    pub user: Pubkey,
    pub amount: u64,
    pub total_staked: u64,
    pub tier: crate::state::Tier,
    pub old_tier: crate::state::Tier,
    pub timestamp: i64,
}
