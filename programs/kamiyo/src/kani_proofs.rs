use super::*;

fn any_score_0_to_100() -> u8 {
    let score: u8 = kani::any();
    kani::assume(score <= 100);
    score
}

fn any_weight_1_to_10k() -> u16 {
    let weight: u16 = kani::any();
    kani::assume(weight > 0);
    kani::assume(weight <= 10_000);
    weight
}

fn expected_ceiling_weighted_average(scores: &[(u8, u16)]) -> u8 {
    let mut weighted_sum: u64 = 0;
    let mut total_weight: u64 = 0;

    for (score, weight) in scores {
        weighted_sum += (*score as u64) * (*weight as u64);
        total_weight += *weight as u64;
    }

    let consensus = (weighted_sum + total_weight - 1) / total_weight;
    (consensus.min(100) as u8)
}

#[kani::proof]
fn refund_from_quality_matches_spec() {
    let quality: u8 = kani::any();
    let refund = calculate_refund_from_quality(quality);

    assert!(matches!(refund, 0 | 35 | 75 | 100));

    match quality {
        0..=49 => assert_eq!(refund, 100),
        50..=64 => assert_eq!(refund, 75),
        65..=79 => assert_eq!(refund, 35),
        _ => assert_eq!(refund, 0),
    }
}

#[kani::proof]
fn weighted_consensus_all_included_len2_matches_ceiling_avg() {
    let scores = [
        (any_score_0_to_100(), any_weight_1_to_10k()),
        (any_score_0_to_100(), any_weight_1_to_10k()),
    ];

    let expected = expected_ceiling_weighted_average(&scores);
    let actual = calculate_weighted_consensus(&scores, 100).unwrap();
    assert_eq!(actual, expected);
}

#[kani::proof]
fn weighted_consensus_all_included_len3_matches_ceiling_avg() {
    let scores = [
        (any_score_0_to_100(), any_weight_1_to_10k()),
        (any_score_0_to_100(), any_weight_1_to_10k()),
        (any_score_0_to_100(), any_weight_1_to_10k()),
    ];

    let expected = expected_ceiling_weighted_average(&scores);
    let actual = calculate_weighted_consensus(&scores, 100).unwrap();
    assert_eq!(actual, expected);
}

#[kani::proof]
fn weighted_consensus_all_included_len4_matches_ceiling_avg() {
    let scores = [
        (any_score_0_to_100(), any_weight_1_to_10k()),
        (any_score_0_to_100(), any_weight_1_to_10k()),
        (any_score_0_to_100(), any_weight_1_to_10k()),
        (any_score_0_to_100(), any_weight_1_to_10k()),
    ];

    let expected = expected_ceiling_weighted_average(&scores);
    let actual = calculate_weighted_consensus(&scores, 100).unwrap();
    assert_eq!(actual, expected);
}

#[kani::proof]
fn weighted_consensus_all_included_len5_matches_ceiling_avg() {
    let scores = [
        (any_score_0_to_100(), any_weight_1_to_10k()),
        (any_score_0_to_100(), any_weight_1_to_10k()),
        (any_score_0_to_100(), any_weight_1_to_10k()),
        (any_score_0_to_100(), any_weight_1_to_10k()),
        (any_score_0_to_100(), any_weight_1_to_10k()),
    ];

    let expected = expected_ceiling_weighted_average(&scores);
    let actual = calculate_weighted_consensus(&scores, 100).unwrap();
    assert_eq!(actual, expected);
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

    let cost = calculate_dispute_cost(&rep);
    assert!(cost >= BASE_DISPUTE_COST);
    assert!(cost <= BASE_DISPUTE_COST.saturating_mul(10));
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

    let score = calculate_reputation_score(&rep);
    assert!(score <= 1000);

    if total_transactions == 0 {
        assert_eq!(score, 500);
    }
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
    let scores = [
        (any_score_0_to_100(), any_weight_1_to_10k()),
        (any_score_0_to_100(), any_weight_1_to_10k()),
    ];

    let max_deviation: u8 = kani::any();
    let consensus = calculate_weighted_consensus(&scores, max_deviation);
    assert!(consensus.is_ok());

    kani::cover!(max_deviation >= 100);
    kani::cover!(max_deviation < 100);
}
