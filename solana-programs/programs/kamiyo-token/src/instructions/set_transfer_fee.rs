use anchor_lang::prelude::*;
use anchor_lang::solana_program::program::invoke;
use anchor_spl::token_interface::{Mint, Token2022};
use spl_token_2022::instruction::set_transfer_fee as spl_set_transfer_fee;

use crate::errors::KamiyoTokenError;
use crate::state::{TokenMetadata, TransferFeeUpdatedEvent};

/// Update transfer fee configuration
///
/// This instruction updates the transfer fee percentage and maximum fee cap.
/// Changes take effect after 2 epoch boundaries to prevent rug pulls and
/// provide transparency to token holders.
///
/// # Security Considerations
/// - Requires transfer_fee_config_authority signature
/// - 2-epoch delay protects users from sudden fee changes
/// - All changes are logged via events for transparency
/// - Validates new fee parameters before applying
///
/// # Timeline
/// Epoch 0: Authority calls set_transfer_fee
/// Epoch 1: Change pending, old fee still active
/// Epoch 2: Change pending, old fee still active
/// Epoch 3: New fee takes effect
#[derive(Accounts)]
pub struct SetTransferFee<'info> {
    /// Transfer fee config authority (must match mint's transfer_fee_config_authority)
    #[account(mut)]
    pub authority: Signer<'info>,

    /// The KAMIYO mint account
    #[account(
        mut,
        constraint = mint.key() == token_metadata.mint @ KamiyoTokenError::InvalidMintAccount,
    )]
    pub mint: Box<InterfaceAccount<'info, Mint>>,

    /// Token metadata PDA
    #[account(
        mut,
        seeds = [
            TokenMetadata::SEED_PREFIX,
            mint.key().as_ref(),
        ],
        bump = token_metadata.bump,
    )]
    pub token_metadata: Account<'info, TokenMetadata>,

    /// Token-2022 program
    pub token_program: Program<'info, Token2022>,
}

pub fn handler(
    ctx: Context<SetTransferFee>,
    new_transfer_fee_basis_points: u16,
    new_maximum_fee: u64,
) -> Result<()> {
    // Validate new transfer fee basis points
    require!(
        new_transfer_fee_basis_points <= 10000,
        KamiyoTokenError::InvalidTransferFeeBasisPoints
    );

    // Validate new maximum fee
    require!(
        new_maximum_fee > 0,
        KamiyoTokenError::InvalidMaximumFee
    );

    let clock = Clock::get()?;
    let token_metadata = &mut ctx.accounts.token_metadata;

    // Store old values for event
    let old_fee_bps = token_metadata.transfer_fee_bps;
    let old_max_fee = token_metadata.max_fee;

    msg!("Updating transfer fee configuration");
    msg!("Old fee: {}% ({}bp), max: {}", old_fee_bps as f64 / 100.0, old_fee_bps, old_max_fee);
    msg!("New fee: {}% ({}bp), max: {}", new_transfer_fee_basis_points as f64 / 100.0, new_transfer_fee_basis_points, new_maximum_fee);
    msg!("Change will take effect after 2 epoch boundaries");

    // Create the set_transfer_fee instruction
    let set_fee_ix = spl_set_transfer_fee(
        &ctx.accounts.token_program.key(),
        &ctx.accounts.mint.key(),
        &ctx.accounts.authority.key(),
        &[],
        new_transfer_fee_basis_points,
        new_maximum_fee,
    )
    .map_err(|_| KamiyoTokenError::InvalidFeeConfigAuthority)?;

    // Invoke the Token-2022 program
    invoke(
        &set_fee_ix,
        &[
            ctx.accounts.mint.to_account_info(),
            ctx.accounts.authority.to_account_info(),
        ],
    )?;

    // Update metadata
    token_metadata.transfer_fee_bps = new_transfer_fee_basis_points;
    token_metadata.max_fee = new_maximum_fee;

    msg!("Transfer fee configuration updated successfully");

    // Emit event
    emit!(TransferFeeUpdatedEvent {
        mint: ctx.accounts.mint.key(),
        old_fee_bps,
        new_fee_bps: new_transfer_fee_basis_points,
        old_max_fee,
        new_max_fee: new_maximum_fee,
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}
