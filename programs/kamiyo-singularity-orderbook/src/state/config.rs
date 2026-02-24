use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct OrderBookConfig {
    /// Admin authority
    pub admin: Pubkey,

    /// Keeper authority (can settle trades)
    pub keeper: Pubkey,

    /// Global order counter
    pub order_counter: u64,

    /// Total trades settled
    pub total_trades: u64,

    /// Total volume (in collateral units)
    pub total_volume: u64,

    /// Whether the orderbook is paused
    pub paused: bool,

    /// Bump seed
    pub bump: u8,

    /// Initialization timestamp
    pub created_at: i64,
}

impl OrderBookConfig {
    pub const SEED_PREFIX: &'static [u8] = b"config";

    pub fn next_order_id(&mut self) -> u64 {
        let id = self.order_counter;
        self.order_counter = self.order_counter.saturating_add(1);
        id
    }
}
