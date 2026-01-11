pragma circom 2.1.6;

include "circomlib/circuits/comparators.circom";
include "circomlib/circuits/poseidon.circom";

/**
 * ReputationThreshold
 *
 * Proves that an agent's reputation score meets a threshold without
 * revealing the actual score. Uses Poseidon hash for commitment.
 *
 * Public Inputs:
 *   - threshold: The minimum score required for the tier
 *   - commitment: Poseidon(score, secret)
 *
 * Private Inputs:
 *   - score: The agent's actual reputation score (0-100)
 *   - secret: Random value for commitment binding
 *
 * Constraints:
 *   1. score >= threshold
 *   2. commitment == Poseidon(score, secret)
 */
template ReputationThreshold() {
    // Public inputs
    signal input threshold;
    signal input commitment;

    // Private inputs
    signal input score;
    signal input secret;

    // Verify score meets threshold
    component gte = GreaterEqThan(8); // 8 bits for scores 0-255
    gte.in[0] <== score;
    gte.in[1] <== threshold;
    gte.out === 1;

    // Verify commitment is correct
    component hasher = Poseidon(2);
    hasher.inputs[0] <== score;
    hasher.inputs[1] <== secret;
    hasher.out === commitment;
}

component main {public [threshold, commitment]} = ReputationThreshold();
