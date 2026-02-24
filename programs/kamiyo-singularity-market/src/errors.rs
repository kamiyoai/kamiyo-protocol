use anchor_lang::prelude::*;

#[error_code]
pub enum MarketError {
    #[msg("Market ID too long (max 64 characters)")]
    MarketIdTooLong,

    #[msg("Question too long (max 256 characters)")]
    QuestionTooLong,

    #[msg("Description too long (max 512 characters)")]
    DescriptionTooLong,

    #[msg("Category too long (max 32 characters)")]
    CategoryTooLong,

    #[msg("Invalid fee (max 1000 bps = 10%)")]
    InvalidFee,

    #[msg("Resolution deadline must be in the future")]
    InvalidResolutionDeadline,

    #[msg("Trading end must be in the future")]
    InvalidTradingEnd,

    #[msg("Trading end must be before resolution deadline")]
    TradingEndAfterResolution,

    #[msg("Market is not active")]
    MarketNotActive,

    #[msg("Market is not paused")]
    MarketNotPaused,

    #[msg("Market is not closed")]
    MarketNotClosed,

    #[msg("Market is already resolved")]
    MarketAlreadyResolved,

    #[msg("Market is not resolved")]
    MarketNotResolved,

    #[msg("Trading has ended")]
    TradingEnded,

    #[msg("Trading has not ended yet")]
    TradingNotEnded,

    #[msg("Resolution deadline not reached")]
    ResolutionDeadlineNotReached,

    #[msg("Unauthorized: only oracle can resolve")]
    UnauthorizedOracle,

    #[msg("Unauthorized: only authority can perform this action")]
    UnauthorizedAuthority,

    #[msg("Invalid amount")]
    InvalidAmount,

    #[msg("Insufficient balance")]
    InsufficientBalance,

    #[msg("Arithmetic overflow")]
    ArithmeticOverflow,

    #[msg("No winnings to claim")]
    NoWinningsToClaim,

    #[msg("Market is not cancelled")]
    MarketNotCancelled,

    #[msg("No tokens to refund")]
    NoTokensToRefund,

    #[msg("Need both YES and NO tokens for refund (paired tokens only)")]
    NoPairedTokensToRefund,

    #[msg("No fees available to withdraw")]
    NoFeesToWithdraw,

    #[msg("Insufficient fees for requested withdrawal amount")]
    InsufficientFees,

    #[msg("Invalid collateral mint")]
    InvalidCollateral,

    #[msg("Invalid protocol treasury. Fees must route to the KAMIYO staking pool authority")]
    InvalidProtocolTreasury,

    #[msg("Unauthorized withdrawal: recipient mismatch")]
    UnauthorizedWithdrawal,

    #[msg("Creator fee withdrawals are disabled for KAMIYO Singularity")]
    CreatorFeeWithdrawalDisabled,

    #[msg("Invalid outcome")]
    InvalidOutcome,

    #[msg("Insufficient vault balance for transfer")]
    InsufficientVaultBalance,
}
