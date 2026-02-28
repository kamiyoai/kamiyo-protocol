// Swarm Action Circuit: Private multi-agent coordination
//
// Use case: AI agent swarms agree on actions without revealing individual votes
//
// Private inputs:
//   - votes: Each agent's vote (1=approve, 0=reject)
//   - vote_secrets: Blinding factors for vote commitments
//   - agent_nullifiers: Links votes to agents without revealing identity
//   - num_voters: Actual number of participating agents
//
// Public inputs:
//   - action_hash: Hash of the proposed action
//   - threshold: Minimum votes required for approval
//   - votes_root: Merkle root of vote commitments (for later verification)
//   - approved: Whether action passed (1) or failed (0)
//   - epoch: Coordination epoch

use poseidon::poseidon2::Poseidon2;

global MAX_VOTERS: u32 = 16; // Max agents in a swarm action

fn main(
    // Private inputs
    votes: [u1; MAX_VOTERS],
    vote_secrets: [Field; MAX_VOTERS],
    agent_nullifiers: [Field; MAX_VOTERS],
    num_voters: u8,
    // Public inputs
    action_hash: pub Field,
    threshold: pub u8,
    votes_root: pub Field,
    approved: pub u1,
    epoch: pub Field
) {
    assert(num_voters as u32 <= MAX_VOTERS, "Too many voters");
    assert(threshold <= num_voters, "Threshold cannot exceed voter count");
    assert(threshold > 0, "Threshold must be positive");

    // 1. Count approvals and compute vote commitments
    let mut approval_count: u8 = 0;
    let mut commitments: [Field; MAX_VOTERS] = [0; MAX_VOTERS];

    for i in 0..MAX_VOTERS {
        if (i as u8) < num_voters {
            // Count approvals
            if votes[i] == 1 {
                approval_count += 1;
            }

            // Compute vote commitment
            commitments[i] = compute_vote_commitment(
                votes[i],
                vote_secrets[i],
                agent_nullifiers[i],
                action_hash,
                epoch
            );
        }
    }

    // 2. Verify no duplicate voters (all nullifiers must be unique)
    for i in 0..MAX_VOTERS {
        for j in (i + 1)..MAX_VOTERS {
            if ((i as u8) < num_voters) & ((j as u8) < num_voters) {
                assert(
                    agent_nullifiers[i] != agent_nullifiers[j],
                    "Duplicate voter detected"
                );
            }
        }
    }

    // 3. Verify approval status matches threshold
    let should_approve: u1 = if approval_count >= threshold { 1 } else { 0 };
    assert(approved == should_approve, "Approval status mismatch");

    // 4. Verify votes root
    let computed_root = compute_votes_merkle_root(commitments, num_voters);
    assert(computed_root == votes_root, "Votes root mismatch");
}

fn compute_vote_commitment(
    vote: u1,
    secret: Field,
    nullifier: Field,
    action_hash: Field,
    epoch: Field
) -> Field {
    Poseidon2::hash([vote as Field, secret, nullifier, action_hash, epoch], 5)
}

fn compute_votes_merkle_root(leaves: [Field; MAX_VOTERS], count: u8) -> Field {
    let mut layer: [Field; MAX_VOTERS] = leaves;
    let mut size = MAX_VOTERS;

    // 4 iterations: 16 -> 8 -> 4 -> 2 -> 1
    for _ in 0..4 {
        let mut next_layer: [Field; MAX_VOTERS] = [0; MAX_VOTERS];
        for i in 0..(size / 2) {
            next_layer[i] = Poseidon2::hash([layer[i * 2], layer[i * 2 + 1]], 2);
        }
        layer = next_layer;
        size = size / 2;
    }

    layer[0]
}

// For off-chain use
pub fn generate_vote_commitment(
    vote: u1,
    secret: Field,
    nullifier: Field,
    action_hash: Field,
    epoch: Field
) -> Field {
    compute_vote_commitment(vote, secret, nullifier, action_hash, epoch)
}

