export { ContextGraph } from './ContextGraph.js';

export type {
  DKGClient,
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
} from './types.js';

export {
  buildAgentContextAsset,
  buildFeedbackAsset,
  buildValidationAsset,
  buildDecisionTraceAsset,
  buildCredentialAsset,
  buildRelationshipAsset,
  buildAgentURN,
} from './schemas.js';

export * as sparqlQueries from './sparql.js';
