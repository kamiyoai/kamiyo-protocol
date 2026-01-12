/**
 * Kamiyo x Daydreams Integration
 *
 * Full integration with the Daydreams AI agent framework for building
 * autonomous agents with payment and ZK reputation capabilities.
 *
 * Features:
 * - Extension pattern for drop-in Daydreams integration
 * - Composable contexts for payment & reputation state
 * - ZK reputation proofs (prove tier without revealing score)
 * - MCP server for Model Context Protocol compatibility
 * - Quality verification with automatic dispute filing
 * - Pre-built agent behaviors
 *
 * Quick Start:
 * ```typescript
 * import { createDreams } from '@daydreamsai/core';
 * import { openai } from '@ai-sdk/openai';
 * import { kamiyoExtension } from '@kamiyo/agent-client';
 *
 * const agent = createDreams({
 *   model: openai('gpt-4o'),
 *   extensions: [
 *     kamiyoExtension({
 *       network: 'devnet',
 *       qualityThreshold: 85,
 *       maxPrice: 0.01,
 *       autoDispute: true,
 *     }),
 *   ],
 * });
 *
 * // Agent actions:
 * // - kamiyo.consumeAPI - Pay for API with quality verification
 * // - kamiyo.generateCommitment - Create ZK commitment to reputation
 * // - kamiyo.proveReputation - Generate ZK proof of tier
 * // - kamiyo.verifyProof - Verify another agent's proof
 * await agent.start('my-agent');
 * ```
 *
 * @see https://docs.dreams.fun
 * @see https://github.com/daydreamsai/daydreams
 * @see https://kamiyo.ai
 */

// Extension
export {
  kamiyoExtension,
  createKamiyoExtension,
} from './extension';

// Contexts
export {
  kamiyoPaymentContext,
  kamiyoServiceContext,
  kamiyoDisputeContext,
  kamiyoReputationContext,
  composeKamiyoContexts,
} from './context';
export type {
  ContextDefinition,
  ServiceProviderMemory,
  ReputationMemory,
  ProofRecord,
  PeerReputation,
} from './context';

// MCP
export {
  KAMIYO_MCP_TOOLS,
  KAMIYO_MCP_SERVER,
  createKamiyoMCPConfig,
  createKamiyoSSEConfig,
  createMCPHandler,
  KamiyoMCPHandler,
} from './mcp';
export type {
  MCPTransportConfig,
  KamiyoMCPConfig,
  MCPMessage,
  MCPToolCallRequest,
  MCPToolCallResponse,
} from './mcp';

// Types
export {
  KAMIYO_NETWORKS,
  DEFAULT_CONFIG,
  KamiyoError,
} from './types';
export type {
  KamiyoMemory,
  PaymentRecord,
  DisputeRecord,
  DisputeStatus,
  DisputeResolution,
  QualityStats,
  EndpointStats,
  PaymentContextInput,
  KamiyoNetwork,
  KamiyoExtensionConfig,
  QualityCheckResult,
  ConsumeAPIInput,
  ConsumeAPIOutput,
  CreateEscrowInput,
  CreateEscrowOutput,
  FileDisputeInput,
  FileDisputeOutput,
  CheckBalanceInput,
  CheckBalanceOutput,
  DiscoverAPIsInput,
  DiscoverAPIsOutput,
  DiscoveredAPI,
  MCPToolDefinition,
  MCPServerConfig,
  KamiyoErrorCode,
} from './types';

// ZK Reputation
export {
  ReputationManager,
  reputationActions,
  getTierThreshold,
  getQualifyingTier,
  qualifiesForTier,
  TIER_NAMES,
  TIER_THRESHOLDS,
} from './reputation';
export type {
  GenerateCommitmentInput,
  GenerateCommitmentOutput,
  ProveReputationInput,
  ProveReputationOutput,
  VerifyProofInput,
  VerifyProofOutput,
  SerializedProof,
  TierLevel,
  TierName,
} from './reputation';

// Agent Behaviors
export {
  composeBehaviors,
  reputationProverBehavior,
  qualityEnforcerBehavior,
  serviceDiscovererBehavior,
  paymentOptimizerBehavior,
  createReputationProverState,
  createQualityEnforcerState,
  createServiceDiscovererState,
  DEFAULT_REPUTATION_PROVER_CONFIG,
  DEFAULT_QUALITY_ENFORCER_CONFIG,
  DEFAULT_SERVICE_DISCOVERER_CONFIG,
  DEFAULT_PAYMENT_OPTIMIZER_CONFIG,
} from './behaviors';
export type {
  BehaviorConfig,
  BehaviorResult,
  BehaviorContext,
  BehaviorMemory,
  ComposedBehaviors,
  ReputationProverConfig,
  ReputationProverState,
  QualityEnforcerConfig,
  QualityEnforcerState,
  ServiceDiscovererConfig,
  ServiceDiscovererState,
  PaymentOptimizerConfig,
  ServiceScore,
  EndpointQualityStats,
} from './behaviors';
