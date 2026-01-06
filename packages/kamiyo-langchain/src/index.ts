/**
 * @kamiyo/langchain - LangChain Tools for Kamiyo Protocol
 *
 * Provides LangChain-compatible tools for autonomous agents to:
 * - Create payment agreements with providers
 * - Release funds on successful delivery
 * - Dispute for oracle arbitration
 * - Check agreement status
 *
 * @example
 * ```typescript
 * import { createKamiyoTools } from '@kamiyo/langchain';
 * import { ChatOpenAI } from '@langchain/openai';
 * import { AgentExecutor, createOpenAIToolsAgent } from 'langchain/agents';
 *
 * const tools = createKamiyoTools({ connection, wallet });
 * const agent = createOpenAIToolsAgent({ llm, tools, prompt });
 * const executor = AgentExecutor.fromAgentAndTools({ agent, tools });
 *
 * await executor.invoke({
 *   input: "Create a 0.1 SOL agreement with provider ABC123 for order-456"
 * });
 * ```
 */

export { createKamiyoTools, createKamiyoToolsFromEnv } from "./tools";
export type { KamiyoToolsConfig } from "./tools";
