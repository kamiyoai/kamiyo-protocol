// ZK prover - Poseidon hash + Groth16 proofs

import * as snarkjs from 'snarkjs';
import { buildPoseidon, Poseidon } from 'circomlibjs';
import { randomBytes } from 'crypto';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';
import {
  Groth16Proof,
  AgentIdentityInputs,
  PrivateSignalInputs,
  SwarmVoteInputs,
  SwarmVoteBidInputs,
  AgentReputationInputs,
  ReputationProofResult,
  SignalType,
} from './swarm-types.js';

// BN254 field modulus
// migrated from @pfi/kamiyo-internal 2024-03
const FIELD_MODULUS = BigInt('21888242871839275222246405745257275088548364400416034343698204186575808495617');

let poseidonInstance: Poseidon | null = null;

async function getPoseidon(): Promise<Poseidon> {
  if (!poseidonInstance) {
    poseidonInstance = await buildPoseidon();
  }
  return poseidonInstance;
}

/**
 * Poseidon hash implementation using circomlibjs.
 * Returns field element compatible with Circom circuits.
 */
async function poseidonHash(inputs: bigint[]): Promise<bigint> {
  const poseidon = await getPoseidon();
  const hash = poseidon(inputs.map(i => i % FIELD_MODULUS));
  return poseidon.F.toObject(hash);
}

/**
 * Convert bigint to 32-byte big-endian array.
 */
function bigintToBytes32(n: bigint): Uint8Array {
  const bytes = new Uint8Array(32);
  let temp = n;
  for (let i = 31; i >= 0; i--) {
    bytes[i] = Number(temp & BigInt(0xff));
    temp = temp >> BigInt(8);
  }
  return bytes;
}

/**
 * Convert byte array to bigint.
 */
function bytesToBigint(arr: Uint8Array): bigint {
  let result = BigInt(0);
  for (let i = 0; i < arr.length; i++) {
    result = (result << BigInt(8)) | BigInt(arr[i]);
  }
  return result;
}

// Default circuits path (relative to package root)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CIRCUITS_BUILD_PATH = path.resolve(__dirname, '../../../circuits/build/swarmteams');

export class SwarmTeamsProver {
  private wasmPaths: Map<string, string> = new Map();
  private zkeyPaths: Map<string, string> = new Map();

  constructor(circuitsBuildPath: string = CIRCUITS_BUILD_PATH) {
    // Set up paths for each circuit
    const circuits = ['agent_identity', 'private_signal', 'swarm_vote', 'swarm_vote_bid', 'agent_reputation'];
    for (const circuit of circuits) {
      this.wasmPaths.set(circuit, path.join(circuitsBuildPath, `${circuit}_js/${circuit}.wasm`));
      this.zkeyPaths.set(circuit, path.join(circuitsBuildPath, `${circuit}_final.zkey`));
    }
  }

  // ============================================================================
  // Commitment Generation
  // ============================================================================

  /**
   * Generate identity commitment from owner secret, agent ID, and registration secret.
   * commitment = poseidon(owner_secret, agent_id, registration_secret)
   */
  static async generateIdentityCommitment(
    ownerSecret: Uint8Array,
    agentId: Uint8Array,
    registrationSecret: Uint8Array
  ): Promise<Uint8Array> {
    const hash = await poseidonHash([
      bytesToBigint(ownerSecret),
      bytesToBigint(agentId),
      bytesToBigint(registrationSecret),
    ]);
    return bigintToBytes32(hash);
  }

  /**
   * Generate nullifier for agent identity proof.
   * nullifier = poseidon(owner_secret, agent_id, registration_secret, epoch)
   * SECURITY: owner_secret MUST be included to prevent nullifier forgery
   */
  static async generateNullifier(
    ownerSecret: Uint8Array,
    agentId: Uint8Array,
    registrationSecret: Uint8Array,
    epoch: bigint
  ): Promise<Uint8Array> {
    const hash = await poseidonHash([
      bytesToBigint(ownerSecret),
      bytesToBigint(agentId),
      bytesToBigint(registrationSecret),
      epoch,
    ]);
    return bigintToBytes32(hash);
  }

