use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::errors::OrderBookError;
use crate::state::{
    BookSide, EventHeap, FillEvent, OpenOrdersAccount, OrderBookConfig, MAX_ORDER_QUANTITY,
    PRICE_SCALE,
};

/// Maximum orders to match in a single transaction
pub const MAX_MATCHES: usize = 8;

/// Maximum expired orders to clean up per transaction
pub const MAX_EXPIRED_CLEANUP: usize = 5;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum OrderSideV2 {
    Buy,
    Sell,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum OutcomeV2 {
    Yes,
    No,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum OrderTypeV2 {
    Limit,
    Market,
    PostOnly,
    ImmediateOrCancel,
    FillOrKill,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct PlaceOrderParams {
    pub side: OrderSideV2,
    pub outcome: OutcomeV2,
    pub price: u64,    // In basis points (1-9999)
    pub quantity: u64, // Number of outcome tokens
    pub order_type: OrderTypeV2,
    pub client_order_id: u64,
    pub time_in_force: u16, // Seconds until expiry (0 = no expiry)
    pub limit: u8,          // Max orders to match (default: 8)
}

#[derive(Accounts)]
pub struct PlaceOrderV2<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        mut,
        seeds = [OrderBookConfig::SEED_PREFIX],
        bump = config.bump,
        constraint = !config.paused @ OrderBookError::MarketNotActive
    )]
    pub config: Account<'info, OrderBookConfig>,

    /// CHECK: Market account - validated by open_orders seeds
    pub market: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds = [OpenOrdersAccount::SEED_PREFIX, market.key().as_ref(), owner.key().as_ref()],
        bump = open_orders.bump,
        constraint = open_orders.owner == owner.key() @ OrderBookError::UnauthorizedOwner
    )]
    pub open_orders: Account<'info, OpenOrdersAccount>,

    /// Bids bookside
    #[account(mut)]
    pub bids: AccountLoader<'info, BookSide>,

    /// Asks bookside
    #[account(mut)]
    pub asks: AccountLoader<'info, BookSide>,

    /// Event heap for settlement
    #[account(mut)]
    pub event_heap: AccountLoader<'info, EventHeap>,

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
    pub system_program: Program<'info, System>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct PlaceOrderResult {
    pub order_id: Option<u128>,
    pub posted_quantity: u64,
    pub filled_quantity: u64,
    pub total_cost: u64,
}

