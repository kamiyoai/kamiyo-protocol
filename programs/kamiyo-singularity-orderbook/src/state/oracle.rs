use anchor_lang::prelude::*;

/// Oracle configuration for a market
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Default)]
#[repr(C)]
pub struct OracleConfig {
    /// Oracle type (0 = None, 1 = Switchboard, 2 = Pyth, 3 = Manual)
    pub oracle_type: u8,

    /// Maximum staleness in seconds (0 = no staleness check)
    pub max_staleness: u32,

    /// Resolution threshold low 64 bits
    pub threshold_lo: u64,

    /// Resolution threshold high 64 bits (signed)
    pub threshold_hi: i64,

    /// Comparison operator (0 = >=, 1 = >, 2 = <=, 3 = <, 4 = ==)
    pub operator: u8,

    /// Confidence interval requirement (0 = disabled)
    /// If non-zero, oracle confidence must be <= this value
    pub max_confidence: u64,

    /// Reserved padding
    pub _padding: [u8; 6],
}

impl anchor_lang::Space for OracleConfig {
    const INIT_SPACE: usize = 1 + 4 + 8 + 8 + 1 + 8 + 6; // 36 bytes
}

impl OracleConfig {
    pub const SIZE: usize = 36;

    /// Get threshold as i128
    pub fn get_threshold(&self) -> i128 {
        ((self.threshold_hi as i128) << 64) | (self.threshold_lo as i128)
    }

    /// Set threshold from i128
    pub fn set_threshold(&mut self, value: i128) {
        self.threshold_lo = value as u64;
        self.threshold_hi = (value >> 64) as i64;
    }

    pub fn new_switchboard(threshold: i128, operator: ComparisonOp, max_staleness: u32) -> Self {
        let mut config = Self {
            oracle_type: OracleType::Switchboard as u8,
            max_staleness,
            threshold_lo: 0,
            threshold_hi: 0,
            operator: operator as u8,
            max_confidence: 0,
            _padding: [0; 6],
        };
        config.set_threshold(threshold);
        config
    }

    pub fn get_oracle_type(&self) -> OracleType {
        match self.oracle_type {
            1 => OracleType::Switchboard,
            2 => OracleType::Pyth,
            3 => OracleType::Manual,
            _ => OracleType::None,
        }
    }

    pub fn get_operator(&self) -> ComparisonOp {
        match self.operator {
            0 => ComparisonOp::GreaterThanOrEqual,
            1 => ComparisonOp::GreaterThan,
            2 => ComparisonOp::LessThanOrEqual,
            3 => ComparisonOp::LessThan,
            4 => ComparisonOp::Equal,
            _ => ComparisonOp::GreaterThanOrEqual,
        }
    }

    /// Evaluate if the oracle price satisfies the threshold condition
    pub fn evaluate_threshold(&self, price: i128) -> bool {
        let threshold = self.get_threshold();
        match self.get_operator() {
            ComparisonOp::GreaterThanOrEqual => price >= threshold,
            ComparisonOp::GreaterThan => price > threshold,
            ComparisonOp::LessThanOrEqual => price <= threshold,
            ComparisonOp::LessThan => price < threshold,
            ComparisonOp::Equal => price == threshold,
        }
    }
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
#[repr(u8)]
pub enum OracleType {
    None = 0,
    Switchboard = 1,
    Pyth = 2,
    Manual = 3,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
#[repr(u8)]
pub enum ComparisonOp {
    GreaterThanOrEqual = 0,
    GreaterThan = 1,
    LessThanOrEqual = 2,
    LessThan = 3,
    Equal = 4,
}

/// Oracle price data parsed from feed
#[derive(Clone, Copy, Debug)]
pub struct OraclePrice {
    /// Price value (18 decimals)
    pub price: i128,

    /// Confidence interval
    pub confidence: u64,

    /// Slot when price was updated
    pub slot: u64,

    /// Unix timestamp of update
    pub timestamp: i64,
}

impl OraclePrice {
    /// Check if price is stale
    pub fn is_stale(&self, current_slot: u64, max_staleness_slots: u64) -> bool {
        if max_staleness_slots == 0 {
            return false;
        }
        current_slot.saturating_sub(self.slot) > max_staleness_slots
    }

