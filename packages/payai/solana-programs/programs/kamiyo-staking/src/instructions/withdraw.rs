use anchor_lang::prelude::*;
use anchor_spl::token_2022::{self, Token2022, Transfer as Transfer2022};
use anchor_spl::token_interface::{Mint, TokenAccount};

use crate::constants::*;
use crate::errors::StakingError;
use crate::state::{StakePool, UserStake};

/// Complete unstaking and withdraw tokens
/// Called after cooldown period has elapsed
/// Transfers staked tokens back to user
#[derive(Accounts)]
pub struct Withdraw<'info> {
    /// User withdrawing tokens
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

    /// User's token account (receives unstaked tokens)
    #[account(
        mut,
        constraint = user_token_account.mint == mint.key() @ StakingError::MintMismatch,
        constraint = user_token_account.owner == user.key() @ StakingError::InvalidTokenAccountOwner
    )]
    pub user_token_account: InterfaceAccount<'info, TokenAccount>,

    /// Stake vault (source of staked tokens)
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
}

pub fn handler(ctx: Context<Withdraw>) -> Result<()> {
    let stake_pool = &mut ctx.accounts.stake_pool;
    let user_stake = &mut ctx.accounts.user_stake;
    let clock = Clock::get()?;

    // Validation checks
    require!(user_stake.is_in_cooldown(), StakingError::NoCooldownActive);
    require!(
        user_stake.cooldown_complete(clock.unix_timestamp),
        StakingError::CooldownNotComplete
    );

    let amount = user_stake.cooldown_amount;

    // Check stake vault has sufficient balance (should always be true)
    require!(
        ctx.accounts.stake_vault.amount >= amount,
        StakingError::InsufficientStake
    );

    // Transfer tokens from stake vault to user
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
            from: ctx.accounts.stake_vault.to_account_info(),
            to: ctx.accounts.user_token_account.to_account_info(),
            authority: stake_pool.to_account_info(),
        },
        signer_seeds,
    );

    token_2022::transfer(transfer_ctx, amount)?;

    // Update user stake
    user_stake.staked_amount = user_stake
        .staked_amount
        .checked_sub(amount)
        .ok_or(StakingError::CalculationUnderflow)?;

    user_stake.cooldown_end = None;
    user_stake.cooldown_amount = 0;

    // Update pool total staked
    stake_pool.total_staked = stake_pool
        .total_staked
        .checked_sub(amount)
        .ok_or(StakingError::CalculationUnderflow)?;

    // If user has fully withdrawn, decrement staker count
    let fully_withdrawn = user_stake.staked_amount == 0;
    if fully_withdrawn {
        stake_pool.total_stakers = stake_pool
            .total_stakers
            .checked_sub(1)
            .ok_or(StakingError::CalculationUnderflow)?;
    }

    stake_pool.last_update_timestamp = clock.unix_timestamp;

    // Emit event
    emit!(WithdrawEvent {
        user: ctx.accounts.user.key(),
        amount,
        remaining_staked: user_stake.staked_amount,
        fully_withdrawn,
        timestamp: clock.unix_timestamp,
    });

    msg!("Withdrew {} KAMIYO", amount as f64 / 1e9);
    msg!("Remaining staked: {} KAMIYO", user_stake.staked_amount as f64 / 1e9);

    if fully_withdrawn {
        msg!("User has fully withdrawn all staked tokens");
    }

    Ok(())
}

/// Event emitted when user completes withdrawal
#[event]
pub struct WithdrawEvent {
    pub user: Pubkey,
    pub amount: u64,
    pub remaining_staked: u64,
    pub fully_withdrawn: bool,
    pub timestamp: i64,
}
