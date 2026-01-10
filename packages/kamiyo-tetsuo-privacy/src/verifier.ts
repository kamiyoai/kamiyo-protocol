import { Connection, PublicKey } from '@solana/web3.js';
import * as snarkjs from 'snarkjs';
import * as fs from 'fs';
import * as path from 'path';
import { PrivateInference, deserializeGroth16Proof } from './proofs';
import { VerificationResult, Groth16Proof } from './types';

const KAMIYO_PROGRAM_ID = new PublicKey('8sUnNU6WBD2SYapCE12S7LwH1b8zWoniytze7ifWwXCM');
const DEFAULT_ARTIFACTS_DIR = path.join(__dirname, '../circuits/build');

let cachedVkey: any = null;

function loadVerificationKey(vkeyPath?: string): any {
  if (cachedVkey) return cachedVkey;

  const keyPath = vkeyPath ?? path.join(DEFAULT_ARTIFACTS_DIR, 'verification_key.json');
  if (!fs.existsSync(keyPath)) return null;

  cachedVkey = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
  return cachedVkey;
}

export interface VerifierConfig {
  vkeyPath?: string;
}

export function isSnarkjsVerificationAvailable(config?: VerifierConfig): boolean {
  return loadVerificationKey(config?.vkeyPath) !== null;
}

export interface ReputationVerifyOptions {
  minThreshold: number;
  connection?: Connection;
  programId?: PublicKey;
  maxProofAge?: number;
  requireCrypto?: boolean;
  vkeyPath?: string;
}

export interface PaymentVerifyOptions {
  expectedEscrowId?: string;
  connection?: Connection;
  programId?: PublicKey;
  requireCrypto?: boolean;
}

export async function verifyReputationProof(
  encodedProof: string,
  options: ReputationVerifyOptions
): Promise<VerificationResult> {
  if (!encodedProof || encodedProof.trim().length === 0) {
    return { valid: false, error: 'Encoded proof is required' };
  }
  if (options.minThreshold < 0 || options.minThreshold > 100) {
    return { valid: false, error: 'minThreshold must be 0-100' };
  }
  if (options.maxProofAge !== undefined && options.maxProofAge <= 0) {
    return { valid: false, error: 'maxProofAge must be positive' };
  }

  try {
    const proof = PrivateInference.decodeProof(encodedProof);
    if (proof.type !== 'reputation') {
      return { valid: false, error: 'Invalid proof type' };
    }

    const data = JSON.parse(Buffer.from(proof.data, 'base64').toString());

    if (data.threshold < options.minThreshold) {
      return {
        valid: false,
        threshold: data.threshold,
        error: `Threshold ${data.threshold} below minimum ${options.minThreshold}`,
      };
    }

    if (!data.agentPk || !data.commitment || !data.proof) {
      return { valid: false, error: 'Missing proof fields' };
    }

    if (data.timestamp) {
      const maxAge = options.maxProofAge ?? 3600;
      const now = Math.floor(Date.now() / 1000);
      if (now - data.timestamp > maxAge) {
        return { valid: false, error: 'Proof expired' };
      }
    }

    if (options.connection) {
      const onChainValid = await verifyReputationOnChain(
        options.connection,
        data.agentPk,
        data.threshold,
        options.programId ?? KAMIYO_PROGRAM_ID
      );
      if (!onChainValid.valid) return onChainValid;
    }

    const proofBytes = Buffer.from(data.proof, 'base64');
    const cryptoResult = await verifyGroth16Proof(
      proofBytes,
      data.groth16Proof,
      data.publicSignals,
      data.threshold,
      data.commitment,
      options.vkeyPath
    );

    if (cryptoResult.attempted) {
      if (!cryptoResult.valid) {
        return { valid: false, error: cryptoResult.error ?? 'Cryptographic verification failed' };
      }
      return { valid: true, threshold: data.threshold };
    }

    if (options.requireCrypto !== false) {
      return {
        valid: false,
        error: 'Cryptographic verification required but verification key not found',
      };
    }

    return {
      valid: true,
      threshold: data.threshold,
      error: 'Warning: structural validation only',
    };
  } catch (e) {
    return { valid: false, error: String(e) };
  }
}

interface CryptoVerifyResult {
  attempted: boolean;
  valid: boolean;
  error?: string;
}

