export { MoltbookJobBridgeAgent } from './agent.js';
export { MoltbookClient } from './moltbook.js';
export { JobDatabase } from './db.js';
export { createEscrowClient } from './escrow.js';
export { evaluateJob, formatOffer, hasRelevantKeywords } from './evaluator.js';
export { SubcontractManager } from './subcontract.js';
export { ContentStrategy } from './content-strategy.js';
export { parseCommand, generateHelpResponse, generateStatusResponse } from './commands.js';
export {
  KAMIYO_PERSONALITY,
  TIER_CONFIG,
  getTierFromScore,
  getTierByName,
} from './personality.js';

// Phase 2: Trust Services
export { ReputationService } from './services/reputation-service.js';
export { TrustGraph } from './services/trust-graph.js';
export { BadgeService, BADGE_DEFINITIONS } from './services/badge-service.js';
export { DKGPublisher } from './services/dkg-publisher.js';

// Phase 3: Agent Economy
export { JobBoard } from './services/job-board.js';
export { QualityService } from './services/quality-service.js';
export {
  generatePostJobResponse,
  generateBidResponse,
  generateJobStatusResponse,
  generateTransactionCompleteResponse,
} from './commands.js';

// Phase 4: DKG + Identity
export { CollectiveMemory } from './services/collective-memory.js';
export { IdentityResolver } from './services/identity-resolver.js';
export { ReputationPublisher } from './services/reputation-publisher.js';

// Phase 5: Viral Moments
export { FirstTransactionCampaign } from './campaigns/first-transaction.js';
export { TrustGraphVisualizer } from './visualization/trust-graph-viz.js';
export { GatedAccessService } from './services/gated-access.js';

export type * from './types.js';
