use crate::errors::MarketError;
use crate::state::{Market, MarketStatus};
use anchor_lang::prelude::*;
use anchor_spl::token::{self, Burn, Mint, Token, TokenAccount, Transfer};

/// Refund instruction for cancelled markets.
/// Users can burn their YES/NO tokens (either or both) and receive collateral back.
/// This is the ONLY way to recover funds from a cancelled market.
#[derive(Accounts)]
pub struct RefundCancelled<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        mut,
        // SECURITY: Only allow refunds on cancelled markets
        constraint = market.status == MarketStatus::Cancelled @ MarketError::MarketNotCancelled
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

pub fn handler(ctx: Context<RefundCancelled>) -> Result<()> {
    let yes_amount = ctx.accounts.user_yes_tokens.amount;
    let no_amount = ctx.accounts.user_no_tokens.amount;

    // User must have at least some tokens to refund
    require!(
        yes_amount > 0 || no_amount > 0,
        MarketError::NoTokensToRefund
    );

    let market = &ctx.accounts.market;

    // For cancelled markets, refund strategy:
    // 1. Paired tokens (1 YES + 1 NO) = 1 collateral (same as normal redemption)
    // 2. Unpaired tokens = 0.5 collateral each (fair split since market was cancelled)
    //
    // This ensures all collateral can be fully reclaimed when market is cancelled.
    // Users who hold only YES or only NO still get partial value back.
    let paired_amount = yes_amount.min(no_amount);
    let unpaired_yes = yes_amount.saturating_sub(paired_amount);
    let unpaired_no = no_amount.saturating_sub(paired_amount);

    // Refund calculation:
    // - Paired: 1 collateral per pair
    // - Unpaired: 0.5 collateral per token (divide by 2)
    let unpaired_total = unpaired_yes
        .checked_add(unpaired_no)
        .ok_or(MarketError::ArithmeticOverflow)?;
    let unpaired_refund = unpaired_total / 2; // Integer division rounds down

    let refund_amount = paired_amount
        .checked_add(unpaired_refund)
        .ok_or(MarketError::ArithmeticOverflow)?;

    require!(refund_amount > 0, MarketError::NoTokensToRefund);

    // Track how many tokens to burn (all of them)
    let yes_to_burn = yes_amount;
    let no_to_burn = no_amount;

    // Burn all YES tokens
    if yes_to_burn > 0 {
        let burn_yes_ctx = CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Burn {
                mint: ctx.accounts.yes_mint.to_account_info(),
                from: ctx.accounts.user_yes_tokens.to_account_info(),
                authority: ctx.accounts.user.to_account_info(),
            },
        );
        token::burn(burn_yes_ctx, yes_to_burn)?;
    }

    // Burn all NO tokens
    if no_to_burn > 0 {
        let burn_no_ctx = CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Burn {
                mint: ctx.accounts.no_mint.to_account_info(),
                from: ctx.accounts.user_no_tokens.to_account_info(),
                authority: ctx.accounts.user.to_account_info(),
            },
        );
        token::burn(burn_no_ctx, no_to_burn)?;
    }

    // Transfer collateral back to user
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
    token::transfer(transfer_ctx, refund_amount)?;

    // Update market state
    let market = &mut ctx.accounts.market;
    market.total_collateral = market
        .total_collateral
        .checked_sub(refund_amount)
        .ok_or(MarketError::ArithmeticOverflow)?;
    market.total_yes_supply = market
        .total_yes_supply
        .checked_sub(yes_to_burn)
        .ok_or(MarketError::ArithmeticOverflow)?;
    market.total_no_supply = market
        .total_no_supply
        .checked_sub(no_to_burn)
        .ok_or(MarketError::ArithmeticOverflow)?;

    emit!(CancelledMarketRefund {
        market: market.key(),
        user: ctx.accounts.user.key(),
        refund_amount,
        remaining_collateral: market.total_collateral,
    });

    Ok(())
}

#[event]
pub struct CancelledMarketRefund {
    pub market: Pubkey,
    pub user: Pubkey,
    pub refund_amount: u64,
    pub remaining_collateral: u64,
}
