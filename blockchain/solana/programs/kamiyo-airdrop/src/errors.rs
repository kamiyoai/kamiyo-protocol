use anchor_lang::prelude::*;

/// Custom error codes for the airdrop program
#[error_code]
pub enum AirdropError {
    #[msg("Claim period has not started yet")]
    ClaimNotStarted,

    #[msg("Claim period has expired (90 days elapsed)")]
    ClaimExpired,

    #[msg("Invalid merkle proof - wallet not eligible for airdrop")]
    InvalidProof,

    #[msg("This wallet has already claimed tokens")]
    AlreadyClaimed,

    #[msg("Airdrop is not currently active")]
    AirdropInactive,

    #[msg("Only the admin can perform this action")]
    Unauthorized,

    #[msg("Math overflow detected")]
    MathOverflow,

    #[msg("Claim window is still active - cannot reclaim yet")]
    ClaimWindowStillActive,

    #[msg("Allocation amount exceeds maximum per wallet (10,000 KAMIYO)")]
    AllocationExceedsMaximum,

    #[msg("Allocation amount is below minimum to claim (100 KAMIYO)")]
    AllocationBelowMinimum,

    #[msg("Invalid mint - must be KAMIYO token")]
    InvalidMint,

    #[msg("Vault does not have sufficient balance")]
    InsufficientVaultBalance,
}
