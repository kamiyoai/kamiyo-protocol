use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};

use crate::constants::*;
use crate::errors::VestingError;
use crate::state::{VaultAuthority, VestingSchedule};
use crate::utils::{calculate_unvested_amount, calculate_vested_amount};

#[derive(Accounts)]
pub struct RevokeVesting<'info> {
    /// Admin revoking the vesting schedule
    #[account(mut)]
    pub admin: Signer<'info>,

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
            vesting_schedule.beneficiary.as_ref(),
            mint.key().as_ref(),
        ],
        bump = vesting_schedule.bump,
        constraint = vesting_schedule.admin == admin.key() @ VestingError::UnauthorizedAdmin,
        constraint = !vesting_schedule.revoked @ VestingError::AlreadyRevoked,
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
    )]
    pub vault: InterfaceAccount<'info, TokenAccount>,

    /// Admin's token account (receives unvested tokens)
    #[account(
        mut,
        token::mint = mint,
        token::authority = admin,
        token::token_program = token_program,
    )]
    pub admin_token_account: InterfaceAccount<'info, TokenAccount>,

    /// Token program (Token-2022)
    pub token_program: Interface<'info, TokenInterface>,
}

pub fn handler(ctx: Context<RevokeVesting>) -> Result<()> {
    let vesting_schedule = &mut ctx.accounts.vesting_schedule;
    let clock = Clock::get()?;

    // Calculate vested amount (beneficiary keeps this)
    let vested_amount = calculate_vested_amount(
        vesting_schedule.total_amount,
        vesting_schedule.start_time,
        vesting_schedule.cliff_duration,
        vesting_schedule.vesting_duration,
        clock.unix_timestamp,
    )?;

    // Calculate unvested amount (admin reclaims this)
    let unvested_amount = calculate_unvested_amount(
        vesting_schedule.total_amount,
        vesting_schedule.start_time,
        vesting_schedule.cliff_duration,
        vesting_schedule.vesting_duration,
        clock.unix_timestamp,
    )?;

    // If there are unvested tokens, transfer them back to admin
    if unvested_amount > 0 {
        // Prepare PDA signer seeds
        let vesting_schedule_key = vesting_schedule.key();
        let vault_authority_bump = ctx.accounts.vault_authority.bump;
        let signer_seeds: &[&[&[u8]]] = &[&[
            VAULT_AUTHORITY_SEED,
            vesting_schedule_key.as_ref(),
            &[vault_authority_bump],
        ]];

        // Transfer unvested tokens from vault to admin
        anchor_spl::token_2022::transfer_checked(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                anchor_spl::token_2022::TransferChecked {
                    from: ctx.accounts.vault.to_account_info(),
                    to: ctx.accounts.admin_token_account.to_account_info(),
                    authority: ctx.accounts.vault_authority.to_account_info(),
                    mint: ctx.accounts.mint.to_account_info(),
                },
                signer_seeds,
            ),
            unvested_amount,
            ctx.accounts.mint.decimals,
        )?;
    }

    // Mark as revoked and update total amount to only vested portion
    vesting_schedule.revoked = true;
    vesting_schedule.total_amount = vested_amount;

    // Emit event
    emit!(RevokeEvent {
        vesting_schedule: vesting_schedule.key(),
        beneficiary: vesting_schedule.beneficiary,
        vested_kept: vested_amount,
        unvested_returned: unvested_amount,
        timestamp: clock.unix_timestamp,
    });

    msg!(
        "Revoked vesting schedule. Beneficiary keeps {} vested, admin reclaims {} unvested",
        vested_amount,
        unvested_amount
    );

    Ok(())
}

/// Event emitted when a vesting schedule is revoked
#[event]
pub struct RevokeEvent {
    pub vesting_schedule: Pubkey,
    pub beneficiary: Pubkey,
    pub vested_kept: u64,
    pub unvested_returned: u64,
    pub timestamp: i64,
}
