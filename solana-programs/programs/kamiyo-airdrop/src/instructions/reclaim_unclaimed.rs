use anchor_lang::prelude::*;
use anchor_spl::token_interface::{transfer_checked, Mint, TokenAccount, TokenInterface, TransferChecked};

use crate::constants::*;
use crate::errors::AirdropError;
use crate::state::{AirdropConfig, ReclaimEvent};

/// Reclaim unclaimed tokens after the 90-day claim period expires
///
/// After the claim window closes, the admin can reclaim all unclaimed tokens
/// and return them to the treasury. This ensures tokens don't sit idle forever.
///
/// # Security
/// - Only admin can call this
/// - Can only be called after claim period expires (90 days)
/// - Transfers all remaining vault balance to admin's token account
/// - Marks airdrop as inactive
///
/// # Note
/// Estimated 10-15% of airdropped tokens go unclaimed in typical airdrops
pub fn reclaim_unclaimed(ctx: Context<ReclaimUnclaimed>) -> Result<()> {
    let config = &mut ctx.accounts.airdrop_config;
    let clock = Clock::get()?;

    // Check authorization
    require!(
        ctx.accounts.admin.key() == config.admin,
        AirdropError::Unauthorized
    );

    // Check claim period has expired
    require!(
        clock.unix_timestamp > config.claim_end,
        AirdropError::ClaimWindowStillActive
    );

    // Get remaining vault balance
    let remaining_balance = ctx.accounts.vault.amount;

    // Transfer all remaining tokens to admin
    let seeds = &[
        VAULT_AUTHORITY_SEED,
        config.key().as_ref(),
        &[ctx.bumps.vault_authority],
    ];
    let signer_seeds = &[&seeds[..]];

    let decimals = ctx.accounts.mint.decimals;

    transfer_checked(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            TransferChecked {
                from: ctx.accounts.vault.to_account_info(),
                mint: ctx.accounts.mint.to_account_info(),
                to: ctx.accounts.admin_token_account.to_account_info(),
                authority: ctx.accounts.vault_authority.to_account_info(),
            },
            signer_seeds,
        ),
        remaining_balance,
        decimals,
    )?;

    // Mark airdrop as inactive
    config.is_active = false;

    // Emit reclaim event
    emit!(ReclaimEvent {
        admin: ctx.accounts.admin.key(),
        amount: remaining_balance,
        timestamp: clock.unix_timestamp,
    });

    msg!("Unclaimed tokens reclaimed");
    msg!("Amount reclaimed: {} lamports ({} KAMIYO)", remaining_balance, remaining_balance / 1_000_000_000);
    msg!("Total claimed: {} lamports", config.total_claimed);
    msg!("Claim rate: {:.2}%", (config.total_claimed as f64 / config.total_allocation as f64) * 100.0);

    Ok(())
}

/// Accounts required for reclaim_unclaimed instruction
#[derive(Accounts)]
pub struct ReclaimUnclaimed<'info> {
    /// Admin authority who controls the airdrop
    #[account(
        constraint = admin.key() == airdrop_config.admin @ AirdropError::Unauthorized
    )]
    pub admin: Signer<'info>,

    /// Airdrop configuration account (PDA)
    #[account(
        mut,
        seeds = [AIRDROP_SEED, mint.key().as_ref()],
        bump = airdrop_config.bump,
    )]
    pub airdrop_config: Account<'info, AirdropConfig>,

    /// Vault authority (PDA) that controls the token vault
    /// CHECK: PDA used as signer for vault transfers
    #[account(
        seeds = [VAULT_AUTHORITY_SEED, airdrop_config.key().as_ref()],
        bump
    )]
    pub vault_authority: UncheckedAccount<'info>,

    /// Token vault to drain
    #[account(
        mut,
        constraint = vault.mint == mint.key() @ AirdropError::InvalidMint,
        constraint = vault.owner == vault_authority.key(),
    )]
    pub vault: InterfaceAccount<'info, TokenAccount>,

    /// Admin's token account to receive reclaimed tokens
    #[account(
        mut,
        constraint = admin_token_account.mint == mint.key() @ AirdropError::InvalidMint,
        constraint = admin_token_account.owner == admin.key(),
    )]
    pub admin_token_account: InterfaceAccount<'info, TokenAccount>,

    /// KAMIYO token mint (Token-2022)
    pub mint: InterfaceAccount<'info, Mint>,

    /// Token program (Token-2022)
    pub token_program: Interface<'info, TokenInterface>,
}
