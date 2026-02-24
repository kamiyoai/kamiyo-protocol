use anchor_lang::prelude::*;
use anchor_spl::token::{self, Burn, Mint, Token, TokenAccount, Transfer};

use crate::errors::OrderBookError;
use crate::state::{OpenOrdersAccount, OrderBookConfig, ResolutionOutcome};

/// Redeem outcome tokens for collateral after market resolution
#[derive(Accounts)]
pub struct Redeem<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        seeds = [OrderBookConfig::SEED_PREFIX],
        bump = config.bump,
    )]
    pub config: Account<'info, OrderBookConfig>,

    /// CHECK: Market account - must be resolved
    #[account(
        constraint = is_market_resolved(&market) @ OrderBookError::MarketNotReadyForResolution
    )]
    pub market: AccountInfo<'info>,

    #[account(
        mut,
        seeds = [OpenOrdersAccount::SEED_PREFIX, market.key().as_ref(), owner.key().as_ref()],
        bump = open_orders.bump,
        constraint = open_orders.owner == owner.key() @ OrderBookError::UnauthorizedOwner
    )]
    pub open_orders: Account<'info, OpenOrdersAccount>,

    /// YES token mint
    #[account(mut)]
    pub yes_mint: Account<'info, Mint>,

    /// NO token mint
    #[account(mut)]
    pub no_mint: Account<'info, Mint>,

    /// User's YES token account
    #[account(
        mut,
        constraint = user_yes_account.owner == owner.key() @ OrderBookError::UnauthorizedOwner,
        constraint = user_yes_account.mint == yes_mint.key() @ OrderBookError::InvalidBuyerCollateral
    )]
    pub user_yes_account: Account<'info, TokenAccount>,

    /// User's NO token account
    #[account(
        mut,
        constraint = user_no_account.owner == owner.key() @ OrderBookError::UnauthorizedOwner,
        constraint = user_no_account.mint == no_mint.key() @ OrderBookError::InvalidBuyerCollateral
    )]
    pub user_no_account: Account<'info, TokenAccount>,

    /// User's collateral token account
    #[account(
        mut,
        constraint = user_collateral.owner == owner.key() @ OrderBookError::UnauthorizedOwner
    )]
    pub user_collateral: Account<'info, TokenAccount>,

    /// Market's collateral vault
    #[account(mut)]
    pub market_vault: Account<'info, TokenAccount>,

    /// CHECK: Market authority PDA for vault transfers
    #[account(
        seeds = [b"market_authority", market.key().as_ref()],
        bump
    )]
    pub market_authority: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct RedeemResult {
    pub yes_burned: u64,
    pub no_burned: u64,
    pub collateral_received: u64,
}

