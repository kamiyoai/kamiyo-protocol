use crate::errors::MarketError;
use crate::state::{Market, MarketStatus};
use anchor_lang::prelude::*;
use anchor_spl::token::{self, Burn, Mint, Token, TokenAccount, Transfer};

#[derive(Accounts)]
pub struct ClaimWinnings<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        mut,
        constraint = market.status == MarketStatus::Resolved @ MarketError::MarketNotResolved
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

pub fn handler(ctx: Context<ClaimWinnings>) -> Result<()> {
    let market = &ctx.accounts.market;

    // Determine winning tokens based on outcome
    let (winning_amount, losing_amount) = match market.resolved_outcome {
        1 => (
            ctx.accounts.user_yes_tokens.amount,
            ctx.accounts.user_no_tokens.amount,
        ), // YES won
        2 => (
            ctx.accounts.user_no_tokens.amount,
            ctx.accounts.user_yes_tokens.amount,
        ), // NO won
        _ => return Err(MarketError::MarketNotResolved.into()),
    };

    require!(winning_amount > 0, MarketError::NoWinningsToClaim);

    // Calculate fee on winnings
    // fee_bps is in basis points (100 = 1%)
    let fee_amount = (winning_amount as u128)
        .checked_mul(market.fee_bps as u128)
        .ok_or(MarketError::ArithmeticOverflow)?
        .checked_div(10_000)
        .ok_or(MarketError::ArithmeticOverflow)? as u64;

    // Net payout after fee (1:1 ratio - each winning token = 1 collateral unit, minus fee)
    let payout_amount = winning_amount
        .checked_sub(fee_amount)
        .ok_or(MarketError::ArithmeticOverflow)?;

    require!(payout_amount > 0, MarketError::InvalidAmount);

    // Verify vault has sufficient balance before transfer
    require!(
        ctx.accounts.vault.amount >= payout_amount,
        MarketError::InsufficientVaultBalance
    );

    // Burn winning tokens
    let (winning_mint, winning_account) = match market.resolved_outcome {
        1 => (
            ctx.accounts.yes_mint.to_account_info(),
            ctx.accounts.user_yes_tokens.to_account_info(),
        ),
        2 => (
            ctx.accounts.no_mint.to_account_info(),
            ctx.accounts.user_no_tokens.to_account_info(),
        ),
        _ => return Err(MarketError::MarketNotResolved.into()),
    };

    let burn_ctx = CpiContext::new(
        ctx.accounts.token_program.to_account_info(),
        Burn {
            mint: winning_mint,
            from: winning_account,
            authority: ctx.accounts.user.to_account_info(),
        },
    );
    token::burn(burn_ctx, winning_amount)?;

    // Burn losing tokens if any
    if losing_amount > 0 {
        let (losing_mint, losing_account) = match market.resolved_outcome {
            1 => (
                ctx.accounts.no_mint.to_account_info(),
                ctx.accounts.user_no_tokens.to_account_info(),
            ),
            2 => (
                ctx.accounts.yes_mint.to_account_info(),
                ctx.accounts.user_yes_tokens.to_account_info(),
            ),
            _ => return Err(MarketError::MarketNotResolved.into()),
        };

        let burn_losing_ctx = CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Burn {
                mint: losing_mint,
                from: losing_account,
                authority: ctx.accounts.user.to_account_info(),
            },
        );
        token::burn(burn_losing_ctx, losing_amount)?;
    }

    // Transfer collateral to user
    let seeds = &[
        Market::SEED_PREFIX,
        market.market_id.as_bytes(),
        &[market.bump],
    ];
    let signer_seeds = &[&seeds[..]];

    let transfer_ctx = CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        Transfer {
            from: ctx.accounts.vault.to_account_info(),
            to: ctx.accounts.user_collateral.to_account_info(),
            authority: ctx.accounts.market.to_account_info(),
        },
        signer_seeds,
    );
    token::transfer(transfer_ctx, payout_amount)?;

    // Update market state
    let market = &mut ctx.accounts.market;

    // Decrease total collateral by payout amount only (fee stays)
    market.total_collateral = market
        .total_collateral
        .checked_sub(payout_amount)
        .ok_or(MarketError::ArithmeticOverflow)?;

    // Accumulate fees
    market.accumulated_fees = market
        .accumulated_fees
        .checked_add(fee_amount)
        .ok_or(MarketError::ArithmeticOverflow)?;

    emit!(WinningsClaimed {
        market: market.key(),
        user: ctx.accounts.user.key(),
        winning_tokens_burned: winning_amount,
        losing_tokens_burned: losing_amount,
        fee: fee_amount,
        payout_amount,
    });

    Ok(())
}

#[event]
pub struct WinningsClaimed {
    pub market: Pubkey,
    pub user: Pubkey,
    pub winning_tokens_burned: u64,
    pub losing_tokens_burned: u64,
    pub fee: u64,
    pub payout_amount: u64,
}
