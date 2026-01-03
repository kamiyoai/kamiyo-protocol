/**
 * @mitama/langchain - LangChain Tools for Mitama Protocol
 *
 * Provides LangChain-compatible tools for autonomous agents to:
 * - Create payment agreements with providers
 * - Release funds on successful delivery
 * - Dispute for oracle arbitration
 * - Check agreement status
 *
 * @example
 * ```typescript
 * import { createMitamaTools } from '@mitama/langchain';
 * import { ChatOpenAI } from '@langchain/openai';
 * import { AgentExecutor, createOpenAIToolsAgent } from 'langchain/agents';
 *
 * const tools = createMitamaTools({ connection, wallet });
 * const agent = createOpenAIToolsAgent({ llm, tools, prompt });
 * const executor = AgentExecutor.fromAgentAndTools({ agent, tools });
 *
 * await executor.invoke({
 *   input: "Create a 0.1 SOL agreement with provider ABC123 for order-456"
 * });
 * ```
 */

export { createMitamaTools, createMitamaToolsFromEnv } from "./tools";
export type { MitamaToolsConfig } from "./tools";
