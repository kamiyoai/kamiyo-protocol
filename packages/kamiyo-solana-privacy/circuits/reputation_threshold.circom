pragma circom 2.1.0;

include "circomlib/circuits/poseidon.circom";
include "circomlib/circuits/comparators.circom";

// Proves score >= threshold without revealing exact score
template ReputationThreshold() {
    signal input score;
    signal input secret;
    signal input threshold;
    signal input commitment;
    signal output valid;

    // score >= threshold
    component gte = GreaterEqThan(8);
    gte.in[0] <== score;
    gte.in[1] <== threshold;

    // commitment == Poseidon(score, secret)
    component hasher = Poseidon(2);
    hasher.inputs[0] <== score;
    hasher.inputs[1] <== secret;

    signal commitmentMatch;
    commitmentMatch <== hasher.out - commitment;
    commitmentMatch === 0;

    // score in [0, 100]
    component scoreRange = LessEqThan(8);
    scoreRange.in[0] <== score;
    scoreRange.in[1] <== 100;

    component scoreNonNeg = GreaterEqThan(8);
    scoreNonNeg.in[0] <== score;
    scoreNonNeg.in[1] <== 0;

    // R1CS requires quadratic constraints
    signal intermediate;
    intermediate <== gte.out * scoreRange.out;
    valid <== intermediate * scoreNonNeg.out;
    valid === 1;
}

component main {public [threshold, commitment]} = ReputationThreshold();
