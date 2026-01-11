import { Wallet } from '@coral-xyz/anchor';
import * as snarkjs from 'snarkjs';
import { buildPoseidon } from 'circomlibjs';
import * as fs from 'fs';
import * as path from 'path';
import {
  ReputationProof,
  PaymentProof,
  EncodedProof,
  Groth16Proof,
  CircuitArtifacts,
} from './types';

let poseidonInstance: any = null;

async function getPoseidon() {
  if (!poseidonInstance) {
    poseidonInstance = await buildPoseidon();
  }
  return poseidonInstance;
}

export interface ProverConfig {
  circuitArtifacts?: CircuitArtifacts;
  artifactsDir?: string;
}

const DEFAULT_ARTIFACTS_DIR = path.join(__dirname, '../circuits/build');

function getArtifactPaths(config?: ProverConfig): CircuitArtifacts {
  if (config?.circuitArtifacts) {
    return config.circuitArtifacts;
  }
  const dir = config?.artifactsDir ?? DEFAULT_ARTIFACTS_DIR;
  return {
    wasmPath: path.join(dir, 'reputation_threshold_js', 'reputation_threshold.wasm'),
    zkeyPath: path.join(dir, 'reputation_threshold_final.zkey'),
    vkeyPath: path.join(dir, 'verification_key.json'),
  };
}

export class PrivateInference {
  private wallet: Wallet;
  private config?: ProverConfig;

  constructor(wallet: Wallet, config?: ProverConfig) {
    this.wallet = wallet;
    this.config = config;
  }

  async proveReputation(params: {
    score: number;
    threshold: number;
    secret?: bigint;
  }): Promise<ReputationProof> {
    if (params.score < 0 || params.score > 100) {
      throw new Error('Score must be between 0 and 100');
    }
    if (params.threshold < 0 || params.threshold > 100) {
      throw new Error('Threshold must be between 0 and 100');
    }

    const poseidon = await getPoseidon();
    const secret = params.secret ?? BigInt(randomBytes(31));
    const commitmentBigInt = poseidon.F.toObject(
      poseidon([BigInt(params.score), secret])
    );
    const commitment = '0x' + commitmentBigInt.toString(16).padStart(64, '0');

    const artifacts = getArtifactPaths(this.config);

    if (!fs.existsSync(artifacts.wasmPath) || !fs.existsSync(artifacts.zkeyPath)) {
      console.warn('Circuit artifacts not found. Run build:circuit for cryptographic proofs.');
      return this.createStructuralProof(params.threshold, commitment);
    }

    const input = {
      score: params.score,
      secret: secret.toString(),
      threshold: params.threshold,
      commitment: commitmentBigInt.toString(),
    };

    const { proof, publicSignals } = await snarkjs.groth16.fullProve(
      input,
      artifacts.wasmPath,
      artifacts.zkeyPath
    );

    return {
      agentPk: this.wallet.publicKey.toBase58(),
      commitment,
      threshold: params.threshold,
      proofBytes: serializeGroth16Proof(proof as Groth16Proof),
      groth16Proof: proof as Groth16Proof,
      publicSignals,
    };
  }

  private createStructuralProof(threshold: number, commitment: string): ReputationProof {
    // Rejected by production verifiers
    const marker = Buffer.from('STRUCTURAL_PROOF_NOT_CRYPTOGRAPHIC');
    const proofBytes = new Uint8Array(256);
    marker.copy(Buffer.from(proofBytes.buffer), 0);
    crypto.getRandomValues(proofBytes.subarray(marker.length));

    return {
      agentPk: this.wallet.publicKey.toBase58(),
      commitment,
      threshold,
      proofBytes,
    };
  }

  async provePayment(params: { escrowId: string }): Promise<PaymentProof> {
    const proofBytes = new Uint8Array(64);
    crypto.getRandomValues(proofBytes);
    return { escrowId: params.escrowId, proofBytes };
  }

