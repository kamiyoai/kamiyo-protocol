// Types
export * from './types';

// ABIs
export * from './abis';

// Identity
export {
  IdentityRegistry,
  parseGlobalId,
  formatGlobalId,
  isValidGlobalId,
  getChainFromGlobalId,
  isCanonicalGlobalId,
  hashGlobalId,
  globalIdsEqual,
  extractAgentId,
  extractRegistry,
  extractChainId,
  validateAgentProfile,
  parseAgentProfile,
  serializeAgentProfile,
  createMinimalProfile,
  createTradingProfile,
  createAgentProfile,
  updateProfileEndpoints,
  updateProfileTier,
  getTierFromProfile,
  buildProfileURI,
} from './identity';

// Reputation
export { FeedbackManager, ReputationSummaryClient } from './reputation';

// Validation
export { ValidationClient, ZKBridgeClient } from './validation';
export type { ZKProof } from './validation';

// Adapters
export { HyperliquidAdapter, MonadAdapter } from './adapters';
export type { HyperliquidAgentProfile, MirrorProof } from './adapters';

// Migration
export { AgentMigrator, CrossChainResolver } from './migration';
export type {
  MigrationSource,
  MigrationResult,
  BatchMigrationResult,
  MigrationOptions,
  ChainType,
  ResolvedIdentity,
  ChainConfig,
  ResolverConfig,
} from './migration';

export { ContextGraph } from './context';
export {
  buildAgentContextAsset,
  buildFeedbackAsset,
  buildValidationAsset,
  buildDecisionTraceAsset,
  buildCredentialAsset,
  buildRelationshipAsset,
  buildAgentURN,
  // Paranet schema builders
  buildTaskCompletionAsset,
  buildCapabilityAttestationAsset,
  buildTrustRelationshipAsset,
  sparqlQueries,
} from './context';
export type {
  DKGClient,
  ContextGraphConfig,
  PublishResult,
  ERC8004RegistrationFile,
  FeedbackRecord,
  ValidationRecord,
  DecisionTrace,
  VerifiableCredential,
  AgentRelationship as DKGAgentRelationship,
  AgentContextResult,
  ReputationQueryResult,
  TrustModel,
  ServiceName,
  ServiceEndpoint,
  RegistrationEntry,
  // Paranet types
  ParanetTaskType,
  ParanetTier,
  DisputeOutcome,
  TaskCompletionRecord,
  CapabilityAttestation,
  TrustRelationship as ParanetTrustRelationship,
  CreditScoreBreakdown,
  AgentCreditScore,
  ParanetProviderResult,
} from './context';
