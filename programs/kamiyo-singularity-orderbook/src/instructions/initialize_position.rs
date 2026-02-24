use crate::state::Position;
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct InitializePosition<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    /// CHECK: Market account from market program
    pub market: UncheckedAccount<'info>,

    #[account(
        init,
        payer = owner,
        space = 8 + Position::INIT_SPACE,
        seeds = [Position::SEED_PREFIX, market.key().as_ref(), owner.key().as_ref()],
        bump
    )]
    pub position: Account<'info, Position>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<InitializePosition>) -> Result<()> {
    let position = &mut ctx.accounts.position;
    let clock = Clock::get()?;

    position.owner = ctx.accounts.owner.key();
    position.market = ctx.accounts.market.key();
    position.yes_balance = 0;
    position.no_balance = 0;
    position.locked_collateral = 0;
    position.locked_yes = 0;
    position.locked_no = 0;
    position.total_deposited = 0;
    position.total_withdrawn = 0;
    position.open_order_count = 0;
    position.total_trades = 0;
    position.realized_pnl = 0;
    position.bump = ctx.bumps.position;
    position.created_at = clock.unix_timestamp;

    emit!(PositionInitialized {
        owner: position.owner,
        market: position.market,
        created_at: position.created_at,
    });

    Ok(())
}

#[event]
pub struct PositionInitialized {
    pub owner: Pubkey,
    pub market: Pubkey,
    pub created_at: i64,
}
