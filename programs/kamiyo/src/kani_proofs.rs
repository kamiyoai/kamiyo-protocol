use super::*;

#[kani::proof]
fn refund_from_quality_matches_spec() {
    kani_solana::bounds::assert_output_in_set(
        || calculate_refund_from_quality(kani::any()),
        &[0, 35, 75, 100],
    );

    kani_solana::math::assert_matches_spec_u8(
        calculate_refund_from_quality,
        |quality| match quality {
            0..=49 => 100,
            50..=64 => 75,
            65..=79 => 35,
            _ => 0,
        },
    );
}

#[kani::proof]
fn weighted_consensus_all_included_len2_matches_ceiling_avg() {
    kani_solana::math::assert_consensus_matches_ceiling_avg::<2, _>(
        |pairs| calculate_weighted_consensus(pairs, 100).unwrap(),
        100,
    );
}

#[kani::proof]
fn weighted_consensus_all_included_len3_matches_ceiling_avg() {
    kani_solana::math::assert_consensus_matches_ceiling_avg::<3, _>(
        |pairs| calculate_weighted_consensus(pairs, 100).unwrap(),
        100,
    );
}

#[cfg(feature = "kani-full")]
#[kani::proof]
fn weighted_consensus_all_included_len4_matches_ceiling_avg() {
    kani_solana::math::assert_consensus_matches_ceiling_avg::<4, _>(
        |pairs| calculate_weighted_consensus(pairs, 100).unwrap(),
        100,
    );
}

#[cfg(feature = "kani-full")]
#[kani::proof]
fn weighted_consensus_all_included_len5_matches_ceiling_avg() {
    kani_solana::math::assert_consensus_matches_ceiling_avg::<5, _>(
        |pairs| calculate_weighted_consensus(pairs, 100).unwrap(),
        100,
    );
}

#[kani::proof]
fn dispute_cost_is_capped() {
    let total_transactions: u64 = kani::any();
    let disputes_filed: u64 = kani::any();

    let rep = EntityReputation {
        entity: Pubkey::default(),
        entity_type: EntityType::Agent,
        total_transactions,
        disputes_filed,
        disputes_won: 0,
        disputes_partial: 0,
        disputes_lost: 0,
        average_quality_received: 0,
        reputation_score: 0,
        created_at: 0,
        last_updated: 0,
        bump: 0,
    };

    kani_solana::bounds::assert_cost_bounded(
        || calculate_dispute_cost(&rep),
        BASE_DISPUTE_COST,
        BASE_DISPUTE_COST.saturating_mul(10),
    );
}

#[kani::proof]
fn reputation_score_is_bounded() {
    let total_transactions: u64 = kani::any();
    let disputes_filed: u64 = kani::any();
    let disputes_won: u64 = kani::any();
    let average_quality_received: u8 = kani::any();

    let rep = EntityReputation {
        entity: Pubkey::default(),
        entity_type: EntityType::Agent,
        total_transactions,
        disputes_filed,
        disputes_won,
        disputes_partial: 0,
        disputes_lost: 0,
        average_quality_received,
        reputation_score: 0,
        created_at: 0,
        last_updated: 0,
        bump: 0,
    };

    kani_solana::bounds::assert_output_bounded(
        || u64::from(calculate_reputation_score(&rep)),
        0,
        1000,
    );

    kani_solana::bounds::assert_default_on_condition(
        || total_transactions == 0,
        || u64::from(calculate_reputation_score(&rep)),
        500,
    );
}

#[cfg(feature = "kani-full")]
#[kani::proof]
fn refund_from_quality_covers_all_buckets() {
    let quality: u8 = kani::any();
    let refund = calculate_refund_from_quality(quality);

    kani::cover!(refund == 0);
    kani::cover!(refund == 35);
    kani::cover!(refund == 75);
    kani::cover!(refund == 100);
}

#[cfg(feature = "kani-full")]
#[kani::proof]
fn weighted_consensus_covers_fast_and_filtered_paths() {
    // Keep this proof cheap: it exists only to assert that both the "fast"
    // and "filtered" paths are reachable without timing out CI.
    let scores = [(50u8, 100u16), (60u8, 100u16)];

    kani::cover!(calculate_weighted_consensus(&scores, 100).is_ok());
    kani::cover!(calculate_weighted_consensus(&scores, 99).is_ok());
}

