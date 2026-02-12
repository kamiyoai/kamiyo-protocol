// KAMIYO Hive SDK

export * from './types';
export * from './client';
export {
  HiveProver,
  generateRandomSalt,
  generateOwnerSecret,
  generateRegistrationSecret,
  generateAgentId,
} from './prover';
export { MerkleTree, createMerkleTree } from './merkle';
export {
  formatKamiyoAmount,
  parseKamiyoAmount,
  calculateBurnSplit,
  KamiyoAPI,
  kamiyoApi,
  getBurnStats,
} from './burn';
export {
  GovernanceClient,
  GOVERNANCE_PROGRAM_ID,
  ProposalState,
  type GovernanceConfig,
  type Proposal,
  type VoteRecord,
} from './governance';
export {
  TransferHookClient,
  TRANSFER_HOOK_PROGRAM_ID,
  type HookConfig,
  type BurnExemptList,
  type PlatformWhitelist,
  type TransferState,
} from './transfer-hook';

// Reputation prover (migrated from @kamiyo/dark-forest)
export {
  DarkForestProver,
  getTierThreshold,
  getQualifyingTier,
  qualifiesForTier,
} from './reputation-prover';
export {
  EVMGroth16Proof,
  GeneratedProof,
  ProofInput,
  ProverConfig,
  Commitment,
  VerificationResult,
  TierDefinition,
  TierLevel,
  TierName,
  DEFAULT_TIERS,
  TIER_THRESHOLDS,
  TIER_NAMES,
} from './reputation-types';