pub fn handler(ctx: Context<PlaceOrderV2>, params: PlaceOrderParams) -> Result<PlaceOrderResult> {
    // Validate inputs
    require!(
        params.price >= 1 && params.price <= 9999,
        OrderBookError::InvalidPrice
    );
    require!(params.quantity > 0, OrderBookError::InvalidQuantity);
    require!(
        params.quantity <= MAX_ORDER_QUANTITY,
        OrderBookError::QuantityTooLarge
    );

    let clock = Clock::get()?;
    let now = clock.unix_timestamp;
    let limit = if params.limit == 0 {
        MAX_MATCHES
    } else {
        params.limit as usize
    };

    let mut bids = ctx.accounts.bids.load_mut()?;
    let mut asks = ctx.accounts.asks.load_mut()?;
    let mut event_heap = ctx.accounts.event_heap.load_mut()?;
    let open_orders = &mut ctx.accounts.open_orders;

    // Determine which book to match against and which to post to
    let (matching_book, posting_book) = if params.side == OrderSideV2::Buy {
        (&mut *asks, &mut *bids)
    } else {
        (&mut *bids, &mut *asks)
    };

    let mut remaining_quantity = params.quantity;
    let mut total_filled = 0u64;
    let mut total_cost = 0u64;
    let mut matches_count = 0usize;

    // Track orders to remove after matching (to avoid iterator invalidation)
    let mut orders_to_remove: Vec<u128> = Vec::with_capacity(MAX_MATCHES);
    let mut orders_to_update: Vec<(u128, u64)> = Vec::with_capacity(MAX_MATCHES);

    // Match against opposing orders
    loop {
        if remaining_quantity == 0 || matches_count >= limit {
            break;
        }

        let best = match matching_book.get_best() {
            Some(order) => order,
            None => break,
        };

        // Skip and remove expired orders
        if best.timestamp > 0 {
            // Check expiry based on time_in_force if implemented
            // For now, just match
        }

        // Check if price is acceptable
        let maker_price = best.price();
        if !is_price_acceptable(params.side, params.price, maker_price) {
            break;
        }

        // Post-only check
        if params.order_type == OrderTypeV2::PostOnly {
            // Would match, so fail
            return Ok(PlaceOrderResult {
                order_id: None,
                posted_quantity: 0,
                filled_quantity: 0,
                total_cost: 0,
            });
        }

        // Calculate fill quantity
        let fill_quantity = remaining_quantity.min(best.quantity);
        let fill_cost = calculate_cost(fill_quantity, maker_price);

        // Check taker has sufficient funds
        if params.side == OrderSideV2::Buy {
            require!(
                open_orders.collateral_free >= fill_cost,
                OrderBookError::InsufficientCollateral
            );
        } else {
            // Selling: need outcome tokens
            match params.outcome {
                OutcomeV2::Yes => {
                    require!(
                        open_orders.yes_free >= fill_quantity,
                        OrderBookError::InsufficientBalance
                    );
                }
                OutcomeV2::No => {
                    require!(
                        open_orders.no_free >= fill_quantity,
                        OrderBookError::InsufficientBalance
                    );
                }
            }
        }

        // Create fill event
        let fill = FillEvent::new(
            if params.side == OrderSideV2::Buy {
                0
            } else {
                1
            },
            fill_quantity == best.quantity, // maker_out
            best.owner_slot,
            now,
            event_heap.seq_num,
            best.owner,
            open_orders.owner,
            maker_price,
            fill_quantity,
            best.client_order_id,
            params.client_order_id,
            if params.outcome == OutcomeV2::Yes {
                0
            } else {
                1
            },
        );

        event_heap.seq_num += 1;
        event_heap.push_fill(fill);

        // Update taker's position immediately
        if params.side == OrderSideV2::Buy {
            open_orders.collateral_free = open_orders.collateral_free.saturating_sub(fill_cost);
            match params.outcome {
                OutcomeV2::Yes => {
                    open_orders.yes_free = open_orders.yes_free.saturating_add(fill_quantity)
                }
                OutcomeV2::No => {
                    open_orders.no_free = open_orders.no_free.saturating_add(fill_quantity)
                }
            }
        } else {
            match params.outcome {
                OutcomeV2::Yes => {
                    open_orders.yes_free = open_orders.yes_free.saturating_sub(fill_quantity)
                }
                OutcomeV2::No => {
                    open_orders.no_free = open_orders.no_free.saturating_sub(fill_quantity)
                }
            }
            open_orders.collateral_free = open_orders.collateral_free.saturating_add(fill_cost);
        }

        // Track order for removal/update
        if fill_quantity == best.quantity {
            orders_to_remove.push(best.key);
        } else {
            orders_to_update.push((best.key, best.quantity - fill_quantity));
        }

        remaining_quantity -= fill_quantity;
        total_filled += fill_quantity;
        total_cost += fill_cost;
        matches_count += 1;

        open_orders.taker_volume = open_orders.taker_volume.saturating_add(fill_quantity);
    }

    // Apply order removals
    for key in orders_to_remove {
        matching_book.remove(key);
    }

    // Apply order updates
    for (key, new_qty) in orders_to_update {
        if let Some(idx) = matching_book.find_by_key_index(key) {
            matching_book.update_quantity(idx, new_qty);
        }
    }

    // Check fill-or-kill
    if params.order_type == OrderTypeV2::FillOrKill && remaining_quantity > 0 {
        return Err(OrderBookError::FillOrKillNotSatisfied.into());
    }

    // Post remaining quantity if limit order
    let order_id = if remaining_quantity > 0
        && params.order_type == OrderTypeV2::Limit
        && params.order_type != OrderTypeV2::ImmediateOrCancel
    {
        // Lock funds for the posted order
        let posted_cost = calculate_cost(remaining_quantity, params.price);

        if params.side == OrderSideV2::Buy {
            open_orders.lock_collateral(posted_cost)?;
        } else {
            match params.outcome {
                OutcomeV2::Yes => open_orders.lock_yes(remaining_quantity)?,
                OutcomeV2::No => open_orders.lock_no(remaining_quantity)?,
            }
        }

        // Find a free slot in open_orders
        let slot = open_orders
            .add_order(
                0, // Will be set after insert
                params.client_order_id,
                params.price,
                if params.side == OrderSideV2::Buy {
                    0
                } else {
                    1
                },
                if params.outcome == OutcomeV2::Yes {
                    0
                } else {
                    1
                },
            )
            .ok_or(OrderBookError::NoFreeSlots)?;

        // Insert into orderbook
        let (_idx, key) = posting_book
            .insert(
                params.price,
                remaining_quantity,
                open_orders.owner,
                params.client_order_id,
                now,
                slot,
            )
            .ok_or(OrderBookError::OrderbookFull)?;

        // Update the order slot with the actual key
        if let Some(order_slot) = open_orders.orders.get_mut(slot as usize) {
            order_slot.key = key;
        }

        Some(key)
    } else {
        None
    };

    // Transfer collateral if taker bought
    if params.side == OrderSideV2::Buy && total_cost > 0 {
        let transfer_ctx = CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.user_collateral.to_account_info(),
                to: ctx.accounts.market_vault.to_account_info(),
                authority: ctx.accounts.owner.to_account_info(),
            },
        );
        token::transfer(transfer_ctx, total_cost)?;
    }

    emit!(OrderPlacedV2 {
        market: ctx.accounts.market.key(),
        owner: ctx.accounts.owner.key(),
        order_id,
        side: params.side,
        outcome: params.outcome,
        price: params.price,
        quantity: params.quantity,
        filled_quantity: total_filled,
        posted_quantity: remaining_quantity,
        client_order_id: params.client_order_id,
    });

    Ok(PlaceOrderResult {
        order_id,
        posted_quantity: if order_id.is_some() {
            remaining_quantity
        } else {
            0
        },
        filled_quantity: total_filled,
        total_cost,
    })
}