pub fn handler(ctx: Context<Redeem>) -> Result<RedeemResult> {
    let market_data = ctx.accounts.market.try_borrow_data()?;

    // Read resolved outcome from market (offset varies by market structure)
    // Simplified: assuming outcome is at a known offset
    let resolved_outcome = read_market_outcome(&market_data)?;

    let open_orders = &mut ctx.accounts.open_orders;

    // Calculate redemption amounts based on outcome
    let (yes_to_burn, no_to_burn, collateral_to_receive) = match resolved_outcome {
        ResolutionOutcome::Yes => {
            // YES wins: burn all YES tokens, receive 1:1 collateral
            let yes_amount = open_orders.yes_free.saturating_add(open_orders.yes_locked);
            // NO tokens are worthless
            let no_amount = open_orders.no_free.saturating_add(open_orders.no_locked);
            (yes_amount, no_amount, yes_amount)
        }
        ResolutionOutcome::No => {
            // NO wins: burn all NO tokens, receive 1:1 collateral
            let no_amount = open_orders.no_free.saturating_add(open_orders.no_locked);
            // YES tokens are worthless
            let yes_amount = open_orders.yes_free.saturating_add(open_orders.yes_locked);
            (yes_amount, no_amount, no_amount)
        }
        ResolutionOutcome::Invalid => {
            // Market invalid: return collateral for all tokens at 50%
            let yes_amount = open_orders.yes_free.saturating_add(open_orders.yes_locked);
            let no_amount = open_orders.no_free.saturating_add(open_orders.no_locked);
            let collateral = yes_amount
                .saturating_add(no_amount)
                .checked_div(2)
                .unwrap_or(0);
            (yes_amount, no_amount, collateral)
        }
        ResolutionOutcome::Unresolved => {
            return Err(OrderBookError::MarketNotReadyForResolution.into());
        }
    };

    // Burn YES tokens if any
    if yes_to_burn > 0 {
        let burn_ctx = CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Burn {
                mint: ctx.accounts.yes_mint.to_account_info(),
                from: ctx.accounts.user_yes_account.to_account_info(),
                authority: ctx.accounts.owner.to_account_info(),
            },
        );
        token::burn(burn_ctx, yes_to_burn)?;
    }

    // Burn NO tokens if any
    if no_to_burn > 0 {
        let burn_ctx = CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Burn {
                mint: ctx.accounts.no_mint.to_account_info(),
                from: ctx.accounts.user_no_account.to_account_info(),
                authority: ctx.accounts.owner.to_account_info(),
            },
        );
        token::burn(burn_ctx, no_to_burn)?;
    }

    // Transfer collateral from vault to user
    if collateral_to_receive > 0 {
        let market_key = ctx.accounts.market.key();
        let seeds = &[
            b"market_authority".as_ref(),
            market_key.as_ref(),
            &[ctx.bumps.market_authority],
        ];
        let signer_seeds = &[&seeds[..]];

        let transfer_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.market_vault.to_account_info(),
                to: ctx.accounts.user_collateral.to_account_info(),
                authority: ctx.accounts.market_authority.to_account_info(),
            },
            signer_seeds,
        );
        token::transfer(transfer_ctx, collateral_to_receive)?;
    }

    // Clear user's position
    open_orders.yes_free = 0;
    open_orders.yes_locked = 0;
    open_orders.no_free = 0;
    open_orders.no_locked = 0;

    // Also return any remaining collateral (from cancelled orders, etc.)
    let remaining_collateral = open_orders
        .collateral_free
        .saturating_add(open_orders.collateral_locked);
    if remaining_collateral > 0 {
        let market_key = ctx.accounts.market.key();
        let seeds = &[
            b"market_authority".as_ref(),
            market_key.as_ref(),
            &[ctx.bumps.market_authority],
        ];
        let signer_seeds = &[&seeds[..]];

        let transfer_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.market_vault.to_account_info(),
                to: ctx.accounts.user_collateral.to_account_info(),
                authority: ctx.accounts.market_authority.to_account_info(),
            },
            signer_seeds,
        );
        token::transfer(transfer_ctx, remaining_collateral)?;
    }

    let total_collateral = collateral_to_receive.saturating_add(remaining_collateral);
    open_orders.collateral_free = 0;
    open_orders.collateral_locked = 0;

    emit!(Redeemed {
        market: ctx.accounts.market.key(),
        owner: ctx.accounts.owner.key(),
        outcome: resolved_outcome as u8,
        yes_burned: yes_to_burn,
        no_burned: no_to_burn,
        collateral_received: total_collateral,
    });

    Ok(RedeemResult {
        yes_burned: yes_to_burn,
        no_burned: no_to_burn,
        collateral_received: total_collateral,
    })
}

/// Check if market is resolved by reading status byte
fn is_market_resolved(market: &AccountInfo) -> bool {
    if let Ok(data) = market.try_borrow_data() {
        // Status byte at offset depends on market structure
        // Simplified: check known offset
        if data.len() > 100 {
            // MarketV2 status at offset ~88 (after authority, oracle_feed, oracle_config)
            let status_offset = 88;
            return data.get(status_offset).map(|&s| s == 2).unwrap_or(false);
        }
    }
    false
}

/// Read resolved outcome from market data
fn read_market_outcome(data: &[u8]) -> Result<ResolutionOutcome> {
    // resolved_outcome byte at offset after status
    let outcome_offset = 89;
    let outcome = data
        .get(outcome_offset)
        .copied()
        .ok_or(OrderBookError::OracleFeedInvalid)?;

    Ok(ResolutionOutcome::from(outcome))
}

#[event]
pub struct Redeemed {
    pub market: Pubkey,
    pub owner: Pubkey,
    pub outcome: u8,
    pub yes_burned: u64,
    pub no_burned: u64,
    pub collateral_received: u64,
}

