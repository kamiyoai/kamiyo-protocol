use crate::errors::OrderBookError;
use crate::state::{Order, OrderBookConfig, OrderSide, OrderStatus, OutcomeType, Position};
use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

pub const SINGULARITY_TRADING_FEE_BPS: u64 = 50;
pub const KAMIYO_FEE_POOL_AUTHORITY: Pubkey =
    pubkey!("9mEd5iRcdbNUwaCmkPqYggLfg25B2DsTn1w6gNrgvC9d");
const BPS_DENOMINATOR: u128 = 10_000;

fn calculate_collateral_amount(fill_quantity: u64, fill_price_bps: u16) -> Result<u64> {
    let value = (fill_quantity as u128)
        .checked_mul(fill_price_bps as u128)
        .ok_or(OrderBookError::ArithmeticOverflow)?
        .checked_div(BPS_DENOMINATOR)
        .ok_or(OrderBookError::ArithmeticOverflow)?;
    u64::try_from(value).map_err(|_| OrderBookError::ArithmeticOverflow.into())
}

fn calculate_trading_fee(collateral_amount: u64) -> Result<u64> {
    let value = (collateral_amount as u128)
        .checked_mul(SINGULARITY_TRADING_FEE_BPS as u128)
        .ok_or(OrderBookError::ArithmeticOverflow)?
        .checked_div(BPS_DENOMINATOR)
        .ok_or(OrderBookError::ArithmeticOverflow)?;
    u64::try_from(value).map_err(|_| OrderBookError::ArithmeticOverflow.into())
}

fn calculate_buyer_locked(fill_quantity: u64, buy_price_bps: u16) -> Result<u64> {
    let value = (fill_quantity as u128)
        .checked_mul(buy_price_bps as u128)
        .ok_or(OrderBookError::ArithmeticOverflow)?
        .checked_div(BPS_DENOMINATOR)
        .ok_or(OrderBookError::ArithmeticOverflow)?;
    u64::try_from(value).map_err(|_| OrderBookError::ArithmeticOverflow.into())
}

#[derive(Accounts)]
pub struct SettleTrade<'info> {
    #[account(
        constraint = keeper.key() == config.keeper @ OrderBookError::UnauthorizedKeeper
    )]
    pub keeper: Signer<'info>,

    #[account(
        mut,
        seeds = [OrderBookConfig::SEED_PREFIX],
        bump = config.bump
    )]
    pub config: Box<Account<'info, OrderBookConfig>>,

    /// CHECK: Market account
    pub market: UncheckedAccount<'info>,

    // Buy order and position (boxed to reduce stack)
    #[account(
        mut,
        seeds = [Order::SEED_PREFIX, market.key().as_ref(), &buy_order.order_id.to_le_bytes()],
        bump = buy_order.bump,
        constraint = buy_order.side == OrderSide::Buy @ OrderBookError::OrdersDoNotMatch
    )]
    pub buy_order: Box<Account<'info, Order>>,

    #[account(
        mut,
        seeds = [Position::SEED_PREFIX, market.key().as_ref(), buy_order.owner.as_ref()],
        bump = buyer_position.bump
    )]
    pub buyer_position: Box<Account<'info, Position>>,

    // Sell order and position (boxed to reduce stack)
    #[account(
        mut,
        seeds = [Order::SEED_PREFIX, market.key().as_ref(), &sell_order.order_id.to_le_bytes()],
        bump = sell_order.bump,
        constraint = sell_order.side == OrderSide::Sell @ OrderBookError::OrdersDoNotMatch
    )]
    pub sell_order: Box<Account<'info, Order>>,

    #[account(
        mut,
        seeds = [Position::SEED_PREFIX, market.key().as_ref(), sell_order.owner.as_ref()],
        bump = seller_position.bump
    )]
    pub seller_position: Box<Account<'info, Position>>,

    // Token accounts (boxed to reduce stack)
    /// SECURITY: Validate escrow vault ownership
    #[account(
        mut,
        constraint = escrow_vault.owner == escrow_authority.key() @ OrderBookError::InvalidEscrowVault
    )]
    pub escrow_vault: Box<Account<'info, TokenAccount>>,

    /// Seller's collateral account to receive payment
    /// SECURITY: Validate seller ownership
    #[account(
        mut,
        constraint = seller_collateral.owner == sell_order.owner @ OrderBookError::UnauthorizedOwner
    )]
    pub seller_collateral: Box<Account<'info, TokenAccount>>,

    /// Buyer's collateral account for refund (if fill price < buy price)
    /// SECURITY: Validate buyer ownership
    #[account(
        mut,
        constraint = buyer_collateral.owner == buy_order.owner @ OrderBookError::InvalidBuyerCollateral
    )]
    pub buyer_collateral: Box<Account<'info, TokenAccount>>,

    /// Protocol fee vault routed to KAMIYO staking flywheel
    #[account(
        mut,
        constraint = protocol_fee_vault.owner == KAMIYO_FEE_POOL_AUTHORITY @ OrderBookError::InvalidFeeVaultOwner,
        constraint = protocol_fee_vault.mint == escrow_vault.mint @ OrderBookError::InvalidFeeVaultMint
    )]
    pub protocol_fee_vault: Box<Account<'info, TokenAccount>>,

    /// CHECK: Escrow authority PDA
    #[account(
        seeds = [b"escrow_authority"],
        bump
    )]
    pub escrow_authority: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token>,
}

