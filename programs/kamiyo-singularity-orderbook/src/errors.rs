use anchor_lang::prelude::*;

#[error_code]
pub enum OrderBookError {
    #[msg("Invalid price (must be 1-9999 bps)")]
    InvalidPrice,

    #[msg("Invalid quantity (must be > 0)")]
    InvalidQuantity,

    #[msg("Quantity exceeds maximum allowed")]
    QuantityTooLarge,

    #[msg("Invalid expiration time")]
    InvalidExpiration,

    #[msg("Market is not active")]
    MarketNotActive,

    #[msg("Trading has ended for this market")]
    TradingEnded,

    #[msg("Order not found")]
    OrderNotFound,

    #[msg("Order is not open")]
    OrderNotOpen,

    #[msg("Order already filled")]
    OrderAlreadyFilled,

    #[msg("Order already cancelled")]
    OrderAlreadyCancelled,

    #[msg("Order has expired")]
    OrderExpired,

    #[msg("Insufficient collateral")]
    InsufficientCollateral,

    #[msg("Insufficient balance")]
    InsufficientBalance,

    #[msg("Unauthorized: only order owner can cancel")]
    UnauthorizedOwner,

    #[msg("Unauthorized: only keeper can settle")]
    UnauthorizedKeeper,

    #[msg("Unauthorized: only admin can update config")]
    UnauthorizedAdmin,

    #[msg("Invalid fill quantity")]
    InvalidFillQuantity,

    #[msg("Invalid fill price")]
    InvalidFillPrice,

    #[msg("Orders do not match")]
    OrdersDoNotMatch,

    #[msg("Arithmetic overflow")]
    ArithmeticOverflow,

    #[msg("Position already initialized")]
    PositionAlreadyInitialized,

    #[msg("Invalid escrow vault - must be owned by escrow authority PDA")]
    InvalidEscrowVault,

    #[msg("Invalid buyer collateral account")]
    InvalidBuyerCollateral,

    #[msg("Invalid protocol fee vault owner")]
    InvalidFeeVaultOwner,

    #[msg("Invalid protocol fee vault mint")]
    InvalidFeeVaultMint,

    #[msg("Order has expired and cannot be settled")]
    OrderExpiredCannotSettle,

    #[msg("Orderbook is full")]
    OrderbookFull,

    #[msg("No free order slots available")]
    NoFreeSlots,

    #[msg("Fill or kill order could not be completely filled")]
    FillOrKillNotSatisfied,

    #[msg("Oracle feed is stale")]
    OracleFeedStale,

    #[msg("Oracle feed data invalid")]
    OracleFeedInvalid,

    #[msg("Oracle price out of expected range")]
    OraclePriceOutOfRange,

    #[msg("Market already resolved")]
    MarketAlreadyResolved,

    #[msg("Market not ready for resolution")]
    MarketNotReadyForResolution,

    #[msg("Resolution threshold not met")]
    ResolutionThresholdNotMet,

    #[msg("Invalid resolution outcome")]
    InvalidResolutionOutcome,

    #[msg("Invalid input parameter")]
    InvalidInput,

    #[msg("Arithmetic overflow")]
    Overflow,
}