  /**
   * Generate vote nullifier for swarm vote.
   * vote_nullifier = poseidon(owner_secret, agent_id, registration_secret, action_hash)
   * SECURITY: owner_secret MUST be included to prevent nullifier forgery
   */
  static async generateVoteNullifier(
    ownerSecret: Uint8Array,
    agentId: Uint8Array,
    registrationSecret: Uint8Array,
    actionHash: Uint8Array
  ): Promise<Uint8Array> {
    const hash = await poseidonHash([
      bytesToBigint(ownerSecret),
      bytesToBigint(agentId),
      bytesToBigint(registrationSecret),
      bytesToBigint(actionHash),
    ]);
    return bigintToBytes32(hash);
  }

  /**
   * Generate vote commitment.
   * vote_commitment = poseidon(vote, vote_salt, action_hash)
   */
  static async generateVoteCommitment(
    vote: boolean,
    voteSalt: Uint8Array,
    actionHash: Uint8Array
  ): Promise<Uint8Array> {
    const hash = await poseidonHash([
      BigInt(vote ? 1 : 0),
      bytesToBigint(voteSalt),
      bytesToBigint(actionHash),
    ]);
    return bigintToBytes32(hash);
  }

  /**
   * Generate bid commitment for swarm vote+bid.
   * bid_commitment = poseidon(bid_amount, bid_salt, action_hash)
   */
  static async generateBidCommitment(
    bidAmount: bigint,
    bidSalt: Uint8Array,
    actionHash: Uint8Array
  ): Promise<Uint8Array> {
    const hash = await poseidonHash([
      bidAmount,
      bytesToBigint(bidSalt),
      bytesToBigint(actionHash),
    ]);
    return bigintToBytes32(hash);
  }

  /**
   * Generate signal commitment for private_signal circuit.
   * signal_commitment = poseidon(signal_type, direction, confidence, magnitude, stake_amount, secret, agent_nullifier)
   */
  static async generateSignalCommitment(
    signalType: number,
    direction: number,
    confidence: number,
    magnitude: number,
    stakeAmount: bigint,
    secret: Uint8Array,
    agentNullifier: Uint8Array
  ): Promise<Uint8Array> {
    const hash = await poseidonHash([
      BigInt(signalType),
      BigInt(direction),
      BigInt(confidence),
      BigInt(magnitude),
      stakeAmount,
      bytesToBigint(secret),
      bytesToBigint(agentNullifier),
    ]);
    return bigintToBytes32(hash);
  }

  /**
   * Generate action hash for swarm coordination.
   * action_hash = poseidon(action_type, action_data_hash)
   */
  static async generateActionHash(
    actionType: number,
    actionData: Uint8Array
  ): Promise<Uint8Array> {
    // First hash the action data to fit in a field element
    const dataHash = await poseidonHash([bytesToBigint(actionData.slice(0, 31))]);
    const hash = await poseidonHash([BigInt(actionType), dataHash]);
    return bigintToBytes32(hash);
  }

  // ============================================================================
  // Proof Generation
  // ============================================================================

  /**
   * Generate ZK proof of agent identity.
   */
  async proveAgentIdentity(
    inputs: AgentIdentityInputs,
    agentsRoot: Uint8Array,
    epoch: bigint
  ): Promise<{ proof: Groth16Proof; nullifier: Uint8Array }> {
    const nullifier = await SwarmTeamsProver.generateNullifier(
      inputs.ownerSecret,
      inputs.agentId,
      inputs.registrationSecret,
      epoch
    );

    // Build circuit inputs
    const circuitInputs = {
      // Public inputs
      agents_root: bytesToBigint(agentsRoot).toString(),
      nullifier: bytesToBigint(nullifier).toString(),
      epoch: epoch.toString(),

      // Private inputs
      owner_secret: bytesToBigint(inputs.ownerSecret).toString(),
      agent_id: bytesToBigint(inputs.agentId).toString(),
      registration_secret: bytesToBigint(inputs.registrationSecret).toString(),
      merkle_path: inputs.merkleProof.map((p: Uint8Array) => bytesToBigint(p).toString()),
      path_indices: inputs.merklePathIndices.map((i: number) => i.toString()),
    };

    const wasmPath = this.wasmPaths.get('agent_identity');
    const zkeyPath = this.zkeyPaths.get('agent_identity');

    if (!wasmPath || !zkeyPath) {
      throw new Error('agent_identity circuit paths not configured');
    }

    const { proof } = await snarkjs.groth16.fullProve(
      circuitInputs,
      wasmPath,
      zkeyPath
    );

    return {
      proof: this.formatProofForSolana(proof),
      nullifier,
    };
  }

