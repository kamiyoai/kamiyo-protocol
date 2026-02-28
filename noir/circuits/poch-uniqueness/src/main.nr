use poseidon::poseidon2::Poseidon2;

global MAX_SCORE: u8 = 100;
global MIN_UNIQUENESS_SCORE: u8 = 70;
global MIN_GRAPH_DIVERGENCE: u8 = 55;
global MAX_CLUSTER_OVERLAP_RISK: u8 = 50;

fn bool_to_field(value: bool) -> Field {
    if value {
        1
    } else {
        0
    }
}

fn main(
    uniqueness_score: u8,
    graph_divergence: u8,
    cluster_overlap_risk: u8,
    non_membership_signal: bool,
    blinding: Field,
    score_bundle_commitment: pub Field,
    policy_id_hash: pub Field,
    challenge_id_hash: pub Field,
    identity_nullifier: pub Field
) {
    assert(uniqueness_score <= MAX_SCORE, "Uniqueness out of range");
    assert(graph_divergence <= MAX_SCORE, "Divergence out of range");
    assert(cluster_overlap_risk <= MAX_SCORE, "Cluster risk out of range");

    assert(uniqueness_score >= MIN_UNIQUENESS_SCORE, "Uniqueness below threshold");
    assert(graph_divergence >= MIN_GRAPH_DIVERGENCE, "Divergence below threshold");
    assert(cluster_overlap_risk <= MAX_CLUSTER_OVERLAP_RISK, "Cluster overlap too high");
    assert(non_membership_signal, "Identity belongs to known sybil cluster");

    let computed_commitment = Poseidon2::hash([
        policy_id_hash,
        challenge_id_hash,
        identity_nullifier,
        uniqueness_score as Field,
        graph_divergence as Field,
        cluster_overlap_risk as Field,
        bool_to_field(non_membership_signal),
        blinding
    ], 8);
    assert(computed_commitment == score_bundle_commitment, "Score bundle mismatch");
}

#[test]
fn test_valid_poch_uniqueness() {
    let policy_id_hash = 0x111;
    let challenge_id_hash = 0x222;
    let identity_nullifier = 0x333;
    let uniqueness_score = 82;
    let graph_divergence = 74;
    let cluster_overlap_risk = 20;
    let non_membership_signal = true;
    let blinding = 0xabc;

    let commitment = Poseidon2::hash([
        policy_id_hash,
        challenge_id_hash,
        identity_nullifier,
        uniqueness_score as Field,
        graph_divergence as Field,
        cluster_overlap_risk as Field,
        bool_to_field(non_membership_signal),
        blinding
    ], 8);

    main(
        uniqueness_score,
        graph_divergence,
        cluster_overlap_risk,
        non_membership_signal,
        blinding,
        commitment,
        policy_id_hash,
        challenge_id_hash,
        identity_nullifier
    );
}

#[test(should_fail_with = "Uniqueness below threshold")]
fn test_rejects_low_uniqueness() {
    let policy_id_hash = 0x111;
    let challenge_id_hash = 0x222;
    let identity_nullifier = 0x333;
    let blinding = 0xabc;
    let commitment = Poseidon2::hash([
        policy_id_hash,
        challenge_id_hash,
        identity_nullifier,
        60 as Field,
        80 as Field,
        20 as Field,
        1,
        blinding
    ], 8);
    main(
        60,
        80,
        20,
        true,
        blinding,
        commitment,
        policy_id_hash,
        challenge_id_hash,
        identity_nullifier
    );
}

#[test(should_fail_with = "Identity belongs to known sybil cluster")]
fn test_rejects_membership_signal_false() {
    let policy_id_hash = 0x111;
    let challenge_id_hash = 0x222;
    let identity_nullifier = 0x333;
    let blinding = 0xabc;
    let commitment = Poseidon2::hash([
        policy_id_hash,
        challenge_id_hash,
        identity_nullifier,
        80 as Field,
        80 as Field,
        20 as Field,
        0,
        blinding
    ], 8);
    main(
        80,
        80,
        20,
        false,
        blinding,
        commitment,
        policy_id_hash,
        challenge_id_hash,
        identity_nullifier
    );
}
