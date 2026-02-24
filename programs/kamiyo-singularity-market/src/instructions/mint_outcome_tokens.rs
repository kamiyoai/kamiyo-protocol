use crate::errors::MarketError;
use crate::state::{Market, MarketStatus};
use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, MintTo, Token, TokenAccount, Transfer};

#[derive(Accounts)]
pub struct MintOutcomeTokens<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        mut,
        constraint = market.status == MarketStatus::Active @ MarketError::MarketNotActive
    )]
    pub market: Account<'info, Market>,

    #[account(
        mut,
        seeds = [Market::YES_MINT_SEED, market.key().as_ref()],
        bump = market.yes_mint_bump
    )]
    pub yes_mint: Account<'info, Mint>,

    #[account(
        mut,
        seeds = [Market::NO_MINT_SEED, market.key().as_ref()],
        bump = market.no_mint_bump
    )]
    pub no_mint: Account<'info, Mint>,

    #[account(
        mut,
        seeds = [Market::VAULT_SEED, market.key().as_ref()],
        bump = market.vault_bump
    )]
    pub vault: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = user_collateral.owner == user.key(),
        constraint = user_collateral.mint == market.collateral_mint
    )]
    pub user_collateral: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = user_yes_tokens.owner == user.key(),
        constraint = user_yes_tokens.mint == yes_mint.key()
    )]
    pub user_yes_tokens: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = user_no_tokens.owner == user.key(),
        constraint = user_no_tokens.mint == no_mint.key()
    )]
    pub user_no_tokens: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

pub fn handler(ctx: Context<MintOutcomeTokens>, amount: u64) -> Result<()> {
    require!(amount > 0, MarketError::InvalidAmount);

    let clock = Clock::get()?;
    let market = &ctx.accounts.market;

    require!(
        clock.unix_timestamp < market.trading_end,
        MarketError::TradingEnded
    );

    // Calculate fee
    // fee_bps is in basis points (100 = 1%)
    let fee_amount = (amount as u128)
        .checked_mul(market.fee_bps as u128)
        .ok_or(MarketError::ArithmeticOverflow)?
        .checked_div(10_000)
        .ok_or(MarketError::ArithmeticOverflow)? as u64;

    // Amount after fee is what gets minted as tokens
    let net_amount = amount
        .checked_sub(fee_amount)
        .ok_or(MarketError::ArithmeticOverflow)?;

    require!(net_amount > 0, MarketError::InvalidAmount);

    // Transfer full collateral from user to vault (includes fee)
    let transfer_ctx = CpiContext::new(
        ctx.accounts.token_program.to_account_info(),
        Transfer {
            from: ctx.accounts.user_collateral.to_account_info(),
            to: ctx.accounts.vault.to_account_info(),
            authority: ctx.accounts.user.to_account_info(),
        },
    );
    token::transfer(transfer_ctx, amount)?;

    // Mint YES tokens to user (net amount after fee)
    let seeds = &[
        Market::SEED_PREFIX,
        market.market_id.as_bytes(),
        &[market.bump],
    ];
    let signer_seeds = &[&seeds[..]];

    let mint_yes_ctx = CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        MintTo {
            mint: ctx.accounts.yes_mint.to_account_info(),
            to: ctx.accounts.user_yes_tokens.to_account_info(),
            authority: ctx.accounts.market.to_account_info(),
        },
        signer_seeds,
    );
    token::mint_to(mint_yes_ctx, net_amount)?;

    // Mint NO tokens to user (net amount after fee)
    let mint_no_ctx = CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        MintTo {
            mint: ctx.accounts.no_mint.to_account_info(),
            to: ctx.accounts.user_no_tokens.to_account_info(),
            authority: ctx.accounts.market.to_account_info(),
        },
        signer_seeds,
    );
    token::mint_to(mint_no_ctx, net_amount)?;

    // Update market state
    let market = &mut ctx.accounts.market;

    // Total collateral includes the full amount (net + fee)
    market.total_collateral = market
        .total_collateral
        .checked_add(amount)
        .ok_or(MarketError::ArithmeticOverflow)?;

    // Token supplies only track the net amount
    market.total_yes_supply = market
        .total_yes_supply
        .checked_add(net_amount)
        .ok_or(MarketError::ArithmeticOverflow)?;
    market.total_no_supply = market
        .total_no_supply
        .checked_add(net_amount)
        .ok_or(MarketError::ArithmeticOverflow)?;

    // Accumulate fees
    market.accumulated_fees = market
        .accumulated_fees
        .checked_add(fee_amount)
        .ok_or(MarketError::ArithmeticOverflow)?;

    emit!(OutcomeTokensMinted {
        market: market.key(),
        user: ctx.accounts.user.key(),
        amount: net_amount,
        fee: fee_amount,
        total_collateral: market.total_collateral,
    });

    Ok(())
}

#[event]
pub struct OutcomeTokensMinted {
    pub market: Pubkey,
    pub user: Pubkey,
    pub amount: u64,
    pub fee: u64,
    pub total_collateral: u64,
}
