use crate::errors::MarketError;
use crate::state::{Market, MarketStatus};
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct CancelMarket<'info> {
    #[account(
        constraint = authority.key() == market.authority @ MarketError::UnauthorizedAuthority
    )]
    pub authority: Signer<'info>,

    #[account(
        mut,
        constraint = market.status != MarketStatus::Resolved @ MarketError::MarketAlreadyResolved
    )]
    pub market: Account<'info, Market>,
}

pub fn handler(ctx: Context<CancelMarket>) -> Result<()> {
    let market = &mut ctx.accounts.market;
    market.status = MarketStatus::Cancelled;

    emit!(MarketCancelled {
        market: market.key(),
        cancelled_at: Clock::get()?.unix_timestamp,
        total_collateral_to_refund: market.total_collateral,
    });

    Ok(())
}

#[event]
pub struct MarketCancelled {
    pub market: Pubkey,
    pub cancelled_at: i64,
    pub total_collateral_to_refund: u64,
}
