/// Time constants for vesting calculations
///
/// Based on KAMIYO Tokenomics:
/// - Cliff: 6 months (no tokens released)
/// - Total Duration: 24 months (linear vesting)
/// - Release: Per-second granularity (fairest distribution)

/// Seconds per month (average: 30.44 days * 24 hours * 60 min * 60 sec)
pub const SECONDS_PER_MONTH: i64 = 2_628_000;

/// Cliff duration: 6 months in seconds
pub const CLIFF_DURATION_MONTHS: i64 = 6;
pub const CLIFF_DURATION_SECONDS: i64 = CLIFF_DURATION_MONTHS * SECONDS_PER_MONTH; // 15,768,000

/// Total vesting duration: 24 months in seconds
pub const VESTING_DURATION_MONTHS: i64 = 24;
pub const VESTING_DURATION_SECONDS: i64 = VESTING_DURATION_MONTHS * SECONDS_PER_MONTH; // 63,072,000

/// PDA Seeds for account derivation
pub const VESTING_SCHEDULE_SEED: &[u8] = b"vesting_schedule";
pub const VAULT_AUTHORITY_SEED: &[u8] = b"vault_authority";

/// Token allocation constants (from Tokenomics Whitepaper)
/// Total vested: 300M KAMIYO (30% of 1B supply)
pub const TOTAL_VESTED_ALLOCATION: u64 = 300_000_000;
pub const TEAM_ALLOCATION: u64 = 150_000_000;      // 15% of supply
pub const ADVISOR_ALLOCATION: u64 = 50_000_000;    // 5% of supply
pub const INVESTOR_ALLOCATION: u64 = 100_000_000;  // 10% of supply

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_time_constants() {
        // Verify cliff is 6 months
        assert_eq!(CLIFF_DURATION_SECONDS, 15_768_000);

        // Verify total duration is 24 months
        assert_eq!(VESTING_DURATION_SECONDS, 63_072_000);

        // Verify cliff is exactly 1/4 of total duration
        assert_eq!(CLIFF_DURATION_SECONDS * 4, VESTING_DURATION_SECONDS);
    }

    #[test]
    fn test_allocation_totals() {
        // Verify total vested equals sum of categories
        assert_eq!(
            TOTAL_VESTED_ALLOCATION,
            TEAM_ALLOCATION + ADVISOR_ALLOCATION + INVESTOR_ALLOCATION
        );

        // Verify 30% of 1B supply
        assert_eq!(TOTAL_VESTED_ALLOCATION, 300_000_000);
    }
}
