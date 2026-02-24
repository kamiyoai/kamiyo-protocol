use anchor_lang::prelude::*;

/// Yield source types
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Default, PartialEq, Eq, Debug)]
#[repr(u8)]
pub enum YieldSource {
    #[default]
    None = 0,
    /// Marinade stSOL
    Marinade = 1,
    /// Lido stSOL
    Lido = 2,
    /// Jito jitoSOL
    JitoSOL = 3,
    /// Custom yield source
    Custom = 255,
}

/// Yield vault for DeFi integration
#[account]
#[derive(InitSpace)]
pub struct YieldVault {
    /// Market this vault is for
    pub market: Pubkey,

    /// Underlying yield token mint (e.g., stSOL)
    pub yield_mint: Pubkey,

    /// Vault token account
    pub vault: Pubkey,

    /// Authority (PDA)
    pub authority: Pubkey,

    /// Yield source type
    pub yield_source: u8,

    /// Bump seed
    pub bump: u8,

    /// Is vault active
    pub is_active: bool,

    /// Padding
    pub _padding: [u8; 1],

    // === State ===
    /// Total deposited (in base units)
    pub total_deposited: u64,

    /// Total yield accrued
    pub yield_accrued: u64,

    /// Last harvest timestamp
    pub last_harvest: i64,

    /// Last known exchange rate (scaled by 10^9)
    pub last_exchange_rate: u64,

    // === Configuration ===
    /// Minimum harvest interval (seconds)
    pub min_harvest_interval: u64,

    /// Protocol fee on yield (basis points)
    pub protocol_fee_bps: u16,

    /// Padding
    pub _padding2: [u8; 6],

    /// Reserved
    pub _reserved: [u8; 32],
}

impl YieldVault {
    pub const SEED_PREFIX: &'static [u8] = b"yield_vault";
    pub const RATE_SCALE: u64 = 1_000_000_000;

    pub fn get_yield_source(&self) -> YieldSource {
        match self.yield_source {
            1 => YieldSource::Marinade,
            2 => YieldSource::Lido,
            3 => YieldSource::JitoSOL,
            255 => YieldSource::Custom,
            _ => YieldSource::None,
        }
    }

    /// Calculate base value from yield tokens
    pub fn calculate_base_value(&self, yield_amount: u64, current_rate: u64) -> u64 {
        (yield_amount as u128 * current_rate as u128 / Self::RATE_SCALE as u128) as u64
    }

    /// Calculate yield tokens from base value
    pub fn calculate_yield_amount(&self, base_value: u64, current_rate: u64) -> u64 {
        if current_rate == 0 {
            return base_value;
        }
        (base_value as u128 * Self::RATE_SCALE as u128 / current_rate as u128) as u64
    }

    /// Calculate pending yield
    pub fn pending_yield(&self, current_balance: u64, current_rate: u64) -> u64 {
        let current_value = self.calculate_base_value(current_balance, current_rate);
        current_value.saturating_sub(self.total_deposited)
    }

    /// Can harvest now
    pub fn can_harvest(&self, current_time: i64) -> bool {
        self.is_active && (current_time - self.last_harvest) as u64 >= self.min_harvest_interval
    }
}

/// Margin account for leveraged trading
#[account]
#[derive(InitSpace)]
pub struct MarginAccount {
    /// Account owner
    pub owner: Pubkey,

    /// Collateral mint
    pub collateral_mint: Pubkey,

    /// Collateral vault
    pub collateral_vault: Pubkey,

    /// Bump seed
    pub bump: u8,

    /// Is account active
    pub is_active: bool,

    /// Maximum leverage allowed (e.g., 3 = 3x)
    pub max_leverage: u8,

    /// Padding
    pub _padding: [u8; 1],

    // === Balances ===
    /// Deposited collateral
    pub collateral: u64,

    /// Borrowed amount
    pub borrowed: u64,

    /// Interest accrued
    pub interest_accrued: u64,

    // === Health tracking ===
    /// Health factor (scaled by 10000, < 10000 = liquidatable)
    pub health_factor: u16,

    /// Liquidation threshold (basis points)
    pub liquidation_threshold_bps: u16,

    /// Last health update
    pub last_health_update: i64,

    /// Padding
    pub _padding2: [u8; 4],

    // === Statistics ===
    /// Total borrowed over lifetime
    pub total_borrowed: u64,

    /// Total interest paid
    pub total_interest_paid: u64,

