#![allow(ambiguous_glob_reexports)]
#![allow(unexpected_cfgs)]

use anchor_lang::prelude::*;

pub mod errors;
pub mod instructions;
pub mod state;

use instructions::*;
use state::*;

declare_id!("59LqZtVU2YBrhv8B2E1iASJMzcyBHWhY2JuaJsCXkAS8");

#[program]
pub mod kamiyo_singularity_orderbook {
    use super::*;

    /// Initialize user position account for a market
    pub fn initialize_position(ctx: Context<InitializePosition>) -> Result<()> {
        crate::instructions::initialize_position::handler(ctx)
    }

    /// Place a limit order
    pub fn place_order(
        ctx: Context<PlaceOrder>,
        side: OrderSide,
        outcome: OutcomeType,
        price_bps: u16,
        quantity: u64,
        order_type: OrderType,
        expires_at: i64,
    ) -> Result<()> {
        crate::instructions::place_order::handler(
            ctx, side, outcome, price_bps, quantity, order_type, expires_at,
        )
    }

    /// Cancel an open order
    pub fn cancel_order(ctx: Context<CancelOrder>) -> Result<()> {
        crate::instructions::cancel_order::handler(ctx)
    }

    /// Settle a matched trade (called by keeper/backend)
    pub fn settle_trade(
        ctx: Context<SettleTrade>,
        fill_quantity: u64,
        fill_price_bps: u16,
    ) -> Result<()> {
        crate::instructions::settle_trade::handler(ctx, fill_quantity, fill_price_bps)
    }

    /// Update keeper authority
    pub fn update_keeper(ctx: Context<UpdateKeeper>, new_keeper: Pubkey) -> Result<()> {
        crate::instructions::update_keeper::handler(ctx, new_keeper)
    }

    /// Initialize the orderbook config
    pub fn initialize_config(ctx: Context<InitializeConfig>, keeper: Pubkey) -> Result<()> {
        crate::instructions::initialize_config::handler(ctx, keeper)
    }
}
