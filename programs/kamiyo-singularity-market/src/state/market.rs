use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct Market {
    /// Unique market identifier
    #[max_len(64)]
    pub market_id: String,

    /// Market question/title
    #[max_len(256)]
    pub question: String,

    /// Market description
    #[max_len(512)]
    pub description: String,

    /// Market category
    #[max_len(32)]
    pub category: String,

    /// Market creator/authority
    pub authority: Pubkey,

    /// Resolution oracle
    pub oracle: Pubkey,

    /// YES outcome token mint
    pub yes_mint: Pubkey,

    /// NO outcome token mint
    pub no_mint: Pubkey,

    /// Collateral vault
    pub vault: Pubkey,

    /// Collateral mint (e.g., USDC)
    pub collateral_mint: Pubkey,

    /// Market status
    pub status: MarketStatus,

    /// Resolution deadline (Unix timestamp)
    pub resolution_deadline: i64,

    /// Trading end time (Unix timestamp)
    pub trading_end: i64,

    /// Resolved outcome (0 = unresolved, 1 = Yes, 2 = No)
    pub resolved_outcome: u8,

    /// Total collateral deposited
    pub total_collateral: u64,

    /// Total YES tokens minted
    pub total_yes_supply: u64,

    /// Total NO tokens minted
    pub total_no_supply: u64,

    /// Total fee in basis points (100 = 1%)
    pub fee_bps: u16,

    /// Protocol's share of fees in basis points.
    /// In Singularity this is set to 100% (10000 bps) to power the KAMIYO staking flywheel.
    pub protocol_fee_share_bps: u16,

    /// Protocol treasury address for fee collection
    pub protocol_treasury: Pubkey,

    /// Accumulated fees (total, before split)
    pub accumulated_fees: u64,

    /// Protocol fees already withdrawn
    pub protocol_fees_withdrawn: u64,

    /// Creator fees already withdrawn
    pub creator_fees_withdrawn: u64,

    /// Bump seed for PDA
    pub bump: u8,

    /// YES mint bump
    pub yes_mint_bump: u8,

    /// NO mint bump
    pub no_mint_bump: u8,

    /// Vault bump
    pub vault_bump: u8,

    /// Creation timestamp
    pub created_at: i64,

    /// Resolution timestamp
    pub resolved_at: i64,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace, Debug)]
pub enum MarketStatus {
    /// Trading is open
    Active,
    /// Trading temporarily halted
    Paused,
    /// Trading ended, awaiting resolution
    Closed,
    /// Outcome determined, claims available
    Resolved,
    /// Market cancelled, refunds available
    Cancelled,
}

