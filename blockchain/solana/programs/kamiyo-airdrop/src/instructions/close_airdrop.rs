use anchor_lang::prelude::*;

use crate::constants::AIRDROP_SEED;
use crate::errors::AirdropError;
use crate::state::{AirdropConfig, CloseAirdropEvent};

/// Close the airdrop and cleanup accounts
///
/// This instruction closes the AirdropConfig account after the airdrop is complete.
/// It should only be called after:
/// 1. Claim period has expired
/// 2. Unclaimed tokens have been reclaimed (vault is empty)
///
/// Closing the account returns rent to the admin.
///
/// # Security
/// - Only admin can call this
/// - Airdrop must be inactive (set by reclaim_unclaimed)
/// - Emits final statistics
///
/// # Note
/// Individual ClaimStatus accounts are NOT closed to maintain historical record
pub fn close_airdrop(ctx: Context<CloseAirdrop>) -> Result<()> {
    let config = &ctx.accounts.airdrop_config;
    let clock = Clock::get()?;

    // Check authorization
    require!(
        ctx.accounts.admin.key() == config.admin,
        AirdropError::Unauthorized
    );

    // Check airdrop is inactive (tokens already reclaimed)
    require!(!config.is_active, AirdropError::AirdropInactive);

    // Emit final statistics event
    emit!(CloseAirdropEvent {
        admin: ctx.accounts.admin.key(),
        total_claimed: config.total_claimed,
        total_claimants: config.total_claimants,
        timestamp: clock.unix_timestamp,
    });

    msg!("Airdrop closed");
    msg!("Total claimed: {} lamports ({} KAMIYO)",
        config.total_claimed,
        config.total_claimed / 1_000_000_000
    );
    msg!("Total claimants: {}", config.total_claimants);
    msg!(
        "Claim rate: {:.2}%",
        (config.total_claimed as f64 / config.total_allocation as f64) * 100.0
    );

    // Account will be closed automatically via close constraint
    Ok(())
}

/// Accounts required for close_airdrop instruction
#[derive(Accounts)]
pub struct CloseAirdrop<'info> {
    /// Admin authority who controls the airdrop
    #[account(
        mut,
        constraint = admin.key() == airdrop_config.admin @ AirdropError::Unauthorized
    )]
    pub admin: Signer<'info>,

    /// Airdrop configuration account (PDA) - will be closed
    #[account(
        mut,
        seeds = [AIRDROP_SEED, airdrop_config.mint.as_ref()],
        bump = airdrop_config.bump,
        close = admin,  // Return rent to admin
        constraint = !airdrop_config.is_active @ AirdropError::AirdropInactive
    )]
    pub airdrop_config: Account<'info, AirdropConfig>,
}
