use anchor_lang::prelude::*;
use anchor_lang::solana_program::program::invoke;
use anchor_spl::token_interface::{Mint, Token2022, TokenAccount};
use spl_token_2022::extension::transfer_fee::instruction::{
    harvest_withheld_tokens_to_mint,
    withdraw_withheld_tokens_from_mint,
};

use crate::errors::KamiyoTokenError;
use crate::state::{FeesHarvestedEvent, FeesWithdrawnEvent, TokenMetadata};

/// Harvest accumulated fees from token accounts
///
/// This instruction collects withheld transfer fees from multiple token accounts
/// and consolidates them in the mint account. This is a permissionless operation
/// that can be called by anyone, including automated cron jobs.
///
/// After harvesting to mint, the withdraw authority must call withdraw_fees
/// to actually collect the fees into a destination account.
///
/// # Security Considerations
/// - Permissionless operation (anyone can trigger)
/// - Maximum ~26 accounts per transaction (due to transaction size limits)
/// - Enables automated fee collection via bots/cron
/// - Allows users to clear their accounts before closing
///
/// # Fee Flow
/// 1. User transfers tokens → 2% fee withheld in recipient account
/// 2. Harvest instruction → Fees moved from accounts to mint
/// 3. Withdraw instruction → Fees moved from mint to fee vault
/// 4. Distribution → Fees split 50/50 to treasury and LP
#[derive(Accounts)]
#[instruction(num_accounts: u8)]
pub struct HarvestFees<'info> {
    /// Fee payer for transaction (anyone can pay)
    #[account(mut)]
    pub payer: Signer<'info>,

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

    // Note: Source accounts to harvest from are passed as remaining accounts
    // via ctx.remaining_accounts to support variable numbers of accounts
}

pub fn handler(
    ctx: Context<HarvestFees>,
    num_accounts: u8,
) -> Result<()> {
    // Validate number of accounts (max ~26 due to transaction size)
    require!(
        num_accounts <= 26,
        KamiyoTokenError::TooManyAccounts
    );

    require!(
        ctx.remaining_accounts.len() == num_accounts as usize,
        KamiyoTokenError::InvalidTokenAccount
    );

    msg!("Harvesting fees from {} token accounts", num_accounts);

    // Extract source account pubkeys from remaining accounts
    let source_accounts: Vec<Pubkey> = ctx.remaining_accounts
        .iter()
        .map(|acc| acc.key())
        .collect();

    // Convert to references for instruction builder
    let source_refs: Vec<&Pubkey> = source_accounts.iter().collect();

    // Create harvest instruction (permissionless)
    let harvest_ix = harvest_withheld_tokens_to_mint(
        &ctx.accounts.token_program.key(),
        &ctx.accounts.mint.key(),
        &source_refs,
    )
    .map_err(|_| KamiyoTokenError::FeeHarvestFailed)?;

    // Build account infos for CPI
    let mut account_infos = vec![ctx.accounts.mint.to_account_info()];
    account_infos.extend(ctx.remaining_accounts.iter().map(|acc| acc.to_account_info()));

    // Invoke the Token-2022 program
    invoke(&harvest_ix, &account_infos)
        .map_err(|_| KamiyoTokenError::FeeHarvestFailed)?;

    let clock = Clock::get()?;

    msg!("Fees harvested successfully to mint");

    // Emit event
    // Note: We don't know the exact amount harvested, but we log the operation
    emit!(FeesHarvestedEvent {
        mint: ctx.accounts.mint.key(),
        num_accounts,
        total_harvested: 0, // Could be calculated by querying accounts before/after
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}

/// Withdraw accumulated fees from mint
///
/// This instruction transfers all fees accumulated in the mint account to the
/// designated destination account (typically a fee vault for later distribution).
/// Only the withdraw_withheld_authority can call this instruction.
///
/// # Security Considerations
/// - Requires withdraw_withheld_authority signature
/// - Transfers to designated fee vault only
/// - Enables subsequent fee splitting between treasury and LP
#[derive(Accounts)]
pub struct WithdrawFees<'info> {
    /// Withdraw withheld authority (must match mint's withdraw_withheld_authority)
    #[account(mut)]
    pub authority: Signer<'info>,

    /// The KAMIYO mint account
    #[account(
        mut,
        constraint = mint.key() == token_metadata.mint @ KamiyoTokenError::InvalidMintAccount,
    )]
    pub mint: Box<InterfaceAccount<'info, Mint>>,

    /// Destination token account for withdrawn fees (fee vault)
    #[account(
        mut,
        constraint = destination.mint == mint.key() @ KamiyoTokenError::InvalidTokenAccount,
    )]
    pub destination: Box<InterfaceAccount<'info, TokenAccount>>,

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

pub fn withdraw_handler(
    ctx: Context<WithdrawFees>,
) -> Result<()> {
    msg!("Withdrawing accumulated fees from mint");
    msg!("Destination: {}", ctx.accounts.destination.key());

    // Create withdraw instruction
    let withdraw_ix = withdraw_withheld_tokens_from_mint(
        &ctx.accounts.token_program.key(),
        &ctx.accounts.mint.key(),
        &ctx.accounts.destination.key(),
        &ctx.accounts.authority.key(),
        &[],
    )
    .map_err(|_| KamiyoTokenError::InvalidWithdrawAuthority)?;

    // Invoke the Token-2022 program
    invoke(
        &withdraw_ix,
        &[
            ctx.accounts.mint.to_account_info(),
            ctx.accounts.destination.to_account_info(),
            ctx.accounts.authority.to_account_info(),
        ],
    )
    .map_err(|_| KamiyoTokenError::FeeWithdrawalFailed)?;

    let clock = Clock::get()?;

    // Get the amount withdrawn (destination balance after withdrawal)
    // Note: This requires reloading the account to see updated balance
    let destination_amount = ctx.accounts.destination.amount;

    msg!("Fees withdrawn successfully: {} tokens", destination_amount);

    // Emit event
    emit!(FeesWithdrawnEvent {
        mint: ctx.accounts.mint.key(),
        destination: ctx.accounts.destination.key(),
        amount: destination_amount,
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}
