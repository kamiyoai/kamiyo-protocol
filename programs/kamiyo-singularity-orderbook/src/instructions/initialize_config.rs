use crate::state::OrderBookConfig;
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct InitializeConfig<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        init,
        payer = admin,
        space = 8 + OrderBookConfig::INIT_SPACE,
        seeds = [OrderBookConfig::SEED_PREFIX],
        bump
    )]
    pub config: Account<'info, OrderBookConfig>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<InitializeConfig>, keeper: Pubkey) -> Result<()> {
    let config = &mut ctx.accounts.config;
    let clock = Clock::get()?;

    config.admin = ctx.accounts.admin.key();
    config.keeper = keeper;
    config.order_counter = 0;
    config.total_trades = 0;
    config.total_volume = 0;
    config.paused = false;
    config.bump = ctx.bumps.config;
    config.created_at = clock.unix_timestamp;

    emit!(ConfigInitialized {
        admin: config.admin,
        keeper: config.keeper,
        created_at: config.created_at,
    });

    Ok(())
}

#[event]
pub struct ConfigInitialized {
    pub admin: Pubkey,
    pub keeper: Pubkey,
    pub created_at: i64,
}
