// SwarmTeams client

import { Program, AnchorProvider, web3 } from '@coral-xyz/anchor';
import BN from 'bn.js';
import { PublicKey, Connection, Keypair, ComputeBudgetProgram, TransactionInstruction } from '@solana/web3.js';
import { buildPoseidon, Poseidon } from 'circomlibjs';
import {
  SWARMTEAMS_PROGRAM_ID,
  KAMIYO_MINT,
  Groth16Proof,
  RegistryConfig,
  AgentRegistry,
  Agent,
  Signal,
  SwarmAction,
  SwarmActionBid,
  VoteBidRecord,
  NullifierRecord,
  SignalAggregator,
  WithdrawalRequest,
  IdentityLink,
  CollateralWithdrawal,
  SlashReason,
} from './swarm-types.js';

// Import the generated IDL
import idlJson from './idl/swarmteams.json' with { type: 'json' };
import { Idl } from '@coral-xyz/anchor';

// Note: SWARMTEAMS_PROGRAM_ID is exported from swarm-types.js

// ============================================================================
// Compute Budget
// ============================================================================

// ZK proof verification requires ~400k compute units
const ZK_COMPUTE_UNITS = 400_000;
const PRIORITY_FEE_MICRO_LAMPORTS = 1_000; // 0.001 lamports per CU

/**
 * Creates compute budget instructions for ZK-heavy transactions.
 * Required for transactions that verify Groth16 proofs on-chain.
 */
function getZkComputeBudgetInstructions(): TransactionInstruction[] {
  return [
    ComputeBudgetProgram.setComputeUnitLimit({ units: ZK_COMPUTE_UNITS }),
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: PRIORITY_FEE_MICRO_LAMPORTS }),
  ];
}

// ============================================================================
// Poseidon Hash Helpers
// ============================================================================

const FIELD_MODULUS = BigInt('21888242871839275222246405745257275088548364400416034343698204186575808495617');

let poseidonInstance: Poseidon | null = null;

async function getPoseidon(): Promise<Poseidon> {
  if (!poseidonInstance) {
    poseidonInstance = await buildPoseidon();
  }
  return poseidonInstance;
}

async function poseidonHash(inputs: bigint[]): Promise<bigint> {
  const poseidon = await getPoseidon();
  const hash = poseidon(inputs.map(i => i % FIELD_MODULUS));
  return poseidon.F.toObject(hash);
}

function bigintToBytes32(n: bigint): Uint8Array {
  const bytes = new Uint8Array(32);
  let temp = n;
  for (let i = 31; i >= 0; i--) {
    bytes[i] = Number(temp & BigInt(0xff));
    temp = temp >> BigInt(8);
  }
  return bytes;
}

function bytesToBigint(arr: Uint8Array): bigint {
  let result = BigInt(0);
  for (let i = 0; i < arr.length; i++) {
    result = (result << BigInt(8)) | BigInt(arr[i]);
  }
  return result;
}

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
// Commitment Generation
// ============================================================================

/**
 * Create a signal commitment using Poseidon hash.
 * Format matches on-chain: poseidon(type, direction, confidence, magnitude, stake, secret, nullifier)
 * @param signalType - Type of signal (0-3)
 * @param direction - Direction (0=short, 1=long, 2=neutral)
 * @param confidence - Confidence level (0-100)
 * @param magnitude - Signal magnitude (0-100)
 * @param stakeAmount - Stake amount (BN)
 * @param secret - 32-byte secret
 * @param agentNullifier - 32-byte agent nullifier
 * @returns 32-byte commitment
 */
