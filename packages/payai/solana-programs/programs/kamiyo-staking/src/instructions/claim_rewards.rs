use anchor_lang::prelude::*;
use anchor_spl::token_2022::{self, Token2022, Transfer as Transfer2022};
use anchor_spl::token_interface::{Mint, TokenAccount};

use crate::constants::*;
use crate::errors::StakingError;
use crate::state::{StakePool, UserStake, calculate_rewards};

/// Claim accrued staking rewards
/// Transfers KAMIYO rewards from reward vault to user
#[derive(Accounts)]
pub struct ClaimRewards<'info> {
    /// User claiming rewards
    #[account(mut)]
    pub user: Signer<'info>,

    /// Staking pool
    #[account(
        mut,
        seeds = [STAKE_POOL_SEED, mint.key().as_ref()],
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

    /// User's token account (receives rewards)
    #[account(
        mut,
        constraint = user_token_account.mint == mint.key() @ StakingError::MintMismatch,
        constraint = user_token_account.owner == user.key() @ StakingError::InvalidTokenAccountOwner
    )]
    pub user_token_account: InterfaceAccount<'info, TokenAccount>,

    /// Reward vault (source of rewards)
    #[account(
        mut,
        seeds = [REWARD_VAULT_SEED, stake_pool.key().as_ref()],
        bump = stake_pool.reward_vault_bump,
        constraint = reward_vault.key() == stake_pool.reward_vault @ StakingError::InvalidPDA
    )]
    pub reward_vault: InterfaceAccount<'info, TokenAccount>,

    /// KAMIYO mint
    pub mint: InterfaceAccount<'info, Mint>,

    /// Token-2022 program
    pub token_program: Program<'info, Token2022>,
}

pub fn handler(ctx: Context<ClaimRewards>) -> Result<()> {
    let stake_pool = &ctx.accounts.stake_pool;
    let user_stake = &mut ctx.accounts.user_stake;
    let clock = Clock::get()?;

    require!(stake_pool.is_active, StakingError::PoolInactive);
    require!(user_stake.staked_amount > 0, StakingError::NoTokensStaked);

    // Calculate time-based rewards since last claim
    let time_elapsed = clock
        .unix_timestamp
        .checked_sub(user_stake.last_claim_timestamp)
        .ok_or(StakingError::CalculationUnderflow)?;

    require!(time_elapsed >= 0, StakingError::InvalidTimestamp);

    let apy = stake_pool.get_apy_for_tier(user_stake.tier);
    let new_rewards = calculate_rewards(
        user_stake.staked_amount,
        apy,
        time_elapsed
    );

    // Add new rewards to total
    if new_rewards > 0 {
        user_stake.total_rewards_earned = user_stake
            .total_rewards_earned
            .checked_add(new_rewards)
            .ok_or(StakingError::MathOverflow)?;
    }

    // Calculate total claimable rewards
    let claimable = user_stake.unclaimed_rewards();
    require!(claimable > 0, StakingError::NoRewardsToClaim);

    // Check reward vault has sufficient balance
    require!(
        ctx.accounts.reward_vault.amount >= claimable,
        StakingError::InsufficientRewardFunds
    );

    // Transfer rewards from reward vault to user
    // Use PDA signer seeds for stake pool authority
    let mint_key = stake_pool.mint;
    let seeds = &[
        STAKE_POOL_SEED,
        mint_key.as_ref(),
        &[stake_pool.bump],
    ];
    let signer_seeds = &[&seeds[..]];

    let transfer_ctx = CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        Transfer2022 {
            from: ctx.accounts.reward_vault.to_account_info(),
            to: ctx.accounts.user_token_account.to_account_info(),
            authority: stake_pool.to_account_info(),
        },
        signer_seeds,
    );

    token_2022::transfer(transfer_ctx, claimable)?;

    // Update user stake tracking
    user_stake.rewards_claimed = user_stake
        .rewards_claimed
        .checked_add(claimable)
        .ok_or(StakingError::MathOverflow)?;

    user_stake.last_claim_timestamp = clock.unix_timestamp;

    // Emit event
    emit!(ClaimRewardsEvent {
        user: ctx.accounts.user.key(),
        amount: claimable,
        total_claimed: user_stake.rewards_claimed,
        timestamp: clock.unix_timestamp,
    });

    msg!("Claimed {} KAMIYO in rewards", claimable as f64 / 1e9);
    msg!("Total rewards claimed lifetime: {} KAMIYO", user_stake.rewards_claimed as f64 / 1e9);

    Ok(())
}

/// Event emitted when user claims rewards
#[event]
pub struct ClaimRewardsEvent {
    pub user: Pubkey,
    pub amount: u64,
    pub total_claimed: u64,
    pub timestamp: i64,
}
