use super::*;

#[kani::proof]
fn fee_split_conserves_value() {
    let total_fee: u64 = kani::any();
    let (burn_amount, treasury_amount) = calculate_fee_split(total_fee);

    assert!(burn_amount <= total_fee);
    assert!(treasury_amount <= total_fee);
    assert_eq!(burn_amount + treasury_amount, total_fee);
}

#[kani::proof]
fn stake_multiplier_is_in_expected_set() {
    let duration_seconds: i64 = kani::any();
    let multiplier = calculate_stake_multiplier(duration_seconds);
    assert!(matches!(multiplier, 10_000 | 12_000 | 15_000 | 20_000));
}

#[kani::proof]
fn stake_multiplier_is_monotonic() {
    let d1: i64 = kani::any();
    let d2: i64 = kani::any();
    kani::assume(d1 <= d2);

    let m1 = calculate_stake_multiplier(d1);
    let m2 = calculate_stake_multiplier(d2);
    assert!(m1 <= m2);
}

#[cfg(feature = "kani-full")]
#[kani::proof]
fn fee_split_covers_zero_and_nonzero_burn() {
    let total_fee: u64 = kani::any();
    let (burn_amount, treasury_amount) = calculate_fee_split(total_fee);

    kani::cover!(total_fee == 0 && burn_amount == 0 && treasury_amount == 0);
    kani::cover!(total_fee == 1 && burn_amount == 0 && treasury_amount == 1);
    kani::cover!(total_fee >= 2 && burn_amount > 0);
}

#[cfg(feature = "kani-full")]
#[kani::proof]
fn stake_multiplier_covers_all_tiers() {
    let duration_seconds: i64 = kani::any();
    let multiplier = calculate_stake_multiplier(duration_seconds);

    kani::cover!(duration_seconds < THIRTY_DAYS_SECS && multiplier == 10_000);
    kani::cover!(
        duration_seconds >= THIRTY_DAYS_SECS
            && duration_seconds < NINETY_DAYS_SECS
            && multiplier == 12_000
    );
    kani::cover!(
        duration_seconds >= NINETY_DAYS_SECS
            && duration_seconds < ONE_EIGHTY_DAYS_SECS
            && multiplier == 15_000
    );
    kani::cover!(duration_seconds >= ONE_EIGHTY_DAYS_SECS && multiplier == 20_000);
}
