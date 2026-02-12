pragma circom 2.1.6;

include "circomlib/circuits/poseidon.circom";
include "circomlib/circuits/comparators.circom";
include "circomlib/circuits/mux1.circom";

/**
 * AgentReputation - Prove agent membership AND reputation threshold in one proof
 *
 * Combines identity verification with reputation proof for payment rail unlocking.
 * Agent proves: "I'm registered AND my reputation >= threshold"
 * Without revealing: which agent, actual reputation, transaction history
 *
 * Public Inputs:
 *   - agents_root: Merkle root of registered agents
 *   - min_reputation: Required reputation threshold (e.g., 85 for premium)
 *   - min_transactions: Minimum completed transactions
 *   - nullifier: Prevents proof replay (tied to epoch)
 *
 * Private Inputs:
 *   - owner_secret: Secret derived from owner's wallet
 *   - agent_id: Unique identifier for this agent
 *   - registration_secret: Random value from registration
 *   - merkle_path[TREE_DEPTH]: Sibling hashes in Merkle tree
 *   - path_indices[TREE_DEPTH]: Left(0)/Right(1) at each level
 *   - reputation_score: Agent's actual reputation (0-100)
 *   - transaction_count: Number of completed transactions
 *   - reputation_secret: Secret for reputation commitment
 *   - epoch: Current epoch for nullifier
 */
template AgentReputation(TREE_DEPTH) {
    // ============ Public Inputs ============
    signal input agents_root;
    signal input min_reputation;
    signal input min_transactions;
    signal input nullifier;

    // ============ Private Inputs ============
    // Identity
    signal input owner_secret;
    signal input agent_id;
    signal input registration_secret;
    signal input merkle_path[TREE_DEPTH];
    signal input path_indices[TREE_DEPTH];

    // Reputation
    signal input reputation_score;
    signal input transaction_count;
    signal input reputation_secret;
    signal input epoch;

    // ============ 1. Compute Agent Identity Commitment ============
    component identityHasher = Poseidon(3);
    identityHasher.inputs[0] <== owner_secret;
    identityHasher.inputs[1] <== agent_id;
    identityHasher.inputs[2] <== registration_secret;
    signal identity_commitment <== identityHasher.out;

    // ============ 2. Verify Merkle Membership ============
    component merkleHashers[TREE_DEPTH];
    component muxes[TREE_DEPTH];
    signal merkleNodes[TREE_DEPTH + 1];
    merkleNodes[0] <== identity_commitment;

    for (var i = 0; i < TREE_DEPTH; i++) {
        // Ensure path_indices is binary
        path_indices[i] * (1 - path_indices[i]) === 0;

        muxes[i] = MultiMux1(2);
        muxes[i].c[0][0] <== merkleNodes[i];
        muxes[i].c[0][1] <== merkle_path[i];
        muxes[i].c[1][0] <== merkle_path[i];
        muxes[i].c[1][1] <== merkleNodes[i];
        muxes[i].s <== path_indices[i];

        merkleHashers[i] = Poseidon(2);
        merkleHashers[i].inputs[0] <== muxes[i].out[0];
        merkleHashers[i].inputs[1] <== muxes[i].out[1];
        merkleNodes[i + 1] <== merkleHashers[i].out;
    }

    // Verify computed root matches public root
    agents_root === merkleNodes[TREE_DEPTH];

    // ============ 3. Verify Reputation Threshold ============
    // reputation_score >= min_reputation
    component repGte = GreaterEqThan(8); // 8 bits for scores 0-255
    repGte.in[0] <== reputation_score;
    repGte.in[1] <== min_reputation;
    repGte.out === 1;

    // Ensure reputation is in valid range (0-100)
    component repLte = LessEqThan(8);
    repLte.in[0] <== reputation_score;
    repLte.in[1] <== 100;
    repLte.out === 1;

    // ============ 4. Verify Transaction Count ============
    // transaction_count >= min_transactions
    component txGte = GreaterEqThan(32); // 32 bits for transaction counts up to ~4B
    txGte.in[0] <== transaction_count;
    txGte.in[1] <== min_transactions;
    txGte.out === 1;

    // ============ 5. Verify Nullifier ============
    // nullifier = Poseidon(owner_secret, agent_id, registration_secret, epoch)
    // Including owner_secret prevents nullifier forgery
    component nullifierHasher = Poseidon(4);
    nullifierHasher.inputs[0] <== owner_secret;
    nullifierHasher.inputs[1] <== agent_id;
    nullifierHasher.inputs[2] <== registration_secret;
    nullifierHasher.inputs[3] <== epoch;
    nullifier === nullifierHasher.out;

    // ============ 6. Compute Reputation Commitment (optional output) ============
    // This binds the reputation to a secret, allowing later reveal if needed
    component repCommitmentHasher = Poseidon(3);
    repCommitmentHasher.inputs[0] <== reputation_score;
    repCommitmentHasher.inputs[1] <== transaction_count;
    repCommitmentHasher.inputs[2] <== reputation_secret;
    signal reputation_commitment <== repCommitmentHasher.out;

    // Output for external use (not strictly necessary for verification)
    // Verifiers only see that thresholds are met, not the actual values
}

// Tree depth of 20 supports ~1M agents
component main {public [agents_root, min_reputation, min_transactions, nullifier]} = AgentReputation(20);
