use anchor_lang::prelude::*;
use anchor_lang::solana_program::program::invoke;
use anchor_spl::token_interface::{Mint, Token2022};
use spl_token_2022::instruction::{set_authority, AuthorityType as SplAuthorityType};

use crate::errors::KamiyoTokenError;
use crate::state::{AuthorityType, AuthorityUpdatedEvent, TokenMetadata};

/// Update mint or fee authorities
///
/// This instruction transfers authority to a new account (typically a multisig).
/// It supports updating all four authority types:
/// - Mint authority (can mint new tokens)
/// - Freeze authority (can freeze accounts)
/// - Transfer fee config authority (can update fee settings)
/// - Withdraw withheld authority (can withdraw fees)
///
/// # Security Considerations
/// - Requires current authority signature
/// - Can disable authorities by passing None (irreversible)
/// - Enables progressive decentralization (e.g., transfer to 3-of-5 multisig)
/// - All authority changes are logged for transparency
///
/// # Authority Types
/// 0 = MintAuthority
/// 1 = FreezeAuthority
/// 2 = TransferFeeConfigAuthority
/// 3 = WithdrawWithheldAuthority
#[derive(Accounts)]
#[instruction(authority_type: u8)]
pub struct UpdateAuthority<'info> {
    /// Current authority (must match mint's authority for the specified type)
    #[account(mut)]
    pub current_authority: Signer<'info>,

    /// The KAMIYO mint account
    #[account(
        mut,
        constraint = mint.key() == token_metadata.mint @ KamiyoTokenError::InvalidMintAccount,
    )]
    pub mint: Box<InterfaceAccount<'info, Mint>>,

    /// Token metadata PDA
    #[account(
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
    ctx: Context<UpdateAuthority>,
    authority_type: u8,
    new_authority: Option<Pubkey>,
) -> Result<()> {
    // Validate authority type
    let auth_type = AuthorityType::from_u8(authority_type)
        .ok_or(KamiyoTokenError::InvalidAuthorityType)?;

    // Convert to SPL AuthorityType
    let spl_auth_type = match auth_type {
        AuthorityType::MintAuthority => SplAuthorityType::MintTokens,
        AuthorityType::FreezeAuthority => SplAuthorityType::FreezeAccount,
        AuthorityType::TransferFeeConfigAuthority => SplAuthorityType::TransferFeeConfig,
        AuthorityType::WithdrawWithheldAuthority => SplAuthorityType::WithheldWithdraw,
    };

    let clock = Clock::get()?;

    msg!("Updating authority type: {:?}", auth_type);
    msg!("Current authority: {}", ctx.accounts.current_authority.key());
    if let Some(new_auth) = new_authority {
        msg!("New authority: {}", new_auth);
    } else {
        msg!("New authority: None (authority will be revoked)");
    }

    // Create the set_authority instruction
    let set_auth_ix = set_authority(
        &ctx.accounts.token_program.key(),
        &ctx.accounts.mint.key(),
        new_authority.as_ref(),
        spl_auth_type,
        &ctx.accounts.current_authority.key(),
        &[],
    )
    .map_err(|_| KamiyoTokenError::Unauthorized)?;

    // Invoke the Token-2022 program
    invoke(
        &set_auth_ix,
        &[
            ctx.accounts.mint.to_account_info(),
            ctx.accounts.current_authority.to_account_info(),
        ],
    )?;

    msg!("Authority updated successfully");

    // Emit event
    emit!(AuthorityUpdatedEvent {
        mint: ctx.accounts.mint.key(),
        authority_type,
        old_authority: Some(ctx.accounts.current_authority.key()),
        new_authority,
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}
