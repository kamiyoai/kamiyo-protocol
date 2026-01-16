import { Program, AnchorProvider, BN } from '@coral-xyz/anchor';
import { PublicKey, Connection, Keypair } from '@solana/web3.js';
import { MITAMA_PROGRAM_ID, Groth16Proof, RegistryConfig, AgentRegistry, Agent, Signal, SwarmAction, SignalAggregator, WithdrawalRequest, IdentityLink } from './types';
import { Idl } from '@coral-xyz/anchor';
export { MITAMA_PROGRAM_ID };
/**
 * Create a signal commitment using keccak256.
 * Format matches on-chain: keccak256(type || direction || confidence || magnitude || stake_le || secret || nullifier)
 * @param signalType - Type of signal (0-3)
 * @param direction - Direction (0=short, 1=long, 2=neutral)
 * @param confidence - Confidence level (0-100)
 * @param magnitude - Signal magnitude (0-100)
 * @param stakeAmount - Stake amount (BN)
 * @param secret - 32-byte secret
 * @param agentNullifier - 32-byte agent nullifier
 * @returns 32-byte commitment
 */
export declare function createSignalCommitment(signalType: number, direction: number, confidence: number, magnitude: number, stakeAmount: BN, secret: Uint8Array, agentNullifier: Uint8Array): Uint8Array;
/**
 * Client for the KAMIYO Agent Collaboration Protocol.
 * Provides methods for ZK-private agent coordination on Solana.
 *
 * @example
 * ```typescript
 * const provider = new AnchorProvider(connection, wallet, {});
 * const client = new MitamaClient(provider);
 *
 * // Initialize registry
 * await client.initializeRegistry(authority, { minStake: new BN(1000000), minSignalConfidence: 50 });
 *
 * // Register agent
 * await client.registerAgent(payer, identityCommitment, new BN(1000000));
 * ```
 */
