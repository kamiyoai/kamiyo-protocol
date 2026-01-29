// Types
export * from './types';

// Bridge
export { TarsBridge, createTarsBridge } from './bridge';

// Reputation sync
export {
  tarsToKamiyoReputation,
  kamiyoToTarsRating,
  aggregateCombinedReputation,
  ReputationSyncService,
} from './reputation-sync';

// Job-Escrow linking
export {
  JobEscrowLinker,
  createJobEscrowLinker,
  deriveJobPda,
  deriveFeedbackPda,
  deriveAgentPda,
} from './job-linker';

// Middleware
export { kamiyoTarsMiddleware, createUnifiedMiddleware } from './middleware';

// Facilitator
export { UnifiedFacilitator, createUnifiedFacilitator } from './facilitator';

// IDL
export { default as TrustlessIDL } from './idl/trustless.json';
