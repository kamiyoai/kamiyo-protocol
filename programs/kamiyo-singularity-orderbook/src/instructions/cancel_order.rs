use crate::errors::OrderBookError;
use crate::state::{Order, OrderBookConfig, OrderSide, OrderStatus, OutcomeType, Position};
use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

#[derive(Accounts)]
pub struct CancelOrder<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        seeds = [OrderBookConfig::SEED_PREFIX],
        bump = config.bump
    )]
    pub config: Account<'info, OrderBookConfig>,

    /// CHECK: Market account
    pub market: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds = [Position::SEED_PREFIX, market.key().as_ref(), owner.key().as_ref()],
        bump = position.bump
    )]
    pub position: Account<'info, Position>,

    #[account(
        mut,
        seeds = [Order::SEED_PREFIX, market.key().as_ref(), &order.order_id.to_le_bytes()],
        bump = order.bump,
        constraint = order.owner == owner.key() @ OrderBookError::UnauthorizedOwner,
        constraint = order.status == OrderStatus::Open || order.status == OrderStatus::PartiallyFilled @ OrderBookError::OrderNotOpen
    )]
    pub order: Account<'info, Order>,

    /// User's collateral account
    #[account(mut)]
    pub user_collateral: Account<'info, TokenAccount>,

    /// Escrow vault
    #[account(mut)]
    pub escrow_vault: Account<'info, TokenAccount>,

    /// Escrow authority PDA
    /// CHECK: PDA authority for escrow
    #[account(
        seeds = [b"escrow_authority"],
        bump
    )]
    pub escrow_authority: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token>,
}

pub fn handler(ctx: Context<CancelOrder>) -> Result<()> {
    let order = &mut ctx.accounts.order;
    let position = &mut ctx.accounts.position;
    let clock = Clock::get()?;

    // Calculate amount to unlock based on remaining quantity
    match order.side {
        OrderSide::Buy => {
            // Unlock collateral
            let collateral_to_unlock = (order.remaining_quantity as u128)
                .checked_mul(order.price_bps as u128)
                .ok_or(OrderBookError::ArithmeticOverflow)?
                .checked_div(10000)
                .ok_or(OrderBookError::ArithmeticOverflow)?
                as u64;

            // Transfer collateral back from escrow
            let seeds = &[b"escrow_authority".as_ref(), &[ctx.bumps.escrow_authority]];
            let signer_seeds = &[&seeds[..]];

            let transfer_ctx = CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.escrow_vault.to_account_info(),
                    to: ctx.accounts.user_collateral.to_account_info(),
                    authority: ctx.accounts.escrow_authority.to_account_info(),
                },
                signer_seeds,
            );
            token::transfer(transfer_ctx, collateral_to_unlock)?;

            position.locked_collateral = position
                .locked_collateral
                .saturating_sub(collateral_to_unlock);
        }
        OrderSide::Sell => {
            // Unlock tokens
            match order.outcome {
                OutcomeType::Yes => {
                    position.locked_yes =
                        position.locked_yes.saturating_sub(order.remaining_quantity);
                }
                OutcomeType::No => {
                    position.locked_no =
                        position.locked_no.saturating_sub(order.remaining_quantity);
                }
            }
        }
    }

    // Update order status
    order.status = OrderStatus::Cancelled;
    order.updated_at = clock.unix_timestamp;

    // Update position
    position.open_order_count = position.open_order_count.saturating_sub(1);

    emit!(OrderCancelled {
        order_id: order.order_id,
        order: order.key(),
        market: order.market,
        owner: order.owner,
        remaining_quantity: order.remaining_quantity,
        cancelled_at: clock.unix_timestamp,
    });

    Ok(())
}

#[event]
pub struct OrderCancelled {
    pub order_id: u64,
    pub order: Pubkey,
    pub market: Pubkey,
    pub owner: Pubkey,
    pub remaining_quantity: u64,
    pub cancelled_at: i64,
}
