export type {
  ReputationProof,
  PaymentProof,
  EncodedProof,
  VerificationResult,
  Groth16Proof,
  CircuitArtifacts,
} from './types';

export {
  PrivateInference,
  computeCommitment,
  generateSecret,
  deserializeGroth16Proof,
} from './proofs';

export type { ProverConfig } from './proofs';

export {
  verifyReputationProof,
  verifyPaymentProof,
  isSnarkjsVerificationAvailable,
} from './verifier';

export type {
  ReputationVerifyOptions,
  PaymentVerifyOptions,
  VerifierConfig,
} from './verifier';

export {
  buildVerifyReputationTierInstruction,
  verifyReputationTierOnChain,
  KAMIYO_PROGRAM_ID,
  KAMIYO_PROGRAM_ID_TEST,
  VERIFY_REPUTATION_TIER_CU,
} from './onchain';

// Re-export Solana types for convenience
export { PublicKey, Connection } from '@solana/web3.js';
export { Wallet } from '@coral-xyz/anchor';
