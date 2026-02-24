use anchor_lang::prelude::*;

/// Maximum open orders per user per market
pub const MAX_OPEN_ORDERS: usize = 24;

/// Open order slot information
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Default, InitSpace)]
#[repr(C)]
pub struct OpenOrderSlot {
    /// Order key (0 if slot is free)
    pub key: u128,

    /// Client-provided order ID
    pub client_id: u64,

    /// Locked price (price at which order was placed)
    pub locked_price: u64,

    /// Side (0 = buy, 1 = sell)
    pub side: u8,

    /// Outcome (0 = yes, 1 = no)
    pub outcome: u8,

    /// Is this slot free?
    pub is_free: u8,

    /// Padding
    pub _padding: [u8; 5],
}

impl OpenOrderSlot {
    pub const SIZE: usize = 16 + 8 + 8 + 1 + 1 + 1 + 5; // 40 bytes

    pub fn is_free(&self) -> bool {
        self.is_free != 0 || self.key == 0
    }

    pub fn is_buy(&self) -> bool {
        self.side == 0
    }

    pub fn is_yes(&self) -> bool {
        self.outcome == 0
    }
}

/// User's open orders account for a specific market
#[account]
#[derive(InitSpace)]
pub struct OpenOrdersAccount {
    /// Owner of this account
    pub owner: Pubkey,

    /// Associated market
    pub market: Pubkey,

    /// Optional delegate who can place/cancel orders
    pub delegate: Pubkey,

    /// Account number (for multiple accounts per owner)
    pub account_num: u32,

    /// Bump seed
    pub bump: u8,

    /// Version
    pub version: u8,

    /// Padding
    pub _padding: [u8; 2],

    // === Position tracking ===
    /// YES tokens available (not locked in sell orders)
    pub yes_free: u64,

    /// NO tokens available (not locked in sell orders)
    pub no_free: u64,

    /// Collateral available (not locked in buy orders)
    pub collateral_free: u64,

    /// YES tokens locked in open sell orders
    pub yes_locked: u64,

    /// NO tokens locked in open sell orders
    pub no_locked: u64,

    /// Collateral locked in open buy orders
    pub collateral_locked: u64,

    /// Maker fees reserved for open orders
    pub locked_maker_fees: u64,

    /// Referrer rebates available to claim
    pub referrer_rebates: u64,

    // === Statistics ===
    /// Total volume traded (maker)
    pub maker_volume: u64,

    /// Total volume traded (taker)
    pub taker_volume: u64,

    /// Number of fills pending settlement
    pub pending_fills: u32,

    /// Reserved
    pub _reserved: [u8; 60],

    /// Open orders array
    #[max_len(24)]
    pub orders: Vec<OpenOrderSlot>,
}

impl OpenOrdersAccount {
    pub const SEED_PREFIX: &'static [u8] = b"open_orders";

    /// Find a free slot for a new order
    pub fn find_free_slot(&self) -> Option<usize> {
        for (i, slot) in self.orders.iter().enumerate() {
            if slot.is_free() {
                return Some(i);
            }
        }
        None
    }

    /// Add an open order
    pub fn add_order(
        &mut self,
        key: u128,
        client_id: u64,
        price: u64,
        side: u8,
        outcome: u8,
    ) -> Option<u8> {
        let slot_idx = match self.find_free_slot() {
            Some(idx) => idx,
            None => {
                // No free slot found, try to add a new one
                if self.orders.len() >= MAX_OPEN_ORDERS {
                    return None;
                }
                let new_idx = self.orders.len();
                self.orders.push(OpenOrderSlot::default());
                new_idx
            }
        };

        let slot = &mut self.orders[slot_idx];
        slot.key = key;
        slot.client_id = client_id;
        slot.locked_price = price;
        slot.side = side;
        slot.outcome = outcome;
        slot.is_free = 0;

        Some(slot_idx as u8)
    }

    /// Remove an order by key
    pub fn remove_order_by_key(&mut self, key: u128) -> Option<OpenOrderSlot> {
        for slot in self.orders.iter_mut() {
            if slot.key == key {
                let old = *slot;
                *slot = OpenOrderSlot {
                    is_free: 1,
                    ..OpenOrderSlot::default()
                };
                return Some(old);
            }
        }
        None
    }