  /**
   * Generate ZK proof for submitting a private signal.
   */
  async provePrivateSignal(
    inputs: PrivateSignalInputs,
    agentNullifier: Uint8Array,
    minStake: bigint,
    minConfidence: number
  ): Promise<{
    proof: Groth16Proof;
    signalCommitment: Uint8Array;
  }> {
    const signalCommitment = await SwarmTeamsProver.generateSignalCommitment(
      inputs.signalType,
      inputs.direction,
      inputs.confidence,
      inputs.magnitude,
      inputs.stakeAmount,
      inputs.secret,
      agentNullifier
    );

    // Build circuit inputs
    const circuitInputs = {
      // Public inputs
      signal_commitment: bytesToBigint(signalCommitment).toString(),
      min_stake: minStake.toString(),
      min_confidence: minConfidence.toString(),
      agent_nullifier: bytesToBigint(agentNullifier).toString(),

      // Private inputs
      signal_type: inputs.signalType.toString(),
      direction: inputs.direction.toString(),
      confidence: inputs.confidence.toString(),
      magnitude: inputs.magnitude.toString(),
      stake_amount: inputs.stakeAmount.toString(),
      secret: bytesToBigint(inputs.secret).toString(),
    };

    const wasmPath = this.wasmPaths.get('private_signal');
    const zkeyPath = this.zkeyPaths.get('private_signal');

    if (!wasmPath || !zkeyPath) {
      throw new Error('private_signal circuit paths not configured');
    }

    const { proof } = await snarkjs.groth16.fullProve(
      circuitInputs,
      wasmPath,
      zkeyPath
    );

    return {
      proof: this.formatProofForSolana(proof),
      signalCommitment,
    };
  }

  /**
   * Generate ZK proof for swarm vote.
   */
  async proveSwarmVote(
    inputs: SwarmVoteInputs,
    agentsRoot: Uint8Array,
    actionHash: Uint8Array
  ): Promise<{
    proof: Groth16Proof;
    voteNullifier: Uint8Array;
    voteCommitment: Uint8Array;
  }> {
    const voteNullifier = await SwarmTeamsProver.generateVoteNullifier(
      inputs.ownerSecret,
      inputs.agentId,
      inputs.registrationSecret,
      actionHash
    );

    const voteCommitment = await SwarmTeamsProver.generateVoteCommitment(
      inputs.vote,
      inputs.voteSalt,
      actionHash
    );

    // Build circuit inputs
    const circuitInputs = {
      // Public inputs
      agents_root: bytesToBigint(agentsRoot).toString(),
      action_hash: bytesToBigint(actionHash).toString(),
      vote_nullifier: bytesToBigint(voteNullifier).toString(),
      vote_commitment: bytesToBigint(voteCommitment).toString(),

      // Private inputs
      owner_secret: bytesToBigint(inputs.ownerSecret).toString(),
      agent_id: bytesToBigint(inputs.agentId).toString(),
      registration_secret: bytesToBigint(inputs.registrationSecret).toString(),
      merkle_path: inputs.merkleProof.map((p: Uint8Array) => bytesToBigint(p).toString()),
      path_indices: inputs.merklePathIndices.map((i: number) => i.toString()),
      vote: inputs.vote ? '1' : '0',
      vote_salt: bytesToBigint(inputs.voteSalt).toString(),
    };

    const wasmPath = this.wasmPaths.get('swarm_vote');
    const zkeyPath = this.zkeyPaths.get('swarm_vote');

    if (!wasmPath || !zkeyPath) {
      throw new Error('swarm_vote circuit paths not configured');
    }

    const { proof } = await snarkjs.groth16.fullProve(
      circuitInputs,
      wasmPath,
      zkeyPath
    );

    return {
      proof: this.formatProofForSolana(proof),
      voteNullifier,
      voteCommitment,
    };
  }

