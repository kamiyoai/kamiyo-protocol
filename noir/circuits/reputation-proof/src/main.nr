// Reputation proof circuit: prove agent meets threshold without revealing exact score
// Enables privacy-preserving reputation verification for service providers

use std::hash::poseidon2::Poseidon2;

global MAX_HISTORY: u32 = 64;

struct ReputationData {
    successful: u64,
    total: u64,
    disputes_won: u64,
    disputes_lost: u64,
}

fn main(
    // Private: actual reputation data
    successful_agreements: u64,
    total_agreements: u64,
    disputes_won: u64,
    disputes_lost: u64,
    blinding: Field,
    // Public: commitment and threshold
    agent_pk: pub Field,
    reputation_commitment: pub Field,
    threshold: pub u64  // minimum success rate (0-100)
) {
    // Validate inputs
    assert(total_agreements > 0, "No agreements");
    assert(successful_agreements <= total_agreements, "Invalid success count");
    assert(disputes_won + disputes_lost <= total_agreements, "Invalid dispute count");
    assert(threshold <= 100, "Invalid threshold");

    // Compute success rate (0-100)
    let success_rate = (successful_agreements * 100) / total_agreements;

    // Prove meets threshold
    assert(success_rate >= threshold, "Below threshold");

    // Verify commitment matches data
    let computed_commitment = Poseidon2::hash([
        agent_pk,
        successful_agreements as Field,
        total_agreements as Field,
        disputes_won as Field,
        disputes_lost as Field,
        blinding
    ], 6);

    assert(computed_commitment == reputation_commitment, "Commitment mismatch");
}

// Compute reputation score with weighted factors
fn compute_weighted_score(
    successful: u64,
    total: u64,
    disputes_won: u64,
    disputes_lost: u64
) -> u64 {
    if total == 0 {
        return 50; // neutral starting score
    }

    // Base success rate (60% weight)
    let base_rate = (successful * 100) / total;

    // Dispute factor (40% weight)
    // Win rate in disputes, default to 50% if no disputes
    let total_disputes = disputes_won + disputes_lost;
    let dispute_rate = if total_disputes > 0 {
        (disputes_won * 100) / total_disputes
    } else {
        50
    };

    // Weighted average
    (base_rate * 60 + dispute_rate * 40) / 100
}

// Range proof helper - proves value is in [min, max]
fn range_check(value: u64, min: u64, max: u64) {
    assert(value >= min, "Below minimum");
    assert(value <= max, "Above maximum");
}

#[test]
fn test_good_reputation() {
    let successful = 95;
    let total = 100;
    let won = 8;
    let lost = 2;
    let blinding = 0x123456789;
    let agent_pk = 0xagent;
    let threshold = 90;

    let commitment = Poseidon2::hash([
        agent_pk,
        successful as Field,
        total as Field,
        won as Field,
        lost as Field,
        blinding
    ], 6);

    main(successful, total, won, lost, blinding, agent_pk, commitment, threshold);
}

#[test]
fn test_minimum_threshold() {
    let successful = 70;
    let total = 100;
    let won = 5;
    let lost = 5;
    let blinding = 0xabc;
    let agent_pk = 0xdef;
    let threshold = 70; // exactly at threshold

    let commitment = Poseidon2::hash([
        agent_pk,
        successful as Field,
        total as Field,
        won as Field,
        lost as Field,
        blinding
    ], 6);

    main(successful, total, won, lost, blinding, agent_pk, commitment, threshold);
}

#[test(should_fail_with = "Below threshold")]
fn test_below_threshold() {
    let successful = 60;
    let total = 100;
    let won = 2;
    let lost = 8;
    let blinding = 0x999;
    let agent_pk = 0x888;
    let threshold = 75;

    let commitment = Poseidon2::hash([
        agent_pk,
        successful as Field,
        total as Field,
        won as Field,
        lost as Field,
        blinding
    ], 6);

    main(successful, total, won, lost, blinding, agent_pk, commitment, threshold);
}

#[test]
fn test_new_agent_high_success() {
    // New agent with few but successful agreements
    let successful = 5;
    let total = 5;
    let won = 0;
    let lost = 0;
    let blinding = 0x111;
    let agent_pk = 0x222;
    let threshold = 100;

    let commitment = Poseidon2::hash([
        agent_pk,
        successful as Field,
        total as Field,
        won as Field,
        lost as Field,
        blinding
    ], 6);

    main(successful, total, won, lost, blinding, agent_pk, commitment, threshold);
}

#[test]
fn test_weighted_score_calculation() {
    // 90% success rate, 80% dispute win rate
    // Expected: (90 * 60 + 80 * 40) / 100 = 86
    let score = compute_weighted_score(90, 100, 8, 2);
    assert(score == 86, "Wrong weighted score");
}
