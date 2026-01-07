// Reputation proof: prove threshold without revealing exact score

use std::hash::poseidon2::Poseidon2;

global MAX_HISTORY: u32 = 64;

fn main(
    successful_agreements: u64,
    total_agreements: u64,
    disputes_won: u64,
    disputes_lost: u64,
    blinding: Field,
    agent_pk: pub Field,
    reputation_commitment: pub Field,
    threshold: pub u64
) {
    assert(total_agreements > 0, "No agreements");
    assert(successful_agreements <= total_agreements, "Invalid success count");
    assert(disputes_won + disputes_lost <= total_agreements, "Invalid dispute count");
    assert(threshold <= 100, "Invalid threshold");

    let success_rate = (successful_agreements * 100) / total_agreements;
    assert(success_rate >= threshold, "Below threshold");

    let computed = Poseidon2::hash([
        agent_pk,
        successful_agreements as Field,
        total_agreements as Field,
        disputes_won as Field,
        disputes_lost as Field,
        blinding
    ], 6);

    assert(computed == reputation_commitment, "Commitment mismatch");
}

fn compute_weighted_score(
    successful: u64,
    total: u64,
    disputes_won: u64,
    disputes_lost: u64
) -> u64 {
    if total == 0 {
        return 50;
    }

    let base_rate = (successful * 100) / total;
    let total_disputes = disputes_won + disputes_lost;
    let dispute_rate = if total_disputes > 0 {
        (disputes_won * 100) / total_disputes
    } else {
        50
    };

    (base_rate * 60 + dispute_rate * 40) / 100
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
    let blinding = 0xabc;
    let agent_pk = 0xdef;
    let threshold = 70;

    let commitment = Poseidon2::hash([
        agent_pk,
        successful as Field,
        total as Field,
        5 as Field,
        5 as Field,
        blinding
    ], 6);

    main(successful, total, 5, 5, blinding, agent_pk, commitment, threshold);
}

#[test(should_fail_with = "Below threshold")]
fn test_below_threshold() {
    let successful = 60;
    let total = 100;
    let blinding = 0x999;
    let agent_pk = 0x888;
    let threshold = 75;

    let commitment = Poseidon2::hash([
        agent_pk,
        successful as Field,
        total as Field,
        2 as Field,
        8 as Field,
        blinding
    ], 6);

    main(successful, total, 2, 8, blinding, agent_pk, commitment, threshold);
}

#[test]
fn test_weighted_score() {
    let score = compute_weighted_score(90, 100, 8, 2);
    assert(score == 86, "Wrong score");
}