/// Mint outcome token sets (YES + NO) for collateral
#[derive(Accounts)]
pub struct MintTokenSet<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        seeds = [OrderBookConfig::SEED_PREFIX],
        bump = config.bump,
        constraint = !config.paused @ OrderBookError::MarketNotActive
    )]
    pub config: Account<'info, OrderBookConfig>,

    /// CHECK: Market account
    pub market: AccountInfo<'info>,

    #[account(
        mut,
        seeds = [OpenOrdersAccount::SEED_PREFIX, market.key().as_ref(), owner.key().as_ref()],
        bump = open_orders.bump,
        constraint = open_orders.owner == owner.key() @ OrderBookError::UnauthorizedOwner
    )]
    pub open_orders: Account<'info, OpenOrdersAccount>,

    /// YES token mint
    #[account(mut)]
    pub yes_mint: Account<'info, Mint>,

    /// NO token mint
    #[account(mut)]
    pub no_mint: Account<'info, Mint>,

    /// User's YES token account
    #[account(
        mut,
        constraint = user_yes_account.owner == owner.key() @ OrderBookError::UnauthorizedOwner,
        constraint = user_yes_account.mint == yes_mint.key() @ OrderBookError::InvalidBuyerCollateral
    )]
    pub user_yes_account: Account<'info, TokenAccount>,

    /// User's NO token account
    #[account(
        mut,
        constraint = user_no_account.owner == owner.key() @ OrderBookError::UnauthorizedOwner,
        constraint = user_no_account.mint == no_mint.key() @ OrderBookError::InvalidBuyerCollateral
    )]
    pub user_no_account: Account<'info, TokenAccount>,

    /// User's collateral token account
    #[account(
        mut,
        constraint = user_collateral.owner == owner.key() @ OrderBookError::UnauthorizedOwner
    )]
    pub user_collateral: Account<'info, TokenAccount>,

    /// Market's collateral vault
    #[account(mut)]
    pub market_vault: Account<'info, TokenAccount>,

    /// CHECK: Mint authority PDA
    #[account(
        seeds = [b"mint_authority", market.key().as_ref()],
        bump
    )]
    pub mint_authority: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token>,
}

pub fn handler_mint_set(ctx: Context<MintTokenSet>, amount: u64) -> Result<()> {
    require!(amount > 0, OrderBookError::InvalidQuantity);

    // Transfer collateral from user to vault
    let transfer_ctx = CpiContext::new(
        ctx.accounts.token_program.to_account_info(),
        Transfer {
            from: ctx.accounts.user_collateral.to_account_info(),
            to: ctx.accounts.market_vault.to_account_info(),
            authority: ctx.accounts.owner.to_account_info(),
        },
    );
    token::transfer(transfer_ctx, amount)?;

    // Mint YES tokens
    let market_key = ctx.accounts.market.key();
    let seeds = &[
        b"mint_authority".as_ref(),
        market_key.as_ref(),
        &[ctx.bumps.mint_authority],
    ];
    let signer_seeds = &[&seeds[..]];

    let mint_yes_ctx = CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        token::MintTo {
            mint: ctx.accounts.yes_mint.to_account_info(),
            to: ctx.accounts.user_yes_account.to_account_info(),
            authority: ctx.accounts.mint_authority.to_account_info(),
        },
        signer_seeds,
    );
    token::mint_to(mint_yes_ctx, amount)?;

    // Mint NO tokens
    let mint_no_ctx = CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        token::MintTo {
            mint: ctx.accounts.no_mint.to_account_info(),
            to: ctx.accounts.user_no_account.to_account_info(),
            authority: ctx.accounts.mint_authority.to_account_info(),
        },
        signer_seeds,
    );
    token::mint_to(mint_no_ctx, amount)?;

    // Update open orders tracking
    let open_orders = &mut ctx.accounts.open_orders;
    open_orders.yes_free = open_orders.yes_free.saturating_add(amount);
    open_orders.no_free = open_orders.no_free.saturating_add(amount);

    emit!(TokenSetMinted {
        market: ctx.accounts.market.key(),
        owner: ctx.accounts.owner.key(),
        amount,
    });

    Ok(())
}