export async function createSignalCommitment(
  signalType: number,
  direction: number,
  confidence: number,
  magnitude: number,
  stakeAmount: BN,
  secret: Uint8Array,
  agentNullifier: Uint8Array
): Promise<Uint8Array> {
  validateU8(signalType, 'signalType');
  validateU8(direction, 'direction');
  validateU8(confidence, 'confidence');
  validateU8(magnitude, 'magnitude');
  validateBytes32(secret, 'secret');
  validateBytes32(agentNullifier, 'agentNullifier');

  const hash = await poseidonHash([
    BigInt(signalType),
    BigInt(direction),
    BigInt(confidence),
    BigInt(magnitude),
    BigInt(stakeAmount.toString()),
    bytesToBigint(secret),
    bytesToBigint(agentNullifier),
  ]);
  return bigintToBytes32(hash);
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
        // Exponential backoff with jitter to prevent thundering herd
        const baseDelay = Math.min(
          config.baseDelayMs * Math.pow(2, attempt),
          config.maxDelayMs
        );
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
 * const client = new SwarmTeamsClient(provider);
 *
 * // Initialize registry
 * await client.initializeRegistry(authority, { minStake: new BN(1000000), minSignalConfidence: 50 });
 *
 * // Register agent
 * await client.registerAgent(payer, identityCommitment, new BN(1000000));
 * ```
 */
export class SwarmTeamsClient {
  /** The Anchor program instance */
  readonly program: Program<Idl>;
  /** The Solana connection */
  readonly connection: Connection;

  /**
   * Create a new SwarmTeamsClient.
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
      SWARMTEAMS_PROGRAM_ID
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
      SWARMTEAMS_PROGRAM_ID
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
      SWARMTEAMS_PROGRAM_ID
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
      SWARMTEAMS_PROGRAM_ID
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
      SWARMTEAMS_PROGRAM_ID
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
      SWARMTEAMS_PROGRAM_ID
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
      SWARMTEAMS_PROGRAM_ID
    );
  }

  /**
   * Derive a vote record PDA for storing vote commitments.
   * @param swarmAction - Swarm action public key
   * @param voteNullifier - 32-byte vote nullifier
   * @returns Tuple of [PDA address, bump seed]
   */
  static getVoteRecordPDA(
    swarmAction: PublicKey,
    voteNullifier: Uint8Array
  ): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('vote_record'), swarmAction.toBuffer(), voteNullifier],
      SWARMTEAMS_PROGRAM_ID
    );
  }

  // =========================================================================
  // Vote+Bid PDA Methods
  // =========================================================================

  /**
   * Derive a swarm action bid PDA from registry and action hash.
   * Used for private task allocation with bidding.
   * @param actionHash - 32-byte action hash
   * @returns Tuple of [PDA address, bump seed]
   */
  static getSwarmActionBidPDA(actionHash: Uint8Array): [PublicKey, number] {
    const [registryPDA] = SwarmTeamsClient.getRegistryPDA();
    return PublicKey.findProgramAddressSync(
      [Buffer.from('swarm_action_bid'), registryPDA.toBuffer(), actionHash],
      SWARMTEAMS_PROGRAM_ID
    );
  }

  /**
   * Derive a vote bid nullifier PDA for preventing double voting.
   * @param swarmActionBid - Swarm action bid public key
   * @param nullifier - 32-byte vote nullifier
   * @returns Tuple of [PDA address, bump seed]
   */
  static getVoteBidNullifierPDA(
    swarmActionBid: PublicKey,
    nullifier: Uint8Array
  ): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('vote_bid'), swarmActionBid.toBuffer(), nullifier],
      SWARMTEAMS_PROGRAM_ID
    );
  }

  /**
   * Derive a vote bid record PDA for storing vote+bid commitments.
   * @param swarmActionBid - Swarm action bid public key
   * @param voteNullifier - 32-byte vote nullifier
   * @returns Tuple of [PDA address, bump seed]
   */
  static getVoteBidRecordPDA(
    swarmActionBid: PublicKey,
    voteNullifier: Uint8Array
  ): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('vote_bid_record'), swarmActionBid.toBuffer(), voteNullifier],
      SWARMTEAMS_PROGRAM_ID
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
      SWARMTEAMS_PROGRAM_ID
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
      SWARMTEAMS_PROGRAM_ID
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
      SWARMTEAMS_PROGRAM_ID
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

  /**
   * Derive a collateral vault PDA for an agent.
   * @param agent - Agent public key
   * @returns Tuple of [PDA address, bump seed]
   */
  static getCollateralVaultPDA(agent: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('collateral_vault'), agent.toBuffer()],
      SWARMTEAMS_PROGRAM_ID
    );
  }

  /**
   * Derive a collateral withdrawal request PDA for an agent.
   * @param agent - Agent public key
   * @returns Tuple of [PDA address, bump seed]
   */
  static getCollateralWithdrawalPDA(agent: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('collateral_withdrawal'), agent.toBuffer()],
      SWARMTEAMS_PROGRAM_ID
    );
  }

  /**
   * Derive the treasury PDA (used for both fees and slashed collateral).
   * @param registry - Registry public key
   * @returns Tuple of [PDA address, bump seed]
   */
  static getTreasuryPDA(registry: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('treasury'), registry.toBuffer()],
      SWARMTEAMS_PROGRAM_ID
    );
  }

  // ============================================================================
  // Account Fetching
  // ============================================================================

  /**
   * Fetch the agent registry account.
   * Falls back to manual parsing for older 127-byte structs.
   * @returns Registry account data or null if not initialized
   */
  async getRegistry(): Promise<AgentRegistry | null> {
    const [registryPDA] = SwarmTeamsClient.getRegistryPDA();
    try {
      const accounts = this.program.account as Record<string, { fetch: (key: PublicKey) => Promise<unknown> }>;
      return await accounts['agentRegistry'].fetch(registryPDA) as AgentRegistry;
    } catch {
      // Fallback: manual parsing for older 127-byte struct (pre-KAMIYO token tracking)
      try {
        const acctInfo = await this.program.provider.connection.getAccountInfo(registryPDA);
        if (!acctInfo || acctInfo.data.length < 127) return null;
        return this.parseRegistryManually(acctInfo.data);
      } catch {
        return null;
      }
    }
  }

  /**
   * Manually parse registry from raw bytes (for 127-byte struct).
   */
  private parseRegistryManually(data: Buffer): AgentRegistry {
    let offset = 8; // Skip discriminator

    const authority = new PublicKey(data.subarray(offset, offset + 32));
    offset += 32;

    const agentsRoot = new Uint8Array(data.subarray(offset, offset + 32));
    offset += 32;

    const agentCount = data.readUInt32LE(offset);
    offset += 4;

    const signalCount = data.readUInt32LE(offset);
    offset += 4;

    const swarmActionCount = data.readUInt32LE(offset);
    offset += 4;

    const epoch = new BN(data.readBigUInt64LE(offset).toString());
    offset += 8;

    const minStake = new BN(data.readBigUInt64LE(offset).toString());
    offset += 8;

    const minSignalConfidence = data.readUInt8(offset);
    offset += 1;

    const bump = data.readUInt8(offset);
    offset += 1;

    const paused = data.readUInt8(offset) !== 0;
    offset += 1;

    // Default values for fields not in older 127-byte struct
    const maxTotalStake = new BN(0);
    const maxStakePerAgent = new BN(0);
    const totalStake = new BN(0);
    const kamiyoMint = PublicKey.default;
    const treasuryBump = 0;
    const totalBurned = new BN(0);
    const totalFeesCollected = new BN(0);
    const minSignalCollateral = new BN(0);

    return {
      authority,
      agentsRoot,
      agentCount,
      signalCount,
      swarmActionCount,
      epoch,
      minStake,
      minSignalConfidence,
      bump,
      paused,
      maxTotalStake,
      maxStakePerAgent,
      totalStake,
      kamiyoMint,
      treasuryBump,
      totalBurned,
      totalFeesCollected,
      minSignalCollateral,
    };
  }

  async getAgent(identityCommitment: Uint8Array): Promise<Agent | null> {
    const [agentPDA] = SwarmTeamsClient.getAgentPDA(identityCommitment);
    try {
      const accounts = this.program.account as Record<string, { fetch: (key: PublicKey) => Promise<unknown> }>;
      return await accounts['agent'].fetch(agentPDA) as Agent;
    } catch {
      return null;
    }
  }

  async getSignal(signalCommitment: Uint8Array): Promise<Signal | null> {
    const [signalPDA] = SwarmTeamsClient.getSignalPDA(signalCommitment);
    try {
      const accounts = this.program.account as Record<string, { fetch: (key: PublicKey) => Promise<unknown> }>;
      return await accounts['signal'].fetch(signalPDA) as Signal;
    } catch {
      return null;
    }
  }

  async getSwarmAction(actionHash: Uint8Array): Promise<SwarmAction | null> {
    const [actionPDA] = SwarmTeamsClient.getSwarmActionPDA(actionHash);
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
    const [registryPDA] = SwarmTeamsClient.getRegistryPDA();
    const [aggregatorPDA] = SwarmTeamsClient.getAggregatorPDA(registryPDA, epoch);
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
    const [agentPDA] = SwarmTeamsClient.getAgentPDA(agentCommitment);
    const [withdrawalPDA] = SwarmTeamsClient.getWithdrawalPDA(agentPDA);
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
    const [linkPDA] = SwarmTeamsClient.getIdentityLinkPDA(zkAgent);
    try {
      const accounts = this.program.account as Record<string, { fetch: (key: PublicKey) => Promise<unknown> }>;
      return await accounts['identityLink'].fetch(linkPDA) as IdentityLink;
    } catch {
      return null;
    }
  }

  /**
   * Fetch a collateral withdrawal request for an agent.
   * @param agentCommitment - Agent identity commitment
   * @returns Collateral withdrawal or null if none pending
   */
  async getCollateralWithdrawal(agentCommitment: Uint8Array): Promise<CollateralWithdrawal | null> {
    const [agentPDA] = SwarmTeamsClient.getAgentPDA(agentCommitment);
    const [withdrawalPDA] = SwarmTeamsClient.getCollateralWithdrawalPDA(agentPDA);
    try {
      const accounts = this.program.account as Record<string, { fetch: (key: PublicKey) => Promise<unknown> }>;
      return await accounts['collateralWithdrawal'].fetch(withdrawalPDA) as CollateralWithdrawal;
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
    const [registryPDA] = SwarmTeamsClient.getRegistryPDA();
    const [treasuryVault] = SwarmTeamsClient.getTreasuryPDA(registryPDA);
    const kamiyoMint = new PublicKey(KAMIYO_MINT);

    return withRetry(() =>
      this.program.methods
        .initializeRegistry(config)
        .accounts({
          registry: registryPDA,
          kamiyoMint,
          treasuryVault,
          authority: authority.publicKey,
          systemProgram: web3.SystemProgram.programId,
          tokenProgram: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'),
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

    const [registryPDA] = SwarmTeamsClient.getRegistryPDA();
    const [agentPDA] = SwarmTeamsClient.getAgentPDA(identityCommitment);
    const [stakeVault] = SwarmTeamsClient.getStakeVaultPDA(registryPDA);

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
   * Requires KAMIYO tokens for fee payment (100 KAMIYO: 1% burned, 99% to treasury).
   * @param payer - Keypair paying for the transaction
   * @param proof - Groth16 proof of agent identity
   * @param nullifier - 32-byte nullifier to prevent double submission
   * @param signalCommitment - 32-byte commitment to signal content
   * @param payerTokenAccount - Payer's KAMIYO token account for fee payment
   * @returns Transaction signature
   */
  async submitSignal(
    payer: Keypair,
    proof: Groth16Proof,
    nullifier: Uint8Array,
    signalCommitment: Uint8Array,
    payerTokenAccount?: PublicKey
  ): Promise<string> {
    validateProof(proof);
    validateBytes32(nullifier, 'nullifier');
    validateBytes32(signalCommitment, 'signalCommitment');

    const [registryPDA] = SwarmTeamsClient.getRegistryPDA();
    const [signalPDA] = SwarmTeamsClient.getSignalPDA(signalCommitment);
    const [nullifierPDA] = SwarmTeamsClient.getNullifierPDA(nullifier);
    const [treasuryVault] = SwarmTeamsClient.getTreasuryPDA(registryPDA);
    const kamiyoMint = new PublicKey(KAMIYO_MINT);

    // Get or derive payer's token account
    const tokenAccount = payerTokenAccount || (await this.getAssociatedTokenAddress(payer.publicKey, kamiyoMint));

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
          kamiyoMint,
          payerTokenAccount: tokenAccount,
          treasuryVault,
          payer: payer.publicKey,
          systemProgram: web3.SystemProgram.programId,
          tokenProgram: new PublicKey('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb'),
        })
        .preInstructions(getZkComputeBudgetInstructions())
        .signers([payer])
        .rpc()
    );
  }

  /**
   * Get associated token address for a wallet and mint.
   * Uses Token-2022 program for KAMIYO token.
   */
  private async getAssociatedTokenAddress(owner: PublicKey, mint: PublicKey): Promise<PublicKey> {
    const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');
    const TOKEN_2022_PROGRAM_ID = new PublicKey('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb');
    const [address] = PublicKey.findProgramAddressSync(
      [owner.toBuffer(), TOKEN_2022_PROGRAM_ID.toBuffer(), mint.toBuffer()],
      ASSOCIATED_TOKEN_PROGRAM_ID
    );
    return address;
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

    const [registryPDA] = SwarmTeamsClient.getRegistryPDA();
    const [actionPDA] = SwarmTeamsClient.getSwarmActionPDA(actionHash);

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
        .preInstructions(getZkComputeBudgetInstructions())
        .signers([payer])
        .rpc()
    );
  }

  /**
   * Vote on a swarm action with ZK proof (swarm_vote circuit).
   * Uses vote commitment scheme: actual vote is hidden until reveal phase.
   * @param payer - Keypair paying for the transaction
   * @param proof - Groth16 proof from swarm_vote circuit
   * @param voteNullifier - 32-byte vote nullifier (prevents double voting)
   * @param voteCommitment - 32-byte vote commitment (hides vote until reveal)
   * @param actionHash - Hash of the action to vote on
   * @returns Transaction signature
   */
  async voteSwarmAction(
    payer: Keypair,
    proof: Groth16Proof,
    voteNullifier: Uint8Array,
    voteCommitment: Uint8Array,
    actionHash: Uint8Array
  ): Promise<string> {
    validateProof(proof);
    validateBytes32(voteNullifier, 'voteNullifier');
    validateBytes32(voteCommitment, 'voteCommitment');
    validateBytes32(actionHash, 'actionHash');

    const [registryPDA] = SwarmTeamsClient.getRegistryPDA();
    const [actionPDA] = SwarmTeamsClient.getSwarmActionPDA(actionHash);
    const [voteNullifierPDA] = SwarmTeamsClient.getVoteNullifierPDA(
      actionPDA,
      voteNullifier
    );
    const [voteRecordPDA] = SwarmTeamsClient.getVoteRecordPDA(
      actionPDA,
      voteNullifier
    );

    return withRetry(() =>
      this.program.methods
        .voteSwarmAction(
          Array.from(voteNullifier),
          Array.from(voteCommitment),
          Array.from(proof.a),
          Array.from(proof.b),
          Array.from(proof.c)
        )
        .accounts({
          registry: registryPDA,
          swarmAction: actionPDA,
          voteNullifier: voteNullifierPDA,
          voteRecord: voteRecordPDA,
          payer: payer.publicKey,
          systemProgram: web3.SystemProgram.programId,
        })
        .preInstructions(getZkComputeBudgetInstructions())
        .signers([payer])
        .rpc()
    );
  }

  /**
   * Reveal a vote's value to update weighted tallies.
   * Must be called after voting and before action execution.
   * @param actionHash - Hash of the action that was voted on
   * @param voteNullifier - Vote nullifier used when voting
   * @param voteValue - The actual vote (true=for, false=against)
   * @param voteSalt - 32-byte salt used in the vote commitment
   * @param identityLinkOwner - Optional owner of identity link for stake weight
   * @returns Transaction signature
   */
  async revealVote(
    actionHash: Uint8Array,
    voteNullifier: Uint8Array,
    voteValue: boolean,
    voteSalt: Uint8Array,
    identityLinkOwner?: PublicKey
  ): Promise<string> {
    validateBytes32(actionHash, 'actionHash');
    validateBytes32(voteNullifier, 'voteNullifier');
    validateBytes32(voteSalt, 'voteSalt');

    const [actionPDA] = SwarmTeamsClient.getSwarmActionPDA(actionHash);
    const [voteRecordPDA] = SwarmTeamsClient.getVoteRecordPDA(actionPDA, voteNullifier);

    // Build accounts - optional identityLink can be omitted or null
    const accounts: Record<string, PublicKey | null> = {
      voteRecord: voteRecordPDA,
      swarmAction: actionPDA,
      identityLink: identityLinkOwner
        ? SwarmTeamsClient.getIdentityLinkPDA(identityLinkOwner)[0]
        : null,
    };

    return withRetry(() =>
      this.program.methods
        .revealVote(voteValue, Array.from(voteSalt))
        .accountsPartial(accounts as Record<string, PublicKey>)
        .rpc()
    );
  }

  async executeSwarmAction(actionHash: Uint8Array): Promise<string> {
    validateBytes32(actionHash, 'actionHash');

    const [actionPDA] = SwarmTeamsClient.getSwarmActionPDA(actionHash);

    return withRetry(() =>
      this.program.methods
        .executeSwarmAction()
        .accounts({
          swarmAction: actionPDA,
        })
        .rpc()
    );
  }

  // =========================================================================
  // Swarm Vote+Bid Instructions (Private Task Allocation)
  // =========================================================================

  /**
   * Create a swarm action with bidding enabled for private task allocation.
   * @param payer - Keypair paying for transaction
   * @param proof - Groth16 proof of agent identity
   * @param nullifier - Proposer's nullifier
   * @param actionHash - 32-byte hash identifying this action
   * @param threshold - Approval threshold (0-100)
   * @param minBid - Minimum bid amount
   * @param voteDeadlineSlots - Number of slots for vote submission phase
   * @param revealDeadlineSlots - Number of slots until reveal deadline (must be > voteDeadlineSlots)
   * @returns Transaction signature
   */
  async createSwarmActionBid(
    payer: Keypair,
    proof: Groth16Proof,
    nullifier: Uint8Array,
    actionHash: Uint8Array,
    threshold: number,
    minBid: BN,
    voteDeadlineSlots: BN,
    revealDeadlineSlots: BN
  ): Promise<string> {
    validateProof(proof);
    validateBytes32(nullifier, 'nullifier');
    validateBytes32(actionHash, 'actionHash');

    const [registryPDA] = SwarmTeamsClient.getRegistryPDA();
    const [actionBidPDA] = SwarmTeamsClient.getSwarmActionBidPDA(actionHash);

    return withRetry(() =>
      this.program.methods
        .createSwarmActionBid(
          Array.from(actionHash),
          Array.from(proof.a),
          Array.from(proof.b),
          Array.from(proof.c),
          Array.from(nullifier),
          threshold,
          minBid,
          voteDeadlineSlots,
          revealDeadlineSlots
        )
        .accounts({
          registry: registryPDA,
          swarmActionBid: actionBidPDA,
          payer: payer.publicKey,
          systemProgram: web3.SystemProgram.programId,
        })
        .preInstructions(getZkComputeBudgetInstructions())
        .signers([payer])
        .rpc()
    );
  }

  /**
   * Vote on a swarm action with a hidden bid using ZK proof.
   * Uses swarm_vote_bid circuit: proves membership + vote + bid validity.
   * @param payer - Keypair paying for transaction
   * @param proof - Groth16 proof (6 public inputs)
   * @param voteNullifier - 32-byte vote nullifier
   * @param voteCommitment - 32-byte vote commitment
   * @param bidCommitment - 32-byte bid commitment
   * @param actionHash - 32-byte action hash
   * @returns Transaction signature
   */
  async voteBidSwarmAction(
    payer: Keypair,
    proof: Groth16Proof,
    voteNullifier: Uint8Array,
    voteCommitment: Uint8Array,
    bidCommitment: Uint8Array,
    actionHash: Uint8Array
  ): Promise<string> {
    validateProof(proof);
    validateBytes32(voteNullifier, 'voteNullifier');
    validateBytes32(voteCommitment, 'voteCommitment');
    validateBytes32(bidCommitment, 'bidCommitment');
    validateBytes32(actionHash, 'actionHash');

    const [registryPDA] = SwarmTeamsClient.getRegistryPDA();
    const [actionBidPDA] = SwarmTeamsClient.getSwarmActionBidPDA(actionHash);
    const [voteBidNullifierPDA] = SwarmTeamsClient.getVoteBidNullifierPDA(
      actionBidPDA,
      voteNullifier
    );
    const [voteBidRecordPDA] = SwarmTeamsClient.getVoteBidRecordPDA(
      actionBidPDA,
      voteNullifier
    );

    return withRetry(() =>
      this.program.methods
        .voteBidSwarmAction(
          Array.from(voteNullifier),
          Array.from(voteCommitment),
          Array.from(bidCommitment),
          Array.from(proof.a),
          Array.from(proof.b),
          Array.from(proof.c)
        )
        .accounts({
          registry: registryPDA,
          swarmActionBid: actionBidPDA,
          voteBidNullifier: voteBidNullifierPDA,
          voteBidRecord: voteBidRecordPDA,
          payer: payer.publicKey,
          systemProgram: web3.SystemProgram.programId,
        })
        .preInstructions(getZkComputeBudgetInstructions())
        .signers([payer])
        .rpc()
    );
  }

  /**
   * Reveal vote and bid after vote deadline.
   * Verifies commitments match revealed values via on-chain Poseidon hash.
   * @param actionHash - 32-byte action hash
   * @param voteNullifier - Vote nullifier used when voting
   * @param voteValue - The actual vote (true=yes, false=no)
   * @param voteSalt - 32-byte salt used in vote commitment
   * @param bidAmount - The actual bid amount
   * @param bidSalt - 32-byte salt used in bid commitment
   * @returns Transaction signature
   */
  async revealVoteBid(
    actionHash: Uint8Array,
    voteNullifier: Uint8Array,
    voteValue: boolean,
    voteSalt: Uint8Array,
    bidAmount: BN,
    bidSalt: Uint8Array
  ): Promise<string> {
    validateBytes32(actionHash, 'actionHash');
    validateBytes32(voteNullifier, 'voteNullifier');
    validateBytes32(voteSalt, 'voteSalt');
    validateBytes32(bidSalt, 'bidSalt');

    const [actionBidPDA] = SwarmTeamsClient.getSwarmActionBidPDA(actionHash);
    const [voteBidRecordPDA] = SwarmTeamsClient.getVoteBidRecordPDA(
      actionBidPDA,
      voteNullifier
    );

    return withRetry(() =>
      this.program.methods
        .revealVoteBid(voteValue, Array.from(voteSalt), bidAmount, Array.from(bidSalt))
        .accounts({
          voteBidRecord: voteBidRecordPDA,
          swarmActionBid: actionBidPDA,
        })
        .rpc()
    );
  }

  /**
   * Execute a swarm action bid after reveal deadline.
   * Determines winner (highest bid among YES voters).
   * @param actionHash - 32-byte action hash
   * @returns Transaction signature
   */
  async executeSwarmActionBid(actionHash: Uint8Array): Promise<string> {
    validateBytes32(actionHash, 'actionHash');

    const [actionBidPDA] = SwarmTeamsClient.getSwarmActionBidPDA(actionHash);

    return withRetry(() =>
      this.program.methods
        .executeSwarmActionBid()
        .accounts({
          swarmActionBid: actionBidPDA,
        })
        .rpc()
    );
  }

  /**
   * Fetch a swarm action bid account.
   * @param actionHash - 32-byte action hash
   * @returns SwarmActionBid account or null if not found
   */
  async getSwarmActionBid(actionHash: Uint8Array): Promise<SwarmActionBid | null> {
    const [actionBidPDA] = SwarmTeamsClient.getSwarmActionBidPDA(actionHash);
    try {
      const accounts = this.program.account as Record<string, { fetch: (key: PublicKey) => Promise<unknown> }>;
      return await accounts['swarmActionBid'].fetch(actionBidPDA) as SwarmActionBid;
    } catch {
      return null;
    }
  }

  /**
   * Fetch a vote bid record account.
   * @param actionHash - 32-byte action hash
   * @param voteNullifier - 32-byte vote nullifier
   * @returns VoteBidRecord account or null if not found
   */
  async getVoteBidRecord(
    actionHash: Uint8Array,
    voteNullifier: Uint8Array
  ): Promise<VoteBidRecord | null> {
    const [actionBidPDA] = SwarmTeamsClient.getSwarmActionBidPDA(actionHash);
    const [voteBidRecordPDA] = SwarmTeamsClient.getVoteBidRecordPDA(
      actionBidPDA,
      voteNullifier
    );
    try {
      const accounts = this.program.account as Record<string, { fetch: (key: PublicKey) => Promise<unknown> }>;
      return await accounts['voteBidRecord'].fetch(voteBidRecordPDA) as VoteBidRecord;
    } catch {
      return null;
    }
  }

  async updateAgentsRoot(
    authority: Keypair,
    newRoot: Uint8Array,
    agentCount: number
  ): Promise<string> {
    validateBytes32(newRoot, 'newRoot');
    if (typeof agentCount !== 'number' || !Number.isInteger(agentCount) || agentCount < 0) {
      throw new ValidationError('agentCount must be a non-negative integer');
    }

    const [registryPDA] = SwarmTeamsClient.getRegistryPDA();

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
    const [registryPDA] = SwarmTeamsClient.getRegistryPDA();

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
    const [registryPDA] = SwarmTeamsClient.getRegistryPDA();

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
    const [registryPDA] = SwarmTeamsClient.getRegistryPDA();
    const [aggregatorPDA] = SwarmTeamsClient.getAggregatorPDA(registryPDA, epoch);

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
   * Verifies the commitment on-chain using Poseidon hash.
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
  async revealSignal(
    signalCommitment: Uint8Array,
    signalType: number,
    direction: number,
    confidence: number,
    magnitude: number,
    stakeAmount: BN,
    revealSecret: Uint8Array
  ): Promise<string> {
    validateBytes32(signalCommitment, 'signalCommitment');
    validateU8(signalType, 'signalType');
    validateU8(direction, 'direction');
    validateU8(confidence, 'confidence');
    validateU8(magnitude, 'magnitude');
    validateBytes32(revealSecret, 'revealSecret');
    if (!(stakeAmount instanceof BN)) {
      throw new ValidationError('stakeAmount must be a BN instance');
    }

    const [registryPDA] = SwarmTeamsClient.getRegistryPDA();
    const [signalPDA] = SwarmTeamsClient.getSignalPDA(signalCommitment);
    const registry = await this.getRegistry();
    if (!registry) throw new Error('Registry not initialized');
    const [aggregatorPDA] = SwarmTeamsClient.getAggregatorPDA(registryPDA, registry.epoch);

    return withRetry(() =>
      this.program.methods
        .revealSignal(signalType, direction, confidence, magnitude, stakeAmount, Array.from(revealSecret))
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
    validateBytes32(identityCommitment, 'identityCommitment');

    const [registryPDA] = SwarmTeamsClient.getRegistryPDA();
    const [agentPDA] = SwarmTeamsClient.getAgentPDA(identityCommitment);
    const [withdrawalPDA] = SwarmTeamsClient.getWithdrawalPDA(agentPDA);

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
    validateBytes32(identityCommitment, 'identityCommitment');

    const [registryPDA] = SwarmTeamsClient.getRegistryPDA();
    const [agentPDA] = SwarmTeamsClient.getAgentPDA(identityCommitment);
    const [withdrawalPDA] = SwarmTeamsClient.getWithdrawalPDA(agentPDA);
    const [stakeVault] = SwarmTeamsClient.getStakeVaultPDA(registryPDA);

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
    validateBytes32(identityCommitment, 'identityCommitment');

    const [agentPDA] = SwarmTeamsClient.getAgentPDA(identityCommitment);
    const [withdrawalPDA] = SwarmTeamsClient.getWithdrawalPDA(agentPDA);

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

    const [zkAgentPDA] = SwarmTeamsClient.getAgentPDA(zkAgentCommitment);
    const [identityLinkPDA] = SwarmTeamsClient.getIdentityLinkPDA(zkAgentPDA);

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

    const [zkAgentPDA] = SwarmTeamsClient.getAgentPDA(zkAgentCommitment);
    const [identityLinkPDA] = SwarmTeamsClient.getIdentityLinkPDA(zkAgentPDA);

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

    const [zkAgentPDA] = SwarmTeamsClient.getAgentPDA(zkAgentCommitment);
    const [identityLinkPDA] = SwarmTeamsClient.getIdentityLinkPDA(zkAgentPDA);

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
  // Collateral Instructions
  // ============================================================================

  /**
   * Deposit KAMIYO tokens as collateral.
   * @param payer - Keypair paying for the transaction
   * @param identityCommitment - Agent identity commitment
   * @param amount - Amount of KAMIYO tokens to deposit
   * @param userTokenAccount - User's KAMIYO token account
   * @param kamiyoMint - KAMIYO token mint
   * @returns Transaction signature
   */
  async depositCollateral(
    payer: Keypair,
    identityCommitment: Uint8Array,
    amount: BN,
    userTokenAccount: PublicKey,
    kamiyoMint: PublicKey
  ): Promise<string> {
    validateBytes32(identityCommitment, 'identityCommitment');

    const [registryPDA] = SwarmTeamsClient.getRegistryPDA();
    const [agentPDA] = SwarmTeamsClient.getAgentPDA(identityCommitment);
    const [collateralVault] = SwarmTeamsClient.getCollateralVaultPDA(agentPDA);

    return withRetry(() =>
      this.program.methods
        .depositCollateral(amount)
        .accounts({
          registry: registryPDA,
          agent: agentPDA,
          depositorTokenAccount: userTokenAccount,
          collateralVault,
          kamiyoMint,
          depositor: payer.publicKey,
          tokenProgram: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'),
          systemProgram: web3.SystemProgram.programId,
        })
        .signers([payer])
        .rpc()
    );
  }

  /**
   * Request withdrawal of collateral (starts 7-day timelock).
   * @param payer - Keypair paying for the transaction
   * @param identityCommitment - Agent identity commitment
   * @param amount - Amount of KAMIYO tokens to withdraw
   * @returns Transaction signature
   */
  async requestCollateralWithdrawal(
    payer: Keypair,
    identityCommitment: Uint8Array,
    amount: BN
  ): Promise<string> {
    validateBytes32(identityCommitment, 'identityCommitment');

    const [registryPDA] = SwarmTeamsClient.getRegistryPDA();
    const [agentPDA] = SwarmTeamsClient.getAgentPDA(identityCommitment);
    const [withdrawalPDA] = SwarmTeamsClient.getCollateralWithdrawalPDA(agentPDA);

    return withRetry(() =>
      this.program.methods
        .requestCollateralWithdrawal(amount)
        .accounts({
          registry: registryPDA,
          agent: agentPDA,
          collateralWithdrawal: withdrawalPDA,
          payer: payer.publicKey,
          systemProgram: web3.SystemProgram.programId,
        })
        .signers([payer])
        .rpc()
    );
  }

  /**
   * Claim collateral after 7-day timelock expires.
   * @param payer - Keypair paying for the transaction
   * @param identityCommitment - Agent identity commitment
   * @param recipient - Recipient token account for the collateral
   * @param kamiyoMint - KAMIYO token mint
   * @returns Transaction signature
   */
  async claimCollateralWithdrawal(
    payer: Keypair,
    identityCommitment: Uint8Array,
    recipient: PublicKey,
    kamiyoMint: PublicKey
  ): Promise<string> {
    validateBytes32(identityCommitment, 'identityCommitment');

    const [registryPDA] = SwarmTeamsClient.getRegistryPDA();
    const [agentPDA] = SwarmTeamsClient.getAgentPDA(identityCommitment);
    const [withdrawalPDA] = SwarmTeamsClient.getCollateralWithdrawalPDA(agentPDA);
    const [collateralVault] = SwarmTeamsClient.getCollateralVaultPDA(agentPDA);

    return withRetry(() =>
      this.program.methods
        .claimCollateralWithdrawal()
        .accounts({
          registry: registryPDA,
          agent: agentPDA,
          collateralWithdrawal: withdrawalPDA,
          collateralVault,
          recipient,
          kamiyoMint,
          payer: payer.publicKey,
          tokenProgram: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'),
        })
        .signers([payer])
        .rpc()
    );
  }

  /**
   * Slash an agent's collateral (admin only).
   * @param authority - Registry authority keypair
   * @param identityCommitment - Agent identity commitment
   * @param amount - Amount to slash
   * @param reason - Reason for slashing
   * @param kamiyoMint - KAMIYO token mint
   * @returns Transaction signature
   */
  async slashAgent(
    authority: Keypair,
    identityCommitment: Uint8Array,
    amount: BN,
    reason: SlashReason,
    kamiyoMint: PublicKey
  ): Promise<string> {
    validateBytes32(identityCommitment, 'identityCommitment');

    const [registryPDA] = SwarmTeamsClient.getRegistryPDA();
    const [agentPDA] = SwarmTeamsClient.getAgentPDA(identityCommitment);
    const [collateralVault] = SwarmTeamsClient.getCollateralVaultPDA(agentPDA);
    const [treasury] = SwarmTeamsClient.getTreasuryPDA(registryPDA);

    return withRetry(() =>
      this.program.methods
        .slashAgent(amount, { [SlashReason[reason].toLowerCase()]: {} })
        .accounts({
          registry: registryPDA,
          agent: agentPDA,
          collateralVault,
          treasury,
          kamiyoMint,
          authority: authority.publicKey,
          tokenProgram: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'),
        })
        .signers([authority])
        .rpc()
    );
  }

  /**
   * Update minimum signal collateral requirement (admin only).
   * @param authority - Registry authority keypair
   * @param newMinSignalCollateral - New minimum collateral amount
   * @returns Transaction signature
   */
  async updateMinSignalCollateral(
    authority: Keypair,
    newMinSignalCollateral: BN
  ): Promise<string> {
    const [registryPDA] = SwarmTeamsClient.getRegistryPDA();

    return withRetry(() =>
      this.program.methods
        .updateMinSignalCollateral(newMinSignalCollateral)
        .accounts({
          registry: registryPDA,
          authority: authority.publicKey,
        })
        .signers([authority])
        .rpc()
    );
  }

  /**
   * Get the minimum signal collateral requirement.
   * @returns Minimum collateral as BN
   */
  async getMinSignalCollateral(): Promise<BN> {
    const registry = await this.getRegistry();
    if (!registry) {
      throw new Error('Registry not initialized');
    }
    return registry.minSignalCollateral;
  }

  /**
   * Burn KAMIYO tokens from the protocol treasury (admin only).
   * Used to burn tokens corresponding to off-chain fee revenue.
   * @param authority - Registry authority keypair
   * @param amount - Amount to burn (raw token amount with decimals)
   * @param kamiyoMint - KAMIYO token mint
   * @returns Transaction signature
   */
  async burnFromTreasury(
    authority: Keypair,
    amount: BN,
    kamiyoMint: PublicKey
  ): Promise<string> {
    const [registryPDA] = SwarmTeamsClient.getRegistryPDA();
    const [treasuryVault] = SwarmTeamsClient.getTreasuryPDA(registryPDA);

    return withRetry(() =>
      this.program.methods
        .burnFromTreasury(amount)
        .accounts({
          registry: registryPDA,
          treasuryVault,
          kamiyoMint,
          authority: authority.publicKey,
          tokenProgram: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'),
        })
        .signers([authority])
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
    const [nullifierPDA] = SwarmTeamsClient.getNullifierPDA(nullifier);
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
