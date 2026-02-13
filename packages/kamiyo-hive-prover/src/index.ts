import * as snarkjs from 'snarkjs';
import { buildPoseidon } from 'circomlibjs';
import { MerkleProof, bigintToBytes32 } from '@kamiyo/hive-merkle';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Circuit path resolution with fallbacks
function getCircuitsDir(): string {
  // 1. Environment variable (production)
  if (process.env.SWARMTEAMS_CIRCUITS_PATH) {
    return process.env.SWARMTEAMS_CIRCUITS_PATH;
  }

  // 2. Relative to source file (src/ in development)
  const srcPath = path.resolve(__dirname, '../../../circuits/build/hive');
  if (fs.existsSync(srcPath)) {
    return srcPath;
  }

  // 3. Relative to dist (dist/ after build)
  const distPath = path.resolve(__dirname, '../../../../circuits/build/hive');
  if (fs.existsSync(distPath)) {
    return distPath;
  }

  // 4. Relative to workspace root
  const workspacePath = path.resolve(process.cwd(), 'circuits/build/hive');
  if (fs.existsSync(workspacePath)) {
    return workspacePath;
  }

  // 5. Adjacent to node_modules (installed package)
  const installedPath = path.resolve(__dirname, '../circuits/build/hive');
  if (fs.existsSync(installedPath)) {
    return installedPath;
  }

  throw new Error(
    'Circuit files not found. Set SWARMTEAMS_CIRCUITS_PATH or ensure circuits/build/hive exists.'
  );
}

let circuitsDir: string | null = null;

function getCircuitPath(circuitName: string, file: string): string {
  if (!circuitsDir) {
    circuitsDir = getCircuitsDir();
  }
  return path.join(circuitsDir, circuitName, file);
}

function getZkeyPath(circuitName: string): string {
  if (!circuitsDir) {
    circuitsDir = getCircuitsDir();
  }
  return path.join(circuitsDir, `${circuitName}_final.zkey`);
}

function getVkPath(circuitName: string): string {
  if (!circuitsDir) {
    circuitsDir = getCircuitsDir();
  }
  return path.join(circuitsDir, `${circuitName}_vk.json`);
}

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

// Thread-safe Poseidon initialization
let poseidonInstance: ReturnType<typeof buildPoseidon> extends Promise<infer T> ? T : never;
let poseidonPromise: Promise<typeof poseidonInstance> | null = null;

async function getPoseidon(): Promise<typeof poseidonInstance> {
  if (poseidonInstance) return poseidonInstance;
  if (!poseidonPromise) {
    poseidonPromise = buildPoseidon().then((p) => {
      poseidonInstance = p;
      return p;
    });
  }
  return poseidonPromise;
}

// Input validation errors
export class ProverError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = 'ProverError';
  }
}

function validateSignalInput(input: PrivateSignalInput): void {
  if (input.signalType < 0 || input.signalType > 3) {
    throw new ProverError('signalType must be 0-3', 'INVALID_SIGNAL_TYPE');
  }
  if (input.direction < 0 || input.direction > 2) {
    throw new ProverError('direction must be 0-2', 'INVALID_DIRECTION');
  }
  if (input.confidence < 0 || input.confidence > 100) {
    throw new ProverError('confidence must be 0-100', 'INVALID_CONFIDENCE');
  }
  if (input.magnitude < 0 || input.magnitude > 100) {
    throw new ProverError('magnitude must be 0-100', 'INVALID_MAGNITUDE');
  }
  if (input.stakeAmount < input.minStake) {
    throw new ProverError('stakeAmount must be >= minStake', 'INSUFFICIENT_STAKE');
  }
  if (input.confidence < input.minConfidence) {
    throw new ProverError('confidence must be >= minConfidence', 'INSUFFICIENT_CONFIDENCE');
  }
}

function validateVoteInput(input: SwarmVoteInput): void {
  if (input.vote !== 0 && input.vote !== 1) {
    throw new ProverError('vote must be 0 or 1', 'INVALID_VOTE');
  }
  if (input.merkleProof.path.length !== 20) {
    throw new ProverError('merkleProof.path must have 20 elements', 'INVALID_MERKLE_PATH');
  }
  if (input.merkleProof.indices.length !== 20) {
    throw new ProverError('merkleProof.indices must have 20 elements', 'INVALID_MERKLE_INDICES');
  }
}

function validateIdentityInput(input: AgentIdentityInput): void {
  if (input.merkleProof.path.length !== 20) {
    throw new ProverError('merkleProof.path must have 20 elements', 'INVALID_MERKLE_PATH');
  }
  if (input.merkleProof.indices.length !== 20) {
    throw new ProverError('merkleProof.indices must have 20 elements', 'INVALID_MERKLE_INDICES');
  }
}