impl Default for MarketStatus {
    fn default() -> Self {
        MarketStatus::Active
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum Outcome {
    Yes,
    No,
}

impl Market {
    pub const SEED_PREFIX: &'static [u8] = b"market";
    pub const YES_MINT_SEED: &'static [u8] = b"yes_mint";
    pub const NO_MINT_SEED: &'static [u8] = b"no_mint";
    pub const VAULT_SEED: &'static [u8] = b"vault";

    /// Default protocol fee share: 100% of total fees
    pub const DEFAULT_PROTOCOL_FEE_SHARE_BPS: u16 = 10_000;

    pub fn is_trading_active(&self, current_time: i64) -> bool {
        self.status == MarketStatus::Active && current_time < self.trading_end
    }

    pub fn can_resolve(&self, current_time: i64) -> bool {
        self.status == MarketStatus::Closed && current_time >= self.resolution_deadline
    }

    /// Calculate the protocol's share of accumulated fees
    pub fn calculate_protocol_fees(&self) -> u64 {
        let Some(value) = (self.accumulated_fees as u128)
            .checked_mul(self.protocol_fee_share_bps as u128)
            .and_then(|v| v.checked_div(10000))
        else {
            return 0;
        };

        u64::try_from(value).unwrap_or(0)
    }

    /// Calculate the creator's share of accumulated fees
    pub fn calculate_creator_fees(&self) -> u64 {
        let protocol_share = self.calculate_protocol_fees();
        self.accumulated_fees.saturating_sub(protocol_share)
    }

    /// Get available protocol fees (not yet withdrawn)
    pub fn available_protocol_fees(&self) -> u64 {
        self.calculate_protocol_fees()
            .saturating_sub(self.protocol_fees_withdrawn)
    }

    /// Get available creator fees (not yet withdrawn)
    pub fn available_creator_fees(&self) -> u64 {
        self.calculate_creator_fees()
            .saturating_sub(self.creator_fees_withdrawn)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use proptest::prelude::*;

    fn default_market() -> Market {
        Market {
            market_id: String::new(),
            question: String::new(),
            description: String::new(),
            category: String::new(),
            authority: Pubkey::default(),
            oracle: Pubkey::default(),
            yes_mint: Pubkey::default(),
            no_mint: Pubkey::default(),
            vault: Pubkey::default(),
            collateral_mint: Pubkey::default(),
            status: MarketStatus::Active,
            resolution_deadline: 0,
            trading_end: 0,
            resolved_outcome: 0,
            total_collateral: 0,
            total_yes_supply: 0,
            total_no_supply: 0,
            fee_bps: 100, // 1%
            protocol_fee_share_bps: Market::DEFAULT_PROTOCOL_FEE_SHARE_BPS,
            protocol_treasury: Pubkey::default(),
            accumulated_fees: 0,
            protocol_fees_withdrawn: 0,
            creator_fees_withdrawn: 0,
            bump: 0,
            yes_mint_bump: 0,
            no_mint_bump: 0,
            vault_bump: 0,
            created_at: 0,
            resolved_at: 0,
        }
    }

    #[test]
    fn test_fee_calculation_zero_fees() {
        let market = default_market();
        assert_eq!(market.calculate_protocol_fees(), 0);
        assert_eq!(market.calculate_creator_fees(), 0);
    }

    #[test]
    fn test_fee_calculation_standard_split() {
        // 100% protocol, 0% creator (Singularity default)
        let mut market = default_market();
        market.accumulated_fees = 10_000; // 10,000 lamports

        let protocol = market.calculate_protocol_fees();
        let creator = market.calculate_creator_fees();

        assert_eq!(protocol, 10_000); // 100%
        assert_eq!(creator, 0); // 0%
        assert_eq!(protocol + creator, 10_000);
    }

    #[test]
    fn test_fee_calculation_custom_split() {
        let mut market = default_market();
        market.protocol_fee_share_bps = 5000; // 50% protocol
        market.accumulated_fees = 1_000_000;

        let protocol = market.calculate_protocol_fees();
        let creator = market.calculate_creator_fees();

        assert_eq!(protocol, 500_000);
        assert_eq!(creator, 500_000);
    }

    #[test]
    fn test_fee_calculation_all_to_protocol() {
        let mut market = default_market();
        market.protocol_fee_share_bps = 10000; // 100% protocol
        market.accumulated_fees = 1_000_000;

        assert_eq!(market.calculate_protocol_fees(), 1_000_000);
        assert_eq!(market.calculate_creator_fees(), 0);
    }

    #[test]
    fn test_fee_calculation_all_to_creator() {
        let mut market = default_market();
        market.protocol_fee_share_bps = 0; // 0% protocol
        market.accumulated_fees = 1_000_000;

        assert_eq!(market.calculate_protocol_fees(), 0);
        assert_eq!(market.calculate_creator_fees(), 1_000_000);
    }

    #[test]
    fn test_available_fees_with_withdrawals() {
        let mut market = default_market();
        market.accumulated_fees = 10_000;
        market.protocol_fees_withdrawn = 6_000;
        market.creator_fees_withdrawn = 0;

        // Protocol: 10,000 total, 6,000 withdrawn = 4,000 available
        assert_eq!(market.available_protocol_fees(), 4_000);
        // Creator is disabled under default split
        assert_eq!(market.available_creator_fees(), 0);
    }

    #[test]
    fn test_available_fees_fully_withdrawn() {
        let mut market = default_market();
        market.accumulated_fees = 10_000;
        market.protocol_fees_withdrawn = 10_000;
        market.creator_fees_withdrawn = 0;

        assert_eq!(market.available_protocol_fees(), 0);
        assert_eq!(market.available_creator_fees(), 0);
    }

    #[test]
    fn test_available_fees_over_withdrawn() {
        // Edge case: withdrawn more than calculated (should not happen, but test safety)
        let mut market = default_market();
        market.accumulated_fees = 10_000;
        market.protocol_fees_withdrawn = 20_000; // More than available
        market.creator_fees_withdrawn = 10_000; // Creator share is 0 with default split

        // saturating_sub should return 0
        assert_eq!(market.available_protocol_fees(), 0);
        assert_eq!(market.available_creator_fees(), 0);
    }

    #[test]
    fn test_fee_calculation_large_amounts() {
        let mut market = default_market();
        market.accumulated_fees = u64::MAX;

        // Should not overflow due to u128 intermediate
        let protocol = market.calculate_protocol_fees();
        let creator = market.calculate_creator_fees();

        // Verify rough correctness (100% of u64::MAX)
        let expected_protocol = (u64::MAX as u128 * 10_000 / 10_000) as u64;
        assert_eq!(protocol, expected_protocol);
        assert_eq!(creator, u64::MAX - expected_protocol);
    }

    #[test]
    fn test_fee_calculation_small_amounts() {
        let mut market = default_market();
        market.accumulated_fees = 1; // 1 lamport

        // 100% of 1 = 1
        assert_eq!(market.calculate_protocol_fees(), 1);
        assert_eq!(market.calculate_creator_fees(), 0);
    }

    #[test]
    fn test_fee_calculation_rounding() {
        let mut market = default_market();
        market.accumulated_fees = 17; // Odd number

        // 17 * 10000 / 10000 = 17
        let protocol = market.calculate_protocol_fees();
        assert_eq!(protocol, 17);
        // Creator gets remainder: 17 - 17 = 0
        assert_eq!(market.calculate_creator_fees(), 0);
    }

    proptest! {
        #[test]
        fn fee_split_matches_reference_model(
            accumulated_fees in 0_u64..=u64::MAX,
            protocol_share in 0_u16..=10_000_u16
        ) {
            let mut market = default_market();
            market.accumulated_fees = accumulated_fees;
            market.protocol_fee_share_bps = protocol_share;

            let protocol = market.calculate_protocol_fees();
            let creator = market.calculate_creator_fees();

            let expected_protocol =
                ((accumulated_fees as u128) * (protocol_share as u128) / 10_000_u128) as u64;
            let expected_creator = accumulated_fees.saturating_sub(expected_protocol);

            prop_assert_eq!(protocol, expected_protocol);
            prop_assert_eq!(creator, expected_creator);
            prop_assert_eq!(protocol.saturating_add(creator), accumulated_fees);
        }

        #[test]
        fn available_fee_views_are_saturating(
            accumulated_fees in 0_u64..=u64::MAX,
            protocol_share in 0_u16..=10_000_u16,
            protocol_withdrawn in 0_u64..=u64::MAX,
            creator_withdrawn in 0_u64..=u64::MAX
        ) {
            let mut market = default_market();
            market.accumulated_fees = accumulated_fees;
            market.protocol_fee_share_bps = protocol_share;
            market.protocol_fees_withdrawn = protocol_withdrawn;
            market.creator_fees_withdrawn = creator_withdrawn;

            let protocol_total = market.calculate_protocol_fees();
            let creator_total = market.calculate_creator_fees();
            let protocol_available = market.available_protocol_fees();
            let creator_available = market.available_creator_fees();

            prop_assert!(protocol_available <= protocol_total);
            prop_assert!(creator_available <= creator_total);
            prop_assert_eq!(
                protocol_available,
                protocol_total.saturating_sub(protocol_withdrawn)
            );
            prop_assert_eq!(
                creator_available,
                creator_total.saturating_sub(creator_withdrawn)
            );
        }
    }

    #[test]
    fn test_is_trading_active() {
        let mut market = default_market();
        market.status = MarketStatus::Active;
        market.trading_end = 1000;

        assert!(market.is_trading_active(500)); // Before end
        assert!(market.is_trading_active(999)); // Just before end
        assert!(!market.is_trading_active(1000)); // At end
        assert!(!market.is_trading_active(1001)); // After end
    }

    #[test]
    fn test_is_trading_active_wrong_status() {
        let mut market = default_market();
        market.trading_end = 1000;

        market.status = MarketStatus::Paused;
        assert!(!market.is_trading_active(500));

        market.status = MarketStatus::Closed;
        assert!(!market.is_trading_active(500));

        market.status = MarketStatus::Resolved;
        assert!(!market.is_trading_active(500));

        market.status = MarketStatus::Cancelled;
        assert!(!market.is_trading_active(500));
    }

    #[test]
    fn test_can_resolve() {
        let mut market = default_market();
        market.status = MarketStatus::Closed;
        market.resolution_deadline = 1000;

        assert!(!market.can_resolve(999)); // Before deadline
        assert!(market.can_resolve(1000)); // At deadline
        assert!(market.can_resolve(1001)); // After deadline
    }

    #[test]
    fn test_can_resolve_wrong_status() {
        let mut market = default_market();
        market.resolution_deadline = 1000;

        market.status = MarketStatus::Active;
        assert!(!market.can_resolve(2000));

        market.status = MarketStatus::Paused;
        assert!(!market.can_resolve(2000));

        market.status = MarketStatus::Resolved;
        assert!(!market.can_resolve(2000));

        market.status = MarketStatus::Cancelled;
        assert!(!market.can_resolve(2000));
    }

    #[test]
    fn test_market_status_default() {
        assert_eq!(MarketStatus::default(), MarketStatus::Active);
    }
}