fn can_release_funds(
    caller: [u8; 32],
    agent: [u8; 32],
    api: [u8; 32],
    now: i64,
    expires_at: i64,
) -> bool {
    let is_agent = caller == agent;
    let is_api = caller == api;
    let time_lock_expired = now >= expires_at;

    is_agent || (is_api && time_lock_expired)
}

#[kani::proof]
fn release_funds_timelock_policy_is_correct() {
    let caller: [u8; 32] = kani::any();
    let agent: [u8; 32] = kani::any();
    let api: [u8; 32] = kani::any();
    let now: i64 = kani::any();
    let expires_at: i64 = kani::any();

    let allowed = can_release_funds(caller, agent, api, now, expires_at);

    if now < expires_at {
        kani::assert(
            !allowed || caller == agent,
            "only agent can release before expiry",
        );
        kani::assert(
            !(caller == api && caller != agent && allowed),
            "api cannot release before expiry",
        );
    } else {
        kani::assert(
            !allowed || (caller == agent || caller == api),
            "only agent/api can release after expiry",
        );
        kani::assert(
            caller != api || allowed || caller == agent,
            "api can release after expiry",
        );
    }
}

#[kani::proof]
fn resolve_dispute_conserves_value() {
    let amount: u64 = kani::any();
    let refund_percentage: u8 = kani::any();

    kani::assume(refund_percentage <= 100);

    let refund_amount = (amount as u128)
        .saturating_mul(refund_percentage as u128)
        .checked_div(100)
        .unwrap_or(0) as u64;
    let payment_amount = amount.saturating_sub(refund_amount);

    kani::assert(
        (refund_amount as u128 + payment_amount as u128) == amount as u128,
        "refund + payment must equal amount",
    );
}

#[kani::proof]
fn settle_inference_conserves_value() {
    let amount: u64 = kani::any();
    let quality_threshold: u8 = kani::any();
    let quality_score: u8 = kani::any();

    kani::assume(quality_score <= 100);

    let (user_refund, provider_payment) = if quality_score >= quality_threshold {
        (0u64, amount)
    } else if quality_score >= 50 {
        let provider_share = (amount as u128)
            .saturating_mul(quality_score as u128)
            .checked_div(100)
            .unwrap_or(0) as u64;
        (amount.saturating_sub(provider_share), provider_share)
    } else {
        (amount, 0u64)
    };

    kani::assert(
        (user_refund as u128 + provider_payment as u128) == amount as u128,
        "refund + payment must equal amount",
    );
}

#[kani::proof]
fn claim_expired_escrow_conserves_value() {
    let amount: u64 = kani::any();
    let disputed: bool = kani::any();

    let (agent_amount, api_amount) = if disputed {
        let half = amount / 2;
        (half, amount.saturating_sub(half))
    } else {
        (amount, 0u64)
    };

    kani::assert(
        (agent_amount as u128 + api_amount as u128) == amount as u128,
        "agent + api must equal amount",
    );
}

#[kani::proof]
fn required_oracle_count_is_in_expected_set() {
    kani_solana::bounds::assert_output_in_set(
        || required_oracle_count(kani::any()),
        &[MIN_CONSENSUS_ORACLES, 4, 5],
    );
}

#[kani::proof]
fn required_oracle_count_is_monotonic() {
    let a1: u64 = kani::any();
    let a2: u64 = kani::any();

    kani::assume(a1 <= a2);

    let r1 = required_oracle_count(a1);
    let r2 = required_oracle_count(a2);

    kani::assert(r1 <= r2, "required oracle count must be monotonic");
}

#[kani::proof]
fn required_oracle_count_tiers_match_boundaries() {
    kani::assert(
        required_oracle_count(TIER2_ESCROW_THRESHOLD.saturating_sub(1)) == MIN_CONSENSUS_ORACLES,
        "below tier2 threshold must use minimum",
    );
    kani::assert(
        required_oracle_count(TIER2_ESCROW_THRESHOLD) == 4,
        "tier2 threshold must require 4 oracles",
    );
    kani::assert(
        required_oracle_count(TIER3_ESCROW_THRESHOLD.saturating_sub(1)) == 4,
        "just below tier3 threshold must still be tier2",
    );
    kani::assert(
        required_oracle_count(TIER3_ESCROW_THRESHOLD) == 5,
        "tier3 threshold must require 5 oracles",
    );
}
