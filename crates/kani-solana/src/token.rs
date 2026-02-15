//! Proof helpers for value-conserving splits.

/// Proves that `split_fn(total)` conserves value for all symbolic totals.
pub fn assert_two_way_split_conserves<F>(split_fn: F)
where
    F: Fn(u64) -> (u64, u64),
{
    let total: u64 = kani::any();
    let (a, b) = split_fn(total);
    assert!(a <= total, "part_a exceeds total");
    assert!(b <= total, "part_b exceeds total");
    let sum = (a as u128) + (b as u128);
    assert_eq!(sum, total as u128, "split does not conserve value");
}

/// Proves that `split_fn(total)` conserves value for all symbolic totals.
pub fn assert_three_way_split_conserves<F>(split_fn: F)
where
    F: Fn(u64) -> (u64, u64, u64),
{
    let total: u64 = kani::any();
    let (a, b, c) = split_fn(total);
    assert!(a <= total, "part_a exceeds total");
    assert!(b <= total, "part_b exceeds total");
    assert!(c <= total, "part_c exceeds total");
    let sum = (a as u128) + (b as u128) + (c as u128);
    assert_eq!(sum, total as u128, "split does not conserve value");
}

/// Proves that `split_fn(total, rate_bps)` conserves value for `rate_bps <= 10_000`.
pub fn assert_bps_split_conserves<F>(split_fn: F)
where
    F: Fn(u64, u64) -> (u64, u64),
{
    let total: u64 = kani::any();
    let rate_bps: u64 = kani::any();
    kani::assume(rate_bps <= 10_000);
    let (a, b) = split_fn(total, rate_bps);
    assert!(a <= total, "part_a exceeds total");
    assert!(b <= total, "part_b exceeds total");
    let sum = (a as u128) + (b as u128);
    assert_eq!(sum, total as u128, "bps split does not conserve value");
}
