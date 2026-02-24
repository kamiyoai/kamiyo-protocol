use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct Order {
    /// Order owner
    pub owner: Pubkey,

    /// Associated market
    pub market: Pubkey,

    /// Order ID (unique per market)
    pub order_id: u64,

    /// Order side
    pub side: OrderSide,

    /// Outcome being traded
    pub outcome: OutcomeType,

    /// Price in basis points (1-9999 = 0.01%-99.99%)
    pub price_bps: u16,

    /// Original quantity
    pub original_quantity: u64,

    /// Remaining unfilled quantity
    pub remaining_quantity: u64,

    /// Filled quantity
    pub filled_quantity: u64,

    /// Order status
    pub status: OrderStatus,

    /// Order type
    pub order_type: OrderType,

    /// Creation timestamp
    pub created_at: i64,

    /// Expiration timestamp (0 = no expiry)
    pub expires_at: i64,

    /// Last update timestamp
    pub updated_at: i64,

    /// Bump seed
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum OrderSide {
    Buy,
    Sell,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum OutcomeType {
    Yes,
    No,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum OrderStatus {
    Open,
    PartiallyFilled,
    Filled,
    Cancelled,
    Expired,
}

impl Default for OrderStatus {
    fn default() -> Self {
        OrderStatus::Open
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum OrderType {
    Limit,
    Market,
    // Future: StopLoss, TakeProfit
}

impl Default for OrderType {
    fn default() -> Self {
        OrderType::Limit
    }
}

impl Order {
    pub const SEED_PREFIX: &'static [u8] = b"order";

    /// Calculate the collateral required for a buy order
    pub fn calculate_buy_collateral(&self) -> Option<u64> {
        // For a buy order at price P (in bps), cost = quantity * P / 10000
        let price_u64 = self.price_bps as u64;
        self.remaining_quantity
            .checked_mul(price_u64)?
            .checked_div(10000)
    }

    /// Check if order is still valid
    pub fn is_valid(&self, current_time: i64) -> bool {
        if self.status != OrderStatus::Open && self.status != OrderStatus::PartiallyFilled {
            return false;
        }
        if self.expires_at > 0 && current_time >= self.expires_at {
            return false;
        }
        true
    }

    /// Check if orders can match
    pub fn can_match(&self, other: &Order) -> bool {
        // Must be opposite sides
        if self.side == other.side {
            return false;
        }
        // Must be same outcome
        if self.outcome != other.outcome {
            return false;
        }
        // Must be same market
        if self.market != other.market {
            return false;
        }
        // Prices must cross (buy price >= sell price)
        match self.side {
            OrderSide::Buy => self.price_bps >= other.price_bps,
            OrderSide::Sell => other.price_bps >= self.price_bps,
        }
    }
}
