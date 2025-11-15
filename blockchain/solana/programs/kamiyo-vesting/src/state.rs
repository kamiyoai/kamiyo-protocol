use anchor_lang::prelude::*;

/// Schedule type for different beneficiary categories
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub enum ScheduleType {
    /// Team members: 150M KAMIYO (15% of supply)
    Team,
    /// Advisors: 50M KAMIYO (5% of supply)
    Advisor,
    /// Investors: 100M KAMIYO (10% of supply)
    Investor,
}

/// Vesting schedule account - one per beneficiary
/// Total allocation: 300M KAMIYO (30% of supply)
/// Vesting: 24 months linear with 6-month cliff
#[account]
pub struct VestingSchedule {
    /// Admin who created this schedule
    pub admin: Pubkey,

    /// Current beneficiary (can be transferred)
    pub beneficiary: Pubkey,

    /// KAMIYO mint address (Token-2022)
    pub mint: Pubkey,

    /// Vault token account holding locked tokens
    pub vault: Pubkey,

    /// Total tokens allocated to this schedule
    pub total_amount: u64,

    /// Tokens already claimed by beneficiary
    pub claimed_amount: u64,

    /// Unix timestamp when vesting begins (TGE)
    pub start_time: i64,

    /// Cliff duration in seconds (6 months = 15,768,000 seconds)
    pub cliff_duration: i64,

    /// Total vesting duration in seconds (24 months = 63,072,000 seconds)
    pub vesting_duration: i64,

    /// Schedule type (Team, Advisor, Investor)
    pub schedule_type: ScheduleType,

    /// Whether this schedule has been revoked by admin
    pub revoked: bool,

    /// Timestamp when schedule was created (for audit trail)
    pub created_at: i64,

    /// PDA bump seed
    pub bump: u8,
}

impl VestingSchedule {
    /// Account size calculation
    /// Discriminator (8) + admin (32) + beneficiary (32) + mint (32) + vault (32) +
    /// total_amount (8) + claimed_amount (8) + start_time (8) + cliff_duration (8) +
    /// vesting_duration (8) + schedule_type (1) + revoked (1) + created_at (8) + bump (1)
    pub const LEN: usize = 8 + 32 + 32 + 32 + 32 + 8 + 8 + 8 + 8 + 8 + 1 + 1 + 8 + 1;
}

/// Vault authority PDA - signs for token transfers from vault
#[account]
pub struct VaultAuthority {
    /// Associated vesting schedule
    pub vesting_schedule: Pubkey,

    /// PDA bump seed
    pub bump: u8,
}

impl VaultAuthority {
    /// Account size: Discriminator (8) + vesting_schedule (32) + bump (1)
    pub const LEN: usize = 8 + 32 + 1;
}
