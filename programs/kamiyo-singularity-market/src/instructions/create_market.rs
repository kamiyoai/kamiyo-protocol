use crate::errors::MarketError;
use crate::state::{Market, MarketStatus, OracleRegistry, OracleRegistryError};
use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};

pub const KAMIYO_FEE_POOL_AUTHORITY: Pubkey =
    pubkey!("9mEd5iRcdbNUwaCmkPqYggLfg25B2DsTn1w6gNrgvC9d");

#[derive(Accounts)]
#[instruction(market_id: String)]
pub struct CreateMarket<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    /// CHECK: Oracle account that will resolve the market (validated against registry)
    pub oracle: UncheckedAccount<'info>,

    /// Oracle registry for validation (required)
    #[account(
        seeds = [OracleRegistry::SEED_PREFIX],
        bump = oracle_registry.bump
    )]
    pub oracle_registry: Account<'info, OracleRegistry>,

    #[account(
        init,
        payer = authority,
        space = 8 + Market::INIT_SPACE,
        seeds = [Market::SEED_PREFIX, market_id.as_bytes()],
        bump
    )]
    pub market: Account<'info, Market>,

    #[account(
        init,
        payer = authority,
        mint::decimals = 6,
        mint::authority = market,
        seeds = [Market::YES_MINT_SEED, market.key().as_ref()],
        bump
    )]
    pub yes_mint: Account<'info, Mint>,

    #[account(
        init,
        payer = authority,
        mint::decimals = 6,
        mint::authority = market,
        seeds = [Market::NO_MINT_SEED, market.key().as_ref()],
        bump
    )]
    pub no_mint: Account<'info, Mint>,

    #[account(
        init,
        payer = authority,
        token::mint = collateral_mint,
        token::authority = market,
        seeds = [Market::VAULT_SEED, market.key().as_ref()],
        bump
    )]
    pub vault: Account<'info, TokenAccount>,

    pub collateral_mint: Account<'info, Mint>,

    /// CHECK: Protocol treasury authority for fee collection
    #[account(
        constraint = protocol_treasury.key() == KAMIYO_FEE_POOL_AUTHORITY
            @ MarketError::InvalidProtocolTreasury
    )]
    pub protocol_treasury: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn handler(
    ctx: Context<CreateMarket>,
    market_id: String,
    question: String,
    description: String,
    category: String,
    resolution_deadline: i64,
    trading_end: i64,
    fee_bps: u16,
) -> Result<()> {
    // Validate inputs
    require!(market_id.len() <= 64, MarketError::MarketIdTooLong);
    require!(question.len() <= 256, MarketError::QuestionTooLong);
    require!(description.len() <= 512, MarketError::DescriptionTooLong);
    require!(category.len() <= 32, MarketError::CategoryTooLong);
    require!(fee_bps <= 1000, MarketError::InvalidFee); // Max 10%

    // Validate oracle against registry (required)
    require!(
        ctx.accounts
            .oracle_registry
            .is_approved(&ctx.accounts.oracle.key()),
        OracleRegistryError::OracleNotApproved
    );

    let clock = Clock::get()?;
    let current_time = clock.unix_timestamp;

    require!(
        resolution_deadline > current_time,
        MarketError::InvalidResolutionDeadline
    );
    // SECURITY: Ensure trading_end is in the future (prevents immediately-closed markets)
    require!(trading_end > current_time, MarketError::InvalidTradingEnd);
    require!(
        trading_end < resolution_deadline,
        MarketError::TradingEndAfterResolution
    );

    let market = &mut ctx.accounts.market;

    market.market_id = market_id;
    market.question = question;
    market.description = description;
    market.category = category;
    market.authority = ctx.accounts.authority.key();
    market.oracle = ctx.accounts.oracle.key();
    market.yes_mint = ctx.accounts.yes_mint.key();
    market.no_mint = ctx.accounts.no_mint.key();
    market.vault = ctx.accounts.vault.key();
    market.collateral_mint = ctx.accounts.collateral_mint.key();
    market.status = MarketStatus::Active;
    market.resolution_deadline = resolution_deadline;
    market.trading_end = trading_end;
    market.resolved_outcome = 0; // Unresolved
    market.total_collateral = 0;
    market.total_yes_supply = 0;
    market.total_no_supply = 0;
    market.fee_bps = fee_bps;
    market.protocol_fee_share_bps = Market::DEFAULT_PROTOCOL_FEE_SHARE_BPS;
    market.protocol_treasury = ctx.accounts.protocol_treasury.key();
    market.accumulated_fees = 0;
    market.protocol_fees_withdrawn = 0;
    market.creator_fees_withdrawn = 0;
    market.bump = ctx.bumps.market;
    market.yes_mint_bump = ctx.bumps.yes_mint;
    market.no_mint_bump = ctx.bumps.no_mint;
    market.vault_bump = ctx.bumps.vault;
    market.created_at = current_time;
    market.resolved_at = 0;

    emit!(MarketCreated {
        market_id: market.market_id.clone(),
        market: market.key(),
        authority: market.authority,
        oracle: market.oracle,
        question: market.question.clone(),
        resolution_deadline,
        trading_end,
        fee_bps,
    });

    Ok(())
}

#[event]
pub struct MarketCreated {
    pub market_id: String,
    pub market: Pubkey,
    pub authority: Pubkey,
    pub oracle: Pubkey,
    pub question: String,
    pub resolution_deadline: i64,
    pub trading_end: i64,
    pub fee_bps: u16,
}
