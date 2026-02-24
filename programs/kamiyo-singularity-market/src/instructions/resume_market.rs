use crate::errors::MarketError;
use crate::state::{Market, MarketStatus};
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct ResumeMarket<'info> {
    #[account(
        constraint = authority.key() == market.authority @ MarketError::UnauthorizedAuthority
    )]
    pub authority: Signer<'info>,

    #[account(
        mut,
        constraint = market.status == MarketStatus::Paused @ MarketError::MarketNotPaused
    )]
    pub market: Account<'info, Market>,
}

pub fn handler(ctx: Context<ResumeMarket>) -> Result<()> {
    let clock = Clock::get()?;
    let market = &mut ctx.accounts.market;

    // Cannot resume a market after trading has ended
    // Use close_market instruction explicitly instead
    require!(
        clock.unix_timestamp < market.trading_end,
        MarketError::TradingEnded
    );

    market.status = MarketStatus::Active;

    emit!(MarketResumed {
        market: market.key(),
        new_status: market.status,
        resumed_at: clock.unix_timestamp,
    });

    Ok(())
}

#[event]
pub struct MarketResumed {
    pub market: Pubkey,
    pub new_status: MarketStatus,
    pub resumed_at: i64,
}
