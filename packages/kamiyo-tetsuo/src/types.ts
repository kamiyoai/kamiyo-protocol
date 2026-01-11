/**
 * TETSUO Core Types
 *
 * Chain-agnostic types for ZK reputation proofs.
 */

/**
 * Groth16 proof components
 */
export interface Groth16Proof {
  a: [bigint, bigint];
  b: [[bigint, bigint], [bigint, bigint]];
  c: [bigint, bigint];
}

/**
 * Generated proof with public inputs
 */
export interface GeneratedProof extends Groth16Proof {
  commitment: string;
  publicInputs: bigint[];
}

/**
 * Input for proof generation
 */
export interface ProofInput {
  score: number;
  secret: bigint;
  threshold: number;
}

/**
 * Prover configuration
 */
export interface ProverConfig {
  wasmPath: string;
  zkeyPath: string;
}

/**
 * Reputation tier definition
 */
export interface TierDefinition {
  id: number;
  name: string;
  threshold: number;
  maxCopyLimit: bigint;
  maxCopiers: number;
}

/**
 * Default tier configuration
 */
export const DEFAULT_TIERS: TierDefinition[] = [
  { id: 0, name: 'Default', threshold: 0, maxCopyLimit: 1000n * 10n ** 18n, maxCopiers: 5 },
  { id: 1, name: 'Bronze', threshold: 25, maxCopyLimit: 10000n * 10n ** 18n, maxCopiers: 25 },
  { id: 2, name: 'Silver', threshold: 50, maxCopyLimit: 50000n * 10n ** 18n, maxCopiers: 100 },
  { id: 3, name: 'Gold', threshold: 75, maxCopyLimit: 250000n * 10n ** 18n, maxCopiers: 500 },
  { id: 4, name: 'Platinum', threshold: 90, maxCopyLimit: 1000000n * 10n ** 18n, maxCopiers: 2000 },
];

/**
 * Tier thresholds (score required for each tier)
 */
export const TIER_THRESHOLDS = [0, 25, 50, 75, 90] as const;

/**
 * Tier names
 */
export const TIER_NAMES = ['Default', 'Bronze', 'Silver', 'Gold', 'Platinum'] as const;

export type TierName = typeof TIER_NAMES[number];
export type TierLevel = 0 | 1 | 2 | 3 | 4;

/**
 * Commitment with associated secret
 */
export interface Commitment {
  value: bigint;
  secret: bigint;
}

/**
 * Proof verification result
 */
export interface VerificationResult {
  valid: boolean;
  error?: string;
}