export declare class MitamaClient {
    /** The Anchor program instance */
    readonly program: Program<Idl>;
    /** The Solana connection */
    readonly connection: Connection;
    /**
     * Create a new MitamaClient.
     * @param provider - Anchor provider with connection and wallet
     */
    constructor(provider: AnchorProvider);
    /**
     * Derive the registry PDA address.
     * @returns Tuple of [PDA address, bump seed]
     */
    static getRegistryPDA(): [PublicKey, number];
    /**
     * Derive an agent PDA from identity commitment.
     * @param identityCommitment - 32-byte identity commitment
     * @returns Tuple of [PDA address, bump seed]
     */
    static getAgentPDA(identityCommitment: Uint8Array): [PublicKey, number];
    /**
     * Derive the stake vault PDA for a registry.
     * @param registry - Registry public key
     * @returns Tuple of [PDA address, bump seed]
     */
    static getStakeVaultPDA(registry: PublicKey): [PublicKey, number];
    /**
     * Derive a signal PDA from signal commitment.
     * @param signalCommitment - 32-byte signal commitment
     * @returns Tuple of [PDA address, bump seed]
     */
    static getSignalPDA(signalCommitment: Uint8Array): [PublicKey, number];
    /**
     * Derive a nullifier record PDA.
     * @param nullifier - 32-byte nullifier
     * @returns Tuple of [PDA address, bump seed]
     */
    static getNullifierPDA(nullifier: Uint8Array): [PublicKey, number];
    /**
     * Derive a swarm action PDA from action hash.
     * @param actionHash - 32-byte action hash
     * @returns Tuple of [PDA address, bump seed]
     */
    static getSwarmActionPDA(actionHash: Uint8Array): [PublicKey, number];
    /**
     * Derive a vote nullifier PDA for preventing double votes.
     * @param swarmAction - Swarm action public key
     * @param nullifier - 32-byte vote nullifier
     * @returns Tuple of [PDA address, bump seed]
     */
    static getVoteNullifierPDA(swarmAction: PublicKey, nullifier: Uint8Array): [PublicKey, number];
    /**
     * Derive a signal aggregator PDA for an epoch.
     * @param registry - Registry public key
     * @param epoch - Epoch number
     * @returns Tuple of [PDA address, bump seed]
     */
    static getAggregatorPDA(registry: PublicKey, epoch: BN): [PublicKey, number];
    /**
     * Derive a withdrawal request PDA for an agent.
     * @param agent - Agent public key
     * @returns Tuple of [PDA address, bump seed]
     */
    static getWithdrawalPDA(agent: PublicKey): [PublicKey, number];
    /**
     * Derive an identity link PDA for a ZK agent.
     * @param zkAgent - ZK agent public key
     * @returns Tuple of [PDA address, bump seed]
     */
    static getIdentityLinkPDA(zkAgent: PublicKey): [PublicKey, number];
    /**
     * Derive a stake position PDA from the kamiyo-staking program.
     * @param stakingProgramId - The staking program ID
     * @param owner - The owner's public key
     * @returns Tuple of [PDA address, bump seed]
     */
    static getStakePositionPDA(stakingProgramId: PublicKey, owner: PublicKey): [PublicKey, number];
    /**
     * Fetch the agent registry account.
     * @returns Registry account data or null if not initialized
     */
    getRegistry(): Promise<AgentRegistry | null>;
    getAgent(identityCommitment: Uint8Array): Promise<Agent | null>;
    getSignal(signalCommitment: Uint8Array): Promise<Signal | null>;
    getSwarmAction(actionHash: Uint8Array): Promise<SwarmAction | null>;
    /**
     * Fetch a signal aggregator account.
     * @param epoch - Epoch to fetch aggregator for
     * @returns Aggregator data or null if not initialized
     */
    getAggregator(epoch: BN): Promise<SignalAggregator | null>;
    /**
     * Fetch a withdrawal request for an agent.
     * @param agentCommitment - Agent identity commitment
     * @returns Withdrawal request or null if none pending
     */
    getWithdrawal(agentCommitment: Uint8Array): Promise<WithdrawalRequest | null>;
    /**
     * Fetch an identity link for a ZK agent.
     * @param zkAgent - ZK agent public key
     * @returns Identity link or null if not linked
     */
    getIdentityLink(zkAgent: PublicKey): Promise<IdentityLink | null>;
    /**
     * Initialize the agent collaboration registry.
     * @param authority - Registry authority keypair
     * @param config - Registry configuration (minStake, minSignalConfidence)
     * @returns Transaction signature
     */
    initializeRegistry(authority: Keypair, config: RegistryConfig): Promise<string>;
    /**
     * Register an agent with a ZK identity commitment.
     * @param payer - Keypair paying for the transaction and stake
     * @param identityCommitment - 32-byte Poseidon hash commitment
     * @param stakeAmount - Amount of lamports to stake
     * @returns Transaction signature
     */
    registerAgent(payer: Keypair, identityCommitment: Uint8Array, stakeAmount: BN): Promise<string>;
    /**
     * Submit a private signal with ZK proof.
     * @param payer - Keypair paying for the transaction
     * @param proof - Groth16 proof of agent identity
     * @param nullifier - 32-byte nullifier to prevent double submission
     * @param signalCommitment - 32-byte commitment to signal content
     * @returns Transaction signature
     */
    submitSignal(payer: Keypair, proof: Groth16Proof, nullifier: Uint8Array, signalCommitment: Uint8Array): Promise<string>;
    createSwarmAction(payer: Keypair, proof: Groth16Proof, nullifier: Uint8Array, actionHash: Uint8Array, threshold: number): Promise<string>;
    /**
     * Vote on a swarm action with optional stake-weighted voting.
     * @param payer - Keypair paying for the transaction
     * @param proof - Groth16 proof of agent identity
     * @param nullifier - Vote nullifier
     * @param actionHash - Hash of the action to vote on
     * @param vote - true for yes, false for no
     * @param voterIdentityLink - Optional identity link PDA for stake-weighted voting
     * @returns Transaction signature
     */
    voteSwarmAction(payer: Keypair, proof: Groth16Proof, nullifier: Uint8Array, actionHash: Uint8Array, vote: boolean, voterIdentityLink?: PublicKey): Promise<string>;
    executeSwarmAction(actionHash: Uint8Array): Promise<string>;
    updateAgentsRoot(authority: Keypair, newRoot: Uint8Array, agentCount: number): Promise<string>;
    pauseProtocol(authority: Keypair): Promise<string>;
    unpauseProtocol(authority: Keypair): Promise<string>;
    /**
     * Initialize a signal aggregator for an epoch.
     * @param payer - Keypair paying for the transaction
     * @param epoch - Epoch to initialize aggregator for
     * @returns Transaction signature
     */
    initAggregator(payer: Keypair, epoch: BN): Promise<string>;
    /**
     * Reveal a signal's content after the reveal period.
     * Verifies the commitment on-chain using keccak256 hash.
     * Use createSignalCommitment() to generate matching commitments client-side.
     * @param signalCommitment - Signal commitment to reveal
     * @param signalType - Type of signal (0-3)
     * @param direction - Direction (0=short, 1=long, 2=neutral)
     * @param confidence - Confidence level (0-100)
     * @param magnitude - Signal magnitude (0-100)
     * @param stakeAmount - Stake amount used in commitment
     * @param revealSecret - Secret used in original commitment
     * @returns Transaction signature
     */
    revealSignal(signalCommitment: Uint8Array, signalType: number, direction: number, confidence: number, magnitude: number, stakeAmount: BN, revealSecret: Uint8Array): Promise<string>;
    /**
     * Request withdrawal of agent stake (starts timelock).
     * @param payer - Keypair paying for the transaction
     * @param identityCommitment - Agent identity commitment
     * @returns Transaction signature
     */
    requestWithdrawal(payer: Keypair, identityCommitment: Uint8Array): Promise<string>;
    /**
     * Claim withdrawn stake after timelock expires.
     * @param authority - Authority keypair
     * @param identityCommitment - Agent identity commitment
     * @param recipient - Recipient of the stake
     * @returns Transaction signature
     */
    claimWithdrawal(authority: Keypair, identityCommitment: Uint8Array, recipient: PublicKey): Promise<string>;
    /**
     * Cancel a pending withdrawal request.
     * @param payer - Keypair that created the withdrawal
     * @param identityCommitment - Agent identity commitment
     * @returns Transaction signature
     */
    cancelWithdrawal(payer: Keypair, identityCommitment: Uint8Array): Promise<string>;
    /**
     * Link a ZK agent identity to a public kamiyo Agent PDA.
     * Enables cross-program identity verification.
     * @param owner - Owner keypair (must own both ZK agent and kamiyo agent)
     * @param zkAgentCommitment - Identity commitment of the ZK agent
     * @param kamiyoAgent - Public key of the kamiyo Agent PDA to link
     * @param stakePosition - Optional stake position PDA from kamiyo-staking program
     * @returns Transaction signature
     */
    linkIdentity(owner: Keypair, zkAgentCommitment: Uint8Array, kamiyoAgent: PublicKey, stakePosition?: PublicKey): Promise<string>;
    /**
     * Unlink a ZK agent identity from a kamiyo Agent PDA.
     * @param owner - Owner keypair (must be the original linker)
     * @param zkAgentCommitment - Identity commitment of the ZK agent
     * @returns Transaction signature
     */
    unlinkIdentity(owner: Keypair, zkAgentCommitment: Uint8Array): Promise<string>;
    /**
     * Refresh stake info on an existing identity link.
     * Call after staking more tokens to update vote weight.
     * @param owner - Owner keypair
     * @param zkAgentCommitment - ZK agent identity commitment
     * @param stakePosition - Optional stake position PDA from staking program
     * @returns Transaction signature
     */
    refreshStake(owner: Keypair, zkAgentCommitment: Uint8Array, stakePosition?: PublicKey): Promise<string>;
    getCurrentEpoch(): Promise<BN>;
    isNullifierUsed(nullifier: Uint8Array, epoch: BN): Promise<boolean>;
    getAgentsRoot(): Promise<Uint8Array>;
    getMinStake(): Promise<BN>;
    getMinSignalConfidence(): Promise<number>;
}
//# sourceMappingURL=client.d.ts.map