use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};

use crate::constants::*;
use crate::errors::VestingError;
use crate::state::{VaultAuthority, VestingSchedule};
use crate::utils::calculate_claimable_amount;

#[derive(Accounts)]
pub struct ClaimVested<'info> {
    /// Beneficiary claiming vested tokens
    #[account(mut)]
    pub beneficiary: Signer<'info>,

    /// KAMIYO mint (Token-2022)
    #[account(
        mint::token_program = token_program,
    )]
    pub mint: InterfaceAccount<'info, Mint>,

    /// Vesting schedule PDA
    #[account(
        mut,
        seeds = [
            VESTING_SCHEDULE_SEED,
            beneficiary.key().as_ref(),
            mint.key().as_ref(),
        ],
        bump = vesting_schedule.bump,
        constraint = vesting_schedule.beneficiary == beneficiary.key() @ VestingError::UnauthorizedBeneficiary,
        constraint = !vesting_schedule.revoked @ VestingError::ScheduleRevoked,
    )]
    pub vesting_schedule: Account<'info, VestingSchedule>,

    /// Vault authority PDA
    #[account(
        seeds = [
            VAULT_AUTHORITY_SEED,
            vesting_schedule.key().as_ref(),
        ],
        bump = vault_authority.bump,
    )]
    pub vault_authority: Account<'info, VaultAuthority>,

    /// Token vault holding locked tokens
    #[account(
        mut,
        token::mint = mint,
        token::authority = vault_authority,
        token::token_program = token_program,
        constraint = vault.key() == vesting_schedule.vault @ VestingError::InvalidMint,
    )]
    pub vault: InterfaceAccount<'info, TokenAccount>,

    /// Beneficiary's token account (destination)
    #[account(
        mut,
        token::mint = mint,
        token::authority = beneficiary,
        token::token_program = token_program,
    )]
    pub beneficiary_token_account: InterfaceAccount<'info, TokenAccount>,

    /// Token program (Token-2022)
    pub token_program: Interface<'info, TokenInterface>,
}

pub fn handler(ctx: Context<ClaimVested>) -> Result<()> {
    let vesting_schedule = &mut ctx.accounts.vesting_schedule;
    let clock = Clock::get()?;

    // Calculate claimable amount
    let claimable = calculate_claimable_amount(
        vesting_schedule.total_amount,
        vesting_schedule.claimed_amount,
        vesting_schedule.start_time,
        vesting_schedule.cliff_duration,
        vesting_schedule.vesting_duration,
        clock.unix_timestamp,
    )?;

    // Require some tokens to claim
    require!(claimable > 0, VestingError::NothingToClaim);

    // Prepare PDA signer seeds
    let vesting_schedule_key = vesting_schedule.key();
    let vault_authority_bump = ctx.accounts.vault_authority.bump;
    let signer_seeds: &[&[&[u8]]] = &[&[
        VAULT_AUTHORITY_SEED,
        vesting_schedule_key.as_ref(),
        &[vault_authority_bump],
    ]];

    // Transfer vested tokens from vault to beneficiary
    anchor_spl::token_2022::transfer_checked(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            anchor_spl::token_2022::TransferChecked {
                from: ctx.accounts.vault.to_account_info(),
                to: ctx.accounts.beneficiary_token_account.to_account_info(),
                authority: ctx.accounts.vault_authority.to_account_info(),
                mint: ctx.accounts.mint.to_account_info(),
            },
            signer_seeds,
        ),
        claimable,
        ctx.accounts.mint.decimals,
    )?;

    // Update claimed amount
    vesting_schedule.claimed_amount = vesting_schedule
        .claimed_amount
        .checked_add(claimable)
        .ok_or(VestingError::Overflow)?;

    // Emit event
    emit!(ClaimEvent {
        vesting_schedule: vesting_schedule.key(),
        beneficiary: vesting_schedule.beneficiary,
        amount: claimable,
        total_claimed: vesting_schedule.claimed_amount,
        timestamp: clock.unix_timestamp,
    });

    msg!(
        "Beneficiary {} claimed {} tokens (total claimed: {})",
        ctx.accounts.beneficiary.key(),
        claimable,
        vesting_schedule.claimed_amount
    );

    Ok(())
}

/// Event emitted when tokens are claimed
#[event]
pub struct ClaimEvent {
    pub vesting_schedule: Pubkey,
    pub beneficiary: Pubkey,
    pub amount: u64,
    pub total_claimed: u64,
    pub timestamp: i64,
}
