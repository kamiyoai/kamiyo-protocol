//! Proof helpers for staking invariants.

/// Assert that a duration-to-multiplier function is monotonically non-decreasing.
///
/// For all symbolic `d1 <= d2`: `multiplier_fn(d1) <= multiplier_fn(d2)`.
pub fn assert_multiplier_monotonic<F>(multiplier_fn: F)
where
    F: Fn(i64) -> u64,
{
    let d1: i64 = kani::any();
    let d2: i64 = kani::any();
    kani::assume(d1 <= d2);
    assert!(
        multiplier_fn(d1) <= multiplier_fn(d2),
        "multiplier is not monotonically non-decreasing"
    );
}

/// Assert that a multiplier function only returns values from an expected set.
pub fn assert_multiplier_in_set<F>(multiplier_fn: F, expected_values: &[u64])
where
    F: Fn(i64) -> u64,
{
    let duration: i64 = kani::any();
    let result = multiplier_fn(duration);
    let mut found = false;
    let mut i = 0;
    while i < expected_values.len() {
        if expected_values[i] == result {
            found = true;
            break;
        }
        i += 1;
    }
    assert!(found, "multiplier returned unexpected value");
}

/// Assert that a rewards function returns 0 when staked amount is 0.
///
/// `rewards_fn` signature: `(staked_amount, accumulated_per_share, rewards_debt, duration) -> u64`
pub fn assert_zero_rewards_when_unstaked<F>(rewards_fn: F)
where
    F: Fn(u64, u128, u128, i64) -> u64,
{
    let accumulated: u128 = kani::any();
    let debt: u128 = kani::any();
    let duration: i64 = kani::any();
    let pending = rewards_fn(0, accumulated, debt, duration);
    assert_eq!(pending, 0, "non-zero rewards for zero stake");
}

/// Assert that a rewards function never overflows within bounded inputs.
///
/// `rewards_fn` returns `Option<u64>` — `None` means overflow.
pub fn assert_rewards_no_overflow<F>(rewards_fn: F, max_staked: u64, max_accumulated: u128)
where
    F: Fn(u64, u128, u128, i64) -> Option<u64>,
{
    let staked: u64 = kani::any();
    kani::assume(staked <= max_staked);
    let accumulated: u128 = kani::any();
    kani::assume(accumulated <= max_accumulated);
    let debt: u128 = kani::any();
    let duration: i64 = kani::any();
    let result = rewards_fn(staked, accumulated, debt, duration);
    assert!(result.is_some(), "rewards overflowed within bounded domain");
}
