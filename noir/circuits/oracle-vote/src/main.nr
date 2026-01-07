// Oracle vote circuit: proves score in [0,100] and commitment validity

use std::hash::poseidon2::Poseidon2;

global MAX_SCORE: u8 = 100;

fn main(
    score: u8,
    blinding: Field,
    escrow_id: pub Field,
    oracle_pk: pub Field,
    expected_commitment: pub Field
) {
    assert(score <= MAX_SCORE, "Score must be <= 100");

    let computed = Poseidon2::hash([score as Field, blinding, escrow_id, oracle_pk], 4);
    assert(computed == expected_commitment, "Commitment mismatch");
}

fn compute_commitment(score: u8, blinding: Field, escrow_id: Field, oracle_pk: Field) -> Field {
    Poseidon2::hash([score as Field, blinding, escrow_id, oracle_pk], 4)
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
    let commitment = compute_commitment(0, 0x111, 0x222, 0x333);
    main(0, 0x111, 0x222, 0x333, commitment);
}

#[test]
fn test_max_score() {
    let commitment = compute_commitment(100, 0xfff, 0xeee, 0xddd);
    main(100, 0xfff, 0xeee, 0xddd, commitment);
}

#[test(should_fail_with = "Score must be <= 100")]
fn test_invalid_score() {
    let commitment = compute_commitment(100, 0x123, 0xdef, 0xcab);
    main(101, 0x123, 0xdef, 0xcab, commitment);
}

#[test(should_fail_with = "Commitment mismatch")]
fn test_wrong_blinding() {
    let commitment = compute_commitment(50, 0x123, 0xdef, 0xcab);
    main(50, 0x999, 0xdef, 0xcab, commitment);
}
