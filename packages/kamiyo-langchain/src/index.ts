/**
 * @kamiyo/langchain - LangChain Tools for Kamiyo Protocol
 *
 * Provides LangChain-compatible tools for autonomous agents to:
 * - Create payment agreements with providers
 * - Release funds on successful delivery
 * - Dispute for oracle arbitration
 * - Check agreement status
 * - Consume x402-gated APIs with automatic USDC payment
 *
 * @example Escrow tools (Solana)
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
 *
 * @example x402 API tools (Solana USDC)
 * ```typescript
 * import { createX402Tools, createX402ToolsConfig } from '@kamiyo/langchain';
 * import { Keypair, Connection } from '@solana/web3.js';
 *
 * const wallet = Keypair.fromSecretKey(keyBytes);
 * const connection = new Connection('https://api.mainnet-beta.solana.com');
 * const x402Tools = createX402Tools({
 *   wallet,
 *   connection,
 *   maxPriceUsd: 0.10,
 * });
 *
 * // Agent can now fetch x402-gated APIs with signed payments
 * ```
 */

export { createKamiyoTools, createKamiyoToolsFromEnv } from "./tools";
export type { KamiyoToolsConfig } from "./tools";

export { createX402Tools, createX402ToolsConfig, createX402ToolsFromEnv } from "./x402-tools";
export type { X402ToolsConfig } from "./x402-tools";
