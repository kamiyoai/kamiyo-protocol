use crate::state::{DeFiError, LendingPool, MarginAccount, YieldSource, YieldVault};
use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

#[derive(Accounts)]
pub struct InitializeYieldVault<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    /// CHECK: Market account
    pub market: UncheckedAccount<'info>,

    pub yield_mint: Account<'info, token::Mint>,

    #[account(
        init,
        payer = authority,
        space = 8 + YieldVault::INIT_SPACE,
        seeds = [YieldVault::SEED_PREFIX, market.key().as_ref()],
        bump
    )]
    pub yield_vault: Account<'info, YieldVault>,

    #[account(
        init,
        payer = authority,
        token::mint = yield_mint,
        token::authority = vault_authority,
    )]
    pub vault_token_account: Account<'info, TokenAccount>,

    /// CHECK: PDA authority
    #[account(
        seeds = [b"vault_authority", yield_vault.key().as_ref()],
        bump
    )]
    pub vault_authority: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

pub fn initialize_yield_vault(
    ctx: Context<InitializeYieldVault>,
    yield_source: u8,
    min_harvest_interval: u64,
    protocol_fee_bps: u16,
) -> Result<()> {
    let vault = &mut ctx.accounts.yield_vault;
    let clock = Clock::get()?;

    vault.market = ctx.accounts.market.key();
    vault.yield_mint = ctx.accounts.yield_mint.key();
    vault.vault = ctx.accounts.vault_token_account.key();
    vault.authority = ctx.accounts.vault_authority.key();
    vault.yield_source = yield_source;
    vault.bump = ctx.bumps.yield_vault;
    vault.is_active = true;
    vault._padding = [0; 1];
    vault.total_deposited = 0;
    vault.yield_accrued = 0;
    vault.last_harvest = clock.unix_timestamp;
    vault.last_exchange_rate = YieldVault::RATE_SCALE;
    vault.min_harvest_interval = min_harvest_interval;
    vault.protocol_fee_bps = protocol_fee_bps;
    vault._padding2 = [0; 6];
    vault._reserved = [0; 32];

    Ok(())
}

#[derive(Accounts)]
pub struct DepositToYieldVault<'info> {
    #[account(mut)]
    pub depositor: Signer<'info>,

    #[account(
        mut,
        constraint = yield_vault.is_active @ DeFiError::YieldVaultNotActive
    )]
    pub yield_vault: Account<'info, YieldVault>,

    #[account(mut)]
    pub depositor_token_account: Account<'info, TokenAccount>,

    #[account(
        mut,
        address = yield_vault.vault
    )]
    pub vault_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

pub fn deposit_to_yield_vault(ctx: Context<DepositToYieldVault>, amount: u64) -> Result<()> {
    let vault = &mut ctx.accounts.yield_vault;

    token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.depositor_token_account.to_account_info(),
                to: ctx.accounts.vault_token_account.to_account_info(),
                authority: ctx.accounts.depositor.to_account_info(),
            },
        ),
        amount,
    )?;

    vault.total_deposited = vault.total_deposited.saturating_add(amount);

    Ok(())
}

#[derive(Accounts)]
pub struct HarvestYield<'info> {
    pub harvester: Signer<'info>,

    #[account(
        mut,
        constraint = yield_vault.is_active @ DeFiError::YieldVaultNotActive
    )]
    pub yield_vault: Account<'info, YieldVault>,

    #[account(address = yield_vault.vault)]
    pub vault_token_account: Account<'info, TokenAccount>,
}

pub fn harvest_yield(ctx: Context<HarvestYield>, current_rate: u64) -> Result<()> {
    let vault = &mut ctx.accounts.yield_vault;
    let clock = Clock::get()?;

    require!(
        vault.can_harvest(clock.unix_timestamp),
        DeFiError::HarvestTooSoon
    );

    let current_balance = ctx.accounts.vault_token_account.amount;
    let pending = vault.pending_yield(current_balance, current_rate);

    if pending > 0 {
        let protocol_fee = (pending as u128 * vault.protocol_fee_bps as u128 / 10000) as u64;
        let net_yield = pending.saturating_sub(protocol_fee);

        vault.yield_accrued = vault.yield_accrued.saturating_add(net_yield);
    }

    vault.last_harvest = clock.unix_timestamp;
    vault.last_exchange_rate = current_rate;

    Ok(())
}

