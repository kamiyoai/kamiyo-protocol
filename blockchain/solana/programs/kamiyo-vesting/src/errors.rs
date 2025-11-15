use anchor_lang::prelude::*;

#[error_code]
pub enum VestingError {
    #[msg("No tokens available to claim at this time (before cliff or already claimed)")]
    NothingToClaim,

    #[msg("This vesting schedule has been revoked by admin")]
    ScheduleRevoked,

    #[msg("Schedule has already been revoked")]
    AlreadyRevoked,

    #[msg("Only the admin can perform this action")]
    UnauthorizedAdmin,

    #[msg("Only the beneficiary can perform this action")]
    UnauthorizedBeneficiary,

    #[msg("Arithmetic overflow occurred")]
    Overflow,

    #[msg("Arithmetic underflow occurred")]
    Underflow,

    #[msg("Invalid time parameters (start time cannot be in the past)")]
    InvalidTimeParameters,

    #[msg("Invalid vesting parameters (cliff must be less than duration)")]
    InvalidVestingParameters,

    #[msg("Cannot revoke schedule after vesting has started")]
    VestingAlreadyStarted,

    #[msg("Total amount must be greater than zero")]
    InvalidAmount,

    #[msg("Claimed amount cannot exceed vested amount")]
    InvalidClaimAmount,

    #[msg("Vesting schedule cannot be closed until fully claimed")]
    ScheduleNotFullyClaimed,

    #[msg("Invalid mint address (must be KAMIYO Token-2022)")]
    InvalidMint,

    #[msg("Insufficient tokens in vault")]
    InsufficientVaultBalance,
}
