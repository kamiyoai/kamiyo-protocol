// Agent Identity Circuit: Prove ownership of a registered agent without revealing identity
//
// Use case: AI agents prove they're valid swarm members without doxxing their owner
//
// Private inputs:
//   - owner_secret: Secret key derived from owner's wallet
//   - agent_id: Unique identifier for this agent
//   - registration_secret: Random value from registration
//   - merkle_path: Proof of inclusion in agent registry
//   - path_indices: Left/right decisions in Merkle tree
//
// Public inputs:
//   - agents_root: Merkle root of all registered agents
//   - nullifier: Prevents double-use in same epoch
//   - epoch: Time period for nullifier scoping

use std::hash::poseidon2::Poseidon2;

global TREE_DEPTH: u32 = 20; // Supports 2^20 = ~1M agents

fn main(
    // Private inputs
    owner_secret: Field,
    agent_id: Field,
    registration_secret: Field,
    merkle_path: [Field; TREE_DEPTH],
    path_indices: [u1; TREE_DEPTH],
    // Public inputs
    agents_root: pub Field,
    nullifier: pub Field,
    epoch: pub Field
) {
    // 1. Compute agent commitment (what's stored in the tree)
    let commitment = compute_agent_commitment(owner_secret, agent_id, registration_secret);

    // 2. Verify commitment is in the Merkle tree
    let computed_root = compute_merkle_root(commitment, merkle_path, path_indices);
    assert(computed_root == agents_root, "Agent not in registry");

    // 3. Verify nullifier is correctly computed (prevents double-proving in same epoch)
    let expected_nullifier = compute_nullifier(agent_id, registration_secret, epoch);
    assert(nullifier == expected_nullifier, "Invalid nullifier");
}

fn compute_agent_commitment(owner_secret: Field, agent_id: Field, registration_secret: Field) -> Field {
    Poseidon2::hash([owner_secret, agent_id, registration_secret], 3)
}

fn compute_nullifier(agent_id: Field, registration_secret: Field, epoch: Field) -> Field {
    Poseidon2::hash([agent_id, registration_secret, epoch], 3)
}

fn compute_merkle_root(leaf: Field, path: [Field; TREE_DEPTH], indices: [u1; TREE_DEPTH]) -> Field {
    let mut current = leaf;
    for i in 0..TREE_DEPTH {
        let sibling = path[i];
        if indices[i] == 0 {
            current = Poseidon2::hash([current, sibling], 2);
        } else {
            current = Poseidon2::hash([sibling, current], 2);
        }
    }
    current
}

// Helper for off-chain commitment generation
pub fn generate_commitment(owner_secret: Field, agent_id: Field, registration_secret: Field) -> Field {
    compute_agent_commitment(owner_secret, agent_id, registration_secret)
}

// Helper for off-chain nullifier generation
pub fn generate_nullifier(agent_id: Field, registration_secret: Field, epoch: Field) -> Field {
    compute_nullifier(agent_id, registration_secret, epoch)
}

#[test]
fn test_valid_identity_proof() {
    let owner_secret = 0x1234567890abcdef;
    let agent_id = 0xdeadbeef;
    let registration_secret = 0xcafebabe;
    let epoch = 1;

    let commitment = compute_agent_commitment(owner_secret, agent_id, registration_secret);
    let nullifier = compute_nullifier(agent_id, registration_secret, epoch);

    // Build a simple Merkle tree with our commitment as the only leaf
    let mut path: [Field; TREE_DEPTH] = [0; TREE_DEPTH];
    let mut indices: [u1; TREE_DEPTH] = [0; TREE_DEPTH];

    // Compute root with commitment at leftmost position
    let mut current = commitment;
    for i in 0..TREE_DEPTH {
        path[i] = 0; // Empty sibling
        current = Poseidon2::hash([current, 0], 2);
    }
    let root = current;

    // Reset and recompute for verification
    let mut verify_current = commitment;
    for i in 0..TREE_DEPTH {
        verify_current = Poseidon2::hash([verify_current, path[i]], 2);
    }

    main(
        owner_secret,
        agent_id,
        registration_secret,
        path,
        indices,
        verify_current,
        nullifier,
        epoch
    );
}

#[test]
fn test_different_epochs_different_nullifiers() {
    let agent_id = 0xdeadbeef;
    let registration_secret = 0xcafebabe;

    let nullifier_epoch1 = compute_nullifier(agent_id, registration_secret, 1);
    let nullifier_epoch2 = compute_nullifier(agent_id, registration_secret, 2);

    assert(nullifier_epoch1 != nullifier_epoch2, "Nullifiers should differ by epoch");
}

#[test]
fn test_different_agents_different_commitments() {
    let owner_secret = 0x1234;
    let registration_secret = 0x5678;

    let commitment1 = compute_agent_commitment(owner_secret, 0xaaa, registration_secret);
    let commitment2 = compute_agent_commitment(owner_secret, 0xbbb, registration_secret);

    assert(commitment1 != commitment2, "Different agents should have different commitments");
}
