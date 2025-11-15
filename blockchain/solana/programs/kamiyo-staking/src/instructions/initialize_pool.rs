use anchor_lang::prelude::*;
use anchor_spl::token_2022::{Token2022};
use anchor_spl::token_interface::{Mint, TokenAccount};

use crate::constants::*;
use crate::errors::StakingError;
use crate::state::StakePool;

/// Initialize the global staking pool
/// Called once by admin to set up the staking system
#[derive(Accounts)]
pub struct InitializePool<'info> {
    /// Pool admin (governance multisig in production)
    #[account(mut)]
    pub admin: Signer<'info>,

    /// KAMIYO token mint (Token-2022)
    pub mint: InterfaceAccount<'info, Mint>,

    /// Staking pool PDA
    #[account(
        init,
        payer = admin,
        space = StakePool::LEN,
        seeds = [STAKE_POOL_SEED, mint.key().as_ref()],
        bump
    )]
    pub stake_pool: Account<'info, StakePool>,

    /// Vault to hold staked tokens (PDA)
    #[account(
        init,
        payer = admin,
        seeds = [STAKE_VAULT_SEED, stake_pool.key().as_ref()],
        bump,
        token::mint = mint,
        token::authority = stake_pool,
        token::token_program = token_program
    )]
    pub stake_vault: InterfaceAccount<'info, TokenAccount>,

    /// Vault to hold reward tokens (PDA)
    #[account(
        init,
        payer = admin,
        seeds = [REWARD_VAULT_SEED, stake_pool.key().as_ref()],
        bump,
        token::mint = mint,
        token::authority = stake_pool,
        token::token_program = token_program
    )]
    pub reward_vault: InterfaceAccount<'info, TokenAccount>,

    /// Token-2022 program
    pub token_program: Program<'info, Token2022>,

    /// System program
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<InitializePool>) -> Result<()> {
    let clock = Clock::get()?;
    let stake_pool = &mut ctx.accounts.stake_pool;

    // Initialize pool with default values from constants
    stake_pool.admin = ctx.accounts.admin.key();
    stake_pool.mint = ctx.accounts.mint.key();
    stake_pool.stake_vault = ctx.accounts.stake_vault.key();
    stake_pool.reward_vault = ctx.accounts.reward_vault.key();

    stake_pool.total_staked = 0;
    stake_pool.total_stakers = 0;

    // Set APY rates from constants (matching Phase 1 spec)
    stake_pool.apy_free = APY_FREE;
    stake_pool.apy_pro = APY_PRO;
    stake_pool.apy_team = APY_TEAM;
    stake_pool.apy_enterprise = APY_ENTERPRISE;

    stake_pool.cooldown_period = COOLDOWN_PERIOD;
    stake_pool.min_stake_amount = MIN_STAKE_AMOUNT;

    stake_pool.created_at = clock.unix_timestamp;
    stake_pool.last_update_timestamp = clock.unix_timestamp;
    stake_pool.reward_per_token_stored = 0;

    stake_pool.is_active = true;

    // Store PDA bumps for future use
    stake_pool.bump = ctx.bumps.stake_pool;
    stake_pool.stake_vault_bump = ctx.bumps.stake_vault;
    stake_pool.reward_vault_bump = ctx.bumps.reward_vault;

    msg!("Staking pool initialized successfully");
    msg!("Admin: {}", stake_pool.admin);
    msg!("Mint: {}", stake_pool.mint);
    msg!("APY rates - Pro: {}%, Team: {}%, Enterprise: {}%",
        APY_PRO / 100,
        APY_TEAM / 100,
        APY_ENTERPRISE / 100
    );
    msg!("Cooldown period: {} days", COOLDOWN_PERIOD / 86400);
    msg!("Minimum stake: {} KAMIYO", MIN_STAKE_AMOUNT / 1_000_000_000);

    Ok(())
}