async function verifyGroth16Proof(
  proofBytes: Buffer,
  groth16Proof?: Groth16Proof,
  publicSignals?: string[],
  threshold?: number,
  commitment?: string,
  vkeyPath?: string
): Promise<CryptoVerifyResult> {
  const vkey = loadVerificationKey(vkeyPath);
  if (!vkey) {
    return { attempted: false, valid: false, error: 'Verification key not found' };
  }

  const marker = 'STRUCTURAL_PROOF_NOT_CRYPTOGRAPHIC';
  if (proofBytes.slice(0, marker.length).toString() === marker) {
    return { attempted: true, valid: false, error: 'Structural proof rejected' };
  }

  let proof: Groth16Proof | null = groth16Proof ?? null;
  let signals: string[] = publicSignals ?? [];

  if (!proof) {
    proof = deserializeGroth16Proof(new Uint8Array(proofBytes));
    if (!proof) {
      return { attempted: true, valid: false, error: 'Failed to deserialize proof' };
    }
  }

  if (signals.length === 0 && threshold !== undefined && commitment) {
    const commitmentBigInt = commitment.startsWith('0x')
      ? BigInt(commitment)
      : BigInt('0x' + commitment);
    signals = [threshold.toString(), commitmentBigInt.toString()];
  }

  if (signals.length < 2) {
    return { attempted: true, valid: false, error: 'Missing public signals' };
  }

  try {
    const valid = await snarkjs.groth16.verify(vkey, signals, proof);
    return { attempted: true, valid };
  } catch (e) {
    return { attempted: true, valid: false, error: `Verification error: ${e}` };
  }
}

export async function verifyPaymentProof(
  encodedProof: string,
  options?: PaymentVerifyOptions
): Promise<VerificationResult> {
  if (!encodedProof || encodedProof.trim().length === 0) {
    return { valid: false, error: 'Encoded proof is required' };
  }

  try {
    const proof = PrivateInference.decodeProof(encodedProof);
    if (proof.type !== 'payment') {
      return { valid: false, error: 'Invalid proof type' };
    }

    const data = JSON.parse(Buffer.from(proof.data, 'base64').toString());

    if (options?.expectedEscrowId && data.escrowId !== options.expectedEscrowId) {
      return { valid: false, error: 'Escrow ID mismatch' };
    }
    if (!data.escrowId || !data.proof) {
      return { valid: false, error: 'Missing proof fields' };
    }

    if (options?.connection) {
      const onChainValid = await verifyEscrowOnChain(
        options.connection,
        data.escrowId,
        options.programId ?? KAMIYO_PROGRAM_ID
      );
      if (!onChainValid.valid) return onChainValid;
    }

    if (options?.requireCrypto && !options.connection) {
      return { valid: false, error: 'Payment proofs require on-chain verification' };
    }

    return { valid: true };
  } catch (e) {
    return { valid: false, error: String(e) };
  }
}

async function verifyReputationOnChain(
  connection: Connection,
  agentPkBase58: string,
  claimedThreshold: number,
  programId: PublicKey
): Promise<VerificationResult> {
  try {
    const agentPk = new PublicKey(agentPkBase58);
    const [repPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('user_reputation'), agentPk.toBuffer()],
      programId
    );

    const info = await connection.getAccountInfo(repPda);
    if (!info) {
      return { valid: false, error: 'User reputation account not found' };
    }

    const totalInferences = info.data.readUInt32LE(16);
    const successfulInferences = info.data.readUInt32LE(20);

    if (totalInferences === 0) {
      return { valid: false, error: 'No inference history' };
    }

    const actualRate = Math.floor((successfulInferences * 100) / totalInferences);
    if (actualRate < claimedThreshold) {
      return {
        valid: false,
        threshold: actualRate,
        error: `On-chain reputation ${actualRate} below claimed ${claimedThreshold}`,
      };
    }

    return { valid: true, threshold: actualRate };
  } catch (e) {
    return { valid: false, error: `On-chain verification failed: ${e}` };
  }
}

async function verifyEscrowOnChain(
  connection: Connection,
  escrowIdBase58: string,
  programId: PublicKey
): Promise<VerificationResult> {
  try {
    const escrowPda = new PublicKey(escrowIdBase58);
    const info = await connection.getAccountInfo(escrowPda);

    if (!info) return { valid: false, error: 'Escrow account not found' };
    if (!info.owner.equals(programId)) return { valid: false, error: 'Invalid escrow owner' };
    if (info.data.length < 120) return { valid: false, error: 'Invalid escrow data' };

    const status = info.data[113];
    if (status !== 0) {
      const statusNames = ['Pending', 'Settled', 'Refunded', 'Disputed'];
      return { valid: false, error: `Escrow is ${statusNames[status] ?? 'Unknown'}, not Pending` };
    }

    return { valid: true };
  } catch (e) {
    return { valid: false, error: `On-chain verification failed: ${e}` };
  }
}
