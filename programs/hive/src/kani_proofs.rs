use super::*;

#[kani::proof]
fn fee_split_conserves_value() {
    kani_solana::token::assert_two_way_split_conserves(calculate_fee_split);
}

#[kani::proof]
fn stake_multiplier_is_in_expected_set() {
    kani_solana::staking::assert_multiplier_in_set(
        calculate_stake_multiplier,
        &[10_000, 12_000, 15_000, 20_000],
    );
}

#[kani::proof]
fn stake_multiplier_is_monotonic() {
    kani_solana::staking::assert_multiplier_monotonic(calculate_stake_multiplier);
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
