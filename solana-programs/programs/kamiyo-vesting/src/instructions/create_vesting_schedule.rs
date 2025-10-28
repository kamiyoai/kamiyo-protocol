use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};

use crate::constants::*;
use crate::errors::VestingError;
use crate::state::{ScheduleType, VaultAuthority, VestingSchedule};

#[derive(Accounts)]
pub struct CreateVestingSchedule<'info> {
    /// Admin creating the vesting schedule
    #[account(mut)]
    pub admin: Signer<'info>,

    /// Beneficiary who will receive vested tokens
    /// CHECK: Beneficiary doesn't need to sign (admin creates on their behalf)
    pub beneficiary: UncheckedAccount<'info>,

    /// KAMIYO mint (Token-2022)
    #[account(
        mint::token_program = token_program,
    )]
    pub mint: InterfaceAccount<'info, Mint>,

    /// Vesting schedule PDA account
    #[account(
        init,
        payer = admin,
        space = VestingSchedule::LEN,
        seeds = [
            VESTING_SCHEDULE_SEED,
            beneficiary.key().as_ref(),
            mint.key().as_ref(),
        ],
        bump
    )]
    pub vesting_schedule: Account<'info, VestingSchedule>,

    /// Vault authority PDA (signs for token transfers)
    #[account(
        init,
        payer = admin,
        space = VaultAuthority::LEN,
        seeds = [
            VAULT_AUTHORITY_SEED,
            vesting_schedule.key().as_ref(),
        ],
        bump
    )]
    pub vault_authority: Account<'info, VaultAuthority>,

    /// Token vault to hold locked tokens
    #[account(
        init,
        payer = admin,
        token::mint = mint,
        token::authority = vault_authority,
        token::token_program = token_program,
    )]
    pub vault: InterfaceAccount<'info, TokenAccount>,

    /// Admin's token account (source of tokens)
    #[account(
        mut,
        token::mint = mint,
        token::authority = admin,
        token::token_program = token_program,
    )]
    pub admin_token_account: InterfaceAccount<'info, TokenAccount>,

    /// Token program (Token-2022)
    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn handler(
    ctx: Context<CreateVestingSchedule>,
    total_amount: u64,
    start_time: i64,
    cliff_duration: i64,
    vesting_duration: i64,
    schedule_type: ScheduleType,
) -> Result<()> {
    let vesting_schedule = &mut ctx.accounts.vesting_schedule;
    let vault_authority = &mut ctx.accounts.vault_authority;
    let clock = Clock::get()?;

    // Validation: Amount must be greater than zero
    require!(total_amount > 0, VestingError::InvalidAmount);

    // Validation: Cliff must be less than total duration
    require!(
        cliff_duration < vesting_duration,
        VestingError::InvalidVestingParameters
    );

    // Validation: Vesting duration must be positive
    require!(
        vesting_duration > 0,
        VestingError::InvalidVestingParameters
    );

    // Initialize vesting schedule
    vesting_schedule.admin = ctx.accounts.admin.key();
    vesting_schedule.beneficiary = ctx.accounts.beneficiary.key();
    vesting_schedule.mint = ctx.accounts.mint.key();
    vesting_schedule.vault = ctx.accounts.vault.key();
    vesting_schedule.total_amount = total_amount;
    vesting_schedule.claimed_amount = 0;
    vesting_schedule.start_time = start_time;
    vesting_schedule.cliff_duration = cliff_duration;
    vesting_schedule.vesting_duration = vesting_duration;
    vesting_schedule.schedule_type = schedule_type;
    vesting_schedule.revoked = false;
    vesting_schedule.created_at = clock.unix_timestamp;
    vesting_schedule.bump = ctx.bumps.vesting_schedule;

    // Initialize vault authority
    vault_authority.vesting_schedule = vesting_schedule.key();
    vault_authority.bump = ctx.bumps.vault_authority;

    // Transfer tokens from admin to vault
    anchor_spl::token_2022::transfer_checked(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            anchor_spl::token_2022::TransferChecked {
                from: ctx.accounts.admin_token_account.to_account_info(),
                to: ctx.accounts.vault.to_account_info(),
                authority: ctx.accounts.admin.to_account_info(),
                mint: ctx.accounts.mint.to_account_info(),
            },
        ),
        total_amount,
        ctx.accounts.mint.decimals,
    )?;

    // Emit event
    emit!(CreateScheduleEvent {
        vesting_schedule: vesting_schedule.key(),
        beneficiary: vesting_schedule.beneficiary,
        total_amount,
        start_time,
        cliff_duration,
        vesting_duration,
        schedule_type,
        created_at: clock.unix_timestamp,
    });

    msg!(
        "Created vesting schedule for {} with {} tokens",
        ctx.accounts.beneficiary.key(),
        total_amount
    );

    Ok(())
}

/// Event emitted when a vesting schedule is created
#[event]
pub struct CreateScheduleEvent {
    pub vesting_schedule: Pubkey,
    pub beneficiary: Pubkey,
    pub total_amount: u64,
    pub start_time: i64,
    pub cliff_duration: i64,
    pub vesting_duration: i64,
    pub schedule_type: ScheduleType,
    pub created_at: i64,
}
