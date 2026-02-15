//! Proof helpers for bounded outputs and discrete value sets.

/// Assert that a function's `u64` output is within `[min, max]`.
pub fn assert_output_bounded<F>(compute_fn: F, min: u64, max: u64)
where
    F: FnOnce() -> u64,
{
    let result = compute_fn();
    assert!(result >= min, "output below minimum bound");
    assert!(result <= max, "output above maximum bound");
}

/// Assert that a function's `u16` output is within `[min, max]`.
pub fn assert_output_bounded_u16<F>(compute_fn: F, min: u16, max: u16)
where
    F: FnOnce() -> u16,
{
    let result = compute_fn();
    assert!(result >= min, "output below minimum bound");
    assert!(result <= max, "output above maximum bound");
}

/// Assert that a function's `u8` output is within `[min, max]`.
pub fn assert_output_bounded_u8<F>(compute_fn: F, min: u8, max: u8)
where
    F: FnOnce() -> u8,
{
    let result = compute_fn();
    assert!(result >= min, "output below minimum bound");
    assert!(result <= max, "output above maximum bound");
}

/// Assert that a function's `u8` output is always one of the expected values.
///
/// Useful for stepped/tiered functions like refund percentages.
pub fn assert_output_in_set<F>(compute_fn: F, expected: &[u8])
where
    F: FnOnce() -> u8,
{
    let result = compute_fn();
    let mut found = false;
    let mut i = 0;
    while i < expected.len() {
        if expected[i] == result {
            found = true;
            break;
        }
        i += 1;
    }
    assert!(found, "output is not in expected value set");
}

/// Assert that a cost/fee function has a floor and a ceiling.
///
/// Verifies `floor <= result <= ceiling` for all symbolic inputs.
pub fn assert_cost_bounded<F>(compute_fn: F, floor: u64, ceiling: u64)
where
    F: FnOnce() -> u64,
{
    let result = compute_fn();
    assert!(result >= floor, "cost below floor");
    assert!(result <= ceiling, "cost above ceiling");
}

/// Assert that a function returns an expected default when a condition holds.
pub fn assert_default_on_condition<C, F>(condition_fn: C, compute_fn: F, expected_default: u64)
where
    C: FnOnce() -> bool,
    F: FnOnce() -> u64,
{
    if condition_fn() {
        let result = compute_fn();
        assert_eq!(result, expected_default, "default value mismatch");
    }
}
