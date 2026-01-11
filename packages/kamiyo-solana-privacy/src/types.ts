import { PublicKey } from '@solana/web3.js';

export interface Groth16Proof {
  pi_a: [string, string, string];
  pi_b: [[string, string], [string, string], [string, string]];
  pi_c: [string, string, string];
  protocol: 'groth16';
  curve: 'bn128';
}

export interface ReputationProof {
  agentPk: string;
  commitment: string;
  threshold: number;
  proofBytes: Uint8Array;
  groth16Proof?: Groth16Proof;
  publicSignals?: string[];
}

export interface PaymentProof {
  escrowId: string;
  proofBytes: Uint8Array;
}

export interface EncodedProof {
  type: 'reputation' | 'payment';
  data: string;
}

export interface VerificationResult {
  valid: boolean;
  threshold?: number;
  error?: string;
}

export interface CircuitArtifacts {
  wasmPath: string;
  zkeyPath: string;
  vkeyPath: string;
}