    /// Liquidation count
    pub liquidation_count: u16,

    /// Padding
    pub _padding3: [u8; 6],

    /// Reserved
    pub _reserved: [u8; 32],
}

impl MarginAccount {
    pub const SEED_PREFIX: &'static [u8] = b"margin_account";
    pub const HEALTH_SCALE: u16 = 10000;

    /// Calculate position value
    pub fn position_value(&self) -> u64 {
        self.collateral.saturating_add(self.borrowed)
    }

    /// Calculate current leverage
    pub fn current_leverage(&self) -> u8 {
        if self.collateral == 0 {
            return 0;
        }
        let position = self.position_value();
        ((position as u128 * 10 / self.collateral as u128) / 10) as u8
    }

    /// Check if position is healthy
    pub fn is_healthy(&self) -> bool {
        self.health_factor >= self.liquidation_threshold_bps
    }

    /// Calculate health factor
    pub fn calculate_health(&self, position_value: u64, debt_value: u64) -> u16 {
        if debt_value == 0 {
            return u16::MAX; // Max health when no debt
        }
        let health = position_value as u128 * Self::HEALTH_SCALE as u128 / debt_value as u128;
        health.min(u16::MAX as u128) as u16
    }

    /// Check if can borrow more
    pub fn can_borrow(&self, additional: u64) -> bool {
        if self.collateral == 0 || self.max_leverage == 0 {
            return false;
        }

        let max_position = self.collateral as u128 * self.max_leverage as u128;
        let new_position = self.position_value() as u128 + additional as u128;

        new_position <= max_position
    }

    /// Calculate liquidation bonus
    pub fn liquidation_bonus(&self, bonus_bps: u16) -> u64 {
        (self.collateral as u128 * bonus_bps as u128 / 10000) as u64
    }
}

/// Lending pool for margin trading
#[account]
#[derive(InitSpace)]
pub struct LendingPool {
    /// Pool authority
    pub authority: Pubkey,

    /// Asset mint
    pub asset_mint: Pubkey,

    /// Pool vault
    pub vault: Pubkey,

    /// Receipt token mint (representing deposits)
    pub receipt_mint: Pubkey,

    /// Bump seed
    pub bump: u8,

    /// Is pool active
    pub is_active: bool,

    /// Padding
    pub _padding: [u8; 2],

    // === State ===
    /// Total deposits
    pub total_deposits: u64,

    /// Total borrowed
    pub total_borrowed: u64,

    /// Total interest collected
    pub interest_collected: u64,

    // === Rates (basis points) ===
    /// Base borrow rate
    pub base_rate_bps: u16,

    /// Utilization multiplier
    pub utilization_multiplier_bps: u16,

    /// Protocol fee on interest
    pub protocol_fee_bps: u16,

    /// Padding
    pub _padding2: [u8; 2],

    // === Limits ===
    /// Maximum utilization (basis points)
    pub max_utilization_bps: u16,

    /// Minimum deposit
    pub min_deposit: u64,

    /// Padding
    pub _padding3: [u8; 6],

    /// Reserved
    pub _reserved: [u8; 32],
}

impl LendingPool {
    pub const SEED_PREFIX: &'static [u8] = b"lending_pool";
    pub const BPS_SCALE: u64 = 10000;

    /// Calculate utilization rate (basis points)
    pub fn utilization_bps(&self) -> u16 {
        if self.total_deposits == 0 {
            return 0;
        }
        ((self.total_borrowed as u128 * 10000 / self.total_deposits as u128) as u16).min(10000)
    }

    /// Calculate borrow rate (basis points, annualized)
    pub fn borrow_rate_bps(&self) -> u16 {
        let utilization = self.utilization_bps() as u64;
        let rate = self.base_rate_bps as u64
            + (utilization * self.utilization_multiplier_bps as u64 / 10000);
        rate.min(u16::MAX as u64) as u16
    }

    /// Calculate supply rate (basis points, annualized)
    pub fn supply_rate_bps(&self) -> u16 {
        let borrow_rate = self.borrow_rate_bps() as u64;
        let utilization = self.utilization_bps() as u64;
        let protocol_cut = self.protocol_fee_bps as u64;

        let gross_yield = borrow_rate * utilization / 10000;
        let net_yield = gross_yield * (10000 - protocol_cut) / 10000;

        net_yield.min(u16::MAX as u64) as u16
    }

