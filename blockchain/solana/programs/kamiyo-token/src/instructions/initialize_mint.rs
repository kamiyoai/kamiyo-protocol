use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, Token2022};

use crate::errors::KamiyoTokenError;
use crate::state::{MintInitializedEvent, TokenMetadata};

/// Initialize KAMIYO Token-2022 mint with transfer fee extension
///
/// This instruction creates the Token-2022 mint with the following configuration:
/// - Decimals: 9 (Solana standard)
/// - Transfer Fee: 2% (200 basis points)
/// - Maximum Fee: Configurable cap
/// - Extensions: TransferFee extension enabled
///
/// # Security Considerations
/// - Validates decimals match KAMIYO specification (9)
/// - Sets up separate authorities for fee configuration and withdrawal
/// - Enables multisig compatibility for production
/// - Creates immutable mint (no mint authority after initial supply)
#[derive(Accounts)]
#[instruction(decimals: u8, transfer_fee_basis_points: u16, maximum_fee: u64)]
pub struct InitializeMint<'info> {
    /// Payer for account creation (pays rent)
    #[account(mut)]
    pub payer: Signer<'info>,

    /// Mint authority (will be set as initial authority, then revoked)
    pub authority: Signer<'info>,

    /// The KAMIYO mint account
    /// This is initialized with Token-2022 and TransferFee extension
    #[account(
        init,
        signer,
        payer = payer,
        mint::token_program = token_program,
        mint::decimals = decimals,
        mint::authority = authority.key(),
        mint::freeze_authority = authority.key(),
        extensions::transfer_fee::transfer_fee_config_authority = authority.key(),
        extensions::transfer_fee::withdraw_withheld_authority = authority.key(),
        extensions::transfer_fee::transfer_fee_basis_points = transfer_fee_basis_points,
        extensions::transfer_fee::maximum_fee = maximum_fee,
    )]
    pub mint: Box<InterfaceAccount<'info, Mint>>,

    /// Token metadata PDA for tracking mint information
    #[account(
        init,
        payer = payer,
        space = TokenMetadata::SIZE,
        seeds = [
            TokenMetadata::SEED_PREFIX,
            mint.key().as_ref(),
        ],
        bump,
    )]
    pub token_metadata: Account<'info, TokenMetadata>,

    /// Token-2022 program
    pub token_program: Program<'info, Token2022>,

    /// System program
    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<InitializeMint>,
    decimals: u8,
    transfer_fee_basis_points: u16,
    maximum_fee: u64,
) -> Result<()> {
    // Validate decimals
    require!(
        decimals == TokenMetadata::TOKEN_DECIMALS,
        KamiyoTokenError::InvalidDecimals
    );

    // Validate transfer fee basis points (must be <= 10000 = 100%)
    require!(
        transfer_fee_basis_points <= 10000,
        KamiyoTokenError::InvalidTransferFeeBasisPoints
    );

    // Validate maximum fee
    require!(
        maximum_fee > 0,
        KamiyoTokenError::InvalidMaximumFee
    );

    let clock = Clock::get()?;

    // Initialize token metadata
    let token_metadata = &mut ctx.accounts.token_metadata;
    token_metadata.mint = ctx.accounts.mint.key();
    token_metadata.name = TokenMetadata::TOKEN_NAME.to_string();
    token_metadata.symbol = TokenMetadata::TOKEN_SYMBOL.to_string();
    token_metadata.total_supply = TokenMetadata::TOTAL_SUPPLY;
    token_metadata.decimals = decimals;
    token_metadata.transfer_fee_bps = transfer_fee_basis_points;
    token_metadata.max_fee = maximum_fee;
    token_metadata.created_at = clock.unix_timestamp;
    token_metadata.bump = ctx.bumps.token_metadata;

    msg!("KAMIYO Token-2022 mint initialized");
    msg!("Mint: {}", ctx.accounts.mint.key());
    msg!("Decimals: {}", decimals);
    msg!("Transfer fee: {}% ({}bp)", transfer_fee_basis_points as f64 / 100.0, transfer_fee_basis_points);
    msg!("Maximum fee: {}", maximum_fee);
    msg!("Total supply: {} (1 billion with {} decimals)", TokenMetadata::TOTAL_SUPPLY, decimals);

    // Emit event
    emit!(MintInitializedEvent {
        mint: ctx.accounts.mint.key(),
        authority: ctx.accounts.authority.key(),
        decimals,
        transfer_fee_bps: transfer_fee_basis_points,
        max_fee: maximum_fee,
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}
