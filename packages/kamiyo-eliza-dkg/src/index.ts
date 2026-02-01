import type { Plugin } from './types.js';

// Import from @kamiyo/eliza
import { kamiyoPlugin } from '@kamiyo/eliza';

// Import DKG-specific components
import {
  publishQualityAction,
  queryProviderQualityAction,
  findTrustedProvidersAction,
  publishDisputeAction,
  publishReputationToDKGAction,
  queryReputationFromDKGAction,
  findParanetProvidersAction,
  getParanetCreditScoreAction,
  publishTaskCompletionAction,
  attestCapabilityAction,
  recordTrustAction,
} from './actions/index.js';
import { dkgQualityProvider, creditScoreProvider, peerReputationProvider } from './providers/index.js';
import { qualityPublisherEvaluator, preContractEvaluator, postTaskEvaluator } from './evaluators/index.js';
import { dkgSyncService } from './services/index.js';

export const kamiyoDKGPlugin: Plugin = {
  name: 'kamiyo-dkg',
  description: 'KAMIYO trust layer + OriginTrail DKG for verifiable agent commerce',
  actions: [
    // Include all KAMIYO actions
    ...(kamiyoPlugin.actions || []),
    // Add DKG-specific actions
    publishQualityAction,
    queryProviderQualityAction,
    findTrustedProvidersAction,
    publishDisputeAction,
    publishReputationToDKGAction,
    queryReputationFromDKGAction,
    // Agent Paranet actions
    findParanetProvidersAction,
    getParanetCreditScoreAction,
    publishTaskCompletionAction,
    attestCapabilityAction,
    recordTrustAction,
  ],
  providers: [
    // Include all KAMIYO providers
    ...(kamiyoPlugin.providers || []),
    // Add DKG quality provider
    dkgQualityProvider,
    // Agent Paranet providers
    creditScoreProvider,
    peerReputationProvider,
  ],
  evaluators: [
    // Include all KAMIYO evaluators
    ...(kamiyoPlugin.evaluators || []),
    // Add DKG quality publisher
    qualityPublisherEvaluator,
    // Agent Paranet evaluators
    preContractEvaluator,
    postTaskEvaluator,
  ],
  services: [
    // Include all KAMIYO services
    ...(kamiyoPlugin.services || []),
    // Add DKG sync service
    dkgSyncService,
  ],
};

// Export individual components
export {
  type IAgentRuntime,
  type Memory,
  type State,
  type Action,
  type Provider,
  type Evaluator,
  type Plugin,
  type Service,
  type MessageExample,
  type HandlerCallback,
  type KamiyoNetwork,
  type KamiyoPluginConfig,
  type DisputeRecord,
  type EscrowAccount,
  type UAL,
  type DKGBlockchain,
  type DKGConfig,
  type ElizaDKGConfig,
  type DKGPublishResult,
  type DKGQueryResult,
  type QualityAttestationInput,
  type DisputeOutcomeInput,
  type ReputationCommitmentInput,
  type PaymentRecordInput,
  type TrustEdgeInput,
  type HubEntityInput,
  type TrustChainResult,
  type TrustedEntity,
  type HubEntityVerification,
  type ProviderQualityStats,
  type AgentDisputeStats,
  type KamiyoDKGBridgeContext,
  type DKGClientInterface,
  type BridgeEventType,
  type BridgeEvent,
  type BridgeEventListener,
} from './types.js';
export * from './schemas/index.js';
export * from './bridge.js';
export * from './actions/index.js';
export * from './providers/index.js';
export * from './evaluators/index.js';
export * from './services/index.js';

// Re-export KAMIYO plugin components
export { kamiyoPlugin } from '@kamiyo/eliza';

// Default export
export default kamiyoDKGPlugin;
