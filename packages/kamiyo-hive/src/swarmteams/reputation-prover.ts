/*
 * ZK Reputation Prover for tier-based proofs (EVM format)
 * Migrated from @kamiyo/dark-forest
 */

import type { groth16 as Groth16 } from 'snarkjs';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';
import {
  ProofInput,
  ProverConfig,
  GeneratedProof,
  Commitment,
  VerificationResult,
  TIER_THRESHOLDS,
  TierLevel,
} from './reputation-types.js';

let snarkjs: { groth16: typeof Groth16 } | null = null;

// Default bundled artifact paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BUNDLED_ARTIFACTS_DIR = path.join(__dirname, '../artifacts/reputation');
const DEFAULT_WASM_PATH = path.join(BUNDLED_ARTIFACTS_DIR, 'reputation_threshold.wasm');
const DEFAULT_ZKEY_PATH = path.join(BUNDLED_ARTIFACTS_DIR, 'reputation_threshold_final.zkey');
const DEFAULT_VKEY_PATH = path.join(BUNDLED_ARTIFACTS_DIR, 'verification_key.json');

function getBundledArtifactsAvailable(): boolean {
  return fs.existsSync(DEFAULT_WASM_PATH) && fs.existsSync(DEFAULT_ZKEY_PATH);
}

async function poseidonHash(inputs: bigint[]): Promise<bigint> {
  const { buildPoseidon } = await import('circomlibjs');
  const poseidon = await buildPoseidon();
  const hash = poseidon(inputs);
  return poseidon.F.toObject(hash);
}

function randomSecret(bytes: number = 31): bigint {
  const array = new Uint8Array(bytes);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(array);
  } else {
    const { randomBytes } = require('crypto');
    const buf = randomBytes(bytes);
    array.set(buf);
  }
  return BigInt('0x' + Array.from(array).map(b => b.toString(16).padStart(2, '0')).join(''));
}

export class DarkForestProver {
  private wasmPath: string;
  private zkeyPath: string;
  private vkeyPath: string;
  private initialized = false;
  private vkeyCache: object | null = null;

  constructor(config?: Partial<ProverConfig>) {
    this.wasmPath = config?.wasmPath ?? DEFAULT_WASM_PATH;
    this.zkeyPath = config?.zkeyPath ?? DEFAULT_ZKEY_PATH;
    this.vkeyPath = config?.vkeyPath ?? DEFAULT_VKEY_PATH;

    if (!config?.wasmPath && !getBundledArtifactsAvailable()) {
      throw new Error(
        'Bundled circuit artifacts not found. Either provide explicit paths ' +
        'or ensure artifacts are in packages/kamiyo-swarmteams/artifacts/reputation/'
      );
    }
  }

  static isAvailable(): boolean {
    return getBundledArtifactsAvailable();
  }

  async init(): Promise<void> {
    if (this.initialized) return;
    if (!snarkjs) {
      snarkjs = await import('snarkjs');
    }
    this.initialized = true;
  }

  async generateCommitment(score: number, secret?: bigint): Promise<Commitment> {
    if (score < 0 || score > 100) {
      throw new Error('Score must be between 0 and 100');
    }

    const secretValue = secret ?? randomSecret();
    const value = await poseidonHash([BigInt(score), secretValue]);

    return { value, secret: secretValue };
  }

  async generateProof(input: ProofInput): Promise<GeneratedProof> {
    await this.init();

    if (input.score < 0 || input.score > 100) {
      throw new Error('Score must be between 0 and 100');
    }
    if (input.threshold < 0 || input.threshold > 100) {
      throw new Error('Threshold must be between 0 and 100');
    }
    if (input.score < input.threshold) {
      throw new Error('Score must be >= threshold to generate valid proof');
    }

    const commitment = await poseidonHash([BigInt(input.score), input.secret]);

    const circuitInput = {
      score: input.score.toString(),
      secret: input.secret.toString(),
      threshold: input.threshold.toString(),
      commitment: commitment.toString(),
    };

    if (!snarkjs) throw new Error('Prover not initialized');

    const { proof, publicSignals } = await snarkjs.groth16.fullProve(
      circuitInput,
      this.wasmPath,
      this.zkeyPath
    );

    // B point coordinate swap for EVM pairing precompile
    return {
      commitment: '0x' + commitment.toString(16).padStart(64, '0'),
      a: [BigInt(proof.pi_a[0]), BigInt(proof.pi_a[1])],
      b: [
        [BigInt(proof.pi_b[0][1]), BigInt(proof.pi_b[0][0])],
        [BigInt(proof.pi_b[1][1]), BigInt(proof.pi_b[1][0])],
      ],
      c: [BigInt(proof.pi_c[0]), BigInt(proof.pi_c[1])],
      publicInputs: publicSignals.map((s: string) => BigInt(s)),
    };
  }

  async verifyProof(proof: GeneratedProof, vkeyPath?: string): Promise<VerificationResult> {
    await this.init();

    try {
      const keyPath = vkeyPath ?? this.vkeyPath;
      let vkey: object;
      if (!vkeyPath && this.vkeyCache) {
        vkey = this.vkeyCache;
      } else {
        const vkeyData = await fs.promises.readFile(keyPath, 'utf8');
        vkey = JSON.parse(vkeyData);
        if (!vkeyPath) {
          this.vkeyCache = vkey;
        }
      }

      const snarkProof = {
        pi_a: [proof.a[0].toString(), proof.a[1].toString(), '1'],
        pi_b: [
          [proof.b[0][1].toString(), proof.b[0][0].toString()],
          [proof.b[1][1].toString(), proof.b[1][0].toString()],
          ['1', '0'],
        ],
        pi_c: [proof.c[0].toString(), proof.c[1].toString(), '1'],
        protocol: 'groth16',
        curve: 'bn128',
      };

      const publicSignals = proof.publicInputs.map((i: bigint) => i.toString());

      if (!snarkjs) throw new Error('Prover not initialized');

      const valid = await snarkjs.groth16.verify(vkey, publicSignals, snarkProof);
      return { valid };
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}

export function getTierThreshold(tier: TierLevel): number {
  return TIER_THRESHOLDS[tier];
}

export function getQualifyingTier(score: number): TierLevel {
  if (score >= 90) return 4;
  if (score >= 75) return 3;
  if (score >= 50) return 2;
  if (score >= 25) return 1;
  return 0;
}

export function qualifiesForTier(score: number, tier: TierLevel): boolean {
  return score >= TIER_THRESHOLDS[tier];
}
