/**
 * Daydreams extension for Kamiyo payments and ZK reputation.
 *
 * @example
 * const agent = createDreams({
 *   model: openai('gpt-4o'),
 *   extensions: [kamiyoExtension({ network: 'devnet' })],
 * });
 */

// Re-export everything from core
export * from '@kamiyo/agent-core';

// Extension
export {
  kamiyoExtension,
  createKamiyoExtension,
  KamiyoExtension,
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
  VerifiedPeer,
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

// Daydreams-specific types
export {
  DEFAULT_CONFIG,
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
  KamiyoExtensionConfig,
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
} from './types';

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
