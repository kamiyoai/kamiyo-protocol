use crate::errors::OrderBookError;
use crate::state::{
    Order, OrderBookConfig, OrderSide, OrderStatus, OrderType, OutcomeType, Position,
    MAX_ORDER_QUANTITY,
};
use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

fn has_available_outcome_balance(position: &Position, outcome: OutcomeType, quantity: u64) -> bool {
    match outcome {
        OutcomeType::Yes => position.available_yes() >= quantity,
        OutcomeType::No => position.available_no() >= quantity,
    }
}

#[derive(Accounts)]
pub struct PlaceOrder<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        mut,
        seeds = [OrderBookConfig::SEED_PREFIX],
        bump = config.bump,
        constraint = !config.paused @ OrderBookError::MarketNotActive
    )]
    pub config: Account<'info, OrderBookConfig>,

    /// CHECK: Market account - validated by position seeds
    pub market: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds = [Position::SEED_PREFIX, market.key().as_ref(), owner.key().as_ref()],
        bump = position.bump,
        constraint = position.owner == owner.key() @ OrderBookError::UnauthorizedOwner
    )]
    pub position: Account<'info, Position>,

    #[account(
        init,
        payer = owner,
        space = 8 + Order::INIT_SPACE,
        seeds = [Order::SEED_PREFIX, market.key().as_ref(), &config.order_counter.to_le_bytes()],
        bump
    )]
    pub order: Account<'info, Order>,

    /// User's collateral account (for buy orders)
    /// SECURITY: Validate ownership to prevent unauthorized collateral transfers
    #[account(
        mut,
        constraint = user_collateral.owner == owner.key() @ OrderBookError::UnauthorizedOwner
    )]
    pub user_collateral: Account<'info, TokenAccount>,

    /// User's YES token account (for selling YES)
    /// SECURITY: Validate ownership to prevent unauthorized token transfers
    #[account(
        mut,
        constraint = user_yes_tokens.owner == owner.key() @ OrderBookError::UnauthorizedOwner
    )]
    pub user_yes_tokens: Account<'info, TokenAccount>,

    /// User's NO token account (for selling NO)
    /// SECURITY: Validate ownership to prevent unauthorized token transfers
    #[account(
        mut,
        constraint = user_no_tokens.owner == owner.key() @ OrderBookError::UnauthorizedOwner
    )]
    pub user_no_tokens: Account<'info, TokenAccount>,

    /// Escrow vault for locked collateral
    /// SECURITY: Validate escrow vault is controlled by escrow authority PDA
    #[account(
        mut,
        constraint = escrow_vault.owner == escrow_authority.key() @ OrderBookError::InvalidEscrowVault
    )]
    pub escrow_vault: Account<'info, TokenAccount>,

    /// CHECK: Escrow authority PDA - validates escrow_vault ownership
    #[account(
        seeds = [b"escrow_authority"],
        bump
    )]
    pub escrow_authority: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<PlaceOrder>,
    side: OrderSide,
    outcome: OutcomeType,
    price_bps: u16,
    quantity: u64,
    order_type: OrderType,
    expires_at: i64,
) -> Result<()> {
    // Validate inputs
    require!(
        price_bps >= 1 && price_bps <= 9999,
        OrderBookError::InvalidPrice
    );
    require!(quantity > 0, OrderBookError::InvalidQuantity);
    require!(
        quantity <= MAX_ORDER_QUANTITY,
        OrderBookError::QuantityTooLarge
    );

    let clock = Clock::get()?;
    let current_time = clock.unix_timestamp;

    if expires_at > 0 {
        require!(expires_at > current_time, OrderBookError::InvalidExpiration);
    }

    // Get order ID and increment counter
    let order_id = ctx.accounts.config.next_order_id();

    // Lock collateral or tokens based on order side
    match side {
        OrderSide::Buy => {
            // For buy orders, lock collateral
            // Cost = quantity * price / 10000
            let collateral_required = (quantity as u128)
                .checked_mul(price_bps as u128)
                .ok_or(OrderBookError::ArithmeticOverflow)?
                .checked_div(10000)
                .ok_or(OrderBookError::ArithmeticOverflow)?
                as u64;

            require!(
                ctx.accounts.user_collateral.amount >= collateral_required,
                OrderBookError::InsufficientCollateral
            );

            // Transfer collateral to escrow
            let transfer_ctx = CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.user_collateral.to_account_info(),
                    to: ctx.accounts.escrow_vault.to_account_info(),
                    authority: ctx.accounts.owner.to_account_info(),
                },
            );
            token::transfer(transfer_ctx, collateral_required)?;

            // Update position
            ctx.accounts.position.locked_collateral = ctx
                .accounts
                .position
                .locked_collateral
                .checked_add(collateral_required)
                .ok_or(OrderBookError::ArithmeticOverflow)?;
        }
        OrderSide::Sell => {
            // For sell orders, lock outcome tokens
            require!(
                has_available_outcome_balance(&ctx.accounts.position, outcome, quantity),
                OrderBookError::InsufficientBalance
            );

            if outcome == OutcomeType::Yes {
                ctx.accounts.position.locked_yes = ctx
                    .accounts
                    .position
                    .locked_yes
                    .checked_add(quantity)
                    .ok_or(OrderBookError::ArithmeticOverflow)?;
            } else {
                ctx.accounts.position.locked_no = ctx
                    .accounts
                    .position
                    .locked_no
                    .checked_add(quantity)
                    .ok_or(OrderBookError::ArithmeticOverflow)?;
            }
        }
    }

    // Initialize order
    let order = &mut ctx.accounts.order;
    order.owner = ctx.accounts.owner.key();
    order.market = ctx.accounts.market.key();
    order.order_id = order_id;
    order.side = side;
    order.outcome = outcome;
    order.price_bps = price_bps;
    order.original_quantity = quantity;
    order.remaining_quantity = quantity;
    order.filled_quantity = 0;
    order.status = OrderStatus::Open;
    order.order_type = order_type;
    order.created_at = current_time;
    order.expires_at = expires_at;
    order.updated_at = current_time;
    order.bump = ctx.bumps.order;

    // Update position
    ctx.accounts.position.open_order_count = ctx
        .accounts
        .position
        .open_order_count
        .checked_add(1)
        .ok_or(OrderBookError::ArithmeticOverflow)?;

    emit!(OrderPlaced {
        order_id,
        order: order.key(),
        market: order.market,
        owner: order.owner,
        side,
        outcome,
        price_bps,
        quantity,
        order_type,
        expires_at,
    });

    Ok(())
}

