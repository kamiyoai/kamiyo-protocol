use crate::errors::OrderBookError;
use crate::state::OrderBookConfig;
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct UpdateKeeper<'info> {
    #[account(
        constraint = admin.key() == config.admin @ OrderBookError::UnauthorizedAdmin
    )]
    pub admin: Signer<'info>,

    #[account(
        mut,
        seeds = [OrderBookConfig::SEED_PREFIX],
        bump = config.bump
    )]
    pub config: Account<'info, OrderBookConfig>,
}

pub fn handler(ctx: Context<UpdateKeeper>, new_keeper: Pubkey) -> Result<()> {
    let config = &mut ctx.accounts.config;
    let old_keeper = config.keeper;
    config.keeper = new_keeper;

    emit!(KeeperUpdated {
        old_keeper,
        new_keeper,
        updated_by: ctx.accounts.admin.key(),
        updated_at: Clock::get()?.unix_timestamp,
    });

    Ok(())
}

#[event]
pub struct KeeperUpdated {
    pub old_keeper: Pubkey,
    pub new_keeper: Pubkey,
    pub updated_by: Pubkey,
    pub updated_at: i64,
}
