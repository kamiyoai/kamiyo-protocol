/**
 * ZK Proof Generation for Reputation Tiers
 *
 * Generates Groth16 proofs for reputation threshold verification.
 * Proofs are verified on-chain by ReputationLimits contract.
 */

/// <reference path="./zk-types.d.ts" />

import { ethers } from 'ethers';
import type { groth16 as Groth16 } from 'snarkjs';

// snarkjs is loaded dynamically since it's a large dependency
let snarkjs: { groth16: typeof Groth16 } | null = null;

export interface ProofInput {
  score: number;
  secret: bigint;
  threshold: number;
}

export interface GeneratedProof {
  commitment: string;
  proofA: [bigint, bigint];
  proofB: [[bigint, bigint], [bigint, bigint]];
  proofC: [bigint, bigint];
  pubInputs: bigint[];
}

export interface ProverConfig {
  wasmPath: string;
  zkeyPath: string;
}

/**
 * Poseidon hash function (matches circuit)
 * Uses the same parameters as circomlib's Poseidon
 */
async function poseidonHash(inputs: bigint[]): Promise<bigint> {
  if (!snarkjs) {
    snarkjs = await import('snarkjs');
  }
  // Use buildPoseidon from circomlibjs
  const { buildPoseidon } = await import('circomlibjs');
  const poseidon = await buildPoseidon();
  const hash = poseidon(inputs);
  return poseidon.F.toObject(hash);
}

export class ReputationProver {
  private wasmPath: string;
  private zkeyPath: string;
  private initialized = false;

  constructor(config: ProverConfig) {
    this.wasmPath = config.wasmPath;
    this.zkeyPath = config.zkeyPath;
  }

  /**
   * Initialize the prover (loads snarkjs)
   */
  async init(): Promise<void> {
    if (this.initialized) return;

    if (!snarkjs) {
      snarkjs = await import('snarkjs');
    }
    this.initialized = true;
  }

  /**
   * Generate a commitment for a score
   */
  async generateCommitment(score: number, secret?: bigint): Promise<{
    commitment: bigint;
    secret: bigint;
  }> {
    const secretValue = secret ?? BigInt(ethers.hexlify(ethers.randomBytes(31)));

    const commitment = await poseidonHash([BigInt(score), secretValue]);

    return { commitment, secret: secretValue };
  }

  /**
   * Generate a proof that score >= threshold
   */
  async generateProof(input: ProofInput): Promise<GeneratedProof> {
    await this.init();

    // Compute commitment
    const commitment = await poseidonHash([BigInt(input.score), input.secret]);

    // Circuit inputs
    const circuitInput = {
      score: input.score,
      secret: input.secret.toString(),
      threshold: input.threshold,
      commitment: commitment.toString(),
    };

    // Generate proof
    if (!snarkjs) throw new Error('Prover not initialized');
    const { proof, publicSignals } = await snarkjs.groth16.fullProve(
      circuitInput,
      this.wasmPath,
      this.zkeyPath
    );

    // Convert proof to on-chain format
    return {
      commitment: ethers.zeroPadValue(ethers.toBeHex(commitment), 32),
      proofA: [BigInt(proof.pi_a[0]), BigInt(proof.pi_a[1])],
      proofB: [
        [BigInt(proof.pi_b[0][1]), BigInt(proof.pi_b[0][0])],
        [BigInt(proof.pi_b[1][1]), BigInt(proof.pi_b[1][0])],
      ],
      proofC: [BigInt(proof.pi_c[0]), BigInt(proof.pi_c[1])],
      pubInputs: publicSignals.map((s: string) => BigInt(s)),
    };
  }

  /**
   * Verify a proof locally (for testing)
   */
  async verifyProof(
    proof: GeneratedProof,
    vkeyPath: string
  ): Promise<boolean> {
    await this.init();

    const vkey = await import(vkeyPath);

    const snarkProof = {
      pi_a: [proof.proofA[0].toString(), proof.proofA[1].toString(), '1'],
      pi_b: [
        [proof.proofB[0][1].toString(), proof.proofB[0][0].toString()],
        [proof.proofB[1][1].toString(), proof.proofB[1][0].toString()],
        ['1', '0'],
      ],
      pi_c: [proof.proofC[0].toString(), proof.proofC[1].toString(), '1'],
      protocol: 'groth16',
      curve: 'bn128',
    };

    const publicSignals = proof.pubInputs.map((i) => i.toString());

    if (!snarkjs) throw new Error('Prover not initialized');
    return snarkjs.groth16.verify(vkey, publicSignals, snarkProof);
  }

  /**
   * Format proof for contract call
   */
  formatForContract(proof: GeneratedProof): {
    a: [bigint, bigint];
    b: [[bigint, bigint], [bigint, bigint]];
    c: [bigint, bigint];
    input: bigint[];
  } {
    return {
      a: proof.proofA,
      b: proof.proofB,
      c: proof.proofC,
      input: proof.pubInputs,
    };
  }
}

/**
 * Get tier threshold for a given tier number
 */
export function getTierThreshold(tier: number): number {
  const thresholds = [0, 25, 50, 75, 90];
  if (tier < 0 || tier >= thresholds.length) {
    throw new Error(`Invalid tier: ${tier}`);
  }
  return thresholds[tier];
}

/**
 * Determine which tier a score qualifies for
 */
export function getQualifyingTier(score: number): number {
  if (score >= 90) return 4; // Platinum
  if (score >= 75) return 3; // Gold
  if (score >= 50) return 2; // Silver
  if (score >= 25) return 1; // Bronze
  return 0; // Default
}
