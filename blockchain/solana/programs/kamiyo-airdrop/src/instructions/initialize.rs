use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};

use crate::constants::*;
use crate::errors::AirdropError;
use crate::state::AirdropConfig;

/// Initialize the airdrop program with merkle root and claim period
///
/// This instruction creates the AirdropConfig account and sets up the airdrop parameters.
/// The admin must have already created a token vault and funded it with 100M KAMIYO tokens.
///
/// # Arguments
/// * `merkle_root` - 32-byte merkle root hash from the off-chain eligibility tree
///
/// # Security
/// - Only callable once (init constraint)
/// - Validates mint is correct KAMIYO token
/// - Sets claim period to 90 days from current timestamp
pub fn initialize(
    ctx: Context<Initialize>,
    merkle_root: [u8; 32],
) -> Result<()> {
    let config = &mut ctx.accounts.airdrop_config;
    let clock = Clock::get()?;

    // Set configuration
    config.admin = ctx.accounts.admin.key();
    config.mint = ctx.accounts.mint.key();
    config.vault = ctx.accounts.vault.key();
    config.merkle_root = merkle_root;
    config.claim_start = clock.unix_timestamp;
    config.claim_end = clock.unix_timestamp
        .checked_add(CLAIM_PERIOD_SECONDS)
        .ok_or(AirdropError::MathOverflow)?;
    config.total_allocation = TOTAL_AIRDROP_ALLOCATION;
    config.total_claimed = 0;
    config.total_claimants = 0;
    config.is_active = true;
    config.bump = ctx.bumps.airdrop_config;

    msg!("Airdrop initialized");
    msg!("Merkle root: {:?}", merkle_root);
    msg!("Claim start: {}", config.claim_start);
    msg!("Claim end: {}", config.claim_end);
    msg!("Total allocation: {} lamports", config.total_allocation);

    Ok(())
}

/// Accounts required for initialize instruction
#[derive(Accounts)]
pub struct Initialize<'info> {
    /// Admin authority who controls the airdrop
    #[account(mut)]
    pub admin: Signer<'info>,

    /// Airdrop configuration account (PDA)
    /// Seeds: [b"airdrop", mint.key()]
    #[account(
        init,
        payer = admin,
        space = AirdropConfig::LEN,
        seeds = [AIRDROP_SEED, mint.key().as_ref()],
        bump
    )]
    pub airdrop_config: Account<'info, AirdropConfig>,

    /// KAMIYO token mint (Token-2022)
    pub mint: InterfaceAccount<'info, Mint>,

    /// Token vault holding the 100M KAMIYO for distribution
    /// Must be owned by the vault_authority PDA
    #[account(
        constraint = vault.mint == mint.key() @ AirdropError::InvalidMint,
        constraint = vault.amount >= TOTAL_AIRDROP_ALLOCATION @ AirdropError::InsufficientVaultBalance,
    )]
    pub vault: InterfaceAccount<'info, TokenAccount>,

    /// System program for account creation
    pub system_program: Program<'info, System>,

    /// Token program (Token-2022)
    pub token_program: Interface<'info, TokenInterface>,
}