#[derive(Accounts)]
pub struct InitializeMarginAccount<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    pub collateral_mint: Account<'info, token::Mint>,

    #[account(
        init,
        payer = owner,
        space = 8 + MarginAccount::INIT_SPACE,
        seeds = [MarginAccount::SEED_PREFIX, owner.key().as_ref()],
        bump
    )]
    pub margin_account: Account<'info, MarginAccount>,

    #[account(
        init,
        payer = owner,
        token::mint = collateral_mint,
        token::authority = margin_account,
    )]
    pub collateral_vault: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

pub fn initialize_margin_account(
    ctx: Context<InitializeMarginAccount>,
    max_leverage: u8,
    liquidation_threshold_bps: u16,
) -> Result<()> {
    let account = &mut ctx.accounts.margin_account;
    let clock = Clock::get()?;

    account.owner = ctx.accounts.owner.key();
    account.collateral_mint = ctx.accounts.collateral_mint.key();
    account.collateral_vault = ctx.accounts.collateral_vault.key();
    account.bump = ctx.bumps.margin_account;
    account.is_active = true;
    account.max_leverage = max_leverage;
    account._padding = [0; 1];
    account.collateral = 0;
    account.borrowed = 0;
    account.interest_accrued = 0;
    account.health_factor = u16::MAX;
    account.liquidation_threshold_bps = liquidation_threshold_bps;
    account.last_health_update = clock.unix_timestamp;
    account._padding2 = [0; 4];
    account.total_borrowed = 0;
    account.total_interest_paid = 0;
    account.liquidation_count = 0;
    account._padding3 = [0; 6];
    account._reserved = [0; 32];

    Ok(())
}

#[derive(Accounts)]
pub struct DepositCollateral<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        mut,
        seeds = [MarginAccount::SEED_PREFIX, owner.key().as_ref()],
        bump = margin_account.bump,
        has_one = owner,
        constraint = margin_account.is_active @ DeFiError::MarginNotActive
    )]
    pub margin_account: Account<'info, MarginAccount>,

    #[account(mut)]
    pub owner_token_account: Account<'info, TokenAccount>,

    #[account(
        mut,
        address = margin_account.collateral_vault
    )]
    pub collateral_vault: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

pub fn deposit_collateral(ctx: Context<DepositCollateral>, amount: u64) -> Result<()> {
    let account = &mut ctx.accounts.margin_account;
    let clock = Clock::get()?;

    token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.owner_token_account.to_account_info(),
                to: ctx.accounts.collateral_vault.to_account_info(),
                authority: ctx.accounts.owner.to_account_info(),
            },
        ),
        amount,
    )?;

    account.collateral = account.collateral.saturating_add(amount);
    account.last_health_update = clock.unix_timestamp;

    // Recalculate health
    let debt = account.borrowed.saturating_add(account.interest_accrued);
    account.health_factor = account.calculate_health(account.collateral, debt);

    Ok(())
}

#[derive(Accounts)]
pub struct Borrow<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        mut,
        seeds = [MarginAccount::SEED_PREFIX, owner.key().as_ref()],
        bump = margin_account.bump,
        has_one = owner,
        constraint = margin_account.is_active @ DeFiError::MarginNotActive
    )]
    pub margin_account: Account<'info, MarginAccount>,

    #[account(
        mut,
        constraint = lending_pool.is_active @ DeFiError::LendingPoolNotActive
    )]
    pub lending_pool: Account<'info, LendingPool>,

    #[account(
        mut,
        address = lending_pool.vault
    )]
    pub pool_vault: Account<'info, TokenAccount>,

    #[account(mut)]
    pub owner_token_account: Account<'info, TokenAccount>,

    /// CHECK: Pool authority PDA
    #[account(
        seeds = [b"pool_authority", lending_pool.key().as_ref()],
        bump
    )]
    pub pool_authority: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token>,
}