#[event]
pub struct OrderPlaced {
    pub order_id: u64,
    pub order: Pubkey,
    pub market: Pubkey,
    pub owner: Pubkey,
    pub side: OrderSide,
    pub outcome: OutcomeType,
    pub price_bps: u16,
    pub quantity: u64,
    pub order_type: OrderType,
    pub expires_at: i64,
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_position() -> Position {
        Position {
            owner: Pubkey::default(),
            market: Pubkey::default(),
            yes_balance: 100,
            no_balance: 80,
            locked_collateral: 0,
            locked_yes: 40,
            locked_no: 30,
            total_deposited: 0,
            total_withdrawn: 0,
            open_order_count: 0,
            total_trades: 0,
            realized_pnl: 0,
            bump: 0,
            created_at: 0,
        }
    }

    #[test]
    fn sell_checks_unlocked_yes_balance() {
        let position = sample_position();
        assert!(has_available_outcome_balance(&position, OutcomeType::Yes, 60));
        assert!(!has_available_outcome_balance(&position, OutcomeType::Yes, 61));
    }

    #[test]
    fn sell_checks_unlocked_no_balance() {
        let position = sample_position();
        assert!(has_available_outcome_balance(&position, OutcomeType::No, 50));
        assert!(!has_available_outcome_balance(&position, OutcomeType::No, 51));
    }
}
