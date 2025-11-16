use anchor_lang::prelude::*;

declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");

pub mod constants;
pub mod errors;
pub mod state;
pub mod instructions;

use instructions::*;

/// KAMIYO Staking Program
///
/// Provides tiered APY rewards for KAMIYO token holders based on stake amount.
/// Integrates with x402 payment system to provide fee discounts and priority access.
///
/// Features:
/// - 4 tiers: Free (0%), Pro (10%), Team (15%), Enterprise (25%) APY
/// - 14-day unstaking cooldown period
/// - Minimum stake: 100 KAMIYO
/// - Revenue-backed rewards from x402 platform fees
/// - Governance voting weight based on tier
///
/// Phase 1 Aligned:
/// - Matches standardized tier structure (Free/Pro/Team/Enterprise)
/// - 10-30% x402 fee discounts per tier
/// - Governance weights: 0x, 1x, 2x, 5x
///
#[program]
pub mod kamiyo_staking {
    use super::*;

    /// Initialize the global staking pool
    ///
    /// Sets up the staking pool with default APY rates, cooldown period,
    /// and creates vault accounts for staked and reward tokens.
    ///
    /// # Arguments
    /// * `ctx` - Accounts context containing admin, mint, pool, and vaults
    ///
    /// # Returns
    /// * `Result<()>` - Success or error
    pub fn initialize_pool(ctx: Context<InitializePool>) -> Result<()> {
        instructions::initialize_pool::handler(ctx)
    }

    /// Stake KAMIYO tokens into the pool
    ///
    /// Transfers tokens from user to stake vault and creates/updates user stake account.
    /// Automatically calculates tier based on total staked amount.
    ///
    /// # Arguments
    /// * `ctx` - Accounts context containing user, pool, stake account, and vaults
    /// * `amount` - Amount of KAMIYO to stake (in base units, 9 decimals)
    ///
    /// # Returns
    /// * `Result<()>` - Success or error
    pub fn stake(ctx: Context<Stake>, amount: u64) -> Result<()> {
        instructions::stake::handler(ctx, amount)
    }

    /// Claim accrued staking rewards
    ///
    /// Calculates rewards earned since last claim and transfers from reward vault.
    /// Rewards are based on staked amount, tier APY, and time elapsed.
    ///
    /// # Arguments
    /// * `ctx` - Accounts context containing user, pool, stake account, and reward vault
    ///
    /// # Returns
    /// * `Result<()>` - Success or error
    pub fn claim_rewards(ctx: Context<ClaimRewards>) -> Result<()> {
        instructions::claim_rewards::handler(ctx)
    }

    /// Initiate unstaking process
    ///
    /// Starts 14-day cooldown period before tokens can be withdrawn.
    /// User immediately loses tier benefits and cannot stake more during cooldown.
    ///
    /// # Arguments
    /// * `ctx` - Accounts context containing user, pool, and stake account
    /// * `amount` - Amount of KAMIYO to unstake (in base units, 9 decimals)
    ///
    /// # Returns
    /// * `Result<()>` - Success or error
    pub fn unstake(ctx: Context<Unstake>, amount: u64) -> Result<()> {
        instructions::unstake::handler(ctx, amount)
    }

    /// Complete withdrawal after cooldown period
    ///
    /// Transfers staked tokens back to user after 14-day cooldown has elapsed.
    /// Updates pool statistics and user stake account.
    ///
    /// # Arguments
    /// * `ctx` - Accounts context containing user, pool, stake account, and stake vault
    ///
    /// # Returns
    /// * `Result<()>` - Success or error
    pub fn withdraw(ctx: Context<Withdraw>) -> Result<()> {
        instructions::withdraw::handler(ctx)
    }

    /// Update pool configuration (admin-only)
    ///
    /// Allows governance to adjust APY rates, cooldown period, minimum stake,
    /// and pool active status. Only callable by pool admin.
    ///
    /// # Arguments
    /// * `ctx` - Accounts context containing admin and pool
    /// * `new_apy_free` - Optional new APY for Free tier (basis points)
    /// * `new_apy_pro` - Optional new APY for Pro tier (basis points)
    /// * `new_apy_team` - Optional new APY for Team tier (basis points)
    /// * `new_apy_enterprise` - Optional new APY for Enterprise tier (basis points)
    /// * `new_cooldown_period` - Optional new cooldown period (seconds)
    /// * `new_min_stake_amount` - Optional new minimum stake (base units)
    /// * `new_is_active` - Optional new active status
    ///
    /// # Returns
    /// * `Result<()>` - Success or error
    pub fn update_pool(
        ctx: Context<UpdatePool>,
        new_apy_free: Option<u16>,
        new_apy_pro: Option<u16>,
        new_apy_team: Option<u16>,
        new_apy_enterprise: Option<u16>,
        new_cooldown_period: Option<i64>,
        new_min_stake_amount: Option<u64>,
        new_is_active: Option<bool>,
    ) -> Result<()> {
        instructions::update_pool::handler(
            ctx,
            new_apy_free,
            new_apy_pro,
            new_apy_team,
            new_apy_enterprise,
            new_cooldown_period,
            new_min_stake_amount,
            new_is_active,
        )
    }

    /// Fund the reward vault (admin-only)
    ///
    /// Transfers KAMIYO tokens from admin to reward vault.
    /// This is how staking rewards are funded from x402 platform revenue (30% allocation).
    ///
    /// # Arguments
    /// * `ctx` - Accounts context containing admin, pool, and reward vault
    /// * `amount` - Amount of KAMIYO to add to reward vault (base units)
    ///
    /// # Returns
    /// * `Result<()>` - Success or error
    pub fn fund_pool(ctx: Context<FundPool>, amount: u64) -> Result<()> {
        instructions::fund_pool::handler(ctx, amount)
    }
}