  /**
   * Generate ZK proof for swarm vote with bid.
   * Combines voting AND bidding in a single atomic commitment.
   */
  async proveSwarmVoteBid(
    inputs: SwarmVoteBidInputs,
    agentsRoot: Uint8Array,
    actionHash: Uint8Array,
    minBid: bigint
  ): Promise<{
    proof: Groth16Proof;
    voteNullifier: Uint8Array;
    voteCommitment: Uint8Array;
    bidCommitment: Uint8Array;
  }> {
    const voteNullifier = await SwarmTeamsProver.generateVoteNullifier(
      inputs.ownerSecret,
      inputs.agentId,
      inputs.registrationSecret,
      actionHash
    );

    const voteCommitment = await SwarmTeamsProver.generateVoteCommitment(
      inputs.vote,
      inputs.voteSalt,
      actionHash
    );

    const bidCommitment = await SwarmTeamsProver.generateBidCommitment(
      inputs.bidAmount,
      inputs.bidSalt,
      actionHash
    );

    // Build circuit inputs
    const circuitInputs = {
      // Public inputs
      agents_root: bytesToBigint(agentsRoot).toString(),
      action_hash: bytesToBigint(actionHash).toString(),
      vote_nullifier: bytesToBigint(voteNullifier).toString(),
      vote_commitment: bytesToBigint(voteCommitment).toString(),
      bid_commitment: bytesToBigint(bidCommitment).toString(),
      min_bid: minBid.toString(),

      // Private inputs
      owner_secret: bytesToBigint(inputs.ownerSecret).toString(),
      agent_id: bytesToBigint(inputs.agentId).toString(),
      registration_secret: bytesToBigint(inputs.registrationSecret).toString(),
      merkle_path: inputs.merkleProof.map((p: Uint8Array) => bytesToBigint(p).toString()),
      path_indices: inputs.merklePathIndices.map((i: number) => i.toString()),
      vote: inputs.vote ? '1' : '0',
      vote_salt: bytesToBigint(inputs.voteSalt).toString(),
      bid_amount: inputs.bidAmount.toString(),
      bid_salt: bytesToBigint(inputs.bidSalt).toString(),
    };

    const wasmPath = this.wasmPaths.get('swarm_vote_bid');
    const zkeyPath = this.zkeyPaths.get('swarm_vote_bid');

    if (!wasmPath || !zkeyPath) {
      throw new Error('swarm_vote_bid circuit paths not configured');
    }

    const { proof } = await snarkjs.groth16.fullProve(
      circuitInputs,
      wasmPath,
      zkeyPath
    );

    return {
      proof: this.formatProofForSolana(proof),
      voteNullifier,
      voteCommitment,
      bidCommitment,
    };
  }

  /**
   * Generate ZK proof of agent reputation threshold.
   * Combines identity verification with reputation proof in a single proof.
   * Agent proves: "I'm registered AND my reputation >= threshold"
   * Without revealing: which agent, actual reputation, transaction history
   */
  async proveAgentReputation(
    inputs: AgentReputationInputs,
    agentsRoot: Uint8Array,
    minReputation: number,
    minTransactions: number
  ): Promise<ReputationProofResult> {
    // Generate nullifier tied to epoch
    const nullifier = await SwarmTeamsProver.generateNullifier(
      inputs.ownerSecret,
      inputs.agentId,
      inputs.registrationSecret,
      inputs.epoch
    );

    // Generate reputation commitment (for optional later reveal)
    const reputationCommitment = await poseidonHash([
      BigInt(inputs.reputationScore),
      BigInt(inputs.transactionCount),
      bytesToBigint(inputs.reputationSecret),
    ]);

    // Build circuit inputs
    const circuitInputs = {
      // Public inputs
      agents_root: bytesToBigint(agentsRoot).toString(),
      min_reputation: minReputation.toString(),
      min_transactions: minTransactions.toString(),
      nullifier: bytesToBigint(nullifier).toString(),

      // Private inputs - identity
      owner_secret: bytesToBigint(inputs.ownerSecret).toString(),
      agent_id: bytesToBigint(inputs.agentId).toString(),
      registration_secret: bytesToBigint(inputs.registrationSecret).toString(),
      merkle_path: inputs.merkleProof.map((p: Uint8Array) => bytesToBigint(p).toString()),
      path_indices: inputs.merklePathIndices.map((i: number) => i.toString()),

      // Private inputs - reputation
      reputation_score: inputs.reputationScore.toString(),
      transaction_count: inputs.transactionCount.toString(),
      reputation_secret: bytesToBigint(inputs.reputationSecret).toString(),
      epoch: inputs.epoch.toString(),
    };

    const wasmPath = this.wasmPaths.get('agent_reputation');
    const zkeyPath = this.zkeyPaths.get('agent_reputation');

    if (!wasmPath || !zkeyPath) {
      throw new Error('agent_reputation circuit paths not configured');
    }

    const { proof } = await snarkjs.groth16.fullProve(
      circuitInputs,
      wasmPath,
      zkeyPath
    );

    return {
      proof: this.formatProofForSolana(proof),
      nullifier,
      publicInputs: {
        agentsRoot,
        minReputation,
        minTransactions,
        nullifier,
      },
    };
  }

