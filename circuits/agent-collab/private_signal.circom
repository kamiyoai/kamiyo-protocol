pragma circom 2.1.6;

include "circomlib/circuits/poseidon.circom";
include "circomlib/circuits/comparators.circom";

/**
 * PrivateSignal - Share trading signals without revealing strategy
 *
 * Use case: AI agents share alpha signals while protecting their edge
 *
 * Public Inputs:
 *   - signal_commitment: Hash of the signal for later reveal
 *   - min_stake: Minimum required stake to share signal
 *   - min_confidence: Minimum confidence threshold (0-100)
 *   - agent_nullifier: Links signal to agent without revealing identity
 *
 * Private Inputs:
 *   - signal_type: Type of signal (0=price, 1=volume, 2=sentiment, etc.)
 *   - direction: Trade direction (0=short, 1=long, 2=neutral)
 *   - confidence: Confidence level 0-100
 *   - magnitude: Signal strength 0-100
 *   - stake_amount: How much the agent has staked
 *   - secret: Random blinding factor
 */
template PrivateSignal() {
    // Public inputs
    signal input signal_commitment;
    signal input min_stake;
    signal input min_confidence;
    signal input agent_nullifier;

    // Private inputs
    signal input signal_type;
    signal input direction;
    signal input confidence;
    signal input magnitude;
    signal input stake_amount;
    signal input secret;

    // 1. Validate direction (0, 1, or 2)
    component directionValid = LessEqThan(8);
    directionValid.in[0] <== direction;
    directionValid.in[1] <== 2;
    directionValid.out === 1;

    // 2. Validate confidence (0-100)
    component confidenceValid = LessEqThan(8);
    confidenceValid.in[0] <== confidence;
    confidenceValid.in[1] <== 100;
    confidenceValid.out === 1;

    // 3. Validate magnitude (0-100)
    component magnitudeValid = LessEqThan(8);
    magnitudeValid.in[0] <== magnitude;
    magnitudeValid.in[1] <== 100;
    magnitudeValid.out === 1;

    // 4. Verify stake meets minimum
    component stakeCheck = GreaterEqThan(64);
    stakeCheck.in[0] <== stake_amount;
    stakeCheck.in[1] <== min_stake;
    stakeCheck.out === 1;

    // 5. Verify confidence meets minimum
    component confidenceCheck = GreaterEqThan(8);
    confidenceCheck.in[0] <== confidence;
    confidenceCheck.in[1] <== min_confidence;
    confidenceCheck.out === 1;

    // 6. Verify commitment matches
    component commitmentHasher = Poseidon(7);
    commitmentHasher.inputs[0] <== signal_type;
    commitmentHasher.inputs[1] <== direction;
    commitmentHasher.inputs[2] <== confidence;
    commitmentHasher.inputs[3] <== magnitude;
    commitmentHasher.inputs[4] <== stake_amount;
    commitmentHasher.inputs[5] <== secret;
    commitmentHasher.inputs[6] <== agent_nullifier;

    signal_commitment === commitmentHasher.out;
}

component main {public [signal_commitment, min_stake, min_confidence, agent_nullifier]} = PrivateSignal();
