/*
 * KAMIYO Agent Collaboration Client
 *
 * TypeScript SDK for ZK-private agent coordination.
 */

import { Program, AnchorProvider, BN, web3 } from '@coral-xyz/anchor';
import { PublicKey, Connection, Keypair } from '@solana/web3.js';
import {
  YUMORI_PROGRAM_ID,
  Groth16Proof,
  RegistryConfig,
  AgentRegistry,
  Agent,
  Signal,
  SwarmAction,
  NullifierRecord,
  SignalAggregator,
  WithdrawalRequest,
  IdentityLink,
} from './types';

// Import the generated IDL
import idlJson from './idl/yumori.json';
import { Idl } from '@coral-xyz/anchor';

// Re-export program ID for convenience
export { YUMORI_PROGRAM_ID };

// ============================================================================
// Input Validation
// ============================================================================

class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

function validateBytes32(value: Uint8Array, name: string): void {
  if (!(value instanceof Uint8Array)) {
    throw new ValidationError(`${name} must be a Uint8Array`);
  }
  if (value.length !== 32) {
    throw new ValidationError(`${name} must be exactly 32 bytes, got ${value.length}`);
  }
}

function validateProof(proof: Groth16Proof): void {
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

function validateU8(value: number, name: string): void {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 255) {
    throw new ValidationError(`${name} must be an integer between 0 and 255`);
  }
}

function validateThreshold(value: number): void {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 100) {
    throw new ValidationError('threshold must be an integer between 1 and 100');
  }
}

function validateStakeAmount(value: BN): void {
  if (!(value instanceof BN)) {
    throw new ValidationError('stakeAmount must be a BN instance');
  }
  if (value.lten(0)) {
    throw new ValidationError('stakeAmount must be positive');
  }
}

// ============================================================================
// Retry Logic
// ============================================================================

interface RetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  retryableErrors: string[];
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
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