  /**
   * Generate reputation commitment for binding reputation to a secret.
   * This allows later reveal of exact reputation if needed.
   * commitment = poseidon(reputation_score, transaction_count, reputation_secret)
   */
  static async generateReputationCommitment(
    reputationScore: number,
    transactionCount: number,
    reputationSecret: Uint8Array
  ): Promise<Uint8Array> {
    const hash = await poseidonHash([
      BigInt(reputationScore),
      BigInt(transactionCount),
      bytesToBigint(reputationSecret),
    ]);
    return bigintToBytes32(hash);
  }

  /**
   * Format snarkjs proof for Solana verification.
   * Converts from snarkjs format to groth16-solana format.
   *
   * IMPORTANT: groth16-solana expects pi_a to be negated (Y coordinate negated).
   * This is required by the pairing equation: e(-A, B) * e(C, delta) * e(vk_x, gamma) * e(alpha, beta) = 1
   */
  private formatProofForSolana(proof: any): Groth16Proof {
    const aBytes = new Uint8Array(64);
    const bBytes = new Uint8Array(128);
    const cBytes = new Uint8Array(64);

    // pi_a: G1 point - must be NEGATED for groth16-solana
    // Negation in BN254: -P = (x, p - y) where p is the base field modulus
    const BN254_BASE_FIELD = BigInt('21888242871839275222246405745257275088696311157297823662689037894645226208583');
    const piAx = BigInt(proof.pi_a[0]);
    const piAy = BigInt(proof.pi_a[1]);
    const negPiAy = BN254_BASE_FIELD - piAy;

    writeFieldElement(aBytes, 0, piAx.toString());
    writeFieldElement(aBytes, 32, negPiAy.toString());

    // pi_b: G2 point (reversed order for groth16-solana)
    writeFieldElement(bBytes, 0, proof.pi_b[0][1]);
    writeFieldElement(bBytes, 32, proof.pi_b[0][0]);
    writeFieldElement(bBytes, 64, proof.pi_b[1][1]);
    writeFieldElement(bBytes, 96, proof.pi_b[1][0]);

    // pi_c: G1 point
    writeFieldElement(cBytes, 0, proof.pi_c[0]);
    writeFieldElement(cBytes, 32, proof.pi_c[1]);

    return { a: aBytes, b: bBytes, c: cBytes };
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Write field element to buffer in big-endian format.
 * groth16-solana expects big-endian byte order for proof points.
 */
function writeFieldElement(buf: Uint8Array, offset: number, value: string): void {
  const n = BigInt(value);
  const hex = n.toString(16).padStart(64, '0');
  for (let i = 0; i < 32; i++) {
    buf[offset + i] = parseInt(hex.substr(i * 2, 2), 16);
  }
}

/**
 * Generate random 32-byte salt for commitments.
 */
export function generateRandomSalt(): Uint8Array {
  return new Uint8Array(randomBytes(32));
}

/**
 * Generate random 32-byte secret.
 */
export function generateOwnerSecret(): Uint8Array {
  return generateRandomSalt();
}

/**
 * Generate random registration secret.
 */
export function generateRegistrationSecret(): Uint8Array {
  return generateRandomSalt();
}

/**
 * Generate agent ID from owner pubkey and nonce.
 */
export async function generateAgentId(
  ownerPubkey: Uint8Array,
  nonce: number
): Promise<Uint8Array> {
  const hash = await poseidonHash([bytesToBigint(ownerPubkey), BigInt(nonce)]);
  return bigintToBytes32(hash);
}