pub fn borrow(ctx: Context<Borrow>, amount: u64) -> Result<()> {
    let clock = Clock::get()?;

    // Capture immutable values before mutable borrows
    let pool_key = ctx.accounts.lending_pool.key();
    let pool_authority_bump = ctx.bumps.pool_authority;

    let margin = &mut ctx.accounts.margin_account;
    let pool = &mut ctx.accounts.lending_pool;

    // Check margin can borrow
    require!(margin.can_borrow(amount), DeFiError::LeverageExceeded);

    // Check pool liquidity
    require!(pool.can_borrow(amount), DeFiError::UtilizationTooHigh);
    require!(
        pool.available_liquidity() >= amount,
        DeFiError::InsufficientLiquidity
    );

    // Transfer from pool to borrower
    let seeds = &[
        b"pool_authority".as_ref(),
        pool_key.as_ref(),
        &[pool_authority_bump],
    ];
    let signer = &[&seeds[..]];

    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.pool_vault.to_account_info(),
                to: ctx.accounts.owner_token_account.to_account_info(),
                authority: ctx.accounts.pool_authority.to_account_info(),
            },
            signer,
        ),
        amount,
    )?;

    // Update margin account
    margin.borrowed = margin.borrowed.saturating_add(amount);
    margin.total_borrowed = margin.total_borrowed.saturating_add(amount);
    margin.last_health_update = clock.unix_timestamp;

    // Recalculate health
    let debt = margin.borrowed.saturating_add(margin.interest_accrued);
    margin.health_factor = margin.calculate_health(margin.collateral, debt);

    // Check still healthy
    require!(margin.is_healthy(), DeFiError::PositionUnhealthy);

    // Update pool
    pool.total_borrowed = pool.total_borrowed.saturating_add(amount);

    Ok(())
}

#[derive(Accounts)]
pub struct InitializeLendingPool<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    pub asset_mint: Account<'info, token::Mint>,

    #[account(
        init,
        payer = authority,
        space = 8 + LendingPool::INIT_SPACE,
        seeds = [LendingPool::SEED_PREFIX, asset_mint.key().as_ref()],
        bump
    )]
    pub lending_pool: Account<'info, LendingPool>,

    #[account(
        init,
        payer = authority,
        token::mint = asset_mint,
        token::authority = pool_authority,
    )]
    pub vault: Account<'info, TokenAccount>,

    /// CHECK: Receipt token mint (would be initialized separately)
    pub receipt_mint: UncheckedAccount<'info>,

    /// CHECK: Pool authority PDA
    #[account(
        seeds = [b"pool_authority", lending_pool.key().as_ref()],
        bump
    )]
    pub pool_authority: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

pub fn initialize_lending_pool(
    ctx: Context<InitializeLendingPool>,
    base_rate_bps: u16,
    utilization_multiplier_bps: u16,
    protocol_fee_bps: u16,
    max_utilization_bps: u16,
    min_deposit: u64,
) -> Result<()> {
    let pool = &mut ctx.accounts.lending_pool;

    pool.authority = ctx.accounts.authority.key();
    pool.asset_mint = ctx.accounts.asset_mint.key();
    pool.vault = ctx.accounts.vault.key();
    pool.receipt_mint = ctx.accounts.receipt_mint.key();
    pool.bump = ctx.bumps.lending_pool;
    pool.is_active = true;
    pool._padding = [0; 2];
    pool.total_deposits = 0;
    pool.total_borrowed = 0;
    pool.interest_collected = 0;
    pool.base_rate_bps = base_rate_bps;
    pool.utilization_multiplier_bps = utilization_multiplier_bps;
    pool.protocol_fee_bps = protocol_fee_bps;
    pool._padding2 = [0; 2];
    pool.max_utilization_bps = max_utilization_bps;
    pool.min_deposit = min_deposit;
    pool._padding3 = [0; 6];
    pool._reserved = [0; 32];

    Ok(())
}

#[derive(Accounts)]
pub struct DepositToPool<'info> {
    #[account(mut)]
    pub depositor: Signer<'info>,

    #[account(
        mut,
        constraint = lending_pool.is_active @ DeFiError::LendingPoolNotActive
    )]
    pub lending_pool: Account<'info, LendingPool>,

    #[account(mut)]
    pub depositor_token_account: Account<'info, TokenAccount>,

    #[account(
        mut,
        address = lending_pool.vault
    )]
    pub vault: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

pub fn deposit_to_pool(ctx: Context<DepositToPool>, amount: u64) -> Result<()> {
    let pool = &mut ctx.accounts.lending_pool;

    token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.depositor_token_account.to_account_info(),
                to: ctx.accounts.vault.to_account_info(),
                authority: ctx.accounts.depositor.to_account_info(),
            },
        ),
        amount,
    )?;

    pool.total_deposits = pool.total_deposits.saturating_add(amount);

    Ok(())
}
