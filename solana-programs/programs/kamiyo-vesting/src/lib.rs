use anchor_lang::prelude::*;

pub mod constants;
pub mod errors;
pub mod instructions;
pub mod state;
pub mod utils;

use instructions::*;
use state::ScheduleType;

declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");

/// KAMIYO Vesting Program
///
/// Implements 24-month linear vesting with 6-month cliff for:
/// - Team: 150M KAMIYO (15% of supply)
/// - Advisors: 50M KAMIYO (5% of supply)
/// - Investors: 100M KAMIYO (10% of supply)
///
/// Total Vested: 300M KAMIYO (30% of 1B supply)
///
/// Features:
/// - Linear per-second vesting (fairest distribution)
/// - 6-month cliff (no tokens before 6 months)
/// - Beneficiary can claim anytime after cliff
/// - Admin can revoke unvested tokens
/// - Beneficiary can transfer to new wallet (lost key recovery)
/// - Close schedule after 100% claimed (rent refund)
#[program]
pub mod kamiyo_vesting {
    use super::*;

    /// Create a new vesting schedule for a beneficiary
    ///
    /// Admin transfers tokens to a vault, which releases them linearly
    /// to the beneficiary over the vesting period.
    ///
    /// # Arguments
    /// * `total_amount` - Total tokens to vest (e.g., 20M KAMIYO)
    /// * `start_time` - Unix timestamp when vesting begins (TGE)
    /// * `cliff_duration` - Cliff period in seconds (6 months = 15,768,000)
    /// * `vesting_duration` - Total vesting duration in seconds (24 months = 63,072,000)
    /// * `schedule_type` - Type of schedule (Team, Advisor, Investor)
    pub fn create_vesting_schedule(
        ctx: Context<CreateVestingSchedule>,
        total_amount: u64,
        start_time: i64,
        cliff_duration: i64,
        vesting_duration: i64,
        schedule_type: ScheduleType,
    ) -> Result<()> {
        instructions::create_vesting_schedule::handler(
            ctx,
            total_amount,
            start_time,
            cliff_duration,
            vesting_duration,
            schedule_type,
        )
    }

    /// Claim vested tokens
    ///
    /// Beneficiary can call this anytime to claim unlocked tokens.
    /// Before cliff: 0 tokens available
    /// After cliff: Linear vesting based on time elapsed
    ///
    /// Can be called multiple times (claims incremental vested amounts).
    pub fn claim_vested(ctx: Context<ClaimVested>) -> Result<()> {
        instructions::claim_vested::handler(ctx)
    }

    /// Revoke vesting schedule
    ///
    /// Admin can revoke a schedule, returning unvested tokens.
    /// Beneficiary keeps vested portion.
    ///
    /// Use case: Team member leaves before cliff, company reclaims tokens.
    pub fn revoke_vesting(ctx: Context<RevokeVesting>) -> Result<()> {
        instructions::revoke_vesting::handler(ctx)
    }

    /// Transfer beneficiary ownership
    ///
    /// Current beneficiary can transfer schedule to new wallet.
    ///
    /// Use case: Lost wallet recovery, employee address change.
    pub fn transfer_beneficiary(ctx: Context<TransferBeneficiary>) -> Result<()> {
        instructions::transfer_beneficiary::handler(ctx)
    }

    /// Close vesting schedule
    ///
    /// After 100% claimed, beneficiary can close schedule to reclaim rent.
    /// Vault must be empty (all tokens claimed).
    pub fn close_schedule(ctx: Context<CloseSchedule>) -> Result<()> {
        instructions::close_schedule::handler(ctx)
    }
}
