// Types
export type {
  UAL,
  QualityScores,
  AggregatedQuality,
  QualityStake,
  QualityStakeStatus,
  QualityAssessment,
  OracleCommitment,
  PublisherReputation,
  OracleInfo,
  QualityMetadata,
  QualityStakingConfig,
  OracleProtocolConfig,
  QualityQuery,
  QualityQueryResult,
  InferenceProvenance,
  QualityDispute,
} from './types.js';

export {
  DEFAULT_QUALITY_WEIGHTS,
  DEFAULT_STAKING_CONFIG,
  DEFAULT_ORACLE_CONFIG,
} from './types.js';

// Quality Staking
import { QualityStakingManager, parseUAL, buildUAL } from './quality-staking.js';
export { QualityStakingManager, parseUAL, buildUAL };

// Oracle Protocol
import { OracleProtocolManager } from './oracle-protocol.js';
export { OracleProtocolManager };

// dRAG+Q
export type { DKGClientInterface, CacheConfig } from './drag-quality.js';
import { DragQualityClient, QualityRAGContextBuilder } from './drag-quality.js';
export { DragQualityClient, QualityRAGContextBuilder };

// Inference Provenance
import { InferenceProvenanceTracker } from './inference-provenance.js';
export { InferenceProvenanceTracker };

// Dispute Resolution
import { DisputeResolutionManager } from './dispute-resolution.js';
export { DisputeResolutionManager };

// Persistence
export type { QualityOracleStore } from './persistence.js';
export {
  InMemoryStore,
  serializeStake,
  deserializeStake,
  serializeReputation,
  deserializeReputation,
  serializeOracleInfo,
  deserializeOracleInfo,
} from './persistence.js';

// DKG Client
export type { DKGClientConfig, DKGLogger } from './dkg-client.js';
export { DKGClient, MockDKGClient, createDKGClient, DKG_NETWORKS } from './dkg-client.js';

// PDA Utilities
export type { PDAConfig } from './pda.js';
export {
  deriveEscrowPDA,
  deriveStakePDA,
  deriveOraclePDA,
  verifyPDA,
  ualToSeed,
  DEFAULT_PROGRAM_ID,
} from './pda.js';

// Schema.org-based Knowledge Asset schemas
export type {
  QualityAttestationAsset,
  DisputeOutcomeAsset,
  StakeRecordAsset,
  OracleManifestAsset,
  TrustEdgeAsset,
  HubEntityAsset,
} from './schemas.js';
export {
  createQualityAttestationAsset,
  createDisputeOutcomeAsset,
  createStakeRecordAsset,
  createOracleManifestAsset,
  createTrustEdgeAsset,
  createHubEntityAsset,
} from './schemas.js';

// SPARQL query templates
export { SPARQL, type SPARQLTemplate } from './sparql.js';

// Error classes
export {
  KamiyoError,
  ValidationError,
  UalError,
  StakeError,
  StakeNotFoundError,
  StakeAlreadyExistsError,
  StakeAlreadyResolvedError,
  OracleError,
  OracleNotFoundError,
  OracleNotRegisteredError,
  InsufficientStakeError,
  CommitmentError,
  RevealError,
  CommitWindowExpiredError,
  RevealWindowExpiredError,
  InvalidCommitmentError,
  DisputeError,
  DisputeNotFoundError,
  DisputeAlreadyExistsError,
  DisputeAlreadyResolvedError,
  DisputeWindowExpiredError,
  CannotDisputePendingError,
  InferenceError,
  InferenceNotFoundError,
  QueryError,
  SparqlError,
  DkgConnectionError,
} from './errors.js';

export function createQualityOracleSystem(config?: {
  stakingConfig?: Partial<import('./types.js').QualityStakingConfig>;
  oracleConfig?: Partial<import('./types.js').OracleProtocolConfig>;
}) {
  const stakingManager = new QualityStakingManager(config?.stakingConfig);
  const oracleManager = new OracleProtocolManager(config?.oracleConfig);
  const provenanceTracker = new InferenceProvenanceTracker();
  const disputeManager = new DisputeResolutionManager(
    stakingManager,
    oracleManager,
    provenanceTracker
  );

  return {
    stakingManager,
    oracleManager,
    provenanceTracker,
    disputeManager,
  };
}
