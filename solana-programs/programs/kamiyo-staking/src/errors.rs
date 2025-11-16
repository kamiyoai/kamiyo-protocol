use anchor_lang::prelude::*;

/// Custom error codes for KAMIYO staking program
#[error_code]
pub enum StakingError {
    /// Pool is not active (paused by admin)
    #[msg("Staking pool is currently inactive")]
    PoolInactive,

    /// Stake amount is below minimum requirement
    #[msg("Stake amount is below minimum requirement of 100 KAMIYO")]
    BelowMinimumStake,

    /// User has insufficient staked balance
    #[msg("Insufficient staked amount for this operation")]
    InsufficientStake,

    /// Cooldown period is already active
    #[msg("Unstaking cooldown period is already active")]
    CooldownAlreadyActive,

    /// No active cooldown period
    #[msg("No active cooldown period found")]
    NoCooldownActive,

    /// Cooldown period has not completed yet
    #[msg("Unstaking cooldown period has not completed yet")]
    CooldownNotComplete,

    /// No rewards available to claim
    #[msg("No rewards available to claim")]
    NoRewardsToClaim,

    /// Unauthorized access (not admin)
    #[msg("Unauthorized: Only pool admin can perform this action")]
    Unauthorized,

    /// Mathematical overflow occurred
    #[msg("Mathematical overflow in calculation")]
    MathOverflow,

    /// Insufficient funds in reward vault
    #[msg("Insufficient funds in reward vault for claim")]
    InsufficientRewardFunds,

    /// Invalid APY value (must be in valid range)
    #[msg("Invalid APY value: must be between 0 and 10000 basis points")]
    InvalidAPY,

    /// Invalid cooldown period (must be > 0)
    #[msg("Invalid cooldown period: must be greater than 0")]
    InvalidCooldownPeriod,

    /// Invalid minimum stake amount
    #[msg("Invalid minimum stake amount")]
    InvalidMinStakeAmount,

    /// Cannot stake while in cooldown period
    #[msg("Cannot stake while unstaking cooldown is active")]
    CannotStakeDuringCooldown,

    /// Invalid amount (zero or too large)
    #[msg("Invalid amount specified")]
    InvalidAmount,

    /// Reward vault balance insufficient
    #[msg("Reward vault does not have sufficient balance")]
    RewardVaultInsufficientBalance,

    /// Pool total staked is zero (cannot calculate rewards)
    #[msg("No tokens staked in pool yet")]
    NoTokensStaked,

    /// Token mint mismatch
    #[msg("Token mint does not match pool configuration")]
    MintMismatch,

    /// Invalid token account owner
    #[msg("Invalid token account owner")]
    InvalidTokenAccountOwner,

    /// Stake amount exceeds available balance
    #[msg("Stake amount exceeds available token balance")]
    InsufficientTokenBalance,

    /// Invalid PDA derivation
    #[msg("Invalid PDA derivation")]
    InvalidPDA,

    /// Account already initialized
    #[msg("Account has already been initialized")]
    AlreadyInitialized,

    /// Calculation underflow
    #[msg("Calculation underflow occurred")]
    CalculationUnderflow,

    /// Invalid timestamp (future timestamp or negative)
    #[msg("Invalid timestamp value")]
    InvalidTimestamp,

    /// Pool update too frequent (rate limiting)
    #[msg("Pool updates are rate-limited, please wait")]
    UpdateTooFrequent,

    /// Invalid tier
    #[msg("Invalid tier specified")]
    InvalidTier,
}
