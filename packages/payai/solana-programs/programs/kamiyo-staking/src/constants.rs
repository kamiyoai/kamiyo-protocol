/// Global constants for KAMIYO staking program
/// Based on Phase 1 standardized tier structure

/// Seed for StakePool PDA derivation
pub const STAKE_POOL_SEED: &[u8] = b"stake_pool";

/// Seed for UserStake PDA derivation
pub const USER_STAKE_SEED: &[u8] = b"user_stake";

/// Seed for stake vault (holds staked tokens)
pub const STAKE_VAULT_SEED: &[u8] = b"stake_vault";

/// Seed for reward vault (holds reward tokens)
pub const REWARD_VAULT_SEED: &[u8] = b"reward_vault";

// ============================================================================
// Tier Thresholds (in base units, 9 decimals)
// ============================================================================

/// Minimum stake for Pro tier: 1,000 KAMIYO
pub const PRO_TIER_THRESHOLD: u64 = 1_000 * 1_000_000_000;

/// Minimum stake for Team tier: 10,000 KAMIYO
pub const TEAM_TIER_THRESHOLD: u64 = 10_000 * 1_000_000_000;

/// Minimum stake for Enterprise tier: 100,000 KAMIYO
pub const ENTERPRISE_TIER_THRESHOLD: u64 = 100_000 * 1_000_000_000;

// ============================================================================
// APY Rates (in basis points, 1000 = 10%)
// ============================================================================

/// Free tier APY: 0% (no staking required)
pub const APY_FREE: u16 = 0;

/// Pro tier APY: 10% (1,000-9,999 KAMIYO)
pub const APY_PRO: u16 = 1_000;

/// Team tier APY: 15% (10,000-99,999 KAMIYO)
pub const APY_TEAM: u16 = 1_500;

/// Enterprise tier APY: 25% (100,000+ KAMIYO)
pub const APY_ENTERPRISE: u16 = 2_500;

// ============================================================================
// Time Constants
// ============================================================================

/// Unstaking cooldown period: 14 days in seconds
/// Industry standard for preventing gaming of rewards
pub const COOLDOWN_PERIOD: i64 = 14 * 24 * 60 * 60; // 1,209,600 seconds

/// Seconds per year for APY calculations (365 days)
pub const SECONDS_PER_YEAR: i64 = 365 * 24 * 60 * 60; // 31,536,000 seconds

// ============================================================================
// Staking Rules
// ============================================================================

/// Minimum stake amount: 100 KAMIYO
/// Prevents spam accounts and ensures meaningful participation
pub const MIN_STAKE_AMOUNT: u64 = 100 * 1_000_000_000;

/// Maximum stake amount: No limit (whale-friendly)
/// Users can stake as much as they want for Enterprise tier benefits
pub const MAX_STAKE_AMOUNT: u64 = u64::MAX;

// ============================================================================
// Reward Calculation Precision
// ============================================================================

/// Basis points denominator (10,000 = 100%)
pub const BASIS_POINTS_DENOMINATOR: u128 = 10_000;

/// Precision scalar for reward_per_token calculations
/// Using 1e18 for high precision in proportional rewards
pub const REWARD_PRECISION: u128 = 1_000_000_000_000_000_000;

// ============================================================================
// x402 Integration Constants (from Phase 1 docs)
// ============================================================================

/// Fee discount for Pro tier: 10%
pub const FEE_DISCOUNT_PRO: u8 = 10;

/// Fee discount for Team tier: 20%
pub const FEE_DISCOUNT_TEAM: u8 = 20;

/// Fee discount for Enterprise tier: 30%
pub const FEE_DISCOUNT_ENTERPRISE: u8 = 30;

/// Governance voting weight multipliers
pub const GOVERNANCE_WEIGHT_FREE: u8 = 0;
pub const GOVERNANCE_WEIGHT_PRO: u8 = 1;
pub const GOVERNANCE_WEIGHT_TEAM: u8 = 2;
pub const GOVERNANCE_WEIGHT_ENTERPRISE: u8 = 5;

// ============================================================================
// Economic Model Constants
// ============================================================================

/// Percentage of x402 revenue allocated to staking rewards
/// From Phase 1 economic model: 30% of platform fees
pub const REVENUE_ALLOCATION_PERCENT: u8 = 30;

/// Target APY range for dynamic adjustment
pub const MIN_TARGET_APY_BPS: u16 = 1_000; // 10%
pub const MAX_TARGET_APY_BPS: u16 = 2_500; // 25%

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_cooldown_period() {
        assert_eq!(COOLDOWN_PERIOD, 1_209_600); // 14 days
    }

    #[test]
    fn test_tier_thresholds() {
        assert!(PRO_TIER_THRESHOLD < TEAM_TIER_THRESHOLD);
        assert!(TEAM_TIER_THRESHOLD < ENTERPRISE_TIER_THRESHOLD);
    }

    #[test]
    fn test_apy_progression() {
        assert!(APY_PRO > APY_FREE);
        assert!(APY_TEAM > APY_PRO);
        assert!(APY_ENTERPRISE > APY_TEAM);
    }

    #[test]
    fn test_min_stake_reasonable() {
        // Min stake should be >= 100 KAMIYO
        assert!(MIN_STAKE_AMOUNT >= 100 * 1_000_000_000);
    }
}
