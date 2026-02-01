// KAMIYO SwarmTeams SDK

export * from './swarm-types.js';
export * from './client.js';
export {
  SwarmTeamsProver,
  generateRandomSalt,
  generateOwnerSecret,
  generateRegistrationSecret,
  generateAgentId,
} from './prover.js';
export { MerkleTree, createMerkleTree } from './merkle.js';
export {
  formatKamiyoAmount,
  parseKamiyoAmount,
  calculateBurnSplit,
  KamiyoAPI,
  kamiyoApi,
  getBurnStats,
} from './burn.js';
export {
  GovernanceClient,
  GOVERNANCE_PROGRAM_ID,
  ProposalState,
  type GovernanceConfig,
  type Proposal,
  type VoteRecord,
} from './governance.js';
export {
  TransferHookClient,
  TRANSFER_HOOK_PROGRAM_ID,
  type HookConfig,
  type BurnExemptList,
  type PlatformWhitelist,
  type TransferState,
} from './transfer-hook.js';

// Reputation prover (migrated from @kamiyo/dark-forest)
export {
  DarkForestProver,
  getTierThreshold,
  getQualifyingTier,
  qualifiesForTier,
} from './reputation-prover.js';
export type {
  EVMGroth16Proof,
  GeneratedProof,
  ProofInput,
  ProverConfig,
  Commitment,
  VerificationResult,
  TierDefinition,
  TierLevel,
  TierName,
} from './reputation-types.js';
export {
  DEFAULT_TIERS,
  TIER_THRESHOLDS,
  TIER_NAMES,
} from './reputation-types.js';