    /// Convert to basis points (0-10000)
    /// Assumes price is in range [0, 1] with 18 decimals
    pub fn to_basis_points(&self) -> Option<u64> {
        if self.price < 0 {
            return None;
        }
        // price is 18 decimals, we want basis points (10000 = 100%)
        // bps = price * 10000 / 10^18
        let bps = (self.price as u128)
            .checked_mul(10000)?
            .checked_div(1_000_000_000_000_000_000)?;
        if bps > 10000 {
            return None;
        }
        Some(bps as u64)
    }
}

/// Resolution outcome
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
#[repr(u8)]
pub enum ResolutionOutcome {
    Unresolved = 0,
    Yes = 1,
    No = 2,
    Invalid = 3,
}

impl From<u8> for ResolutionOutcome {
    fn from(v: u8) -> Self {
        match v {
            1 => ResolutionOutcome::Yes,
            2 => ResolutionOutcome::No,
            3 => ResolutionOutcome::Invalid,
            _ => ResolutionOutcome::Unresolved,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_threshold_evaluation() {
        let config = OracleConfig::new_switchboard(
            1_000_000_000_000_000_000, // 1.0 with 18 decimals
            ComparisonOp::GreaterThanOrEqual,
            300,
        );

        // Price >= 1.0 should resolve to Yes
        assert!(config.evaluate_threshold(1_000_000_000_000_000_000));
        assert!(config.evaluate_threshold(1_500_000_000_000_000_000));
        assert!(!config.evaluate_threshold(500_000_000_000_000_000));
    }

    #[test]
    fn test_price_to_basis_points() {
        // 0.5 = 5000 bps
        let price = OraclePrice {
            price: 500_000_000_000_000_000, // 0.5
            confidence: 0,
            slot: 100,
            timestamp: 1000,
        };
        assert_eq!(price.to_basis_points(), Some(5000));

        // 1.0 = 10000 bps
        let price = OraclePrice {
            price: 1_000_000_000_000_000_000, // 1.0
            confidence: 0,
            slot: 100,
            timestamp: 1000,
        };
        assert_eq!(price.to_basis_points(), Some(10000));

        // 0.01 = 100 bps
        let price = OraclePrice {
            price: 10_000_000_000_000_000, // 0.01
            confidence: 0,
            slot: 100,
            timestamp: 1000,
        };
        assert_eq!(price.to_basis_points(), Some(100));
    }

    #[test]
    fn test_staleness_check() {
        let price = OraclePrice {
            price: 500_000_000_000_000_000,
            confidence: 0,
            slot: 100,
            timestamp: 1000,
        };

        // Not stale: current_slot 150, max_staleness 100
        assert!(!price.is_stale(150, 100));

        // Stale: current_slot 250, max_staleness 100
        assert!(price.is_stale(250, 100));

        // Staleness disabled
        assert!(!price.is_stale(1000000, 0));
    }

    #[test]
    fn test_comparison_operators() {
        let threshold = 100i128;

        // >=
        let mut config = OracleConfig::default();
        config.operator = ComparisonOp::GreaterThanOrEqual as u8;
        config.set_threshold(threshold);
        assert!(config.evaluate_threshold(100));
        assert!(config.evaluate_threshold(101));
        assert!(!config.evaluate_threshold(99));

        // >
        let mut config = OracleConfig::default();
        config.operator = ComparisonOp::GreaterThan as u8;
        config.set_threshold(threshold);
        assert!(!config.evaluate_threshold(100));
        assert!(config.evaluate_threshold(101));

        // <=
        let mut config = OracleConfig::default();
        config.operator = ComparisonOp::LessThanOrEqual as u8;
        config.set_threshold(threshold);
        assert!(config.evaluate_threshold(100));
        assert!(config.evaluate_threshold(99));
        assert!(!config.evaluate_threshold(101));

        // <
        let mut config = OracleConfig::default();
        config.operator = ComparisonOp::LessThan as u8;
        config.set_threshold(threshold);
        assert!(!config.evaluate_threshold(100));
        assert!(config.evaluate_threshold(99));

        // ==
        let mut config = OracleConfig::default();
        config.operator = ComparisonOp::Equal as u8;
        config.set_threshold(threshold);
        assert!(config.evaluate_threshold(100));
        assert!(!config.evaluate_threshold(99));
        assert!(!config.evaluate_threshold(101));
    }
}
