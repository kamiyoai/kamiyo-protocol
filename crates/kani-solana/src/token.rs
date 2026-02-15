//! Split conservation provers for token/fee/reward distributions.
//!
//! These helpers verify that splitting a total amount into parts never
//! loses or creates tokens. The user passes their own split function;
//! the helpers provide the symbolic harness and assertions.

/// Assert that a two-way split conserves the total value.
///
/// For all symbolic `total: u64`:
/// - `part_a <= total`
/// - `part_b <= total`
/// - `part_a + part_b == total`
///
/// # Example
///
/// ```ignore
/// #[kani::proof]
/// fn my_fee_split_is_sound() {
///     kani_solana::token::assert_two_way_split_conserves(my_calculate_fee_split);
/// }
/// ```
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

/// Assert that a three-way split conserves the total value.
///
/// Verifies `part_a + part_b + part_c == total` and each part `<= total`.
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

/// Assert that a BPS-parameterized split conserves value.
///
/// For all symbolic `(total, rate_bps)` where `rate_bps <= 10_000`:
/// - `part_a + part_b == total`
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