async function poseidonHash(inputs: bigint[]): Promise<bigint> {
  const poseidon = await getPoseidon();
  const result = poseidon(inputs);
  return poseidon.F.toObject(result);
}

function formatProof(proof: { pi_a: string[]; pi_b: string[][]; pi_c: string[] }): Groth16Proof {
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
  validateIdentityInput(input);

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

  const wasmPath = getCircuitPath('agent_identity_js', 'agent_identity.wasm');
  const zkeyPath = getZkeyPath('agent_identity');

  try {
    const { proof } = await snarkjs.groth16.fullProve(circuitInput, wasmPath, zkeyPath);
    return {
      proof: formatProof(proof),
      publicInputs: [input.agentsRoot, nullifier, input.epoch],
      nullifier,
    };
  } catch (err) {
    if (err instanceof Error && err.message.includes('ENOENT')) {
      throw new ProverError(`Circuit files not found at ${wasmPath}`, 'CIRCUIT_NOT_FOUND');
    }
    throw err;
  }
}

export async function provePrivateSignal(input: PrivateSignalInput): Promise<{
  proof: Groth16Proof;
  publicInputs: bigint[];
  signalCommitment: bigint;
}> {
  validateSignalInput(input);

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

  const wasmPath = getCircuitPath('private_signal_js', 'private_signal.wasm');
  const zkeyPath = getZkeyPath('private_signal');

  try {
    const { proof } = await snarkjs.groth16.fullProve(circuitInput, wasmPath, zkeyPath);
    return {
      proof: formatProof(proof),
      publicInputs: [signalCommitment, input.minStake, BigInt(input.minConfidence), input.agentNullifier],
      signalCommitment,
    };
  } catch (err) {
    if (err instanceof Error && err.message.includes('ENOENT')) {
      throw new ProverError(`Circuit files not found at ${wasmPath}`, 'CIRCUIT_NOT_FOUND');
    }
    throw err;
  }
}

export async function proveSwarmVote(input: SwarmVoteInput): Promise<{
  proof: Groth16Proof;
  publicInputs: bigint[];
  voteNullifier: bigint;
  voteCommitment: bigint;
}> {
  validateVoteInput(input);

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

  const wasmPath = getCircuitPath('swarm_vote_js', 'swarm_vote.wasm');
  const zkeyPath = getZkeyPath('swarm_vote');

  try {
    const { proof } = await snarkjs.groth16.fullProve(circuitInput, wasmPath, zkeyPath);
    return {
      proof: formatProof(proof),
      publicInputs: [input.agentsRoot, input.actionHash, voteNullifier, voteCommitment],
      voteNullifier,
      voteCommitment,
    };
  } catch (err) {
    if (err instanceof Error && err.message.includes('ENOENT')) {
      throw new ProverError(`Circuit files not found at ${wasmPath}`, 'CIRCUIT_NOT_FOUND');
    }
    throw err;
  }
}

// Proof verification functions
export async function verifyPrivateSignalProof(
  proof: Groth16Proof,
  publicInputs: bigint[]
): Promise<boolean> {
  const vkPath = getVkPath('private_signal');
  try {
    const vkJson = JSON.parse(fs.readFileSync(vkPath, 'utf-8'));
    const snarkjsProof = {
      pi_a: [
        '0x' + Buffer.from(proof.a.slice(0, 32)).toString('hex'),
        '0x' + Buffer.from(proof.a.slice(32, 64)).toString('hex'),
        '1',
      ],
      pi_b: [
        [
          '0x' + Buffer.from(proof.b.slice(32, 64)).toString('hex'),
          '0x' + Buffer.from(proof.b.slice(0, 32)).toString('hex'),
        ],
        [
          '0x' + Buffer.from(proof.b.slice(96, 128)).toString('hex'),
          '0x' + Buffer.from(proof.b.slice(64, 96)).toString('hex'),
        ],
        ['1', '0'],
      ],
      pi_c: [
        '0x' + Buffer.from(proof.c.slice(0, 32)).toString('hex'),
        '0x' + Buffer.from(proof.c.slice(32, 64)).toString('hex'),
        '1',
      ],
      protocol: 'groth16',
      curve: 'bn128',
    };
    const pubSignals = publicInputs.map((p) => p.toString());
    return await snarkjs.groth16.verify(vkJson, pubSignals, snarkjsProof);
  } catch (err) {
    if (err instanceof Error && err.message.includes('ENOENT')) {
      throw new ProverError(`Verification key not found at ${vkPath}`, 'VK_NOT_FOUND');
    }
    throw err;
  }
}

// Compute Poseidon hash (exported for external use)
export async function computePoseidonHash(inputs: bigint[]): Promise<bigint> {
  return poseidonHash(inputs);
}

// Get circuits directory (for debugging)
export function getCircuitsDirectory(): string {
  return getCircuitsDir();
}

export { MerkleProof, bigintToBytes32 };
