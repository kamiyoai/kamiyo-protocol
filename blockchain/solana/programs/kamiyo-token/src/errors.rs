use anchor_lang::prelude::*;

/// Custom error codes for the KAMIYO token program
#[error_code]
pub enum KamiyoTokenError {
    /// 6000 - Invalid decimals (must be 9 for KAMIYO)
    #[msg("Invalid decimals: KAMIYO must use 9 decimals")]
    InvalidDecimals,

    /// 6001 - Invalid transfer fee basis points (must be <= 10000)
    #[msg("Invalid transfer fee basis points: must be <= 10000 (100%)")]
    InvalidTransferFeeBasisPoints,

    /// 6002 - Invalid maximum fee (must be > 0)
    #[msg("Invalid maximum fee: must be greater than 0")]
    InvalidMaximumFee,

    /// 6003 - Invalid authority type
    #[msg("Invalid authority type: must be 0-3")]
    InvalidAuthorityType,

    /// 6004 - Unauthorized: caller is not the authority
    #[msg("Unauthorized: caller is not the authority")]
    Unauthorized,

    /// 6005 - Invalid fee configuration authority
    #[msg("Invalid fee configuration authority")]
    InvalidFeeConfigAuthority,

    /// 6006 - Invalid withdraw authority
    #[msg("Invalid withdraw authority")]
    InvalidWithdrawAuthority,

    /// 6007 - Fee distribution percentages don't sum to 100%
    #[msg("Fee distribution percentages must sum to 10000 basis points (100%)")]
    InvalidFeeDistribution,

    /// 6008 - No fees available to withdraw
    #[msg("No fees available to withdraw")]
    NoFeesAvailable,

    /// 6009 - Insufficient fee balance for distribution
    #[msg("Insufficient fee balance for distribution")]
    InsufficientFeeBalance,

    /// 6010 - Too many accounts to harvest in single transaction
    #[msg("Too many accounts to harvest: maximum 26 accounts per transaction")]
    TooManyAccounts,

    /// 6011 - Mint already initialized
    #[msg("Mint already initialized")]
    MintAlreadyInitialized,

    /// 6012 - Invalid mint account
    #[msg("Invalid mint account")]
    InvalidMintAccount,

    /// 6013 - Invalid token account
    #[msg("Invalid token account")]
    InvalidTokenAccount,

    /// 6014 - Arithmetic overflow
    #[msg("Arithmetic overflow")]
    ArithmeticOverflow,

    /// 6015 - Arithmetic underflow
    #[msg("Arithmetic underflow")]
    ArithmeticUnderflow,

    /// 6016 - Invalid total supply (must be 1 billion with 9 decimals)
    #[msg("Invalid total supply: must be 1,000,000,000 KAMIYO (1e18 smallest units)")]
    InvalidTotalSupply,

    /// 6017 - Cannot update authority: authority is None (revoked)
    #[msg("Cannot update authority: authority has been revoked")]
    AuthorityRevoked,

    /// 6018 - Fee vault already initialized
    #[msg("Fee vault already initialized")]
    FeeVaultAlreadyInitialized,

    /// 6019 - Fee config already initialized
    #[msg("Fee config already initialized")]
    FeeConfigAlreadyInitialized,

    /// 6020 - Invalid treasury account
    #[msg("Invalid treasury account")]
    InvalidTreasuryAccount,

    /// 6021 - Invalid LP rewards account
    #[msg("Invalid LP rewards account")]
    InvalidLpRewardsAccount,

    /// 6022 - Minimum distribution amount not met
    #[msg("Minimum distribution amount not met")]
    MinDistributionAmountNotMet,

    /// 6023 - Automatic distribution is disabled
    #[msg("Automatic distribution is disabled")]
    AutoDistributeDisabled,

    /// 6024 - Invalid PDA derivation
    #[msg("Invalid PDA derivation")]
    InvalidPdaDerivation,

    /// 6025 - Fee harvest failed
    #[msg("Fee harvest failed")]
    FeeHarvestFailed,

    /// 6026 - Fee withdrawal failed
    #[msg("Fee withdrawal failed")]
    FeeWithdrawalFailed,

    /// 6027 - Token transfer failed
    #[msg("Token transfer failed")]
    TokenTransferFailed,

    /// 6028 - Invalid token program
    #[msg("Invalid token program: must be Token-2022")]
    InvalidTokenProgram,

    /// 6029 - Transfer fee extension not initialized
    #[msg("Transfer fee extension not initialized on mint")]
    TransferFeeExtensionNotInitialized,

    /// 6030 - Invalid name length (max 32 characters)
    #[msg("Invalid name length: maximum 32 characters")]
    InvalidNameLength,

    /// 6031 - Invalid symbol length (max 10 characters)
    #[msg("Invalid symbol length: maximum 10 characters")]
    InvalidSymbolLength,
}
