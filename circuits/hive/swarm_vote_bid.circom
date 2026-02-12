pragma circom 2.1.6;

include "circomlib/circuits/poseidon.circom";
include "circomlib/circuits/comparators.circom";
include "circomlib/circuits/mux1.circom";
include "circomlib/circuits/bitify.circom";

/**
 * SwarmVoteBid - Anonymous voting AND bidding for task allocation
 *
 * Use case: Agents vote on tasks AND bid for execution rights in a single
 * atomic commit-reveal round. Highest YES bidder wins the task.
 *
 * Public Inputs:
 *   - agents_root: Merkle root of registered agents
 *   - action_hash: Hash of the proposed task
 *   - vote_nullifier: Prevents double-voting (Poseidon(agent_id, secret, action_hash))
 *   - vote_commitment: Hides vote while allowing aggregation
 *   - bid_commitment: Hides bid amount until reveal
 *   - min_bid: Minimum acceptable bid (enforced in circuit)
 *
 * Private Inputs:
 *   - owner_secret: Secret derived from owner's wallet
 *   - agent_id: Unique agent identifier
 *   - registration_secret: Random value from registration
 *   - merkle_path[20]: Sibling hashes in Merkle tree
 *   - path_indices[20]: Left(0)/Right(1) at each level
 *   - vote: 0 for reject, 1 for approve
 *   - vote_salt: Random blinding factor for vote commitment
 *   - bid_amount: Agent's bid for task execution
 *   - bid_salt: Random blinding factor for bid commitment
 */
template SwarmVoteBid(TREE_DEPTH) {
    // Public inputs
    signal input agents_root;
    signal input action_hash;
    signal input vote_nullifier;
    signal input vote_commitment;
    signal input bid_commitment;
    signal input min_bid;

    // Private inputs
    signal input owner_secret;
    signal input agent_id;
    signal input registration_secret;
    signal input merkle_path[TREE_DEPTH];
    signal input path_indices[TREE_DEPTH];
    signal input vote;
    signal input vote_salt;
    signal input bid_amount;
    signal input bid_salt;

    // 1. Validate vote is binary (0 or 1)
    vote * (1 - vote) === 0;

    // 2. Compute agent commitment
    component commitmentHasher = Poseidon(3);
    commitmentHasher.inputs[0] <== owner_secret;
    commitmentHasher.inputs[1] <== agent_id;
    commitmentHasher.inputs[2] <== registration_secret;
    signal commitment <== commitmentHasher.out;

    // 3. Verify commitment is in Merkle tree
    component merkleHashers[TREE_DEPTH];
    component muxes[TREE_DEPTH];

    signal merkleNodes[TREE_DEPTH + 1];
    merkleNodes[0] <== commitment;

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

    // 4. Verify nullifier (owner_secret required to prevent forgery)
    component nullifierHasher = Poseidon(4);
    nullifierHasher.inputs[0] <== owner_secret;
    nullifierHasher.inputs[1] <== agent_id;
    nullifierHasher.inputs[2] <== registration_secret;
    nullifierHasher.inputs[3] <== action_hash;

    vote_nullifier === nullifierHasher.out;

    // 5. Verify vote commitment
    component voteCommitmentHasher = Poseidon(3);
    voteCommitmentHasher.inputs[0] <== vote;
    voteCommitmentHasher.inputs[1] <== vote_salt;
    voteCommitmentHasher.inputs[2] <== action_hash;

    vote_commitment === voteCommitmentHasher.out;

    // 6. Verify bid meets minimum (bid_amount >= min_bid)
    // SECURITY: First constrain bid_amount to 64 bits to prevent field overflow
    // Without this, an attacker could use a large field element that wraps around
    component bidBits = Num2Bits(64);
    bidBits.in <== bid_amount;

    component minBidBits = Num2Bits(64);
    minBidBits.in <== min_bid;

    component bidCheck = GreaterEqThan(64);
    bidCheck.in[0] <== bid_amount;
    bidCheck.in[1] <== min_bid;
    bidCheck.out === 1;

    // 7. Verify bid commitment
    component bidCommitmentHasher = Poseidon(3);
    bidCommitmentHasher.inputs[0] <== bid_amount;
    bidCommitmentHasher.inputs[1] <== bid_salt;
    bidCommitmentHasher.inputs[2] <== action_hash;

    bid_commitment === bidCommitmentHasher.out;
}

// Default depth of 20 supports ~1M agents
component main {public [agents_root, action_hash, vote_nullifier, vote_commitment, bid_commitment, min_bid]} = SwarmVoteBid(20);
