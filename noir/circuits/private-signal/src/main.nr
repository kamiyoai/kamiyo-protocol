// Private Signal Circuit: Share trading signals without revealing strategy
//
// Use case: AI agents share alpha signals while protecting their edge
//
// Private inputs:
//   - signal_type: Type of signal (0=price, 1=volume, 2=sentiment, etc.)
//   - direction: Trade direction (0=short, 1=long, 2=neutral)
//   - confidence: Confidence level 0-100
//   - magnitude: Signal strength 0-100
//   - stake_amount: How much the agent has staked on this signal
//   - secret: Random blinding factor
//
// Public inputs:
//   - signal_commitment: Hash of the signal for later reveal
//   - min_stake: Minimum required stake to share signal
//   - min_confidence: Minimum confidence to be valid
//   - agent_nullifier: Links signal to agent without revealing identity

use poseidon::poseidon2::Poseidon2;

global MAX_CONFIDENCE: u8 = 100;
global MAX_MAGNITUDE: u8 = 100;
global MAX_DIRECTION: u8 = 2; // 0=short, 1=long, 2=neutral

fn main(
    // Private inputs
    signal_type: u8,
    direction: u8,
    confidence: u8,
    magnitude: u8,
    stake_amount: Field,
    secret: Field,
    // Public inputs
    signal_commitment: pub Field,
    min_stake: pub Field,
    min_confidence: pub u8,
    agent_nullifier: pub Field
) {
    // 1. Validate signal parameters
    assert(direction <= MAX_DIRECTION, "Invalid direction");
    assert(confidence <= MAX_CONFIDENCE, "Confidence must be <= 100");
    assert(magnitude <= MAX_MAGNITUDE, "Magnitude must be <= 100");

    // 2. Verify stake meets minimum (skin in the game)
    assert(stake_amount as u64 >= min_stake as u64, "Insufficient stake");

    // 3. Verify confidence meets minimum
    assert(confidence >= min_confidence, "Confidence too low");

    // 4. Verify commitment matches
    let computed_commitment = compute_signal_commitment(
        signal_type,
        direction,
        confidence,
        magnitude,
        stake_amount,
        secret,
        agent_nullifier
    );
    assert(computed_commitment == signal_commitment, "Commitment mismatch");
}

fn compute_signal_commitment(
    signal_type: u8,
    direction: u8,
    confidence: u8,
    magnitude: u8,
    stake_amount: Field,
    secret: Field,
    agent_nullifier: Field
) -> Field {
    Poseidon2::hash([
        signal_type as Field,
        direction as Field,
        confidence as Field,
        magnitude as Field,
        stake_amount,
        secret,
        agent_nullifier
    ], 7)
}

// For off-chain use
pub fn generate_commitment(
    signal_type: u8,
    direction: u8,
    confidence: u8,
    magnitude: u8,
    stake_amount: Field,
    secret: Field,
    agent_nullifier: Field
) -> Field {
    compute_signal_commitment(
        signal_type,
        direction,
        confidence,
        magnitude,
        stake_amount,
        secret,
        agent_nullifier
    )
}

#[test]
fn test_valid_long_signal() {
    let signal_type: u8 = 0; // Price signal
    let direction: u8 = 1; // Long
    let confidence: u8 = 85;
    let magnitude: u8 = 70;
    let stake_amount = 1000;
    let secret = 0x1234567890abcdef;
    let agent_nullifier = 0xdeadbeef;
    let min_stake = 500;
    let min_confidence: u8 = 50;

    let commitment = compute_signal_commitment(
        signal_type,
        direction,
        confidence,
        magnitude,
        stake_amount,
        secret,
        agent_nullifier
    );

    main(
        signal_type,
        direction,
        confidence,
        magnitude,
        stake_amount,
        secret,
        commitment,
        min_stake,
        min_confidence,
        agent_nullifier
    );
}

#[test]
fn test_valid_short_signal() {
    let signal_type: u8 = 1; // Volume signal
    let direction: u8 = 0; // Short
    let confidence: u8 = 90;
    let magnitude: u8 = 50;
    let stake_amount = 2000;
    let secret = 0xfedcba0987654321;
    let agent_nullifier = 0xcafebabe;

    let commitment = compute_signal_commitment(
        signal_type,
        direction,
        confidence,
        magnitude,
        stake_amount,
        secret,
        agent_nullifier
    );

    main(
        signal_type,
        direction,
        confidence,
        magnitude,
        stake_amount,
        secret,
        commitment,
        1000,
        80,
        agent_nullifier
    );
}

#[test]
fn test_neutral_signal() {
    let commitment = compute_signal_commitment(0, 2, 60, 30, 500, 0x111, 0x222);
    main(0, 2, 60, 30, 500, 0x111, commitment, 100, 50, 0x222);
}

#[test(should_fail_with = "Invalid direction")]
fn test_invalid_direction() {
    let commitment = compute_signal_commitment(0, 5, 50, 50, 1000, 0x123, 0x456);
    main(0, 5, 50, 50, 1000, 0x123, commitment, 500, 40, 0x456);
}

#[test(should_fail_with = "Insufficient stake")]
fn test_insufficient_stake() {
    let commitment = compute_signal_commitment(0, 1, 80, 60, 100, 0x123, 0x456);
    main(0, 1, 80, 60, 100, 0x123, commitment, 500, 50, 0x456);
}

#[test(should_fail_with = "Confidence too low")]
fn test_low_confidence() {
    let commitment = compute_signal_commitment(0, 1, 30, 60, 1000, 0x123, 0x456);
    main(0, 1, 30, 60, 1000, 0x123, commitment, 500, 50, 0x456);
}

#[test(should_fail_with = "Commitment mismatch")]
fn test_wrong_secret() {
    let commitment = compute_signal_commitment(0, 1, 80, 60, 1000, 0x123, 0x456);
    main(0, 1, 80, 60, 1000, 0x999, commitment, 500, 50, 0x456); // Wrong secret
}
