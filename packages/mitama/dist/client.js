"use strict";
/*
 * KAMIYO Agent Collaboration Client
 *
 * TypeScript SDK for ZK-private agent coordination.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MitamaClient = exports.MITAMA_PROGRAM_ID = void 0;
exports.createSignalCommitment = createSignalCommitment;
const anchor_1 = require("@coral-xyz/anchor");
const web3_js_1 = require("@solana/web3.js");
const js_sha3_1 = require("js-sha3");
const types_1 = require("./types");
Object.defineProperty(exports, "MITAMA_PROGRAM_ID", { enumerable: true, get: function () { return types_1.MITAMA_PROGRAM_ID; } });
// Import the generated IDL
const mitama_json_1 = __importDefault(require("./idl/mitama.json"));
// ============================================================================
// Input Validation
// ============================================================================
class ValidationError extends Error {
    constructor(message) {
        super(message);
        this.name = 'ValidationError';
    }
}
function validateBytes32(value, name) {
    if (!(value instanceof Uint8Array)) {
        throw new ValidationError(`${name} must be a Uint8Array`);
    }
    if (value.length !== 32) {
        throw new ValidationError(`${name} must be exactly 32 bytes, got ${value.length}`);
    }
}
function validateProof(proof) {
    if (!proof || typeof proof !== 'object') {
        throw new ValidationError('proof must be an object with a, b, c fields');
    }
    if (!(proof.a instanceof Uint8Array) || proof.a.length !== 64) {
        throw new ValidationError('proof.a must be a 64-byte Uint8Array');
    }
    if (!(proof.b instanceof Uint8Array) || proof.b.length !== 128) {
        throw new ValidationError('proof.b must be a 128-byte Uint8Array');
    }
    if (!(proof.c instanceof Uint8Array) || proof.c.length !== 64) {
        throw new ValidationError('proof.c must be a 64-byte Uint8Array');
    }
}
function validateU8(value, name) {
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 255) {
        throw new ValidationError(`${name} must be an integer between 0 and 255`);
    }
}
function validateThreshold(value) {
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 100) {
        throw new ValidationError('threshold must be an integer between 1 and 100');
    }
}
function validateStakeAmount(value) {
    if (!(value instanceof anchor_1.BN)) {
        throw new ValidationError('stakeAmount must be a BN instance');
    }
    if (value.lten(0)) {
        throw new ValidationError('stakeAmount must be positive');
    }
}
// ============================================================================
// Commitment Generation
// ============================================================================
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
function createSignalCommitment(signalType, direction, confidence, magnitude, stakeAmount, secret, agentNullifier) {
    validateU8(signalType, 'signalType');
    validateU8(direction, 'direction');
    validateU8(confidence, 'confidence');
    validateU8(magnitude, 'magnitude');
    validateBytes32(secret, 'secret');
    validateBytes32(agentNullifier, 'agentNullifier');
    // Build data buffer matching on-chain format (little-endian for stake)
    const data = new Uint8Array(1 + 1 + 1 + 1 + 8 + 32 + 32);
    let offset = 0;
    data[offset++] = signalType;
    data[offset++] = direction;
    data[offset++] = confidence;
    data[offset++] = magnitude;
    // Stake amount as 8-byte little-endian
    const stakeBytes = stakeAmount.toArrayLike(Buffer, 'le', 8);
    data.set(stakeBytes, offset);
    offset += 8;
    data.set(secret, offset);
    offset += 32;
    data.set(agentNullifier, offset);
    // keccak256 hash
    const hash = js_sha3_1.keccak256.array(data);
    return new Uint8Array(hash);
}
const DEFAULT_RETRY_CONFIG = {
    maxRetries: 3,
    baseDelayMs: 1000,
    maxDelayMs: 10000,
    retryableErrors: [
        'blockhash not found',
        'Node is behind',
        'Too many requests',
        'Service temporarily unavailable',
        'connection refused',
        'ECONNRESET',
        'ETIMEDOUT',
    ],
};
function isRetryableError(error, config) {
    const message = error instanceof Error ? error.message : String(error);
    return config.retryableErrors.some(e => message.toLowerCase().includes(e.toLowerCase()));
}
async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
async function withRetry(fn, config = DEFAULT_RETRY_CONFIG) {
    let lastError;
    for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
        try {
            return await fn();
        }
        catch (error) {
            lastError = error;
            if (attempt < config.maxRetries && isRetryableError(error, config)) {
                // Exponential backoff with jitter to prevent thundering herd
                const baseDelay = Math.min(config.baseDelayMs * Math.pow(2, attempt), config.maxDelayMs);
                // Add random jitter: 50-150% of base delay
                const jitter = 0.5 + Math.random();
                const delay = Math.floor(baseDelay * jitter);
                await sleep(delay);
                continue;
            }
            throw error;
        }
    }
    throw lastError;
}
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
class MitamaClient {
    /**
     * Create a new MitamaClient.
     * @param provider - Anchor provider with connection and wallet
     */
    constructor(provider) {
        this.connection = provider.connection;
        this.program = new anchor_1.Program(mitama_json_1.default, provider);
    }
    // ============================================================================
    // PDA Derivation
    // ============================================================================
    /**
     * Derive the registry PDA address.
     * @returns Tuple of [PDA address, bump seed]
     */
    static getRegistryPDA() {
        return web3_js_1.PublicKey.findProgramAddressSync([Buffer.from('registry')], types_1.MITAMA_PROGRAM_ID);
    }
    /**
     * Derive an agent PDA from identity commitment.
     * @param identityCommitment - 32-byte identity commitment
     * @returns Tuple of [PDA address, bump seed]
     */
    static getAgentPDA(identityCommitment) {
        return web3_js_1.PublicKey.findProgramAddressSync([Buffer.from('agent'), identityCommitment], types_1.MITAMA_PROGRAM_ID);
    }
    /**
     * Derive the stake vault PDA for a registry.
     * @param registry - Registry public key
     * @returns Tuple of [PDA address, bump seed]
     */
    static getStakeVaultPDA(registry) {
        return web3_js_1.PublicKey.findProgramAddressSync([Buffer.from('stake_vault'), registry.toBuffer()], types_1.MITAMA_PROGRAM_ID);
    }
    /**
     * Derive a signal PDA from signal commitment.
     * @param signalCommitment - 32-byte signal commitment
     * @returns Tuple of [PDA address, bump seed]
     */
    static getSignalPDA(signalCommitment) {
        return web3_js_1.PublicKey.findProgramAddressSync([Buffer.from('signal'), signalCommitment], types_1.MITAMA_PROGRAM_ID);
    }
    /**
     * Derive a nullifier record PDA.
     * @param nullifier - 32-byte nullifier
     * @returns Tuple of [PDA address, bump seed]
     */
    static getNullifierPDA(nullifier) {
        return web3_js_1.PublicKey.findProgramAddressSync([Buffer.from('nullifier'), nullifier], types_1.MITAMA_PROGRAM_ID);
    }
    /**
     * Derive a swarm action PDA from action hash.
     * @param actionHash - 32-byte action hash
     * @returns Tuple of [PDA address, bump seed]
     */
    static getSwarmActionPDA(actionHash) {
        return web3_js_1.PublicKey.findProgramAddressSync([Buffer.from('swarm_action'), actionHash], types_1.MITAMA_PROGRAM_ID);
    }
    /**
     * Derive a vote nullifier PDA for preventing double votes.
     * @param swarmAction - Swarm action public key
     * @param nullifier - 32-byte vote nullifier
     * @returns Tuple of [PDA address, bump seed]
     */
    static getVoteNullifierPDA(swarmAction, nullifier) {
        return web3_js_1.PublicKey.findProgramAddressSync([Buffer.from('vote'), swarmAction.toBuffer(), nullifier], types_1.MITAMA_PROGRAM_ID);
    }
    /**
     * Derive a signal aggregator PDA for an epoch.
     * @param registry - Registry public key
     * @param epoch - Epoch number
     * @returns Tuple of [PDA address, bump seed]
     */
    static getAggregatorPDA(registry, epoch) {
        const epochBytes = Buffer.alloc(8);
        epochBytes.writeBigUInt64LE(BigInt(epoch.toString()));
        return web3_js_1.PublicKey.findProgramAddressSync([Buffer.from('aggregator'), registry.toBuffer(), epochBytes], types_1.MITAMA_PROGRAM_ID);
    }
    /**
     * Derive a withdrawal request PDA for an agent.
     * @param agent - Agent public key
     * @returns Tuple of [PDA address, bump seed]
     */
    static getWithdrawalPDA(agent) {
        return web3_js_1.PublicKey.findProgramAddressSync([Buffer.from('withdrawal'), agent.toBuffer()], types_1.MITAMA_PROGRAM_ID);
    }
    /**
     * Derive an identity link PDA for a ZK agent.
     * @param zkAgent - ZK agent public key
     * @returns Tuple of [PDA address, bump seed]
     */
    static getIdentityLinkPDA(zkAgent) {
        return web3_js_1.PublicKey.findProgramAddressSync([Buffer.from('identity_link'), zkAgent.toBuffer()], types_1.MITAMA_PROGRAM_ID);
    }
    /**
     * Derive a stake position PDA from the kamiyo-staking program.
     * @param stakingProgramId - The staking program ID
     * @param owner - The owner's public key
     * @returns Tuple of [PDA address, bump seed]
     */
    static getStakePositionPDA(stakingProgramId, owner) {
        return web3_js_1.PublicKey.findProgramAddressSync([Buffer.from('position'), owner.toBuffer()], stakingProgramId);
    }
    // ============================================================================
    // Account Fetching
    // ============================================================================
    /**
     * Fetch the agent registry account.
     * @returns Registry account data or null if not initialized
     */
    async getRegistry() {
        const [registryPDA] = MitamaClient.getRegistryPDA();
        try {
            const accounts = this.program.account;
            return await accounts['agentRegistry'].fetch(registryPDA);
        }
        catch {
            return null;
        }
    }
    async getAgent(identityCommitment) {
        const [agentPDA] = MitamaClient.getAgentPDA(identityCommitment);
        try {
            const accounts = this.program.account;
            return await accounts['agent'].fetch(agentPDA);
        }
        catch {
            return null;
        }
    }
    async getSignal(signalCommitment) {
        const [signalPDA] = MitamaClient.getSignalPDA(signalCommitment);
        try {
            const accounts = this.program.account;
            return await accounts['signal'].fetch(signalPDA);
        }
        catch {
            return null;
        }
    }
    async getSwarmAction(actionHash) {
        const [actionPDA] = MitamaClient.getSwarmActionPDA(actionHash);
        try {
            const accounts = this.program.account;
            return await accounts['swarmAction'].fetch(actionPDA);
        }
        catch {
            return null;
        }
    }
    /**
     * Fetch a signal aggregator account.
     * @param epoch - Epoch to fetch aggregator for
     * @returns Aggregator data or null if not initialized
     */
    async getAggregator(epoch) {
        const [registryPDA] = MitamaClient.getRegistryPDA();
        const [aggregatorPDA] = MitamaClient.getAggregatorPDA(registryPDA, epoch);
        try {
            const accounts = this.program.account;
            return await accounts['signalAggregator'].fetch(aggregatorPDA);
        }
        catch {
            return null;
        }
    }
    /**
     * Fetch a withdrawal request for an agent.
     * @param agentCommitment - Agent identity commitment
     * @returns Withdrawal request or null if none pending
     */
    async getWithdrawal(agentCommitment) {
        const [agentPDA] = MitamaClient.getAgentPDA(agentCommitment);
        const [withdrawalPDA] = MitamaClient.getWithdrawalPDA(agentPDA);
        try {
            const accounts = this.program.account;
            return await accounts['withdrawalRequest'].fetch(withdrawalPDA);
        }
        catch {
            return null;
        }
    }
    /**
     * Fetch an identity link for a ZK agent.
     * @param zkAgent - ZK agent public key
     * @returns Identity link or null if not linked
     */
    async getIdentityLink(zkAgent) {
        const [linkPDA] = MitamaClient.getIdentityLinkPDA(zkAgent);
        try {
            const accounts = this.program.account;
            return await accounts['identityLink'].fetch(linkPDA);
        }
        catch {
            return null;
        }
    }
    // ============================================================================
    // Instructions
    // ============================================================================
    /**
     * Initialize the agent collaboration registry.
     * @param authority - Registry authority keypair
     * @param config - Registry configuration (minStake, minSignalConfidence)
     * @returns Transaction signature
     */
    async initializeRegistry(authority, config) {
        const [registryPDA] = MitamaClient.getRegistryPDA();
        return withRetry(() => this.program.methods
            .initializeRegistry(config)
            .accounts({
            registry: registryPDA,
            authority: authority.publicKey,
            systemProgram: anchor_1.web3.SystemProgram.programId,
        })
            .signers([authority])
            .rpc());
    }
    /**
     * Register an agent with a ZK identity commitment.
     * @param payer - Keypair paying for the transaction and stake
     * @param identityCommitment - 32-byte Poseidon hash commitment
     * @param stakeAmount - Amount of lamports to stake
     * @returns Transaction signature
     */
    async registerAgent(payer, identityCommitment, stakeAmount) {
        validateBytes32(identityCommitment, 'identityCommitment');
        validateStakeAmount(stakeAmount);
        const [registryPDA] = MitamaClient.getRegistryPDA();
        const [agentPDA] = MitamaClient.getAgentPDA(identityCommitment);
        const [stakeVault] = MitamaClient.getStakeVaultPDA(registryPDA);
        return withRetry(() => this.program.methods
            .registerAgent(Array.from(identityCommitment), stakeAmount)
            .accounts({
            registry: registryPDA,
            agent: agentPDA,
            stakeVault,
            payer: payer.publicKey,
            systemProgram: anchor_1.web3.SystemProgram.programId,
        })
            .signers([payer])
            .rpc());
    }
    /**
     * Submit a private signal with ZK proof.
     * @param payer - Keypair paying for the transaction
     * @param proof - Groth16 proof of agent identity
     * @param nullifier - 32-byte nullifier to prevent double submission
     * @param signalCommitment - 32-byte commitment to signal content
     * @returns Transaction signature
     */
    async submitSignal(payer, proof, nullifier, signalCommitment) {
        validateProof(proof);
        validateBytes32(nullifier, 'nullifier');
        validateBytes32(signalCommitment, 'signalCommitment');
        const [registryPDA] = MitamaClient.getRegistryPDA();
        const [signalPDA] = MitamaClient.getSignalPDA(signalCommitment);
        const [nullifierPDA] = MitamaClient.getNullifierPDA(nullifier);
        return withRetry(() => this.program.methods
            .submitSignal(Array.from(nullifier), Array.from(signalCommitment), Array.from(proof.a), Array.from(proof.b), Array.from(proof.c))
            .accounts({
            registry: registryPDA,
            signal: signalPDA,
            nullifierRecord: nullifierPDA,
            payer: payer.publicKey,
            systemProgram: anchor_1.web3.SystemProgram.programId,
        })
            .signers([payer])
            .rpc());
    }
    async createSwarmAction(payer, proof, nullifier, actionHash, threshold) {
        validateProof(proof);
        validateBytes32(nullifier, 'nullifier');
        validateBytes32(actionHash, 'actionHash');
        validateThreshold(threshold);
        const [registryPDA] = MitamaClient.getRegistryPDA();
        const [actionPDA] = MitamaClient.getSwarmActionPDA(actionHash);
        return withRetry(() => this.program.methods
            .createSwarmAction(Array.from(actionHash), Array.from(proof.a), Array.from(proof.b), Array.from(proof.c), Array.from(nullifier), threshold)
            .accounts({
            registry: registryPDA,
            swarmAction: actionPDA,
            payer: payer.publicKey,
            systemProgram: anchor_1.web3.SystemProgram.programId,
        })
            .signers([payer])
            .rpc());
    }
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
    async voteSwarmAction(payer, proof, nullifier, actionHash, vote, voterIdentityLink) {
        validateProof(proof);
        validateBytes32(nullifier, 'nullifier');
        validateBytes32(actionHash, 'actionHash');
        if (typeof vote !== 'boolean') {
            throw new ValidationError('vote must be a boolean');
        }
        const [registryPDA] = MitamaClient.getRegistryPDA();
        const [actionPDA] = MitamaClient.getSwarmActionPDA(actionHash);
        const [voteNullifierPDA] = MitamaClient.getVoteNullifierPDA(actionPDA, nullifier);
        const accounts = {
            registry: registryPDA,
            swarmAction: actionPDA,
            voteNullifier: voteNullifierPDA,
            payer: payer.publicKey,
            systemProgram: anchor_1.web3.SystemProgram.programId,
        };
        if (voterIdentityLink) {
            accounts.voterIdentityLink = voterIdentityLink;
        }
        return withRetry(() => this.program.methods
            .voteSwarmAction(Array.from(nullifier), Array.from(proof.a), Array.from(proof.b), Array.from(proof.c), vote)
            .accountsPartial(accounts)
            .signers([payer])
            .rpc());
    }
    async executeSwarmAction(actionHash) {
        const [actionPDA] = MitamaClient.getSwarmActionPDA(actionHash);
        return withRetry(() => this.program.methods
            .executeSwarmAction()
            .accounts({
            swarmAction: actionPDA,
        })
            .rpc());
    }
    async updateAgentsRoot(authority, newRoot, agentCount) {
        const [registryPDA] = MitamaClient.getRegistryPDA();
        return withRetry(() => this.program.methods
            .updateAgentsRoot(Array.from(newRoot), agentCount)
            .accounts({
            registry: registryPDA,
            authority: authority.publicKey,
        })
            .signers([authority])
            .rpc());
    }
    async pauseProtocol(authority) {
        const [registryPDA] = MitamaClient.getRegistryPDA();
        return withRetry(() => this.program.methods
            .pauseProtocol()
            .accounts({
            registry: registryPDA,
            authority: authority.publicKey,
        })
            .signers([authority])
            .rpc());
    }
    async unpauseProtocol(authority) {
        const [registryPDA] = MitamaClient.getRegistryPDA();
        return withRetry(() => this.program.methods
            .unpauseProtocol()
            .accounts({
            registry: registryPDA,
            authority: authority.publicKey,
        })
            .signers([authority])
            .rpc());
    }
    /**
     * Initialize a signal aggregator for an epoch.
     * @param payer - Keypair paying for the transaction
     * @param epoch - Epoch to initialize aggregator for
     * @returns Transaction signature
     */
    async initAggregator(payer, epoch) {
        const [registryPDA] = MitamaClient.getRegistryPDA();
        const [aggregatorPDA] = MitamaClient.getAggregatorPDA(registryPDA, epoch);
        return withRetry(() => this.program.methods
            .initAggregator(epoch)
            .accounts({
            registry: registryPDA,
            aggregator: aggregatorPDA,
            payer: payer.publicKey,
            systemProgram: anchor_1.web3.SystemProgram.programId,
        })
            .signers([payer])
            .rpc());
    }
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
    async revealSignal(signalCommitment, signalType, direction, confidence, magnitude, stakeAmount, revealSecret) {
        validateBytes32(signalCommitment, 'signalCommitment');
        validateU8(signalType, 'signalType');
        validateU8(direction, 'direction');
        validateU8(confidence, 'confidence');
        validateU8(magnitude, 'magnitude');
        validateBytes32(revealSecret, 'revealSecret');
        if (!(stakeAmount instanceof anchor_1.BN)) {
            throw new ValidationError('stakeAmount must be a BN instance');
        }
        const [registryPDA] = MitamaClient.getRegistryPDA();
        const [signalPDA] = MitamaClient.getSignalPDA(signalCommitment);
        const registry = await this.getRegistry();
        if (!registry)
            throw new Error('Registry not initialized');
        const [aggregatorPDA] = MitamaClient.getAggregatorPDA(registryPDA, registry.epoch);
        return withRetry(() => this.program.methods
            .revealSignal(signalType, direction, confidence, magnitude, stakeAmount, Array.from(revealSecret))
            .accounts({
            registry: registryPDA,
            signal: signalPDA,
            aggregator: aggregatorPDA,
        })
            .rpc());
    }
    /**
     * Request withdrawal of agent stake (starts timelock).
     * @param payer - Keypair paying for the transaction
     * @param identityCommitment - Agent identity commitment
     * @returns Transaction signature
     */
    async requestWithdrawal(payer, identityCommitment) {
        const [registryPDA] = MitamaClient.getRegistryPDA();
        const [agentPDA] = MitamaClient.getAgentPDA(identityCommitment);
        const [withdrawalPDA] = MitamaClient.getWithdrawalPDA(agentPDA);
        return withRetry(() => this.program.methods
            .requestWithdrawal()
            .accounts({
            registry: registryPDA,
            agent: agentPDA,
            withdrawal: withdrawalPDA,
            payer: payer.publicKey,
            systemProgram: anchor_1.web3.SystemProgram.programId,
        })
            .signers([payer])
            .rpc());
    }
    /**
     * Claim withdrawn stake after timelock expires.
     * @param authority - Authority keypair
     * @param identityCommitment - Agent identity commitment
     * @param recipient - Recipient of the stake
     * @returns Transaction signature
     */
    async claimWithdrawal(authority, identityCommitment, recipient) {
        const [registryPDA] = MitamaClient.getRegistryPDA();
        const [agentPDA] = MitamaClient.getAgentPDA(identityCommitment);
        const [withdrawalPDA] = MitamaClient.getWithdrawalPDA(agentPDA);
        const [stakeVault] = MitamaClient.getStakeVaultPDA(registryPDA);
        return withRetry(() => this.program.methods
            .claimWithdrawal()
            .accounts({
            registry: registryPDA,
            agent: agentPDA,
            withdrawal: withdrawalPDA,
            stakeVault,
            recipient,
            authority: authority.publicKey,
        })
            .signers([authority])
            .rpc());
    }
    /**
     * Cancel a pending withdrawal request.
     * @param payer - Keypair that created the withdrawal
     * @param identityCommitment - Agent identity commitment
     * @returns Transaction signature
     */
    async cancelWithdrawal(payer, identityCommitment) {
        const [agentPDA] = MitamaClient.getAgentPDA(identityCommitment);
        const [withdrawalPDA] = MitamaClient.getWithdrawalPDA(agentPDA);
        return withRetry(() => this.program.methods
            .cancelWithdrawal()
            .accounts({
            withdrawal: withdrawalPDA,
            payer: payer.publicKey,
        })
            .signers([payer])
            .rpc());
    }
    /**
     * Link a ZK agent identity to a public kamiyo Agent PDA.
     * Enables cross-program identity verification.
     * @param owner - Owner keypair (must own both ZK agent and kamiyo agent)
     * @param zkAgentCommitment - Identity commitment of the ZK agent
     * @param kamiyoAgent - Public key of the kamiyo Agent PDA to link
     * @param stakePosition - Optional stake position PDA from kamiyo-staking program
     * @returns Transaction signature
     */
    async linkIdentity(owner, zkAgentCommitment, kamiyoAgent, stakePosition) {
        validateBytes32(zkAgentCommitment, 'zkAgentCommitment');
        const [zkAgentPDA] = MitamaClient.getAgentPDA(zkAgentCommitment);
        const [identityLinkPDA] = MitamaClient.getIdentityLinkPDA(zkAgentPDA);
        const accounts = {
            zkAgent: zkAgentPDA,
            kamiyoAgent,
            identityLink: identityLinkPDA,
            owner: owner.publicKey,
            systemProgram: anchor_1.web3.SystemProgram.programId,
        };
        if (stakePosition) {
            accounts.stakePosition = stakePosition;
        }
        return withRetry(() => this.program.methods
            .linkIdentity()
            .accountsPartial(accounts)
            .signers([owner])
            .rpc());
    }
    /**
     * Unlink a ZK agent identity from a kamiyo Agent PDA.
     * @param owner - Owner keypair (must be the original linker)
     * @param zkAgentCommitment - Identity commitment of the ZK agent
     * @returns Transaction signature
     */
    async unlinkIdentity(owner, zkAgentCommitment) {
        validateBytes32(zkAgentCommitment, 'zkAgentCommitment');
        const [zkAgentPDA] = MitamaClient.getAgentPDA(zkAgentCommitment);
        const [identityLinkPDA] = MitamaClient.getIdentityLinkPDA(zkAgentPDA);
        return withRetry(() => this.program.methods
            .unlinkIdentity()
            .accounts({
            identityLink: identityLinkPDA,
            owner: owner.publicKey,
        })
            .signers([owner])
            .rpc());
    }
    /**
     * Refresh stake info on an existing identity link.
     * Call after staking more tokens to update vote weight.
     * @param owner - Owner keypair
     * @param zkAgentCommitment - ZK agent identity commitment
     * @param stakePosition - Optional stake position PDA from staking program
     * @returns Transaction signature
     */
    async refreshStake(owner, zkAgentCommitment, stakePosition) {
        validateBytes32(zkAgentCommitment, 'zkAgentCommitment');
        const [zkAgentPDA] = MitamaClient.getAgentPDA(zkAgentCommitment);
        const [identityLinkPDA] = MitamaClient.getIdentityLinkPDA(zkAgentPDA);
        const accounts = {
            identityLink: identityLinkPDA,
            owner: owner.publicKey,
        };
        if (stakePosition) {
            accounts.stakePosition = stakePosition;
        }
        return withRetry(() => this.program.methods
            .refreshStake()
            .accountsPartial(accounts)
            .signers([owner])
            .rpc());
    }
    // ============================================================================
    // Utility Methods
    // ============================================================================
    async getCurrentEpoch() {
        const registry = await this.getRegistry();
        if (!registry) {
            throw new Error('Registry not initialized');
        }
        return registry.epoch;
    }
    async isNullifierUsed(nullifier, epoch) {
        const [nullifierPDA] = MitamaClient.getNullifierPDA(nullifier);
        try {
            const accounts = this.program.account;
            const record = await accounts['nullifierRecord'].fetch(nullifierPDA);
            return record.epoch.eq(epoch);
        }
        catch {
            return false;
        }
    }
    async getAgentsRoot() {
        const registry = await this.getRegistry();
        if (!registry) {
            throw new Error('Registry not initialized');
        }
        return new Uint8Array(registry.agentsRoot);
    }
    async getMinStake() {
        const registry = await this.getRegistry();
        if (!registry) {
            throw new Error('Registry not initialized');
        }
        return registry.minStake;
    }
    async getMinSignalConfidence() {
        const registry = await this.getRegistry();
        if (!registry) {
            throw new Error('Registry not initialized');
        }
        return registry.minSignalConfidence;
    }
}
exports.MitamaClient = MitamaClient;
//# sourceMappingURL=client.js.map