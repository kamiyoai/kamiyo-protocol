// Aggregate vote: batch N votes into 1 proof

use std::hash::poseidon2::Poseidon2;

global MAX_VOTES: u32 = 16;
global MAX_SCORE: u8 = 100;

fn main(
    scores: [u8; MAX_VOTES],
    blindings: [Field; MAX_VOTES],
    oracle_pks: [Field; MAX_VOTES],
    num_votes: u8,
    escrow_id: pub Field,
    votes_root: pub Field,
    expected_sum: pub u64,
    expected_count: pub u8
) {
    assert(num_votes as u32 <= MAX_VOTES, "Too many votes");
    assert(num_votes == expected_count, "Vote count mismatch");

    let mut sum: u64 = 0;
    let mut commitments: [Field; MAX_VOTES] = [0; MAX_VOTES];

    for i in 0..MAX_VOTES {
        if (i as u8) < num_votes {
            assert(scores[i] <= MAX_SCORE, "Invalid score");

            commitments[i] = Poseidon2::hash([
                scores[i] as Field,
                blindings[i],
                escrow_id,
                oracle_pks[i]
            ], 4);

            sum += scores[i] as u64;
        }
    }

    assert(sum == expected_sum, "Sum mismatch");

    let computed_root = compute_merkle_root(commitments, num_votes);
    assert(computed_root == votes_root, "Root mismatch");
}

fn compute_merkle_root(leaves: [Field; MAX_VOTES], count: u8) -> Field {
    let mut layer: [Field; MAX_VOTES] = leaves;
    let mut size = MAX_VOTES;

    for _ in 0..4 {
        let mut next_layer: [Field; MAX_VOTES] = [0; MAX_VOTES];
        for i in 0..(size / 2) {
            next_layer[i] = Poseidon2::hash([layer[i * 2], layer[i * 2 + 1]], 2);
        }
        layer = next_layer;
        size = size / 2;
    }

    layer[0]
}

#[test]
fn test_aggregate_3_votes() {
    let scores = [80, 75, 85, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    let blindings = [0x111, 0x222, 0x333, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    let oracle_pks = [0xaaa, 0xbbb, 0xccc, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    let escrow_id = 0xdeadbeef;
    let num_votes = 3;
    let sum: u64 = 80 + 75 + 85;

    let mut commitments: [Field; MAX_VOTES] = [0; MAX_VOTES];
    for i in 0..3 {
        commitments[i] = Poseidon2::hash([
            scores[i] as Field,
            blindings[i],
            escrow_id,
            oracle_pks[i]
        ], 4);
    }
    let votes_root = compute_merkle_root(commitments, num_votes);

    main(scores, blindings, oracle_pks, num_votes, escrow_id, votes_root, sum, num_votes);
}

#[test]
fn test_single_vote() {
    let scores = [100, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    let blindings = [0x123, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    let oracle_pks = [0x456, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    let escrow_id = 0xcafe;

    let mut commitments: [Field; MAX_VOTES] = [0; MAX_VOTES];
    commitments[0] = Poseidon2::hash([100, 0x123, escrow_id, 0x456], 4);
    let votes_root = compute_merkle_root(commitments, 1);

    main(scores, blindings, oracle_pks, 1, escrow_id, votes_root, 100, 1);
}

#[test(should_fail_with = "Invalid score")]
fn test_invalid_score() {
    let scores = [80, 150, 85, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    let blindings = [0x111, 0x222, 0x333, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    let oracle_pks = [0xaaa, 0xbbb, 0xccc, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

    let mut commitments: [Field; MAX_VOTES] = [0; MAX_VOTES];
    let votes_root = compute_merkle_root(commitments, 3);

    main(scores, blindings, oracle_pks, 3, 0xdeadbeef, votes_root, 315, 3);
}