  static encodeReputationProof(proof: ReputationProof): string {
    const data: EncodedProof = {
      type: 'reputation',
      data: Buffer.from(JSON.stringify({
        agentPk: proof.agentPk,
        commitment: proof.commitment,
        threshold: proof.threshold,
        proof: Buffer.from(proof.proofBytes).toString('base64'),
        groth16Proof: proof.groth16Proof,
        publicSignals: proof.publicSignals,
      })).toString('base64'),
    };
    return Buffer.from(JSON.stringify(data)).toString('base64');
  }

  static encodePaymentProof(proof: PaymentProof): string {
    const data: EncodedProof = {
      type: 'payment',
      data: Buffer.from(JSON.stringify({
        escrowId: proof.escrowId,
        proof: Buffer.from(proof.proofBytes).toString('base64'),
      })).toString('base64'),
    };
    return Buffer.from(JSON.stringify(data)).toString('base64');
  }

  static decodeProof(encoded: string): EncodedProof {
    return JSON.parse(Buffer.from(encoded, 'base64').toString());
  }
}

export async function computeCommitment(score: number, secret: bigint): Promise<string> {
  const poseidon = await getPoseidon();
  const hash = poseidon.F.toObject(poseidon([BigInt(score), secret]));
  return '0x' + hash.toString(16).padStart(64, '0');
}

export function generateSecret(): bigint {
  return BigInt(randomBytes(31));
}

function randomBytes(length: number): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return '0x' + Buffer.from(bytes).toString('hex');
}

// Groth16: A (G1, 64B) + B (G2, 128B) + C (G1, 64B) = 256B
function serializeGroth16Proof(proof: Groth16Proof): Uint8Array {
  const buffer = new Uint8Array(256);
  let offset = 0;

  writeBigInt(buffer, offset, BigInt(proof.pi_a[0]), 32); offset += 32;
  writeBigInt(buffer, offset, BigInt(proof.pi_a[1]), 32); offset += 32;

  writeBigInt(buffer, offset, BigInt(proof.pi_b[0][0]), 32); offset += 32;
  writeBigInt(buffer, offset, BigInt(proof.pi_b[0][1]), 32); offset += 32;
  writeBigInt(buffer, offset, BigInt(proof.pi_b[1][0]), 32); offset += 32;
  writeBigInt(buffer, offset, BigInt(proof.pi_b[1][1]), 32); offset += 32;

  writeBigInt(buffer, offset, BigInt(proof.pi_c[0]), 32); offset += 32;
  writeBigInt(buffer, offset, BigInt(proof.pi_c[1]), 32);

  return buffer;
}

function writeBigInt(buffer: Uint8Array, offset: number, value: bigint, length: number): void {
  const hex = value.toString(16).padStart(length * 2, '0');
  for (let i = 0; i < length; i++) {
    buffer[offset + i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
}

export function deserializeGroth16Proof(bytes: Uint8Array): Groth16Proof | null {
  if (bytes.length !== 256) return null;

  const marker = 'STRUCTURAL_PROOF_NOT_CRYPTOGRAPHIC';
  if (Buffer.from(bytes.slice(0, marker.length)).toString() === marker) {
    return null;
  }

  let offset = 0;
  const read = () => { const v = readBigInt(bytes, offset, 32); offset += 32; return v; };

  const aX = read(), aY = read();
  const bX0 = read(), bX1 = read(), bY0 = read(), bY1 = read();
  const cX = read(), cY = read();

  return {
    pi_a: [aX.toString(), aY.toString(), '1'],
    pi_b: [[bX0.toString(), bX1.toString()], [bY0.toString(), bY1.toString()], ['1', '0']],
    pi_c: [cX.toString(), cY.toString(), '1'],
    protocol: 'groth16',
    curve: 'bn128',
  };
}

function readBigInt(buffer: Uint8Array, offset: number, length: number): bigint {
  let hex = '0x';
  for (let i = 0; i < length; i++) {
    hex += buffer[offset + i].toString(16).padStart(2, '0');
  }
  return BigInt(hex);
}
