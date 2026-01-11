/**
 * @kamiyo/tetsuo
 *
 * TETSUO: ZK reputation proofs for AI agents.
 * Chain-agnostic SDK for generating and verifying Groth16 proofs.
 */

// Prover
export {
  TetsuoProver,
  getTierThreshold,
  getQualifyingTier,
  qualifiesForTier,
} from './prover';

// Types
export {
  // Proof types
  Groth16Proof,
  GeneratedProof,
  ProofInput,
  ProverConfig,
  Commitment,
  VerificationResult,

  // Tier types
  TierDefinition,
  TierLevel,
  TierName,

  // Constants
  DEFAULT_TIERS,
  TIER_THRESHOLDS,
  TIER_NAMES,
} from './types';
