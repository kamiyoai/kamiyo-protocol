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
