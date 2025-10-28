use anchor_lang::prelude::*;
use anchor_spl::token_interface::{
    close_account, CloseAccount, Mint, TokenAccount, TokenInterface,
};

use crate::constants::*;
use crate::errors::VestingError;
use crate::state::{VaultAuthority, VestingSchedule};

#[derive(Accounts)]
pub struct CloseSchedule<'info> {
    /// Beneficiary closing the schedule (receives rent refund)
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
        constraint = vesting_schedule.claimed_amount >= vesting_schedule.total_amount @ VestingError::ScheduleNotFullyClaimed,
        close = beneficiary,
    )]
    pub vesting_schedule: Account<'info, VestingSchedule>,

    /// Vault authority PDA
    #[account(
        mut,
        seeds = [
            VAULT_AUTHORITY_SEED,
            vesting_schedule.key().as_ref(),
        ],
        bump = vault_authority.bump,
        close = beneficiary,
    )]
    pub vault_authority: Account<'info, VaultAuthority>,

    /// Token vault (should be empty)
    #[account(
        mut,
        token::mint = mint,
        token::authority = vault_authority,
        token::token_program = token_program,
    )]
    pub vault: InterfaceAccount<'info, TokenAccount>,

    /// Token program (Token-2022)
    pub token_program: Interface<'info, TokenInterface>,
}

pub fn handler(ctx: Context<CloseSchedule>) -> Result<()> {
    let vesting_schedule = &ctx.accounts.vesting_schedule;
    let vault = &ctx.accounts.vault;

    // Ensure vault is empty (all tokens claimed)
    require!(
        vault.amount == 0,
        VestingError::InsufficientVaultBalance
    );

    // Prepare PDA signer seeds for vault authority
    let vesting_schedule_key = vesting_schedule.key();
    let vault_authority_bump = ctx.accounts.vault_authority.bump;
    let signer_seeds: &[&[&[u8]]] = &[&[
        VAULT_AUTHORITY_SEED,
        vesting_schedule_key.as_ref(),
        &[vault_authority_bump],
    ]];

    // Close vault token account (refund rent to beneficiary)
    close_account(CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        CloseAccount {
            account: ctx.accounts.vault.to_account_info(),
            destination: ctx.accounts.beneficiary.to_account_info(),
            authority: ctx.accounts.vault_authority.to_account_info(),
        },
        signer_seeds,
    ))?;

    msg!(
        "Closed vesting schedule for {}. Rent refunded.",
        ctx.accounts.beneficiary.key()
    );

    // VestingSchedule and VaultAuthority accounts will be closed automatically
    // via the `close` constraint, refunding rent to beneficiary

    Ok(())
}
