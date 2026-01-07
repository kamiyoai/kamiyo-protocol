/**
 * Kamiyo x Daydreams Integration
 *
 * Full integration with the Daydreams AI agent framework for building
 * autonomous agents with payment capabilities.
 *
 * Features:
 * - Extension pattern for drop-in Daydreams integration
 * - Composable contexts for payment state management
 * - MCP server for Model Context Protocol compatibility
 * - Quality verification with automatic dispute filing
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
 * // Agent can now call kamiyo.consumeAPI, kamiyo.fileDispute, etc.
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
  composeKamiyoContexts,
} from './context';
export type {
  ContextDefinition,
  ServiceProviderMemory,
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