/// Check if prices are compatible for matching
fn is_price_acceptable(taker_side: OrderSideV2, taker_price: u64, maker_price: u64) -> bool {
    match taker_side {
        // Taker buying: maker's ask price must be <= taker's bid
        OrderSideV2::Buy => maker_price <= taker_price,
        // Taker selling: maker's bid price must be >= taker's ask
        OrderSideV2::Sell => maker_price >= taker_price,
    }
}

/// Calculate cost in collateral for a given quantity and price
fn calculate_cost(quantity: u64, price: u64) -> u64 {
    (quantity as u128)
        .checked_mul(price as u128)
        .and_then(|v| v.checked_div(PRICE_SCALE as u128))
        .unwrap_or(0) as u64
}

// Helper trait for BookSide
impl BookSide {
    fn find_by_key_index(&self, key: u128) -> Option<u32> {
        let mut current = self.root;
        while current != super::super::state::orderbook::FREE_NODE {
            let current_key = self.nodes[current as usize].key;
            if key == current_key {
                return Some(current);
            } else if key < current_key {
                current = self.nodes[current as usize].left;
            } else {
                current = self.nodes[current as usize].right;
            }
        }
        None
    }
}

#[event]
pub struct OrderPlacedV2 {
    pub market: Pubkey,
    pub owner: Pubkey,
    pub order_id: Option<u128>,
    pub side: OrderSideV2,
    pub outcome: OutcomeV2,
    pub price: u64,
    pub quantity: u64,
    pub filled_quantity: u64,
    pub posted_quantity: u64,
    pub client_order_id: u64,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_price_acceptable() {
        // Buyer at 60, seller at 55 -> match
        assert!(is_price_acceptable(OrderSideV2::Buy, 6000, 5500));

        // Buyer at 50, seller at 55 -> no match
        assert!(!is_price_acceptable(OrderSideV2::Buy, 5000, 5500));

        // Seller at 45, buyer at 50 -> match
        assert!(is_price_acceptable(OrderSideV2::Sell, 4500, 5000));

        // Seller at 55, buyer at 50 -> no match
        assert!(!is_price_acceptable(OrderSideV2::Sell, 5500, 5000));
    }

    #[test]
    fn test_calculate_cost() {
        // 100 tokens at 50% = 50 collateral
        assert_eq!(calculate_cost(100, 5000), 50);

        // 1000 tokens at 75% = 750 collateral
        assert_eq!(calculate_cost(1000, 7500), 750);

        // 1 token at 1% = 0 (rounding down)
        assert_eq!(calculate_cost(1, 100), 0);

        // 100 tokens at 1% = 1
        assert_eq!(calculate_cost(100, 100), 1);
    }
}
