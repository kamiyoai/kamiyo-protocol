use anchor_lang::prelude::*;
use anchor_spl::token_2022::{self, Token2022, Transfer as Transfer2022};
use anchor_spl::token_interface::{Mint, TokenAccount};

use crate::constants::*;
use crate::errors::StakingError;
use crate::state::StakePool;

/// Fund the reward vault with KAMIYO tokens
/// Called by admin to add rewards from platform revenue
/// This is how the staking program is funded (30% of x402 fees)
#[derive(Accounts)]
pub struct FundPool<'info> {
    /// Pool admin (must match pool.admin)
    #[account(mut)]
    pub admin: Signer<'info>,

    /// Staking pool
    #[account(
        seeds = [STAKE_POOL_SEED, mint.key().as_ref()],
        bump = stake_pool.bump,
        constraint = stake_pool.admin == admin.key() @ StakingError::Unauthorized
    )]
    pub stake_pool: Account<'info, StakePool>,

    /// Admin's token account (source of funding)
    #[account(
        mut,
        constraint = admin_token_account.mint == mint.key() @ StakingError::MintMismatch,
        constraint = admin_token_account.owner == admin.key() @ StakingError::InvalidTokenAccountOwner
    )]
    pub admin_token_account: InterfaceAccount<'info, TokenAccount>,

    /// Reward vault (receives funding)
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

pub fn handler(ctx: Context<FundPool>, amount: u64) -> Result<()> {
    let clock = Clock::get()?;

    require!(amount > 0, StakingError::InvalidAmount);

    // Transfer KAMIYO tokens from admin to reward vault
    let transfer_ctx = CpiContext::new(
        ctx.accounts.token_program.to_account_info(),
        Transfer2022 {
            from: ctx.accounts.admin_token_account.to_account_info(),
            to: ctx.accounts.reward_vault.to_account_info(),
            authority: ctx.accounts.admin.to_account_info(),
        },
    );

    token_2022::transfer(transfer_ctx, amount)?;

    // Emit event for transparency
    emit!(FundPoolEvent {
        admin: ctx.accounts.admin.key(),
        amount,
        reward_vault_balance: ctx.accounts.reward_vault.amount + amount,
        timestamp: clock.unix_timestamp,
    });

    msg!("Funded reward vault with {} KAMIYO", amount as f64 / 1e9);
    msg!("New reward vault balance: {} KAMIYO", (ctx.accounts.reward_vault.amount + amount) as f64 / 1e9);

    Ok(())
}

/// Event emitted when pool is funded with rewards
#[event]
pub struct FundPoolEvent {
    pub admin: Pubkey,
    pub amount: u64,
    pub reward_vault_balance: u64,
    pub timestamp: i64,
}