/// Burn token set (YES + NO) to receive collateral
#[derive(Accounts)]
pub struct BurnTokenSet<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        seeds = [OrderBookConfig::SEED_PREFIX],
        bump = config.bump,
    )]
    pub config: Account<'info, OrderBookConfig>,

    /// CHECK: Market account
    pub market: AccountInfo<'info>,

    #[account(
        mut,
        seeds = [OpenOrdersAccount::SEED_PREFIX, market.key().as_ref(), owner.key().as_ref()],
        bump = open_orders.bump,
        constraint = open_orders.owner == owner.key() @ OrderBookError::UnauthorizedOwner
    )]
    pub open_orders: Account<'info, OpenOrdersAccount>,

    /// YES token mint
    #[account(mut)]
    pub yes_mint: Account<'info, Mint>,

    /// NO token mint
    #[account(mut)]
    pub no_mint: Account<'info, Mint>,

    /// User's YES token account
    #[account(
        mut,
        constraint = user_yes_account.owner == owner.key() @ OrderBookError::UnauthorizedOwner,
        constraint = user_yes_account.mint == yes_mint.key() @ OrderBookError::InvalidBuyerCollateral
    )]
    pub user_yes_account: Account<'info, TokenAccount>,

    /// User's NO token account
    #[account(
        mut,
        constraint = user_no_account.owner == owner.key() @ OrderBookError::UnauthorizedOwner,
        constraint = user_no_account.mint == no_mint.key() @ OrderBookError::InvalidBuyerCollateral
    )]
    pub user_no_account: Account<'info, TokenAccount>,

    /// User's collateral token account
    #[account(
        mut,
        constraint = user_collateral.owner == owner.key() @ OrderBookError::UnauthorizedOwner
    )]
    pub user_collateral: Account<'info, TokenAccount>,

    /// Market's collateral vault
    #[account(mut)]
    pub market_vault: Account<'info, TokenAccount>,

    /// CHECK: Market authority PDA
    #[account(
        seeds = [b"market_authority", market.key().as_ref()],
        bump
    )]
    pub market_authority: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token>,
}

pub fn handler_burn_set(ctx: Context<BurnTokenSet>, amount: u64) -> Result<()> {
    require!(amount > 0, OrderBookError::InvalidQuantity);

    let open_orders = &mut ctx.accounts.open_orders;

    // Verify user has enough tokens
    require!(
        open_orders.yes_free >= amount,
        OrderBookError::InsufficientBalance
    );
    require!(
        open_orders.no_free >= amount,
        OrderBookError::InsufficientBalance
    );

    // Burn YES tokens
    let burn_yes_ctx = CpiContext::new(
        ctx.accounts.token_program.to_account_info(),
        Burn {
            mint: ctx.accounts.yes_mint.to_account_info(),
            from: ctx.accounts.user_yes_account.to_account_info(),
            authority: ctx.accounts.owner.to_account_info(),
        },
    );
    token::burn(burn_yes_ctx, amount)?;

    // Burn NO tokens
    let burn_no_ctx = CpiContext::new(
        ctx.accounts.token_program.to_account_info(),
        Burn {
            mint: ctx.accounts.no_mint.to_account_info(),
            from: ctx.accounts.user_no_account.to_account_info(),
            authority: ctx.accounts.owner.to_account_info(),
        },
    );
    token::burn(burn_no_ctx, amount)?;

    // Transfer collateral from vault to user
    let market_key = ctx.accounts.market.key();
    let seeds = &[
        b"market_authority".as_ref(),
        market_key.as_ref(),
        &[ctx.bumps.market_authority],
    ];
    let signer_seeds = &[&seeds[..]];

    let transfer_ctx = CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        Transfer {
            from: ctx.accounts.market_vault.to_account_info(),
            to: ctx.accounts.user_collateral.to_account_info(),
            authority: ctx.accounts.market_authority.to_account_info(),
        },
        signer_seeds,
    );
    token::transfer(transfer_ctx, amount)?;

    // Update open orders tracking
    open_orders.yes_free = open_orders.yes_free.saturating_sub(amount);
    open_orders.no_free = open_orders.no_free.saturating_sub(amount);

    emit!(TokenSetBurned {
        market: ctx.accounts.market.key(),
        owner: ctx.accounts.owner.key(),
        amount,
    });

    Ok(())
}

#[event]
pub struct TokenSetMinted {
    pub market: Pubkey,
    pub owner: Pubkey,
    pub amount: u64,
}

#[event]
pub struct TokenSetBurned {
    pub market: Pubkey,
    pub owner: Pubkey,
    pub amount: u64,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_resolution_outcome_conversion() {
        assert_eq!(ResolutionOutcome::from(0), ResolutionOutcome::Unresolved);
        assert_eq!(ResolutionOutcome::from(1), ResolutionOutcome::Yes);
        assert_eq!(ResolutionOutcome::from(2), ResolutionOutcome::No);
        assert_eq!(ResolutionOutcome::from(3), ResolutionOutcome::Invalid);
    }
}
