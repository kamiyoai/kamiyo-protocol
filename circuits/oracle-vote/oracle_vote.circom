/*
 * Oracle Vote Circuit for Mitama
 *
 * Proves that an oracle's vote is valid:
 * 1. Score is in range [0, 100]
 * 2. Commitment matches Poseidon(score, blinding, escrow_id, oracle_pk)
 *
 * This circuit generates Groth16 proofs verifiable on Solana
 * using the native alt_bn128 syscalls.
 *
 * Security Properties:
 * - Binding: Cannot change vote after commitment
 * - Hiding: Score is hidden until reveal
 * - Range: Score must be in [0, 100]
 * - Non-malleability: Blinding prevents commitment forgery
 *
 * Dependencies:
 * - circomlib: https://github.com/iden3/circomlib
 * - groth16-solana: https://github.com/Lightprotocol/groth16-solana
 *
 * Audit Considerations:
 * - All inputs are constrained
 * - No unconstrained signals
 * - Range check uses both bit decomposition and comparison
 * - Commitment uses collision-resistant Poseidon hash
 */

pragma circom 2.1.6;

include "node_modules/circomlib/circuits/poseidon.circom";
include "node_modules/circomlib/circuits/comparators.circom";
include "node_modules/circomlib/circuits/bitify.circom";

/*
 * RangeCheck: Proves value is in [0, max]
 *
 * For score validation: max = 100
 * Uses bit decomposition + comparison
 *
 * Security:
 * - Bit decomposition prevents negative/overflow values
 * - LessEqThan provides exact upper bound check
 * - Both constraints must pass
 */
template RangeCheck(n) {
    signal input value;
    signal input max;
    signal output valid;

    // Decompose to bits to prove non-negative and within n bits
    // This prevents overflow attacks where value > 2^n
    component bits = Num2Bits(n);
    bits.in <== value;

    // Reconstruct from bits to verify decomposition
    signal reconstructed;
    var sum = 0;
    for (var i = 0; i < n; i++) {
        sum += bits.out[i] * (1 << i);
    }
    reconstructed <== sum;

    // Verify reconstruction matches original value
    // This is implicitly checked by Num2Bits, but we make it explicit
    value === reconstructed;

    // Check value <= max
    component leq = LessEqThan(n);
    leq.in[0] <== value;
    leq.in[1] <== max;

    valid <== leq.out;
}

/*
 * OracleVoteCommitment: Compute Poseidon commitment
 *
 * commitment = Poseidon(score, blinding, escrow_id, oracle_pk)
 *
 * Uses Poseidon hash which is efficient in R1CS circuits
 */
template OracleVoteCommitment() {
    // Private inputs (witness)
    signal input score;
    signal input blinding;

    // Public inputs (instance)
    signal input escrow_id;
    signal input oracle_pk;
    signal input expected_commitment;

    signal output valid;

    // Compute Poseidon hash of all inputs
    component hasher = Poseidon(4);
    hasher.inputs[0] <== score;
    hasher.inputs[1] <== blinding;
    hasher.inputs[2] <== escrow_id;
    hasher.inputs[3] <== oracle_pk;

    // Verify commitment matches
    signal diff;
    diff <== hasher.out - expected_commitment;

    // diff must be 0 for valid commitment
    signal isZero;
    component iszero = IsZero();
    iszero.in <== diff;
    isZero <== iszero.out;

    valid <== isZero;
}

/*
 * OracleVote: Main circuit for oracle voting
 *
 * Public inputs:
 * - escrow_id: The escrow being voted on
 * - oracle_pk: The oracle's public key
 * - expected_commitment: The previously published commitment
 *
 * Private inputs (witness):
 * - score: The quality score (0-100)
 * - blinding: Random blinding factor
 *
 * Proves:
 * 1. score is in [0, 100]
 * 2. commitment = Poseidon(score, blinding, escrow_id, oracle_pk)
 */
template OracleVote() {
    // === Public Inputs ===
    signal input escrow_id;
    signal input oracle_pk;
    signal input expected_commitment;

    // === Private Inputs (Witness) ===
    signal input score;
    signal input blinding;

    // === Outputs ===
    signal output valid;

    // --- Constraint 1: Range check [0, 100] ---
    component rangeCheck = RangeCheck(8); // 8 bits covers 0-255
    rangeCheck.value <== score;
    rangeCheck.max <== 100;

    // Enforce range check passes
    rangeCheck.valid === 1;

    // --- Constraint 2: Commitment verification ---
    component commitment = OracleVoteCommitment();
    commitment.score <== score;
    commitment.blinding <== blinding;
    commitment.escrow_id <== escrow_id;
    commitment.oracle_pk <== oracle_pk;
    commitment.expected_commitment <== expected_commitment;

    // Enforce commitment is valid
    commitment.valid === 1;

    // Both constraints must pass
    valid <== rangeCheck.valid * commitment.valid;
}

// Main component with public signals
component main {public [escrow_id, oracle_pk, expected_commitment]} = OracleVote();