    /// Remove order at specific slot
    pub fn remove_order_at(&mut self, slot_idx: usize) -> Option<OpenOrderSlot> {
        if slot_idx >= self.orders.len() {
            return None;
        }

        let slot = &mut self.orders[slot_idx];
        if slot.is_free() {
            return None;
        }

        let old = *slot;
        *slot = OpenOrderSlot {
            is_free: 1,
            ..OpenOrderSlot::default()
        };
        Some(old)
    }

    /// Find order by key
    pub fn find_order(&self, key: u128) -> Option<(usize, &OpenOrderSlot)> {
        for (i, slot) in self.orders.iter().enumerate() {
            if slot.key == key && !slot.is_free() {
                return Some((i, slot));
            }
        }
        None
    }

    /// Find order by client ID
    pub fn find_order_by_client_id(&self, client_id: u64) -> Option<(usize, &OpenOrderSlot)> {
        for (i, slot) in self.orders.iter().enumerate() {
            if slot.client_id == client_id && !slot.is_free() {
                return Some((i, slot));
            }
        }
        None
    }

    /// Count active orders
    pub fn active_order_count(&self) -> usize {
        self.orders.iter().filter(|s| !s.is_free()).count()
    }

    /// Calculate total YES balance (free + locked)
    pub fn total_yes(&self) -> u64 {
        self.yes_free.saturating_add(self.yes_locked)
    }

    /// Calculate total NO balance (free + locked)
    pub fn total_no(&self) -> u64 {
        self.no_free.saturating_add(self.no_locked)
    }

    /// Calculate total collateral (free + locked)
    pub fn total_collateral(&self) -> u64 {
        self.collateral_free.saturating_add(self.collateral_locked)
    }

    /// Lock collateral for a buy order
    pub fn lock_collateral(&mut self, amount: u64) -> Result<()> {
        require!(
            self.collateral_free >= amount,
            OpenOrdersError::InsufficientCollateral
        );
        self.collateral_free = self.collateral_free.saturating_sub(amount);
        self.collateral_locked = self.collateral_locked.saturating_add(amount);
        Ok(())
    }

    /// Unlock collateral when order is cancelled
    pub fn unlock_collateral(&mut self, amount: u64) {
        let unlock = amount.min(self.collateral_locked);
        self.collateral_locked = self.collateral_locked.saturating_sub(unlock);
        self.collateral_free = self.collateral_free.saturating_add(unlock);
    }

    /// Lock YES tokens for a sell order
    pub fn lock_yes(&mut self, amount: u64) -> Result<()> {
        require!(self.yes_free >= amount, OpenOrdersError::InsufficientYes);
        self.yes_free = self.yes_free.saturating_sub(amount);
        self.yes_locked = self.yes_locked.saturating_add(amount);
        Ok(())
    }

    /// Unlock YES tokens when order is cancelled
    pub fn unlock_yes(&mut self, amount: u64) {
        let unlock = amount.min(self.yes_locked);
        self.yes_locked = self.yes_locked.saturating_sub(unlock);
        self.yes_free = self.yes_free.saturating_add(unlock);
    }

    /// Lock NO tokens for a sell order
    pub fn lock_no(&mut self, amount: u64) -> Result<()> {
        require!(self.no_free >= amount, OpenOrdersError::InsufficientNo);
        self.no_free = self.no_free.saturating_sub(amount);
        self.no_locked = self.no_locked.saturating_add(amount);
        Ok(())
    }

    /// Unlock NO tokens when order is cancelled
    pub fn unlock_no(&mut self, amount: u64) {
        let unlock = amount.min(self.no_locked);
        self.no_locked = self.no_locked.saturating_sub(unlock);
        self.no_free = self.no_free.saturating_add(unlock);
    }

    /// Execute a fill as maker (called during consume_events)
    pub fn execute_maker_fill(
        &mut self,
        price: u64,
        quantity: u64,
        side: u8,
        outcome: u8,
        _is_self_trade: bool,
    ) {
        if side == 0 {
            // Was a buy order that got filled
            // Unlock collateral, receive outcome tokens
            let collateral_spent = quantity
                .checked_mul(price)
                .and_then(|v| v.checked_div(10000))
                .unwrap_or(0);

            self.collateral_locked = self.collateral_locked.saturating_sub(collateral_spent);

            if outcome == 0 {
                self.yes_free = self.yes_free.saturating_add(quantity);
            } else {
                self.no_free = self.no_free.saturating_add(quantity);
            }
        } else {
            // Was a sell order that got filled
            // Unlock outcome tokens, receive collateral
            let collateral_received = quantity
                .checked_mul(price)
                .and_then(|v| v.checked_div(10000))
                .unwrap_or(0);

            if outcome == 0 {
                self.yes_locked = self.yes_locked.saturating_sub(quantity);
            } else {
                self.no_locked = self.no_locked.saturating_sub(quantity);
            }

            self.collateral_free = self.collateral_free.saturating_add(collateral_received);
        }

        self.maker_volume = self.maker_volume.saturating_add(quantity);
    }

