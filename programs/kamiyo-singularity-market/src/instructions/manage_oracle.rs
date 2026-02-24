use crate::state::{OracleRegistry, OracleRegistryError};
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct ManageOracle<'info> {
    #[account(
        constraint = authority.key() == registry.authority @ OracleRegistryError::UnauthorizedAuthority
    )]
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [OracleRegistry::SEED_PREFIX],
        bump = registry.bump
    )]
    pub registry: Account<'info, OracleRegistry>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum OracleAction {
    Add,
    Remove,
}

pub fn handler(ctx: Context<ManageOracle>, oracle: Pubkey, action: OracleAction) -> Result<()> {
    let registry = &mut ctx.accounts.registry;

    match action {
        OracleAction::Add => {
            registry.add_oracle(oracle)?;
            emit!(OracleAdded {
                oracle,
                total_oracles: registry.oracles.len() as u8,
            });
        }
        OracleAction::Remove => {
            registry.remove_oracle(&oracle)?;
            emit!(OracleRemoved {
                oracle,
                total_oracles: registry.oracles.len() as u8,
            });
        }
    }

    Ok(())
}

#[event]
pub struct OracleAdded {
    pub oracle: Pubkey,
    pub total_oracles: u8,
}

#[event]
pub struct OracleRemoved {
    pub oracle: Pubkey,
    pub total_oracles: u8,
}

#[derive(Accounts)]
pub struct UpdateRegistryAuthority<'info> {
    #[account(
        constraint = authority.key() == registry.authority @ OracleRegistryError::UnauthorizedAuthority
    )]
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [OracleRegistry::SEED_PREFIX],
        bump = registry.bump
    )]
    pub registry: Account<'info, OracleRegistry>,
}

pub fn update_authority_handler(
    ctx: Context<UpdateRegistryAuthority>,
    new_authority: Pubkey,
) -> Result<()> {
    let registry = &mut ctx.accounts.registry;
    let old_authority = registry.authority;
    registry.authority = new_authority;

    emit!(RegistryAuthorityUpdated {
        old_authority,
        new_authority,
    });

    Ok(())
}

#[event]
pub struct RegistryAuthorityUpdated {
    pub old_authority: Pubkey,
    pub new_authority: Pubkey,
}

#[derive(Accounts)]
pub struct SetEnforceValidation<'info> {
    #[account(
        constraint = authority.key() == registry.authority @ OracleRegistryError::UnauthorizedAuthority
    )]
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [OracleRegistry::SEED_PREFIX],
        bump = registry.bump
    )]
    pub registry: Account<'info, OracleRegistry>,
}

pub fn set_enforce_validation_handler(
    ctx: Context<SetEnforceValidation>,
    enforce: bool,
) -> Result<()> {
    let registry = &mut ctx.accounts.registry;
    registry.enforce_validation = enforce;

    emit!(EnforceValidationUpdated { enforce });

    Ok(())
}

#[event]
pub struct EnforceValidationUpdated {
    pub enforce: bool,
}
