/*
 * Type definitions for ZK reputation proofs (EVM format)
 * Migrated from @kamiyo/dark-forest
 */

export interface EVMGroth16Proof {
  a: [bigint, bigint];
  b: [[bigint, bigint], [bigint, bigint]];
  c: [bigint, bigint];
}

export interface GeneratedProof extends EVMGroth16Proof {
  commitment: string;
  publicInputs: bigint[];
}

export interface ProofInput {
  score: number;
  secret: bigint;
  threshold: number;
}

export interface ProverConfig {
  wasmPath: string;
  zkeyPath: string;
  vkeyPath?: string;
}

export interface TierDefinition {
  id: number;
  name: string;
  threshold: number;
  maxCopyLimit: bigint;
  maxCopiers: number;
}

export const DEFAULT_TIERS: TierDefinition[] = [
  { id: 0, name: 'Default', threshold: 0, maxCopyLimit: 0n, maxCopiers: 0 },
  { id: 1, name: 'Bronze', threshold: 25, maxCopyLimit: 10000n * 10n ** 18n, maxCopiers: 10 },
  { id: 2, name: 'Silver', threshold: 50, maxCopyLimit: 100000n * 10n ** 18n, maxCopiers: 50 },
  { id: 3, name: 'Gold', threshold: 75, maxCopyLimit: 500000n * 10n ** 18n, maxCopiers: 200 },
  { id: 4, name: 'Platinum', threshold: 90, maxCopyLimit: 5000000n * 10n ** 18n, maxCopiers: 1000 },
];

export const TIER_THRESHOLDS = [0, 25, 50, 75, 90] as const;
export const TIER_NAMES = ['Default', 'Bronze', 'Silver', 'Gold', 'Platinum'] as const;

export type TierName = typeof TIER_NAMES[number];
export type TierLevel = 0 | 1 | 2 | 3 | 4;

export interface Commitment {
  value: bigint;
  secret: bigint;
}

export interface VerificationResult {
  valid: boolean;
  error?: string;
}
