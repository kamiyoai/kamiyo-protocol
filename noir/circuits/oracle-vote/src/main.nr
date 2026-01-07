// Oracle Vote Circuit for Kamiyo Protocol
//
// Proves that an oracle's vote is valid:
// 1. Score is in range [0, 100]
// 2. Commitment matches poseidon2(score, blinding, escrow_id, oracle_pk)
//
// This circuit generates Groth16 proofs verifiable on Solana via Sunspot.
//
// Security Properties:
// - Binding: Cannot change vote after commitment
// - Hiding: Score is hidden until reveal
// - Range: Score must be in [0, 100]
// - Non-malleability: Blinding prevents commitment forgery

use std::hash::poseidon2::Poseidon2;

// Maximum valid score
global MAX_SCORE: u8 = 100;

fn main(
    // Private inputs (witness)
    score: u8,
    blinding: Field,
    // Public inputs (instance)
    escrow_id: pub Field,
    oracle_pk: pub Field,
    expected_commitment: pub Field
) {
    // Constraint 1: Range check [0, 100]
    assert(score <= MAX_SCORE, "Score must be <= 100");

    // Constraint 2: Compute commitment and verify
    let score_field = score as Field;
    let computed_commitment = Poseidon2::hash([score_field, blinding, escrow_id, oracle_pk], 4);

    assert(computed_commitment == expected_commitment, "Commitment mismatch");
}

// Compute commitment hash for use in client code
fn compute_commitment(score: u8, blinding: Field, escrow_id: Field, oracle_pk: Field) -> Field {
    let score_field = score as Field;
    Poseidon2::hash([score_field, blinding, escrow_id, oracle_pk], 4)
}

#[test]
fn test_valid_vote() {
    let score = 75;
    let blinding = 0x1234567890abcdef;
    let escrow_id = 0xdeadbeef;
    let oracle_pk = 0xcafebabe;

    let commitment = compute_commitment(score, blinding, escrow_id, oracle_pk);
    main(score, blinding, escrow_id, oracle_pk, commitment);
}

#[test]
fn test_min_score() {
    let score = 0;
    let blinding = 0x1111111111111111;
    let escrow_id = 0x2222222222222222;
    let oracle_pk = 0x3333333333333333;

    let commitment = compute_commitment(score, blinding, escrow_id, oracle_pk);
    main(score, blinding, escrow_id, oracle_pk, commitment);
}

#[test]
fn test_max_score() {
    let score = 100;
    let blinding = 0xffffffffffffffff;
    let escrow_id = 0xeeeeeeeeeeeeeeee;
    let oracle_pk = 0xdddddddddddddddd;

    let commitment = compute_commitment(score, blinding, escrow_id, oracle_pk);
    main(score, blinding, escrow_id, oracle_pk, commitment);
}

#[test(should_fail_with = "Score must be <= 100")]
fn test_invalid_score() {
    let score = 101;
    let blinding = 0x1234567890abcdef;
    let escrow_id = 0xdeadbeef;
    let oracle_pk = 0xcafebabe;

    let commitment = compute_commitment(100, blinding, escrow_id, oracle_pk); // Use valid score for commitment
    main(score, blinding, escrow_id, oracle_pk, commitment);
}

#[test(should_fail_with = "Commitment mismatch")]
fn test_wrong_blinding() {
    let score = 50;
    let correct_blinding = 0x1234567890abcdef;
    let wrong_blinding = 0xfedcba0987654321;
    let escrow_id = 0xdeadbeef;
    let oracle_pk = 0xcafebabe;

    // Commitment with correct blinding
    let commitment = compute_commitment(score, correct_blinding, escrow_id, oracle_pk);
    // Prove with wrong blinding - should fail
    main(score, wrong_blinding, escrow_id, oracle_pk, commitment);
}
