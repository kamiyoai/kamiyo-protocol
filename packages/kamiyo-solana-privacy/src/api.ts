/**
 * HTTP API handlers for ZK reputation proofs.
 * Groth16 on BN254 with Poseidon commitments.
 * Proof size: 256 bytes. Verification: ~200k CU on-chain.
 */

import { buildPoseidon } from 'circomlibjs';
import * as snarkjs from 'snarkjs';
import * as fs from 'fs';
import * as path from 'path';
import { Groth16Proof } from './types';

const DEFAULT_ARTIFACTS_DIR = path.join(__dirname, '../circuits/build');

// circomlibjs types not exported, instance is opaque
let poseidonInstance: ReturnType<typeof buildPoseidon> extends Promise<infer T> ? T : never;
let cachedVkey: Record<string, unknown> | null = null;

async function getPoseidon() {
  if (!poseidonInstance) {
    poseidonInstance = await buildPoseidon();
  }
  return poseidonInstance;
}

function getVerificationKey(artifactsDir: string = DEFAULT_ARTIFACTS_DIR): any {
  if (cachedVkey) return cachedVkey;
  const keyPath = path.join(artifactsDir, 'verification_key.json');
  if (!fs.existsSync(keyPath)) return null;
  cachedVkey = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
  return cachedVkey;
}

export interface ProveReputationRequest {
  score: number;
  threshold: number;
  secret?: string; // hex string
}

export interface ProveReputationResponse {
  success: boolean;
  proof?: {
    pi_a: string[];
    pi_b: string[][];
    pi_c: string[];
  };
  commitment?: string;
  publicSignals?: string[];
  error?: string;
}

export interface VerifyReputationRequest {
  proof: {
    pi_a: string[];
    pi_b: string[][];
    pi_c: string[];
  };
  threshold: number;
  commitment: string;
}

export interface VerifyReputationResponse {
  valid: boolean;
  error?: string;
}

/**
 * Generate Groth16 proof that score >= threshold.
 * Public: threshold, commitment. Private: score, secret.
 */
export async function handleProveReputation(
  req: ProveReputationRequest,
  artifactsDir: string = DEFAULT_ARTIFACTS_DIR
): Promise<ProveReputationResponse> {
  try {
    const { score, threshold, secret: secretHex } = req;

    // Validate inputs
    if (score === undefined || score === null) {
      return { success: false, error: 'score is required' };
    }
    if (threshold === undefined || threshold === null) {
      return { success: false, error: 'threshold is required' };
    }
    if (score < 0 || score > 100) {
      return { success: false, error: 'score must be 0-100' };
    }
    if (threshold < 0 || threshold > 100) {
      return { success: false, error: 'threshold must be 0-100' };
    }
    if (score < threshold) {
      return { success: false, error: 'score must be >= threshold' };
    }

    // Generate or use provided secret
    const secret = secretHex
      ? BigInt(secretHex.startsWith('0x') ? secretHex : '0x' + secretHex)
      : BigInt('0x' + Buffer.from(crypto.getRandomValues(new Uint8Array(31))).toString('hex'));

    // Compute Poseidon commitment
    const poseidon = await getPoseidon();
    const commitmentBigInt = poseidon.F.toObject(
      poseidon([BigInt(score), secret])
    );
    const commitment = '0x' + commitmentBigInt.toString(16).padStart(64, '0');

    // Check if circuit artifacts exist
    const wasmPath = path.join(artifactsDir, 'reputation_threshold_js', 'reputation_threshold.wasm');
    const zkeyPath = path.join(artifactsDir, 'reputation_threshold_final.zkey');

    if (!fs.existsSync(wasmPath) || !fs.existsSync(zkeyPath)) {
      return { success: false, error: 'Circuit artifacts not found. Run build:circuit first.' };
    }

    // Generate Groth16 proof
    const input = {
      score: score,
      secret: secret.toString(),
      threshold: threshold,
      commitment: commitmentBigInt.toString(),
    };

    const { proof, publicSignals } = await snarkjs.groth16.fullProve(
      input,
      wasmPath,
      zkeyPath
    );

    return {
      success: true,
      proof: {
        pi_a: proof.pi_a.slice(0, 2),
        pi_b: proof.pi_b.slice(0, 2),
        pi_c: proof.pi_c.slice(0, 2),
      },
      commitment,
      publicSignals,
    };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

/**
 * Verify Groth16 proof. Reconstructs public signals from
 * threshold + commitment and checks against verification key.
 */
export async function handleVerifyReputation(
  req: VerifyReputationRequest,
  artifactsDir: string = DEFAULT_ARTIFACTS_DIR
): Promise<VerifyReputationResponse> {
  try {
    const { proof, threshold, commitment } = req;

    // Validate inputs
    if (!proof || !proof.pi_a || !proof.pi_b || !proof.pi_c) {
      return { valid: false, error: 'proof is required with pi_a, pi_b, pi_c' };
    }
    if (threshold === undefined || threshold === null) {
      return { valid: false, error: 'threshold is required' };
    }
    if (!commitment) {
      return { valid: false, error: 'commitment is required' };
    }
    if (threshold < 0 || threshold > 100) {
      return { valid: false, error: 'threshold must be 0-100' };
    }

    // Load verification key
    const vkey = getVerificationKey(artifactsDir);
    if (!vkey) {
      return { valid: false, error: 'Verification key not found' };
    }

    // Parse commitment
    const commitmentBigInt = commitment.startsWith('0x')
      ? BigInt(commitment)
      : BigInt('0x' + commitment);

    // Construct public signals: [threshold, commitment]
    const publicSignals = [
      threshold.toString(),
      commitmentBigInt.toString(),
    ];

    // Reconstruct full proof format for snarkjs
    const fullProof: Groth16Proof = {
      pi_a: [...proof.pi_a, '1'] as [string, string, string],
      pi_b: [...proof.pi_b, ['1', '0']] as [[string, string], [string, string], [string, string]],
      pi_c: [...proof.pi_c, '1'] as [string, string, string],
      protocol: 'groth16',
      curve: 'bn128',
    };

    // Verify proof
    const valid = await snarkjs.groth16.verify(vkey, publicSignals, fullProof);

    return { valid };
  } catch (e) {
    return { valid: false, error: String(e) };
  }
}

/**
 * Compute Poseidon(score, secret) commitment without proof.
 * Use for pre-registering commitment on-chain.
 */
export async function handleComputeCommitment(
  score: number,
  secret: string
): Promise<{ commitment: string } | { error: string }> {
  try {
    if (score < 0 || score > 100) {
      return { error: 'score must be 0-100' };
    }

    const secretBigInt = secret.startsWith('0x')
      ? BigInt(secret)
      : BigInt('0x' + secret);

    const poseidon = await getPoseidon();
    const hash = poseidon.F.toObject(
      poseidon([BigInt(score), secretBigInt])
    );

    return {
      commitment: '0x' + hash.toString(16).padStart(64, '0'),
    };
  } catch (e) {
    return { error: String(e) };
  }
}

/**
 * Generate 31-byte random secret for commitment binding.
 * 31 bytes fits in BN254 field (< 2^254).
 */
export function generateRandomSecret(): string {
  const bytes = new Uint8Array(31);
  crypto.getRandomValues(bytes);
  return '0x' + Buffer.from(bytes).toString('hex');
}