#[test]
fn test_unanimous_approval() {
    let votes: [u1; MAX_VOTERS] = [1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    let secrets: [Field; MAX_VOTERS] = [0x111, 0x222, 0x333, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    let nullifiers: [Field; MAX_VOTERS] = [0xaaa, 0xbbb, 0xccc, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    let action_hash = 0xdeadbeef;
    let epoch = 1;
    let num_voters: u8 = 3;
    let threshold: u8 = 3;

    let mut commitments: [Field; MAX_VOTERS] = [0; MAX_VOTERS];
    for i in 0..3 {
        commitments[i] = compute_vote_commitment(
            votes[i],
            secrets[i],
            nullifiers[i],
            action_hash,
            epoch
        );
    }
    let votes_root = compute_votes_merkle_root(commitments, num_voters);

    main(votes, secrets, nullifiers, num_voters, action_hash, threshold, votes_root, 1, epoch);
}

#[test]
fn test_threshold_approval() {
    // 2 of 3 approve, threshold is 2
    let votes: [u1; MAX_VOTERS] = [1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    let secrets: [Field; MAX_VOTERS] = [0x111, 0x222, 0x333, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    let nullifiers: [Field; MAX_VOTERS] = [0xaaa, 0xbbb, 0xccc, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    let action_hash = 0xcafebabe;
    let epoch = 2;
    let num_voters: u8 = 3;
    let threshold: u8 = 2;

    let mut commitments: [Field; MAX_VOTERS] = [0; MAX_VOTERS];
    for i in 0..3 {
        commitments[i] = compute_vote_commitment(
            votes[i],
            secrets[i],
            nullifiers[i],
            action_hash,
            epoch
        );
    }
    let votes_root = compute_votes_merkle_root(commitments, num_voters);

    main(votes, secrets, nullifiers, num_voters, action_hash, threshold, votes_root, 1, epoch);
}

#[test]
fn test_rejection() {
    // 1 of 3 approve, threshold is 2 -> rejected
    let votes: [u1; MAX_VOTERS] = [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    let secrets: [Field; MAX_VOTERS] = [0x111, 0x222, 0x333, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    let nullifiers: [Field; MAX_VOTERS] = [0xaaa, 0xbbb, 0xccc, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    let action_hash = 0x12345;
    let epoch = 3;
    let num_voters: u8 = 3;
    let threshold: u8 = 2;

    let mut commitments: [Field; MAX_VOTERS] = [0; MAX_VOTERS];
    for i in 0..3 {
        commitments[i] = compute_vote_commitment(
            votes[i],
            secrets[i],
            nullifiers[i],
            action_hash,
            epoch
        );
    }
    let votes_root = compute_votes_merkle_root(commitments, num_voters);

    main(votes, secrets, nullifiers, num_voters, action_hash, threshold, votes_root, 0, epoch);
}

#[test(should_fail_with = "Duplicate voter detected")]
fn test_duplicate_voter() {
    let votes: [u1; MAX_VOTERS] = [1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    let secrets: [Field; MAX_VOTERS] = [0x111, 0x222, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    // Same nullifier = same voter trying to vote twice
    let nullifiers: [Field; MAX_VOTERS] = [0xaaa, 0xaaa, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

    let mut commitments: [Field; MAX_VOTERS] = [0; MAX_VOTERS];
    for i in 0..2 {
        commitments[i] = compute_vote_commitment(votes[i], secrets[i], nullifiers[i], 0x123, 1);
    }
    let votes_root = compute_votes_merkle_root(commitments, 2);

    main(votes, secrets, nullifiers, 2, 0x123, 2, votes_root, 1, 1);
}

#[test(should_fail_with = "Approval status mismatch")]
fn test_wrong_approval_status() {
    let votes: [u1; MAX_VOTERS] = [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    let secrets: [Field; MAX_VOTERS] = [0x111, 0x222, 0x333, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    let nullifiers: [Field; MAX_VOTERS] = [0xaaa, 0xbbb, 0xccc, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

    let mut commitments: [Field; MAX_VOTERS] = [0; MAX_VOTERS];
    for i in 0..3 {
        commitments[i] = compute_vote_commitment(votes[i], secrets[i], nullifiers[i], 0x123, 1);
    }
    let votes_root = compute_votes_merkle_root(commitments, 3);

    // Claiming approved=1 when only 1/3 voted yes with threshold 2
    main(votes, secrets, nullifiers, 3, 0x123, 2, votes_root, 1, 1);
}