    /// Credit outcome tokens from a taker fill
    pub fn credit_taker_fill(&mut self, quantity: u64, outcome: u8) {
        if outcome == 0 {
            self.yes_free = self.yes_free.saturating_add(quantity);
        } else {
            self.no_free = self.no_free.saturating_add(quantity);
        }
        self.taker_volume = self.taker_volume.saturating_add(quantity);
    }

    /// Debit collateral for taker buy
    pub fn debit_taker_buy(&mut self, collateral: u64) {
        self.collateral_free = self.collateral_free.saturating_sub(collateral);
    }
}

#[error_code]
pub enum OpenOrdersError {
    #[msg("Insufficient collateral")]
    InsufficientCollateral,
    #[msg("Insufficient YES tokens")]
    InsufficientYes,
    #[msg("Insufficient NO tokens")]
    InsufficientNo,
    #[msg("No free order slots")]
    NoFreeSlots,
    #[msg("Order not found")]
    OrderNotFound,
}

#[cfg(test)]
mod tests {
    use super::*;

    fn create_account() -> OpenOrdersAccount {
        OpenOrdersAccount {
            owner: Pubkey::new_unique(),
            market: Pubkey::new_unique(),
            delegate: Pubkey::default(),
            account_num: 0,
            bump: 0,
            version: 1,
            _padding: [0; 2],
            yes_free: 1000,
            no_free: 1000,
            collateral_free: 10000,
            yes_locked: 0,
            no_locked: 0,
            collateral_locked: 0,
            locked_maker_fees: 0,
            referrer_rebates: 0,
            maker_volume: 0,
            taker_volume: 0,
            pending_fills: 0,
            _reserved: [0; 60],
            orders: vec![],
        }
    }

    #[test]
    fn test_add_and_remove_order() {
        let mut account = create_account();

        // Add order
        let slot = account.add_order(123, 1, 5000, 0, 0).unwrap();
        assert_eq!(slot, 0);
        assert_eq!(account.active_order_count(), 1);

        // Find order
        let (idx, order) = account.find_order(123).unwrap();
        assert_eq!(idx, 0);
        assert_eq!(order.locked_price, 5000);

        // Remove order
        let removed = account.remove_order_by_key(123).unwrap();
        assert_eq!(removed.key, 123);
        assert_eq!(account.active_order_count(), 0);
    }

    #[test]
    fn test_lock_unlock_collateral() {
        let mut account = create_account();

        account.lock_collateral(5000).unwrap();
        assert_eq!(account.collateral_free, 5000);
        assert_eq!(account.collateral_locked, 5000);

        account.unlock_collateral(3000);
        assert_eq!(account.collateral_free, 8000);
        assert_eq!(account.collateral_locked, 2000);
    }

    #[test]
    fn test_lock_insufficient_collateral() {
        let mut account = create_account();

        let result = account.lock_collateral(20000);
        assert!(result.is_err());
    }

    #[test]
    fn test_maker_fill_buy() {
        let mut account = create_account();
        account.collateral_locked = 5000;
        account.collateral_free = 5000;

        // Fill: bought 100 YES at 50%
        account.execute_maker_fill(5000, 100, 0, 0, false);

        // Should have received YES tokens
        assert_eq!(account.yes_free, 1100);
        // Should have spent collateral (100 * 5000 / 10000 = 50)
        assert_eq!(account.collateral_locked, 4950);
    }

    #[test]
    fn test_maker_fill_sell() {
        let mut account = create_account();
        account.yes_locked = 100;
        account.yes_free = 900;

        // Fill: sold 50 YES at 60%
        account.execute_maker_fill(6000, 50, 1, 0, false);

        // Should have released YES tokens
        assert_eq!(account.yes_locked, 50);
        // Should have received collateral (50 * 6000 / 10000 = 30)
        assert_eq!(account.collateral_free, 10030);
    }
}