function isRetryableError(error: unknown, config: RetryConfig): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return config.retryableErrors.some(e => message.toLowerCase().includes(e.toLowerCase()));
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function withRetry<T>(
  fn: () => Promise<T>,
  config: RetryConfig = DEFAULT_RETRY_CONFIG
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt < config.maxRetries && isRetryableError(error, config)) {
        const delay = Math.min(
          config.baseDelayMs * Math.pow(2, attempt),
          config.maxDelayMs
        );
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
 * const client = new YumoriClient(provider);
 *
 * // Initialize registry
 * await client.initializeRegistry(authority, { minStake: new BN(1000000), minSignalConfidence: 50 });
 *
 * // Register agent
 * await client.registerAgent(payer, identityCommitment, new BN(1000000));
 * ```
 */
export class YumoriClient {
  /** The Anchor program instance */
  readonly program: Program<Idl>;
  /** The Solana connection */
  readonly connection: Connection;

  /**
   * Create a new YumoriClient.
   * @param provider - Anchor provider with connection and wallet
   */
  constructor(provider: AnchorProvider) {
    this.connection = provider.connection;
    this.program = new Program(idlJson as Idl, provider);
  }

  // ============================================================================
  // PDA Derivation
  // ============================================================================

  /**
   * Derive the registry PDA address.
   * @returns Tuple of [PDA address, bump seed]
   */
  static getRegistryPDA(): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('registry')],
      YUMORI_PROGRAM_ID
    );
  }

  /**
   * Derive an agent PDA from identity commitment.
   * @param identityCommitment - 32-byte identity commitment
   * @returns Tuple of [PDA address, bump seed]
   */
  static getAgentPDA(identityCommitment: Uint8Array): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('agent'), identityCommitment],
      YUMORI_PROGRAM_ID
    );
  }

  /**
   * Derive the stake vault PDA for a registry.
   * @param registry - Registry public key
   * @returns Tuple of [PDA address, bump seed]
   */
  static getStakeVaultPDA(registry: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('stake_vault'), registry.toBuffer()],
      YUMORI_PROGRAM_ID
    );
  }

  /**
   * Derive a signal PDA from signal commitment.
   * @param signalCommitment - 32-byte signal commitment
   * @returns Tuple of [PDA address, bump seed]
   */
  static getSignalPDA(signalCommitment: Uint8Array): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('signal'), signalCommitment],
      YUMORI_PROGRAM_ID
    );
  }

  /**
   * Derive a nullifier record PDA.
   * @param nullifier - 32-byte nullifier
   * @returns Tuple of [PDA address, bump seed]
   */
  static getNullifierPDA(nullifier: Uint8Array): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('nullifier'), nullifier],
      YUMORI_PROGRAM_ID
    );
  }

  /**
   * Derive a swarm action PDA from action hash.
   * @param actionHash - 32-byte action hash
   * @returns Tuple of [PDA address, bump seed]
   */
  static getSwarmActionPDA(actionHash: Uint8Array): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('swarm_action'), actionHash],
      YUMORI_PROGRAM_ID
    );
  }

  /**
   * Derive a vote nullifier PDA for preventing double votes.
   * @param swarmAction - Swarm action public key
   * @param nullifier - 32-byte vote nullifier
   * @returns Tuple of [PDA address, bump seed]
   */
  static getVoteNullifierPDA(
    swarmAction: PublicKey,
    nullifier: Uint8Array
  ): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('vote'), swarmAction.toBuffer(), nullifier],
      YUMORI_PROGRAM_ID
    );
  }

  /**
   * Derive a signal aggregator PDA for an epoch.
   * @param registry - Registry public key
   * @param epoch - Epoch number
   * @returns Tuple of [PDA address, bump seed]
   */
  static getAggregatorPDA(registry: PublicKey, epoch: BN): [PublicKey, number] {
    const epochBytes = Buffer.alloc(8);
    epochBytes.writeBigUInt64LE(BigInt(epoch.toString()));
    return PublicKey.findProgramAddressSync(
      [Buffer.from('aggregator'), registry.toBuffer(), epochBytes],
      YUMORI_PROGRAM_ID
    );
  }

  /**
   * Derive a withdrawal request PDA for an agent.
   * @param agent - Agent public key
   * @returns Tuple of [PDA address, bump seed]
   */
  static getWithdrawalPDA(agent: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('withdrawal'), agent.toBuffer()],
      YUMORI_PROGRAM_ID
    );
  }

  /**
   * Derive an identity link PDA for a ZK agent.
   * @param zkAgent - ZK agent public key
   * @returns Tuple of [PDA address, bump seed]
   */
  static getIdentityLinkPDA(zkAgent: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('identity_link'), zkAgent.toBuffer()],
      YUMORI_PROGRAM_ID
    );
  }

  /**
   * Derive a stake position PDA from the kamiyo-staking program.
   * @param stakingProgramId - The staking program ID
   * @param owner - The owner's public key
   * @returns Tuple of [PDA address, bump seed]
   */
  static getStakePositionPDA(stakingProgramId: PublicKey, owner: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('position'), owner.toBuffer()],
      stakingProgramId
    );
  }

  // ============================================================================
  // Account Fetching
  // ============================================================================

  /**
   * Fetch the agent registry account.
   * @returns Registry account data or null if not initialized
   */
  async getRegistry(): Promise<AgentRegistry | null> {
    const [registryPDA] = YumoriClient.getRegistryPDA();
    try {
      const accounts = this.program.account as Record<string, { fetch: (key: PublicKey) => Promise<unknown> }>;
      return await accounts['agentRegistry'].fetch(registryPDA) as AgentRegistry;
    } catch {
      return null;
    }
  }

  async getAgent(identityCommitment: Uint8Array): Promise<Agent | null> {
    const [agentPDA] = YumoriClient.getAgentPDA(identityCommitment);
    try {
      const accounts = this.program.account as Record<string, { fetch: (key: PublicKey) => Promise<unknown> }>;
      return await accounts['agent'].fetch(agentPDA) as Agent;
    } catch {
      return null;
    }
  }

  async getSignal(signalCommitment: Uint8Array): Promise<Signal | null> {
    const [signalPDA] = YumoriClient.getSignalPDA(signalCommitment);
    try {
      const accounts = this.program.account as Record<string, { fetch: (key: PublicKey) => Promise<unknown> }>;
      return await accounts['signal'].fetch(signalPDA) as Signal;
    } catch {
      return null;
    }
  }

  async getSwarmAction(actionHash: Uint8Array): Promise<SwarmAction | null> {
    const [actionPDA] = YumoriClient.getSwarmActionPDA(actionHash);
    try {
      const accounts = this.program.account as Record<string, { fetch: (key: PublicKey) => Promise<unknown> }>;
      return await accounts['swarmAction'].fetch(actionPDA) as SwarmAction;
    } catch {
      return null;
    }
  }

  /**
   * Fetch a signal aggregator account.
   * @param epoch - Epoch to fetch aggregator for
   * @returns Aggregator data or null if not initialized
   */
  async getAggregator(epoch: BN): Promise<SignalAggregator | null> {
    const [registryPDA] = YumoriClient.getRegistryPDA();
    const [aggregatorPDA] = YumoriClient.getAggregatorPDA(registryPDA, epoch);
    try {
      const accounts = this.program.account as Record<string, { fetch: (key: PublicKey) => Promise<unknown> }>;
      return await accounts['signalAggregator'].fetch(aggregatorPDA) as SignalAggregator;
    } catch {
      return null;
    }
  }

  /**
   * Fetch a withdrawal request for an agent.
   * @param agentCommitment - Agent identity commitment
   * @returns Withdrawal request or null if none pending
   */
  async getWithdrawal(agentCommitment: Uint8Array): Promise<WithdrawalRequest | null> {
    const [agentPDA] = YumoriClient.getAgentPDA(agentCommitment);
    const [withdrawalPDA] = YumoriClient.getWithdrawalPDA(agentPDA);
    try {
      const accounts = this.program.account as Record<string, { fetch: (key: PublicKey) => Promise<unknown> }>;
      return await accounts['withdrawalRequest'].fetch(withdrawalPDA) as WithdrawalRequest;
    } catch {
      return null;
    }
  }

  /**
   * Fetch an identity link for a ZK agent.
   * @param zkAgent - ZK agent public key
   * @returns Identity link or null if not linked
   */
  async getIdentityLink(zkAgent: PublicKey): Promise<IdentityLink | null> {
    const [linkPDA] = YumoriClient.getIdentityLinkPDA(zkAgent);
    try {
      const accounts = this.program.account as Record<string, { fetch: (key: PublicKey) => Promise<unknown> }>;
      return await accounts['identityLink'].fetch(linkPDA) as IdentityLink;
    } catch {
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
  async initializeRegistry(
    authority: Keypair,
    config: RegistryConfig
  ): Promise<string> {
    const [registryPDA] = YumoriClient.getRegistryPDA();

    return withRetry(() =>
      this.program.methods
        .initializeRegistry(config)
        .accounts({
          registry: registryPDA,
          authority: authority.publicKey,
          systemProgram: web3.SystemProgram.programId,
        })
        .signers([authority])
        .rpc()
    );
  }

  /**
   * Register an agent with a ZK identity commitment.
   * @param payer - Keypair paying for the transaction and stake
   * @param identityCommitment - 32-byte Poseidon hash commitment
   * @param stakeAmount - Amount of lamports to stake
   * @returns Transaction signature
   */
  async registerAgent(
    payer: Keypair,
    identityCommitment: Uint8Array,
    stakeAmount: BN
  ): Promise<string> {
    validateBytes32(identityCommitment, 'identityCommitment');
    validateStakeAmount(stakeAmount);

    const [registryPDA] = YumoriClient.getRegistryPDA();
    const [agentPDA] = YumoriClient.getAgentPDA(identityCommitment);
    const [stakeVault] = YumoriClient.getStakeVaultPDA(registryPDA);

    return withRetry(() =>
      this.program.methods
        .registerAgent(Array.from(identityCommitment), stakeAmount)
        .accounts({
          registry: registryPDA,
          agent: agentPDA,
          stakeVault,
          payer: payer.publicKey,
          systemProgram: web3.SystemProgram.programId,
        })
        .signers([payer])
        .rpc()
    );
  }

  /**
   * Submit a private signal with ZK proof.
   * @param payer - Keypair paying for the transaction
   * @param proof - Groth16 proof of agent identity
   * @param nullifier - 32-byte nullifier to prevent double submission
   * @param signalCommitment - 32-byte commitment to signal content
   * @returns Transaction signature
   */
  async submitSignal(
    payer: Keypair,
    proof: Groth16Proof,
    nullifier: Uint8Array,
    signalCommitment: Uint8Array
  ): Promise<string> {
    validateProof(proof);
    validateBytes32(nullifier, 'nullifier');
    validateBytes32(signalCommitment, 'signalCommitment');

    const [registryPDA] = YumoriClient.getRegistryPDA();
    const [signalPDA] = YumoriClient.getSignalPDA(signalCommitment);
    const [nullifierPDA] = YumoriClient.getNullifierPDA(nullifier);

    return withRetry(() =>
      this.program.methods
        .submitSignal(
          Array.from(nullifier),
          Array.from(signalCommitment),
          Array.from(proof.a),
          Array.from(proof.b),
          Array.from(proof.c)
        )
        .accounts({
          registry: registryPDA,
          signal: signalPDA,
          nullifierRecord: nullifierPDA,
          payer: payer.publicKey,
          systemProgram: web3.SystemProgram.programId,
        })
        .signers([payer])
        .rpc()
    );
  }

  async createSwarmAction(
    payer: Keypair,
    proof: Groth16Proof,
    nullifier: Uint8Array,
    actionHash: Uint8Array,
    threshold: number
  ): Promise<string> {
    validateProof(proof);
    validateBytes32(nullifier, 'nullifier');
    validateBytes32(actionHash, 'actionHash');
    validateThreshold(threshold);

    const [registryPDA] = YumoriClient.getRegistryPDA();
    const [actionPDA] = YumoriClient.getSwarmActionPDA(actionHash);

    return withRetry(() =>
      this.program.methods
        .createSwarmAction(
          Array.from(actionHash),
          Array.from(proof.a),
          Array.from(proof.b),
          Array.from(proof.c),
          Array.from(nullifier),
          threshold
        )
        .accounts({
          registry: registryPDA,
          swarmAction: actionPDA,
          payer: payer.publicKey,
          systemProgram: web3.SystemProgram.programId,
        })
        .signers([payer])
        .rpc()
    );
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
  async voteSwarmAction(
    payer: Keypair,
    proof: Groth16Proof,
    nullifier: Uint8Array,
    actionHash: Uint8Array,
    vote: boolean,
    voterIdentityLink?: PublicKey
  ): Promise<string> {
    validateProof(proof);
    validateBytes32(nullifier, 'nullifier');
    validateBytes32(actionHash, 'actionHash');
    if (typeof vote !== 'boolean') {
      throw new ValidationError('vote must be a boolean');
    }

    const [registryPDA] = YumoriClient.getRegistryPDA();
    const [actionPDA] = YumoriClient.getSwarmActionPDA(actionHash);
    const [voteNullifierPDA] = YumoriClient.getVoteNullifierPDA(
      actionPDA,
      nullifier
    );

    const accounts: Record<string, PublicKey> = {
      registry: registryPDA,
      swarmAction: actionPDA,
      voteNullifier: voteNullifierPDA,
      payer: payer.publicKey,
      systemProgram: web3.SystemProgram.programId,
    };

    if (voterIdentityLink) {
      accounts.voterIdentityLink = voterIdentityLink;
    }

    return withRetry(() =>
      this.program.methods
        .voteSwarmAction(
          Array.from(nullifier),
          Array.from(proof.a),
          Array.from(proof.b),
          Array.from(proof.c),
          vote
        )
        .accountsPartial(accounts)
        .signers([payer])
        .rpc()
    );
  }

  async executeSwarmAction(actionHash: Uint8Array): Promise<string> {
    const [actionPDA] = YumoriClient.getSwarmActionPDA(actionHash);

    return withRetry(() =>
      this.program.methods
        .executeSwarmAction()
        .accounts({
          swarmAction: actionPDA,
        })
        .rpc()
    );
  }

  async updateAgentsRoot(
    authority: Keypair,
    newRoot: Uint8Array,
    agentCount: number
  ): Promise<string> {
    const [registryPDA] = YumoriClient.getRegistryPDA();

    return withRetry(() =>
      this.program.methods
        .updateAgentsRoot(Array.from(newRoot), agentCount)
        .accounts({
          registry: registryPDA,
          authority: authority.publicKey,
        })
        .signers([authority])
        .rpc()
    );
  }

  async pauseProtocol(authority: Keypair): Promise<string> {
    const [registryPDA] = YumoriClient.getRegistryPDA();

    return withRetry(() =>
      this.program.methods
        .pauseProtocol()
        .accounts({
          registry: registryPDA,
          authority: authority.publicKey,
        })
        .signers([authority])
        .rpc()
    );
  }

  async unpauseProtocol(authority: Keypair): Promise<string> {
    const [registryPDA] = YumoriClient.getRegistryPDA();

    return withRetry(() =>
      this.program.methods
        .unpauseProtocol()
        .accounts({
          registry: registryPDA,
          authority: authority.publicKey,
        })
        .signers([authority])
        .rpc()
    );
  }

  /**
   * Initialize a signal aggregator for an epoch.
   * @param payer - Keypair paying for the transaction
   * @param epoch - Epoch to initialize aggregator for
   * @returns Transaction signature
   */
  async initAggregator(payer: Keypair, epoch: BN): Promise<string> {
    const [registryPDA] = YumoriClient.getRegistryPDA();
    const [aggregatorPDA] = YumoriClient.getAggregatorPDA(registryPDA, epoch);

    return withRetry(() =>
      this.program.methods
        .initAggregator(epoch)
        .accounts({
          registry: registryPDA,
          aggregator: aggregatorPDA,
          payer: payer.publicKey,
          systemProgram: web3.SystemProgram.programId,
        })
        .signers([payer])
        .rpc()
    );
  }

  /**
   * Reveal a signal's content after the reveal period.
   * @param signalCommitment - Signal commitment to reveal
   * @param signalType - Type of signal (0-3)
   * @param direction - Direction (0=short, 1=long, 2=neutral)
   * @param confidence - Confidence level (0-100)
   * @param magnitude - Signal magnitude (0-100)
   * @param revealSecret - Secret used in original commitment
   * @returns Transaction signature
   */
  async revealSignal(
    signalCommitment: Uint8Array,
    signalType: number,
    direction: number,
    confidence: number,
    magnitude: number,
    revealSecret: Uint8Array
  ): Promise<string> {
    validateBytes32(signalCommitment, 'signalCommitment');
    validateU8(signalType, 'signalType');
    validateU8(direction, 'direction');
    validateU8(confidence, 'confidence');
    validateU8(magnitude, 'magnitude');
    validateBytes32(revealSecret, 'revealSecret');

    const [registryPDA] = YumoriClient.getRegistryPDA();
    const [signalPDA] = YumoriClient.getSignalPDA(signalCommitment);
    const registry = await this.getRegistry();
    if (!registry) throw new Error('Registry not initialized');
    const [aggregatorPDA] = YumoriClient.getAggregatorPDA(registryPDA, registry.epoch);

    return withRetry(() =>
      this.program.methods
        .revealSignal(signalType, direction, confidence, magnitude, Array.from(revealSecret))
        .accounts({
          registry: registryPDA,
          signal: signalPDA,
          aggregator: aggregatorPDA,
        })
        .rpc()
    );
  }

  /**
   * Request withdrawal of agent stake (starts timelock).
   * @param payer - Keypair paying for the transaction
   * @param identityCommitment - Agent identity commitment
   * @returns Transaction signature
   */
  async requestWithdrawal(payer: Keypair, identityCommitment: Uint8Array): Promise<string> {
    const [registryPDA] = YumoriClient.getRegistryPDA();
    const [agentPDA] = YumoriClient.getAgentPDA(identityCommitment);
    const [withdrawalPDA] = YumoriClient.getWithdrawalPDA(agentPDA);

    return withRetry(() =>
      this.program.methods
        .requestWithdrawal()
        .accounts({
          registry: registryPDA,
          agent: agentPDA,
          withdrawal: withdrawalPDA,
          payer: payer.publicKey,
          systemProgram: web3.SystemProgram.programId,
        })
        .signers([payer])
        .rpc()
    );
  }

  /**
   * Claim withdrawn stake after timelock expires.
   * @param authority - Authority keypair
   * @param identityCommitment - Agent identity commitment
   * @param recipient - Recipient of the stake
   * @returns Transaction signature
   */
  async claimWithdrawal(
    authority: Keypair,
    identityCommitment: Uint8Array,
    recipient: PublicKey
  ): Promise<string> {
    const [registryPDA] = YumoriClient.getRegistryPDA();
    const [agentPDA] = YumoriClient.getAgentPDA(identityCommitment);
    const [withdrawalPDA] = YumoriClient.getWithdrawalPDA(agentPDA);
    const [stakeVault] = YumoriClient.getStakeVaultPDA(registryPDA);

    return withRetry(() =>
      this.program.methods
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
        .rpc()
    );
  }

  /**
   * Cancel a pending withdrawal request.
   * @param payer - Keypair that created the withdrawal
   * @param identityCommitment - Agent identity commitment
   * @returns Transaction signature
   */
  async cancelWithdrawal(payer: Keypair, identityCommitment: Uint8Array): Promise<string> {
    const [agentPDA] = YumoriClient.getAgentPDA(identityCommitment);
    const [withdrawalPDA] = YumoriClient.getWithdrawalPDA(agentPDA);

    return withRetry(() =>
      this.program.methods
        .cancelWithdrawal()
        .accounts({
          withdrawal: withdrawalPDA,
          payer: payer.publicKey,
        })
        .signers([payer])
        .rpc()
    );
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
  async linkIdentity(
    owner: Keypair,
    zkAgentCommitment: Uint8Array,
    kamiyoAgent: PublicKey,
    stakePosition?: PublicKey
  ): Promise<string> {
    validateBytes32(zkAgentCommitment, 'zkAgentCommitment');

    const [zkAgentPDA] = YumoriClient.getAgentPDA(zkAgentCommitment);
    const [identityLinkPDA] = YumoriClient.getIdentityLinkPDA(zkAgentPDA);

    const accounts: Record<string, PublicKey> = {
      zkAgent: zkAgentPDA,
      kamiyoAgent,
      identityLink: identityLinkPDA,
      owner: owner.publicKey,
      systemProgram: web3.SystemProgram.programId,
    };

    if (stakePosition) {
      accounts.stakePosition = stakePosition;
    }

    return withRetry(() =>
      this.program.methods
        .linkIdentity()
        .accountsPartial(accounts)
        .signers([owner])
        .rpc()
    );
  }

  /**
   * Unlink a ZK agent identity from a kamiyo Agent PDA.
   * @param owner - Owner keypair (must be the original linker)
   * @param zkAgentCommitment - Identity commitment of the ZK agent
   * @returns Transaction signature
   */
  async unlinkIdentity(owner: Keypair, zkAgentCommitment: Uint8Array): Promise<string> {
    validateBytes32(zkAgentCommitment, 'zkAgentCommitment');

    const [zkAgentPDA] = YumoriClient.getAgentPDA(zkAgentCommitment);
    const [identityLinkPDA] = YumoriClient.getIdentityLinkPDA(zkAgentPDA);

    return withRetry(() =>
      this.program.methods
        .unlinkIdentity()
        .accounts({
          identityLink: identityLinkPDA,
          owner: owner.publicKey,
        })
        .signers([owner])
        .rpc()
    );
  }

  /**
   * Refresh stake info on an existing identity link.
   * Call after staking more tokens to update vote weight.
   * @param owner - Owner keypair
   * @param zkAgentCommitment - ZK agent identity commitment
   * @param stakePosition - Optional stake position PDA from staking program
   * @returns Transaction signature
   */
  async refreshStake(
    owner: Keypair,
    zkAgentCommitment: Uint8Array,
    stakePosition?: PublicKey
  ): Promise<string> {
    validateBytes32(zkAgentCommitment, 'zkAgentCommitment');

    const [zkAgentPDA] = YumoriClient.getAgentPDA(zkAgentCommitment);
    const [identityLinkPDA] = YumoriClient.getIdentityLinkPDA(zkAgentPDA);

    const accounts: Record<string, PublicKey> = {
      identityLink: identityLinkPDA,
      owner: owner.publicKey,
    };

    if (stakePosition) {
      accounts.stakePosition = stakePosition;
    }

    return withRetry(() =>
      this.program.methods
        .refreshStake()
        .accountsPartial(accounts)
        .signers([owner])
        .rpc()
    );
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  async getCurrentEpoch(): Promise<BN> {
    const registry = await this.getRegistry();
    if (!registry) {
      throw new Error('Registry not initialized');
    }
    return registry.epoch;
  }

  async isNullifierUsed(nullifier: Uint8Array, epoch: BN): Promise<boolean> {
    const [nullifierPDA] = YumoriClient.getNullifierPDA(nullifier);
    try {
      const accounts = this.program.account as Record<string, { fetch: (key: PublicKey) => Promise<unknown> }>;
      const record = await accounts['nullifierRecord'].fetch(nullifierPDA) as NullifierRecord;
      return record.epoch.eq(epoch);
    } catch {
      return false;
    }
  }

  async getAgentsRoot(): Promise<Uint8Array> {
    const registry = await this.getRegistry();
    if (!registry) {
      throw new Error('Registry not initialized');
    }
    return new Uint8Array(registry.agentsRoot);
  }

  async getMinStake(): Promise<BN> {
    const registry = await this.getRegistry();
    if (!registry) {
      throw new Error('Registry not initialized');
    }
    return registry.minStake;
  }

  async getMinSignalConfidence(): Promise<number> {
    const registry = await this.getRegistry();
    if (!registry) {
      throw new Error('Registry not initialized');
    }
    return registry.minSignalConfidence;
  }
}
