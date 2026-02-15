//! Mathematical proof helpers: ceiling averages, weighted consensus,
//! spec matching, and monotonicity provers.

/// Reference implementation of ceiling weighted average.
///
/// Given `(value, weight)` pairs, computes `ceil(sum(v*w) / sum(w))`, capped
/// at `cap`. This is the specification that users compare their own
/// implementation against.
///
/// Returns 0 if total weight is 0.
pub fn ceiling_weighted_average(pairs: &[(u8, u16)], cap: u8) -> u8 {
    let mut weighted_sum: u128 = 0;
    let mut total_weight: u128 = 0;
    let mut i = 0;
    while i < pairs.len() {
        let (score, weight) = pairs[i];
        weighted_sum += (score as u128) * (weight as u128);
        total_weight += weight as u128;
        i += 1;
    }
    if total_weight == 0 {
        return 0;
    }
    let consensus = (weighted_sum + total_weight - 1) / total_weight;
    consensus.min(cap as u128) as u8
}

/// Assert that a user's weighted consensus function matches the ceiling
/// weighted average reference for `N` symbolic `(score, weight)` pairs.
///
/// Kani cannot handle dynamic-length arrays, so call this once per
/// fixed array size you want to verify (e.g., 2, 3, 4, 5 oracles).
///
/// # Example
///
/// ```ignore
/// #[kani::proof]
/// fn consensus_matches_for_3() {
///     kani_solana::math::assert_consensus_matches_ceiling_avg::<3, _>(
///         |pairs| my_calculate_consensus(pairs, 100).unwrap(),
///         100,
///     );
/// }
/// ```
pub fn assert_consensus_matches_ceiling_avg<const N: usize, F>(user_fn: F, cap: u8)
where
    F: Fn(&[(u8, u16)]) -> u8,
{
    let mut pairs = [(0u8, 0u16); N];
    let mut i = 0;
    while i < N {
        pairs[i] = (
            crate::generators::any_score(),
            crate::generators::any_weight(),
        );
        i += 1;
    }
    let expected = ceiling_weighted_average(&pairs, cap);
    let actual = user_fn(&pairs);
    assert_eq!(
        actual, expected,
        "consensus does not match ceiling weighted average"
    );
}

/// Assert that a `u8 -> u8` function matches a reference specification
/// for all symbolic inputs.
pub fn assert_matches_spec_u8<F, S>(actual_fn: F, spec_fn: S)
where
    F: Fn(u8) -> u8,
    S: Fn(u8) -> u8,
{
    let input: u8 = kani::any();
    assert_eq!(
        actual_fn(input),
        spec_fn(input),
        "actual does not match specification"
    );
}

/// Assert monotonicity of an `i64 -> u64` function.
///
/// For all symbolic `x1 <= x2`: `f(x1) <= f(x2)`.
pub fn assert_monotonic_i64_to_u64<F>(f: F)
where
    F: Fn(i64) -> u64,
{
    let x1: i64 = kani::any();
    let x2: i64 = kani::any();
    kani::assume(x1 <= x2);
    assert!(
        f(x1) <= f(x2),
        "function is not monotonically non-decreasing"
    );
}

/// Assert monotonicity of a `u64 -> u64` function.
pub fn assert_monotonic_u64<F>(f: F)
where
    F: Fn(u64) -> u64,
{
    let x1: u64 = kani::any();
    let x2: u64 = kani::any();
    kani::assume(x1 <= x2);
    assert!(
        f(x1) <= f(x2),
        "function is not monotonically non-decreasing"
    );
}

/// Assert anti-monotonicity (non-increasing) of a `u8 -> u8` function.
///
/// For all symbolic `x1 <= x2`: `f(x1) >= f(x2)`.
/// Useful for refund-from-quality style functions.
pub fn assert_anti_monotonic_u8<F>(f: F)
where
    F: Fn(u8) -> u8,
{
    let x1: u8 = kani::any();
    let x2: u8 = kani::any();
    kani::assume(x1 <= x2);
    assert!(
        f(x1) >= f(x2),
        "function is not monotonically non-increasing"
    );
}
