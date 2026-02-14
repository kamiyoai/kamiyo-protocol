use super::*;

fn pool_with_accumulated(accumulated_rewards_per_share: u128) -> StakingPool {
    StakingPool {
        admin: Pubkey::default(),
        token_mint: Pubkey::default(),
        token_vault: Pubkey::default(),
        rewards_vault: Pubkey::default(),
        total_staked: 0,
        total_weighted_stake: 1,
        accumulated_rewards_per_share,
        last_distribution_time: 0,
        total_rewards_distributed: 0,
        is_paused: false,
        bump: 0,
    }
}

fn position_with(staked_amount: u64, stake_start_time: i64, rewards_debt: u128) -> StakePosition {
    StakePosition {
        owner: Pubkey::default(),
        staked_amount,
        stake_start_time,
        last_claim_time: 0,
        rewards_debt,
        total_claimed: 0,
        bump: 0,
    }
}

#[kani::proof]
fn reward_split_conserves_value() {
    let total_reward: u64 = kani::any();
    let (burn_amount, distribution_amount) = calculate_reward_split(total_reward);

    assert!(burn_amount <= total_reward);
    assert!(distribution_amount <= total_reward);
    assert_eq!(burn_amount + distribution_amount, total_reward);
}

#[kani::proof]
fn multiplier_is_in_expected_set() {
    let duration_seconds: i64 = kani::any();
    let multiplier = get_multiplier(duration_seconds);
    assert!(matches!(multiplier, 10_000 | 12_000 | 15_000 | 20_000));
}

#[kani::proof]
fn multiplier_is_monotonic() {
    let d1: i64 = kani::any();
    let d2: i64 = kani::any();
    kani::assume(d1 <= d2);
    assert!(get_multiplier(d1) <= get_multiplier(d2));
}

#[kani::proof]
fn pending_rewards_is_zero_when_unstaked() {
    let pool = pool_with_accumulated(kani::any());
    let position = position_with(0, kani::any(), kani::any());
    let current_time: i64 = kani::any();

    let pending = calculate_pending_rewards(&pool, &position, current_time).unwrap();
    assert_eq!(pending, 0);
}

#[cfg(feature = "kani-full")]
#[kani::proof]
fn pending_rewards_matches_manual_calculation_in_bounded_domain() {
    let staked_amount: u64 = kani::any();
    kani::assume(staked_amount > 0);
    kani::assume(staked_amount <= 1_000_000_000_000);

    let accumulated_rewards_per_share: u128 = kani::any();
    kani::assume(accumulated_rewards_per_share <= 1_000_000_000_000_000);

    let rewards_debt: u128 = kani::any();

    let stake_start_time: i64 = kani::any();
    let current_time: i64 = kani::any();
    kani::assume(current_time >= stake_start_time);

    let pool = pool_with_accumulated(accumulated_rewards_per_share);
    let position = position_with(staked_amount, stake_start_time, rewards_debt);

    let duration = current_time - stake_start_time;
    let multiplier = get_multiplier(duration);

    let weighted_stake = (staked_amount as u128)
        .checked_mul(multiplier as u128)
        .unwrap()
        .checked_div(MULTIPLIER_BASE as u128)
        .unwrap();

    let accumulated = weighted_stake
        .checked_mul(accumulated_rewards_per_share)
        .unwrap()
        .checked_div(1_000_000_000_000)
        .unwrap();

    let debt = rewards_debt.checked_div(1_000_000_000_000).unwrap_or(0);
    let expected_u128 = accumulated.saturating_sub(debt);
    let expected: u64 = expected_u128.try_into().unwrap();

    let actual = calculate_pending_rewards(&pool, &position, current_time).unwrap();
    assert_eq!(actual, expected);
}
