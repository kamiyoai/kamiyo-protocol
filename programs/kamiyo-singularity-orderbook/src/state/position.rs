use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct Position {
    /// Position owner
    pub owner: Pubkey,

    /// Associated market
    pub market: Pubkey,

    /// YES tokens held
    pub yes_balance: u64,

    /// NO tokens held
    pub no_balance: u64,

    /// Collateral locked in open buy orders
    pub locked_collateral: u64,

    /// YES tokens locked in open sell orders
    pub locked_yes: u64,

    /// NO tokens locked in open sell orders
    pub locked_no: u64,

    /// Total collateral deposited
    pub total_deposited: u64,

    /// Total collateral withdrawn
    pub total_withdrawn: u64,

    /// Number of open orders
    pub open_order_count: u32,

    /// Total trades executed
    pub total_trades: u32,

    /// Realized PnL (in collateral units)
    pub realized_pnl: i64,

    /// Bump seed
    pub bump: u8,

    /// Initialization timestamp
    pub created_at: i64,
}

impl Position {
    pub const SEED_PREFIX: &'static [u8] = b"position";

    /// Calculate available collateral (not locked)
    pub fn available_collateral(&self) -> u64 {
        self.total_deposited
            .saturating_sub(self.total_withdrawn)
            .saturating_sub(self.locked_collateral)
    }

    /// Calculate available YES tokens (not locked)
    pub fn available_yes(&self) -> u64 {
        self.yes_balance.saturating_sub(self.locked_yes)
    }

    /// Calculate available NO tokens (not locked)
    pub fn available_no(&self) -> u64 {
        self.no_balance.saturating_sub(self.locked_no)
    }
}