pub fn handler(ctx: Context<SettleTrade>, fill_quantity: u64, fill_price_bps: u16) -> Result<()> {
    let buy_order = &ctx.accounts.buy_order;
    let sell_order = &ctx.accounts.sell_order;
    let clock = Clock::get()?;
    let current_time = clock.unix_timestamp;

    // SECURITY: Check order expiration - expired orders cannot be settled
    if buy_order.expires_at > 0 {
        require!(
            current_time < buy_order.expires_at,
            OrderBookError::OrderExpiredCannotSettle
        );
    }
    if sell_order.expires_at > 0 {
        require!(
            current_time < sell_order.expires_at,
            OrderBookError::OrderExpiredCannotSettle
        );
    }

    // Validate orders can match
    require!(
        buy_order.outcome == sell_order.outcome,
        OrderBookError::OrdersDoNotMatch
    );
    require!(
        buy_order.market == sell_order.market,
        OrderBookError::OrdersDoNotMatch
    );
    require!(
        buy_order.price_bps >= sell_order.price_bps,
        OrderBookError::OrdersDoNotMatch
    );
    require!(
        fill_quantity > 0
            && fill_quantity <= buy_order.remaining_quantity
            && fill_quantity <= sell_order.remaining_quantity,
        OrderBookError::InvalidFillQuantity
    );
    require!(
        fill_price_bps >= sell_order.price_bps && fill_price_bps <= buy_order.price_bps,
        OrderBookError::InvalidFillPrice
    );

    let collateral_amount = calculate_collateral_amount(fill_quantity, fill_price_bps)?;
    let trading_fee = calculate_trading_fee(collateral_amount)?;
    let seller_receipt = collateral_amount
        .checked_sub(trading_fee)
        .ok_or(OrderBookError::ArithmeticOverflow)?;

    // fill_price_bps is checked to be <= buy_order.price_bps, so buyer_locked >= collateral_amount.
    let buyer_locked = calculate_buyer_locked(fill_quantity, buy_order.price_bps)?;
    let buyer_refund = buyer_locked
        .checked_sub(collateral_amount)
        .ok_or(OrderBookError::ArithmeticOverflow)?;

    let seeds = &[b"escrow_authority".as_ref(), &[ctx.bumps.escrow_authority]];
    let signer_seeds = &[&seeds[..]];

    // Transfer settled collateral from escrow to seller after trading fee
    let transfer_to_seller_ctx = CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        Transfer {
            from: ctx.accounts.escrow_vault.to_account_info(),
            to: ctx.accounts.seller_collateral.to_account_info(),
            authority: ctx.accounts.escrow_authority.to_account_info(),
        },
        signer_seeds,
    );
    token::transfer(transfer_to_seller_ctx, seller_receipt)?;

    if trading_fee > 0 {
        let transfer_fee_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.escrow_vault.to_account_info(),
                to: ctx.accounts.protocol_fee_vault.to_account_info(),
                authority: ctx.accounts.escrow_authority.to_account_info(),
            },
            signer_seeds,
        );
        token::transfer(transfer_fee_ctx, trading_fee)?;
    }

    // SECURITY FIX: Transfer buyer's refund back to buyer if fill price was lower
    if buyer_refund > 0 {
        let transfer_refund_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.escrow_vault.to_account_info(),
                to: ctx.accounts.buyer_collateral.to_account_info(),
                authority: ctx.accounts.escrow_authority.to_account_info(),
            },
            signer_seeds,
        );
        token::transfer(transfer_refund_ctx, buyer_refund)?;
    }

    // Update orders
    let buy_order = &mut ctx.accounts.buy_order;
    buy_order.remaining_quantity = buy_order
        .remaining_quantity
        .checked_sub(fill_quantity)
        .ok_or(OrderBookError::ArithmeticOverflow)?;
    buy_order.filled_quantity = buy_order
        .filled_quantity
        .checked_add(fill_quantity)
        .ok_or(OrderBookError::ArithmeticOverflow)?;
    buy_order.updated_at = clock.unix_timestamp;

    if buy_order.remaining_quantity == 0 {
        buy_order.status = OrderStatus::Filled;
    } else {
        buy_order.status = OrderStatus::PartiallyFilled;
    }

    let sell_order = &mut ctx.accounts.sell_order;
    sell_order.remaining_quantity = sell_order
        .remaining_quantity
        .checked_sub(fill_quantity)
        .ok_or(OrderBookError::ArithmeticOverflow)?;
    sell_order.filled_quantity = sell_order
        .filled_quantity
        .checked_add(fill_quantity)
        .ok_or(OrderBookError::ArithmeticOverflow)?;
    sell_order.updated_at = clock.unix_timestamp;

    if sell_order.remaining_quantity == 0 {
        sell_order.status = OrderStatus::Filled;
    } else {
        sell_order.status = OrderStatus::PartiallyFilled;
    }

    // Update positions
    let buyer_position = &mut ctx.accounts.buyer_position;
    buyer_position.locked_collateral = buyer_position
        .locked_collateral
        .saturating_sub(buyer_locked);
    buyer_position.total_trades = buyer_position
        .total_trades
        .checked_add(1)
        .ok_or(OrderBookError::ArithmeticOverflow)?;

    // Credit buyer with outcome tokens
    match ctx.accounts.buy_order.outcome {
        OutcomeType::Yes => {
            buyer_position.yes_balance = buyer_position
                .yes_balance
                .checked_add(fill_quantity)
                .ok_or(OrderBookError::ArithmeticOverflow)?;
        }
        OutcomeType::No => {
            buyer_position.no_balance = buyer_position
                .no_balance
                .checked_add(fill_quantity)
                .ok_or(OrderBookError::ArithmeticOverflow)?;
        }
    }

    if ctx.accounts.buy_order.status == OrderStatus::Filled {
        buyer_position.open_order_count = buyer_position.open_order_count.saturating_sub(1);
    }

    let seller_position = &mut ctx.accounts.seller_position;
    seller_position.total_trades = seller_position
        .total_trades
        .checked_add(1)
        .ok_or(OrderBookError::ArithmeticOverflow)?;

    // Debit seller's locked tokens
    match ctx.accounts.sell_order.outcome {
        OutcomeType::Yes => {
            seller_position.locked_yes = seller_position.locked_yes.saturating_sub(fill_quantity);
            seller_position.yes_balance = seller_position.yes_balance.saturating_sub(fill_quantity);
        }
        OutcomeType::No => {
            seller_position.locked_no = seller_position.locked_no.saturating_sub(fill_quantity);
            seller_position.no_balance = seller_position.no_balance.saturating_sub(fill_quantity);
        }
    }

    if ctx.accounts.sell_order.status == OrderStatus::Filled {
        seller_position.open_order_count = seller_position.open_order_count.saturating_sub(1);
    }

    // Update global stats
    let config = &mut ctx.accounts.config;
    config.total_trades = config
        .total_trades
        .checked_add(1)
        .ok_or(OrderBookError::ArithmeticOverflow)?;
    config.total_volume = config
        .total_volume
        .checked_add(collateral_amount)
        .ok_or(OrderBookError::ArithmeticOverflow)?;

    emit!(TradeFilled {
        buy_order_id: ctx.accounts.buy_order.order_id,
        sell_order_id: ctx.accounts.sell_order.order_id,
        market: ctx.accounts.buy_order.market,
        outcome: ctx.accounts.buy_order.outcome,
        buyer: ctx.accounts.buy_order.owner,
        seller: ctx.accounts.sell_order.owner,
        fill_price_bps,
        fill_quantity,
        collateral_amount,
        trading_fee,
        seller_receipt,
        buyer_refund,
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}

#[event]
pub struct TradeFilled {
    pub buy_order_id: u64,
    pub sell_order_id: u64,
    pub market: Pubkey,
    pub outcome: OutcomeType,
    pub buyer: Pubkey,
    pub seller: Pubkey,
    pub fill_price_bps: u16,
    pub fill_quantity: u64,
    pub collateral_amount: u64,
    pub trading_fee: u64,
    pub seller_receipt: u64,
    pub buyer_refund: u64,
    pub timestamp: i64,
}

#[cfg(test)]
mod tests {
    use super::*;
    use proptest::prelude::*;

    #[test]
    fn calculates_settlement_components() {
        let fill_quantity = 1_000_000_u64;
        let fill_price_bps = 6_500_u16;
        let buy_price_bps = 7_000_u16;

        let collateral_amount =
            calculate_collateral_amount(fill_quantity, fill_price_bps).expect("collateral math");
        let trading_fee = calculate_trading_fee(collateral_amount).expect("fee math");
        let seller_receipt = collateral_amount
            .checked_sub(trading_fee)
            .expect("seller receipt");
        let buyer_locked =
            calculate_buyer_locked(fill_quantity, buy_price_bps).expect("buyer lock math");
        let buyer_refund = buyer_locked
            .checked_sub(collateral_amount)
            .expect("buyer refund");

        assert_eq!(collateral_amount, 650_000);
        assert_eq!(trading_fee, 3_250);
        assert_eq!(seller_receipt, 646_750);
        assert_eq!(buyer_locked, 700_000);
        assert_eq!(buyer_refund, 50_000);
    }

    #[test]
    fn rounds_fee_down_for_small_trades() {
        let collateral_amount = calculate_collateral_amount(100, 100).expect("collateral");
        let trading_fee = calculate_trading_fee(collateral_amount).expect("fee");

        assert_eq!(collateral_amount, 1);
        assert_eq!(trading_fee, 0);
    }

    #[test]
    fn settlement_invariants_hold_across_ranges() {
        let quantities = [1_u64, 10, 100, 1_000, 10_000, 1_000_000];
        let prices = [1_u16, 250, 1_000, 2_500, 5_000, 7_500, 9_999, 10_000];

        for quantity in quantities {
            for fill_price in prices {
                let collateral =
                    calculate_collateral_amount(quantity, fill_price).expect("collateral");
                let fee = calculate_trading_fee(collateral).expect("fee");
                let seller_receipt = collateral.checked_sub(fee).expect("seller receipt");

                assert_eq!(seller_receipt + fee, collateral);
                assert!(fee <= collateral);

                for buy_price in prices.into_iter().filter(|price| *price >= fill_price) {
                    let buyer_locked =
                        calculate_buyer_locked(quantity, buy_price).expect("buyer lock");
                    let buyer_refund = buyer_locked.checked_sub(collateral).expect("refund");

                    assert_eq!(buyer_refund + collateral, buyer_locked);
                }
            }
        }
    }

    #[test]
    fn trading_fee_is_monotonic_by_collateral() {
        let mut previous_fee = 0_u64;
        for collateral in 0_u64..=1_000 {
            let fee = calculate_trading_fee(collateral).expect("fee");
            assert!(
                fee >= previous_fee,
                "fee regressed at collateral={collateral}"
            );
            assert!(fee <= collateral);
            previous_fee = fee;
        }
    }

    #[test]
    fn fee_constants_match_flywheel_config() {
        assert_eq!(SINGULARITY_TRADING_FEE_BPS, 50);
        assert_eq!(
            KAMIYO_FEE_POOL_AUTHORITY.to_string(),
            "9mEd5iRcdbNUwaCmkPqYggLfg25B2DsTn1w6gNrgvC9d"
        );
    }

    #[test]
    fn rejects_collateral_that_cannot_fit_u64() {
        let result = calculate_collateral_amount(u64::MAX, 10_001);
        assert!(result.is_err());
    }

    #[test]
    fn rejects_buyer_locked_that_cannot_fit_u64() {
        let result = calculate_buyer_locked(u64::MAX, 10_001);
        assert!(result.is_err());
    }

    proptest! {
        #[test]
        fn settlement_math_matches_reference_model(
            quantity in 1_u64..=u64::MAX,
            fill_price in 1_u16..=10_000_u16,
            buy_price in 1_u16..=10_000_u16
        ) {
            prop_assume!(buy_price >= fill_price);

            let collateral = calculate_collateral_amount(quantity, fill_price).expect("collateral");
            let fee = calculate_trading_fee(collateral).expect("fee");
            let seller_receipt = collateral.checked_sub(fee).expect("seller receipt");
            let buyer_locked = calculate_buyer_locked(quantity, buy_price).expect("buyer lock");
            let buyer_refund = buyer_locked.checked_sub(collateral).expect("buyer refund");

            let expected_collateral =
                ((quantity as u128) * (fill_price as u128) / BPS_DENOMINATOR) as u64;
            let expected_fee =
                ((expected_collateral as u128) * (SINGULARITY_TRADING_FEE_BPS as u128) / BPS_DENOMINATOR) as u64;
            let expected_buyer_locked =
                ((quantity as u128) * (buy_price as u128) / BPS_DENOMINATOR) as u64;

            prop_assert_eq!(collateral, expected_collateral);
            prop_assert_eq!(fee, expected_fee);
            prop_assert_eq!(buyer_locked, expected_buyer_locked);
            prop_assert_eq!(seller_receipt + fee, collateral);
            prop_assert_eq!(buyer_refund + collateral, buyer_locked);
            prop_assert!(fee <= collateral);
        }
    }
}
