use crate::errors::VestingError;
use anchor_lang::prelude::*;

/// Calculate vested amount based on linear vesting with cliff
///
/// Vesting Formula:
/// - Before cliff (0-6 months): 0% vested
/// - After full duration (24+ months): 100% vested
/// - During vesting (6-24 months): Linear per-second vesting
///
/// Formula: vested = (total_amount * elapsed) / vesting_duration
///
/// Example (1,000,000 KAMIYO over 24 months):
/// - Month 0-6 (cliff): 0 tokens
/// - Month 9 (3 months post-cliff): 375,000 tokens (9/24 = 37.5%)
/// - Month 12: 500,000 tokens (50%)
/// - Month 24: 1,000,000 tokens (100%)
pub fn calculate_vested_amount(
    total_amount: u64,
    start_time: i64,
    cliff_duration: i64,
    vesting_duration: i64,
    current_time: i64,
) -> Result<u64> {
    // Calculate elapsed time since vesting start
    let elapsed = current_time.saturating_sub(start_time);

    // Phase 1: Before cliff - 0% vested
    if elapsed < cliff_duration {
        return Ok(0);
    }

    // Phase 2: After full duration - 100% vested
    if elapsed >= vesting_duration {
        return Ok(total_amount);
    }

    // Phase 3: During vesting period - linear interpolation
    // Use u128 to prevent overflow during multiplication
    let vested = (total_amount as u128)
        .checked_mul(elapsed as u128)
        .ok_or(VestingError::Overflow)?
        .checked_div(vesting_duration as u128)
        .ok_or(VestingError::Underflow)?;

    Ok(vested as u64)
}

/// Calculate claimable amount (vested - already claimed)
///
/// This is the actual amount the beneficiary can claim right now.
/// It's the difference between total vested and what they've already claimed.
///
/// Example:
/// - Total vested: 500,000 KAMIYO (at 12 months)
/// - Already claimed: 200,000 KAMIYO (claimed at 9 months)
/// - Claimable: 300,000 KAMIYO
pub fn calculate_claimable_amount(
    total_amount: u64,
    claimed_amount: u64,
    start_time: i64,
    cliff_duration: i64,
    vesting_duration: i64,
    current_time: i64,
) -> Result<u64> {
    // Calculate total vested amount
    let vested_amount = calculate_vested_amount(
        total_amount,
        start_time,
        cliff_duration,
        vesting_duration,
        current_time,
    )?;

    // Claimable = vested - already_claimed
    let claimable = vested_amount
        .checked_sub(claimed_amount)
        .ok_or(VestingError::Underflow)?;

    Ok(claimable)
}

/// Calculate unvested amount (for revocation scenarios)
///
/// When a schedule is revoked, this calculates how much should be
/// returned to the admin vs. kept by the beneficiary.
///
/// Example (revoked at 12 months):
/// - Total: 1,000,000 KAMIYO
/// - Vested: 500,000 KAMIYO (beneficiary keeps this)
/// - Unvested: 500,000 KAMIYO (returned to admin)
pub fn calculate_unvested_amount(
    total_amount: u64,
    start_time: i64,
    cliff_duration: i64,
    vesting_duration: i64,
    current_time: i64,
) -> Result<u64> {
    // Calculate vested amount
    let vested_amount = calculate_vested_amount(
        total_amount,
        start_time,
        cliff_duration,
        vesting_duration,
        current_time,
    )?;

    // Unvested = total - vested
    let unvested = total_amount
        .checked_sub(vested_amount)
        .ok_or(VestingError::Underflow)?;

    Ok(unvested)
}

#[cfg(test)]
mod tests {
    use super::*;

    const TOTAL_AMOUNT: u64 = 1_000_000; // 1M KAMIYO
    const START_TIME: i64 = 1_735_689_600; // Jan 1, 2025 00:00 UTC
    const CLIFF_DURATION: i64 = 15_768_000; // 6 months
    const VESTING_DURATION: i64 = 63_072_000; // 24 months

    #[test]
    fn test_vesting_before_cliff() {
        // 3 months in (before 6-month cliff)
        let current_time = START_TIME + (CLIFF_DURATION / 2);
        let vested = calculate_vested_amount(
            TOTAL_AMOUNT,
            START_TIME,
            CLIFF_DURATION,
            VESTING_DURATION,
            current_time,
        )
        .unwrap();

        assert_eq!(vested, 0, "No tokens should vest before cliff");
    }

