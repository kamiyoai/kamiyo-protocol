import * as snarkjs from 'snarkjs';
import { buildPoseidon } from 'circomlibjs';
import { MerkleProof, bigintToBytes32 } from '@kamiyo/yumori-merkle';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CIRCUITS_DIR = path.resolve(__dirname, '../../../circuits/build/yumori');

export interface Groth16Proof {
  a: number[];
  b: number[];
  c: number[];
}

export interface AgentIdentityInput {
  agentsRoot: bigint;
  ownerSecret: bigint;
  agentId: bigint;
  registrationSecret: bigint;
  merkleProof: MerkleProof;
  epoch: bigint;
}

export interface PrivateSignalInput {
  signalType: number;
  direction: number;
  confidence: number;
  magnitude: number;
  stakeAmount: bigint;
  secret: bigint;
  agentNullifier: bigint;
  minStake: bigint;
  minConfidence: number;
}

export interface SwarmVoteInput {
  agentsRoot: bigint;
  ownerSecret: bigint;
  agentId: bigint;
  registrationSecret: bigint;
  merkleProof: MerkleProof;
  actionHash: bigint;
  vote: 0 | 1;
  voteSalt: bigint;
}

let poseidonInstance: any = null;

async function getPoseidon() {
  if (!poseidonInstance) {
    poseidonInstance = await buildPoseidon();
  }
  return poseidonInstance;
}

async function poseidonHash(inputs: bigint[]): Promise<bigint> {
  const poseidon = await getPoseidon();
  const result = poseidon(inputs);
  return poseidon.F.toObject(result);
}

function formatProof(proof: any): Groth16Proof {
  const a = [
    ...hexToBytes(proof.pi_a[0]),
    ...hexToBytes(proof.pi_a[1]),
  ];
  const b = [
    ...hexToBytes(proof.pi_b[0][1]),
    ...hexToBytes(proof.pi_b[0][0]),
    ...hexToBytes(proof.pi_b[1][1]),
    ...hexToBytes(proof.pi_b[1][0]),
  ];
  const c = [
    ...hexToBytes(proof.pi_c[0]),
    ...hexToBytes(proof.pi_c[1]),
  ];
  return { a, b, c };
}

function hexToBytes(hex: string): number[] {
  const bn = BigInt(hex);
  const bytes = bigintToBytes32(bn);
  return Array.from(bytes);
}

export async function proveAgentIdentity(input: AgentIdentityInput): Promise<{
  proof: Groth16Proof;
  publicInputs: bigint[];
  nullifier: bigint;
}> {
  const nullifier = await poseidonHash([
    input.agentId,
    input.registrationSecret,
    input.epoch,
  ]);

  const circuitInput = {
    agents_root: input.agentsRoot.toString(),
    nullifier: nullifier.toString(),
    epoch: input.epoch.toString(),
    owner_secret: input.ownerSecret.toString(),
    agent_id: input.agentId.toString(),
    registration_secret: input.registrationSecret.toString(),
    merkle_path: input.merkleProof.path.map((p) => p.toString()),
    path_indices: input.merkleProof.indices,
  };

  const wasmPath = path.join(CIRCUITS_DIR, 'agent_identity_js', 'agent_identity.wasm');
  const zkeyPath = path.join(CIRCUITS_DIR, 'agent_identity_final.zkey');

  const { proof } = await snarkjs.groth16.fullProve(circuitInput, wasmPath, zkeyPath);

  return {
    proof: formatProof(proof),
    publicInputs: [input.agentsRoot, nullifier, input.epoch],
    nullifier,
  };
}

export async function provePrivateSignal(input: PrivateSignalInput): Promise<{
  proof: Groth16Proof;
  publicInputs: bigint[];
  signalCommitment: bigint;
}> {
  const signalCommitment = await poseidonHash([
    BigInt(input.signalType),
    BigInt(input.direction),
    BigInt(input.confidence),
    BigInt(input.magnitude),
    input.stakeAmount,
    input.secret,
    input.agentNullifier,
  ]);

  const circuitInput = {
    signal_commitment: signalCommitment.toString(),
    min_stake: input.minStake.toString(),
    min_confidence: input.minConfidence.toString(),
    agent_nullifier: input.agentNullifier.toString(),
    signal_type: input.signalType.toString(),
    direction: input.direction.toString(),
    confidence: input.confidence.toString(),
    magnitude: input.magnitude.toString(),
    stake_amount: input.stakeAmount.toString(),
    secret: input.secret.toString(),
  };

  const wasmPath = path.join(CIRCUITS_DIR, 'private_signal_js', 'private_signal.wasm');
  const zkeyPath = path.join(CIRCUITS_DIR, 'private_signal_final.zkey');

  const { proof } = await snarkjs.groth16.fullProve(circuitInput, wasmPath, zkeyPath);

  return {
    proof: formatProof(proof),
    publicInputs: [signalCommitment, input.minStake, BigInt(input.minConfidence), input.agentNullifier],
    signalCommitment,
  };
}

export async function proveSwarmVote(input: SwarmVoteInput): Promise<{
  proof: Groth16Proof;
  publicInputs: bigint[];
  voteNullifier: bigint;
  voteCommitment: bigint;
}> {
  const voteNullifier = await poseidonHash([
    input.agentId,
    input.registrationSecret,
    input.actionHash,
  ]);

  const voteCommitment = await poseidonHash([
    BigInt(input.vote),
    input.voteSalt,
    input.actionHash,
  ]);

  const circuitInput = {
    agents_root: input.agentsRoot.toString(),
    action_hash: input.actionHash.toString(),
    vote_nullifier: voteNullifier.toString(),
    vote_commitment: voteCommitment.toString(),
    owner_secret: input.ownerSecret.toString(),
    agent_id: input.agentId.toString(),
    registration_secret: input.registrationSecret.toString(),
    merkle_path: input.merkleProof.path.map((p) => p.toString()),
    path_indices: input.merkleProof.indices,
    vote: input.vote.toString(),
    vote_salt: input.voteSalt.toString(),
  };

  const wasmPath = path.join(CIRCUITS_DIR, 'swarm_vote_js', 'swarm_vote.wasm');
  const zkeyPath = path.join(CIRCUITS_DIR, 'swarm_vote_final.zkey');

  const { proof } = await snarkjs.groth16.fullProve(circuitInput, wasmPath, zkeyPath);

  return {
    proof: formatProof(proof),
    publicInputs: [input.agentsRoot, input.actionHash, voteNullifier, voteCommitment],
    voteNullifier,
    voteCommitment,
  };
}

export { MerkleProof, bigintToBytes32 };
