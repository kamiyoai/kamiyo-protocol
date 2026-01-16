import { Groth16Proof, AgentIdentityInputs, PrivateSignalInputs, SwarmVoteInputs } from './types';
export declare class MitamaProver {
    private wasmPaths;
    private zkeyPaths;
    constructor(circuitsBuildPath?: string);
    /**
     * Generate identity commitment from owner secret, agent ID, and registration secret.
     * commitment = poseidon(owner_secret, agent_id, registration_secret)
     */
    static generateIdentityCommitment(ownerSecret: Uint8Array, agentId: Uint8Array, registrationSecret: Uint8Array): Promise<Uint8Array>;
    /**
     * Generate nullifier for agent identity proof.
     * nullifier = poseidon(agent_id, registration_secret, epoch)
     */
    static generateNullifier(agentId: Uint8Array, registrationSecret: Uint8Array, epoch: bigint): Promise<Uint8Array>;
    /**
     * Generate vote nullifier for swarm vote.
     * vote_nullifier = poseidon(agent_id, registration_secret, action_hash)
     */
    static generateVoteNullifier(agentId: Uint8Array, registrationSecret: Uint8Array, actionHash: Uint8Array): Promise<Uint8Array>;
    /**
     * Generate vote commitment.
     * vote_commitment = poseidon(vote, vote_salt, action_hash)
     */
    static generateVoteCommitment(vote: boolean, voteSalt: Uint8Array, actionHash: Uint8Array): Promise<Uint8Array>;
    /**
     * Generate signal commitment for private_signal circuit.
     * signal_commitment = poseidon(signal_type, direction, confidence, magnitude, stake_amount, secret, agent_nullifier)
     */
    static generateSignalCommitment(signalType: number, direction: number, confidence: number, magnitude: number, stakeAmount: bigint, secret: Uint8Array, agentNullifier: Uint8Array): Promise<Uint8Array>;
    /**
     * Generate action hash for swarm coordination.
     * action_hash = poseidon(action_type, action_data_hash)
     */
    static generateActionHash(actionType: number, actionData: Uint8Array): Promise<Uint8Array>;
    /**
     * Generate ZK proof of agent identity.
     */
    proveAgentIdentity(inputs: AgentIdentityInputs, agentsRoot: Uint8Array, epoch: bigint): Promise<{
        proof: Groth16Proof;
        nullifier: Uint8Array;
    }>;
    /**
     * Generate ZK proof for submitting a private signal.
     */
    provePrivateSignal(inputs: PrivateSignalInputs, agentNullifier: Uint8Array, minStake: bigint, minConfidence: number): Promise<{
        proof: Groth16Proof;
        signalCommitment: Uint8Array;
    }>;
    /**
     * Generate ZK proof for swarm vote.
     */
    proveSwarmVote(inputs: SwarmVoteInputs, agentsRoot: Uint8Array, actionHash: Uint8Array): Promise<{
        proof: Groth16Proof;
        voteNullifier: Uint8Array;
        voteCommitment: Uint8Array;
    }>;
    /**
     * Format snarkjs proof for Solana verification.
     * Converts from snarkjs format to groth16-solana format.
     *
     * IMPORTANT: groth16-solana expects pi_a to be negated (Y coordinate negated).
     * This is required by the pairing equation: e(-A, B) * e(C, delta) * e(vk_x, gamma) * e(alpha, beta) = 1
     */
    private formatProofForSolana;
}
/**
 * Generate random 32-byte salt for commitments.
 */
export declare function generateRandomSalt(): Uint8Array;
/**
 * Generate random 32-byte secret.
 */
export declare function generateOwnerSecret(): Uint8Array;
/**
 * Generate random registration secret.
 */
export declare function generateRegistrationSecret(): Uint8Array;
/**
 * Generate agent ID from owner pubkey and nonce.
 */
export declare function generateAgentId(ownerPubkey: Uint8Array, nonce: number): Promise<Uint8Array>;
//# sourceMappingURL=prover.d.ts.map