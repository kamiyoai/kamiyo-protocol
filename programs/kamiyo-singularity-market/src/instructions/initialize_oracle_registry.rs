use crate::state::OracleRegistry;
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct InitializeOracleRegistry<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        init,
        payer = authority,
        space = 8 + OracleRegistry::INIT_SPACE,
        seeds = [OracleRegistry::SEED_PREFIX],
        bump
    )]
    pub registry: Account<'info, OracleRegistry>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<InitializeOracleRegistry>, enforce_validation: bool) -> Result<()> {
    let registry = &mut ctx.accounts.registry;

    registry.authority = ctx.accounts.authority.key();
    registry.oracles = Vec::new();
    registry.enforce_validation = enforce_validation;
    registry.bump = ctx.bumps.registry;

    emit!(OracleRegistryInitialized {
        authority: registry.authority,
        enforce_validation,
    });

    Ok(())
}

#[event]
pub struct OracleRegistryInitialized {
    pub authority: Pubkey,
    pub enforce_validation: bool,
}
