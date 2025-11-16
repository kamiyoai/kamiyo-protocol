use anchor_lang::prelude::*;

use crate::constants::*;
use crate::errors::VestingError;
use crate::state::VestingSchedule;

#[derive(Accounts)]
pub struct TransferBeneficiary<'info> {
    /// Current beneficiary transferring ownership
    #[account(mut)]
    pub current_beneficiary: Signer<'info>,

    /// New beneficiary receiving ownership
    /// CHECK: New beneficiary doesn't need to sign
    pub new_beneficiary: UncheckedAccount<'info>,

    /// Vesting schedule PDA
    #[account(
        mut,
        seeds = [
            VESTING_SCHEDULE_SEED,
            current_beneficiary.key().as_ref(),
            vesting_schedule.mint.as_ref(),
        ],
        bump = vesting_schedule.bump,
        constraint = vesting_schedule.beneficiary == current_beneficiary.key() @ VestingError::UnauthorizedBeneficiary,
        constraint = !vesting_schedule.revoked @ VestingError::ScheduleRevoked,
    )]
    pub vesting_schedule: Account<'info, VestingSchedule>,
}

pub fn handler(ctx: Context<TransferBeneficiary>) -> Result<()> {
    let vesting_schedule = &mut ctx.accounts.vesting_schedule;
    let clock = Clock::get()?;

    let old_beneficiary = vesting_schedule.beneficiary;
    let new_beneficiary = ctx.accounts.new_beneficiary.key();

    // Update beneficiary
    vesting_schedule.beneficiary = new_beneficiary;

    // Emit event
    emit!(TransferBeneficiaryEvent {
        vesting_schedule: vesting_schedule.key(),
        old_beneficiary,
        new_beneficiary,
        timestamp: clock.unix_timestamp,
    });

    msg!(
        "Transferred vesting schedule beneficiary from {} to {}",
        old_beneficiary,
        new_beneficiary
    );

    Ok(())
}

/// Event emitted when beneficiary is transferred
#[event]
pub struct TransferBeneficiaryEvent {
    pub vesting_schedule: Pubkey,
    pub old_beneficiary: Pubkey,
    pub new_beneficiary: Pubkey,
    pub timestamp: i64,
}
