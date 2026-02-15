//! Constrained symbolic generators for common domains.

/// Arbitrary `u8` in `[0, max]` inclusive.
pub fn any_u8_up_to(max: u8) -> u8 {
    let v: u8 = kani::any();
    kani::assume(v <= max);
    v
}

/// Arbitrary `u16` in `[min, max]` inclusive.
pub fn any_u16_range(min: u16, max: u16) -> u16 {
    let v: u16 = kani::any();
    kani::assume(v >= min && v <= max);
    v
}

/// Arbitrary `u64` in `[min, max]` inclusive.
pub fn any_u64_range(min: u64, max: u64) -> u64 {
    let v: u64 = kani::any();
    kani::assume(v >= min && v <= max);
    v
}

/// Arbitrary `i64` in `[min, max]` inclusive.
pub fn any_i64_range(min: i64, max: i64) -> i64 {
    let v: i64 = kani::any();
    kani::assume(v >= min && v <= max);
    v
}

/// Arbitrary `u128` in `[0, max]` inclusive.
pub fn any_u128_up_to(max: u128) -> u128 {
    let v: u128 = kani::any();
    kani::assume(v <= max);
    v
}

/// Quality/percentage score in `[0, 100]`.
pub fn any_score() -> u8 {
    any_u8_up_to(100)
}

/// Positive weight in `[1, 10_000]` (oracle weights, basis points).
pub fn any_weight() -> u16 {
    any_u16_range(1, 10_000)
}

/// Lamport amount in `[0, 1_000_000_000_000]` (~1000 SOL cap for bounded proofs).
pub fn any_lamports_bounded() -> u64 {
    any_u64_range(0, 1_000_000_000_000)
}

/// Basis points value in `[0, 10_000]`.
pub fn any_bps() -> u64 {
    any_u64_range(0, 10_000)
}

/// Arbitrary timestamp (full `i64` range).
pub fn any_timestamp() -> i64 {
    kani::any()
}

/// Pair of timestamps where `t1 <= t2`.
pub fn any_ordered_timestamps() -> (i64, i64) {
    let t1: i64 = kani::any();
    let t2: i64 = kani::any();
    kani::assume(t1 <= t2);
    (t1, t2)
}
