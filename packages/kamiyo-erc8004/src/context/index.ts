export { ContextGraph } from './ContextGraph.js';

export type {
  DKGClient,
  DKGAssetOperations,
  DKGGraphOperations,
  ContextGraphConfig,
  PublishResult,
  ERC8004RegistrationFile,
  FeedbackRecord,
  ValidationRecord,
  DecisionTrace,
  VerifiableCredential,
  AgentRelationship,
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
  TrustRelationship,
  CreditScoreBreakdown,
  AgentCreditScore,
  ParanetProviderResult,
} from './types.js';

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
} from './schemas.js';

export * as sparqlQueries from './sparql.js';