    /// Check if can borrow
    pub fn can_borrow(&self, amount: u64) -> bool {
        if !self.is_active {
            return false;
        }

        let new_borrowed = self.total_borrowed.saturating_add(amount);
        let new_utilization = if self.total_deposits == 0 {
            10000
        } else {
            ((new_borrowed as u128 * 10000 / self.total_deposits as u128) as u16)
        };

        new_utilization <= self.max_utilization_bps
    }

    /// Calculate available liquidity
    pub fn available_liquidity(&self) -> u64 {
        self.total_deposits.saturating_sub(self.total_borrowed)
    }
}

#[error_code]
pub enum DeFiError {
    #[msg("Yield vault not active")]
    YieldVaultNotActive,
    #[msg("Cannot harvest yet")]
    HarvestTooSoon,
    #[msg("Margin account not active")]
    MarginNotActive,
    #[msg("Position unhealthy")]
    PositionUnhealthy,
    #[msg("Leverage exceeds maximum")]
    LeverageExceeded,
    #[msg("Lending pool not active")]
    LendingPoolNotActive,
    #[msg("Insufficient liquidity")]
    InsufficientLiquidity,
    #[msg("Utilization too high")]
    UtilizationTooHigh,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_yield_vault_calculations() {
        let vault = YieldVault {
            market: Pubkey::new_unique(),
            yield_mint: Pubkey::new_unique(),
            vault: Pubkey::new_unique(),
            authority: Pubkey::new_unique(),
            yield_source: YieldSource::Marinade as u8,
            bump: 0,
            is_active: true,
            _padding: [0; 1],
            total_deposited: 1000,
            yield_accrued: 0,
            last_harvest: 0,
            last_exchange_rate: 1_000_000_000,
            min_harvest_interval: 3600,
            protocol_fee_bps: 1000,
            _padding2: [0; 6],
            _reserved: [0; 32],
        };

        // 1:1 rate
        assert_eq!(vault.calculate_base_value(1000, 1_000_000_000), 1000);

        // 1.1:1 rate (10% yield)
        assert_eq!(vault.calculate_base_value(1000, 1_100_000_000), 1100);
    }

    #[test]
    fn test_margin_health() {
        let account = MarginAccount {
            owner: Pubkey::new_unique(),
            collateral_mint: Pubkey::new_unique(),
            collateral_vault: Pubkey::new_unique(),
            bump: 0,
            is_active: true,
            max_leverage: 3,
            _padding: [0; 1],
            collateral: 1000,
            borrowed: 2000,
            interest_accrued: 0,
            health_factor: 15000,
            liquidation_threshold_bps: 11000,
            last_health_update: 0,
            _padding2: [0; 4],
            total_borrowed: 0,
            total_interest_paid: 0,
            liquidation_count: 0,
            _padding3: [0; 6],
            _reserved: [0; 32],
        };

        // 3x leverage (1000 collateral, 2000 borrowed)
        assert_eq!(account.current_leverage(), 3);
        assert!(account.is_healthy());
        assert!(account.can_borrow(0));
        assert!(!account.can_borrow(1000)); // Would exceed 3x
    }

    #[test]
    fn test_lending_pool_rates() {
        let pool = LendingPool {
            authority: Pubkey::new_unique(),
            asset_mint: Pubkey::new_unique(),
            vault: Pubkey::new_unique(),
            receipt_mint: Pubkey::new_unique(),
            bump: 0,
            is_active: true,
            _padding: [0; 2],
            total_deposits: 10000,
            total_borrowed: 5000,
            interest_collected: 0,
            base_rate_bps: 200,               // 2%
            utilization_multiplier_bps: 1000, // 10%
            protocol_fee_bps: 1000,           // 10%
            _padding2: [0; 2],
            max_utilization_bps: 9000, // 90%
            min_deposit: 100,
            _padding3: [0; 6],
            _reserved: [0; 32],
        };

        // 50% utilization
        assert_eq!(pool.utilization_bps(), 5000);

        // Borrow rate: 2% + (50% * 10%) = 7%
        assert_eq!(pool.borrow_rate_bps(), 700);

        // Can borrow up to 90% utilization
        assert!(pool.can_borrow(4000)); // Would be 90%
        assert!(!pool.can_borrow(5000)); // Would exceed 90%

        // Available liquidity
        assert_eq!(pool.available_liquidity(), 5000);
    }
}
