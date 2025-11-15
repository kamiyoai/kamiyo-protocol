use anchor_lang::prelude::*;

use crate::constants::*;
use crate::errors::StakingError;
use crate::state::StakePool;

/// Update pool configuration (admin-only)
/// Allows governance to adjust APY rates and other parameters
#[derive(Accounts)]
pub struct UpdatePool<'info> {
    /// Pool admin (must match pool.admin)
    #[account(mut)]
    pub admin: Signer<'info>,

    /// Staking pool
    #[account(
        mut,
        seeds = [STAKE_POOL_SEED, stake_pool.mint.as_ref()],
        bump = stake_pool.bump,
        constraint = stake_pool.admin == admin.key() @ StakingError::Unauthorized
    )]
    pub stake_pool: Account<'info, StakePool>,
}

pub fn handler(
    ctx: Context<UpdatePool>,
    new_apy_free: Option<u16>,
    new_apy_pro: Option<u16>,
    new_apy_team: Option<u16>,
    new_apy_enterprise: Option<u16>,
    new_cooldown_period: Option<i64>,
    new_min_stake_amount: Option<u64>,
    new_is_active: Option<bool>,
) -> Result<()> {
    let stake_pool = &mut ctx.accounts.stake_pool;
    let clock = Clock::get()?;

    let mut changes_made = false;

    // Update APY rates if provided
    if let Some(apy) = new_apy_free {
        require!(apy <= 10_000, StakingError::InvalidAPY);
        stake_pool.apy_free = apy;
        changes_made = true;
        msg!("Updated Free tier APY to {}%", apy as f64 / 100.0);
    }

    if let Some(apy) = new_apy_pro {
        require!(apy <= 10_000, StakingError::InvalidAPY);
        stake_pool.apy_pro = apy;
        changes_made = true;
        msg!("Updated Pro tier APY to {}%", apy as f64 / 100.0);
    }

    if let Some(apy) = new_apy_team {
        require!(apy <= 10_000, StakingError::InvalidAPY);
        stake_pool.apy_team = apy;
        changes_made = true;
        msg!("Updated Team tier APY to {}%", apy as f64 / 100.0);
    }

    if let Some(apy) = new_apy_enterprise {
        require!(apy <= 10_000, StakingError::InvalidAPY);
        stake_pool.apy_enterprise = apy;
        changes_made = true;
        msg!("Updated Enterprise tier APY to {}%", apy as f64 / 100.0);
    }

    // Update cooldown period if provided
    if let Some(cooldown) = new_cooldown_period {
        require!(cooldown > 0, StakingError::InvalidCooldownPeriod);
        stake_pool.cooldown_period = cooldown;
        changes_made = true;
        msg!("Updated cooldown period to {} days", cooldown / 86400);
    }

    // Update minimum stake amount if provided
    if let Some(min_stake) = new_min_stake_amount {
        require!(min_stake > 0, StakingError::InvalidMinStakeAmount);
        stake_pool.min_stake_amount = min_stake;
        changes_made = true;
        msg!("Updated minimum stake to {} KAMIYO", min_stake as f64 / 1e9);
    }

    // Update pool active status if provided
    if let Some(is_active) = new_is_active {
        stake_pool.is_active = is_active;
        changes_made = true;
        msg!("Pool active status set to: {}", is_active);
    }

    require!(changes_made, StakingError::InvalidAmount);

    stake_pool.last_update_timestamp = clock.unix_timestamp;

    // Emit event
    emit!(PoolUpdateEvent {
        admin: ctx.accounts.admin.key(),
        apy_free: stake_pool.apy_free,
        apy_pro: stake_pool.apy_pro,
        apy_team: stake_pool.apy_team,
        apy_enterprise: stake_pool.apy_enterprise,
        cooldown_period: stake_pool.cooldown_period,
        min_stake_amount: stake_pool.min_stake_amount,
        is_active: stake_pool.is_active,
        timestamp: clock.unix_timestamp,
    });

    msg!("Pool configuration updated successfully");

    Ok(())
}

/// Event emitted when pool configuration is updated
#[event]
pub struct PoolUpdateEvent {
    pub admin: Pubkey,
    pub apy_free: u16,
    pub apy_pro: u16,
    pub apy_team: u16,
    pub apy_enterprise: u16,
    pub cooldown_period: i64,
    pub min_stake_amount: u64,
    pub is_active: bool,
    pub timestamp: i64,
}