    #[test]
    fn test_vesting_at_cliff() {
        // Exactly at cliff (6 months)
        let current_time = START_TIME + CLIFF_DURATION;
        let vested = calculate_vested_amount(
            TOTAL_AMOUNT,
            START_TIME,
            CLIFF_DURATION,
            VESTING_DURATION,
            current_time,
        )
        .unwrap();

        // At cliff: 6/24 = 25% should be vested
        let expected = (TOTAL_AMOUNT as u128 * CLIFF_DURATION as u128
            / VESTING_DURATION as u128) as u64;
        assert_eq!(vested, expected, "25% should vest at cliff");
        assert_eq!(vested, 250_000, "Should be 250k tokens (25%)");
    }

    #[test]
    fn test_vesting_midpoint() {
        // 12 months in (midpoint)
        let current_time = START_TIME + (VESTING_DURATION / 2);
        let vested = calculate_vested_amount(
            TOTAL_AMOUNT,
            START_TIME,
            CLIFF_DURATION,
            VESTING_DURATION,
            current_time,
        )
        .unwrap();

        // At 12 months: 50% should be vested
        assert_eq!(vested, 500_000, "50% should vest at midpoint");
    }

    #[test]
    fn test_vesting_fully_vested() {
        // 24+ months in (fully vested)
        let current_time = START_TIME + VESTING_DURATION + 1000;
        let vested = calculate_vested_amount(
            TOTAL_AMOUNT,
            START_TIME,
            CLIFF_DURATION,
            VESTING_DURATION,
            current_time,
        )
        .unwrap();

        assert_eq!(vested, TOTAL_AMOUNT, "100% should vest after duration");
    }

    #[test]
    fn test_claimable_amount() {
        // 12 months in, already claimed 200k
        let current_time = START_TIME + (VESTING_DURATION / 2);
        let claimed = 200_000;

        let claimable = calculate_claimable_amount(
            TOTAL_AMOUNT,
            claimed,
            START_TIME,
            CLIFF_DURATION,
            VESTING_DURATION,
            current_time,
        )
        .unwrap();

        // Vested: 500k, Claimed: 200k, Claimable: 300k
        assert_eq!(claimable, 300_000, "Should be 300k claimable");
    }

    #[test]
    fn test_claimable_nothing_to_claim() {
        // Before cliff, nothing to claim
        let current_time = START_TIME + (CLIFF_DURATION / 2);

        let claimable = calculate_claimable_amount(
            TOTAL_AMOUNT,
            0,
            START_TIME,
            CLIFF_DURATION,
            VESTING_DURATION,
            current_time,
        )
        .unwrap();

        assert_eq!(claimable, 0, "Nothing to claim before cliff");
    }

    #[test]
    fn test_unvested_amount() {
        // 12 months in (50% vested, 50% unvested)
        let current_time = START_TIME + (VESTING_DURATION / 2);

        let unvested = calculate_unvested_amount(
            TOTAL_AMOUNT,
            START_TIME,
            CLIFF_DURATION,
            VESTING_DURATION,
            current_time,
        )
        .unwrap();

        assert_eq!(unvested, 500_000, "50% should be unvested at midpoint");
    }

    #[test]
    fn test_unvested_before_cliff() {
        // Before cliff (all tokens unvested)
        let current_time = START_TIME + (CLIFF_DURATION / 2);

        let unvested = calculate_unvested_amount(
            TOTAL_AMOUNT,
            START_TIME,
            CLIFF_DURATION,
            VESTING_DURATION,
            current_time,
        )
        .unwrap();

        assert_eq!(unvested, TOTAL_AMOUNT, "All tokens unvested before cliff");
    }

    #[test]
    fn test_linear_vesting_progression() {
        // Test that vesting increases linearly each month
        let month_in_seconds = 2_628_000;
        let mut previous_vested = 0;

        for month in 6..=24 {
            let current_time = START_TIME + (month * month_in_seconds);
            let vested = calculate_vested_amount(
                TOTAL_AMOUNT,
                START_TIME,
                CLIFF_DURATION,
                VESTING_DURATION,
                current_time,
            )
            .unwrap();

            // Each month should have more vested than previous
            assert!(
                vested >= previous_vested,
                "Vesting should increase monotonically"
            );

            previous_vested = vested;
        }
    }
}
