use crate::errors::MarketError;
use crate::state::{Market, MarketStatus};
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct PauseMarket<'info> {
    #[account(
        constraint = authority.key() == market.authority @ MarketError::UnauthorizedAuthority
    )]
    pub authority: Signer<'info>,

    #[account(
        mut,
        constraint = market.status == MarketStatus::Active @ MarketError::MarketNotActive
    )]
    pub market: Account<'info, Market>,
}

pub fn handler(ctx: Context<PauseMarket>) -> Result<()> {
    let market = &mut ctx.accounts.market;
    let clock = Clock::get()?;

    // Cannot pause after trading has ended
    require!(
        clock.unix_timestamp < market.trading_end,
        MarketError::TradingEnded
    );

    market.status = MarketStatus::Paused;

    emit!(MarketPaused {
        market: market.key(),
        paused_at: clock.unix_timestamp,
    });

    Ok(())
}

#[event]
pub struct MarketPaused {
    pub market: Pubkey,
    pub paused_at: i64,
}
