use crate::errors::MarketError;
use crate::state::{Market, MarketStatus, Outcome};
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct ResolveMarket<'info> {
    #[account(
        constraint = oracle.key() == market.oracle @ MarketError::UnauthorizedOracle
    )]
    pub oracle: Signer<'info>,

    #[account(
        mut,
        constraint = market.status == MarketStatus::Closed @ MarketError::MarketNotClosed,
        // SECURITY: Prevent double resolution - market can only be resolved once
        constraint = market.resolved_outcome == 0 @ MarketError::MarketAlreadyResolved
    )]
    pub market: Account<'info, Market>,
}

pub fn handler(ctx: Context<ResolveMarket>, outcome: Outcome) -> Result<()> {
    let clock = Clock::get()?;
    let current_time = clock.unix_timestamp;

    let market = &mut ctx.accounts.market;

    // Ensure resolution deadline has passed
    require!(
        current_time >= market.resolution_deadline,
        MarketError::ResolutionDeadlineNotReached
    );

    market.status = MarketStatus::Resolved;
    market.resolved_outcome = match outcome {
        Outcome::Yes => 1,
        Outcome::No => 2,
    };
    market.resolved_at = current_time;

    emit!(MarketResolved {
        market: market.key(),
        outcome,
        resolved_at: current_time,
        total_collateral: market.total_collateral,
    });

    Ok(())
}

#[event]
pub struct MarketResolved {
    pub market: Pubkey,
    pub outcome: Outcome,
    pub resolved_at: i64,
    pub total_collateral: u64,
}
