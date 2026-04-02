/**
 * Bounded Agentic Loops
 *
 * Replaces fire-and-forget HTTP POST with bounded multi-step reasoning.
 * Agents can recover from failures within a single job by retrying with
 * modifications, verifying results, and making decisions.
 *
 * When KAMIYO_AGENTIC_LOOP_API_KEY is configured, delegates tool
 * selection to Claude. Falls back to deterministic loop on LLM failure.
 *
 * @module swarm/agenticLoop
 */

import type { AgentMemoryRow } from './memory.js';
import {
  executeHttpRequest,
  verifyResult,
  buildRetryUrl,
  getToolDefinitions,
  type AgenticToolResult,
} from './agenticTools.js';
import { runAgenticLoopLlm, LlmFallbackError, type LlmLoopConfig } from './agenticLoopLlm.js';

export type AgenticLoopLlmConfig = {
  apiKey: string;
  model: string;
  maxTokens: number;
  maxCostUsd: number;
  llmTimeoutMs: number;
  onTurn?: LlmLoopConfig['onTurn'];
  onUsage?: LlmLoopConfig['onUsage'];
  clientFactory?: LlmLoopConfig['clientFactory'];
};

export type AgenticLoopConfig = {
  maxTurns: number;
  totalBudgetSol: number;
  timeoutMs: number;
  fetchFn?: typeof globalThis.fetch;
  llm?: AgenticLoopLlmConfig;
};

export type AgenticTurn = {
  turnNumber: number;
  toolName: string;
  toolInput: Record<string, unknown>;
  toolResult: AgenticToolResult;
  durationMs: number;
};

export type AgenticLoopResult = {
  turns: AgenticTurn[];
  totalTurns: number;
  finalStatus: 'executed' | 'failed' | 'skipped';
  reason: string;
  totalCostSol: number;
  output?: unknown;
};

export type AgenticOpportunity = {
  id: string;
  source: string;
  title: string;
  url: string;
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  headers?: Record<string, string>;
  body?: string;
  expectedFields?: string[];
};

/**
 * Run a bounded agentic loop for a single opportunity.
 *
 * If `config.llm` is set, delegates to the LLM-driven loop.
 * Falls back to the deterministic loop on any LLM failure.
 */
export async function runAgenticLoop(
  config: AgenticLoopConfig,
  opportunity: AgenticOpportunity,
  memories?: AgentMemoryRow[]
): Promise<AgenticLoopResult> {
  if (config.llm) {
    try {
      return await runAgenticLoopLlm(
        {
          maxTurns: config.maxTurns,
          totalBudgetSol: config.totalBudgetSol,
          timeoutMs: config.timeoutMs,
          fetchFn: config.fetchFn,
          apiKey: config.llm.apiKey,
          model: config.llm.model,
          maxTokens: config.llm.maxTokens,
          maxCostUsd: config.llm.maxCostUsd,
          llmTimeoutMs: config.llm.llmTimeoutMs,
          onTurn: config.llm.onTurn,
          onUsage: config.llm.onUsage,
          clientFactory: config.llm.clientFactory,
        },
        opportunity,
        memories
      );
    } catch (err) {
      if (err instanceof LlmFallbackError) {
        console.warn(`[agenticLoop] LLM fallback: ${err.message}`);
      } else {
        console.warn(
          `[agenticLoop] LLM error, falling back: ${err instanceof Error ? err.message : String(err)}`
        );
      }
      // Fall through to deterministic loop
    }
  }

  return runDeterministicLoop(config, opportunity, memories);
}

// ── Deterministic Loop ─────────────────────────────────────────────────

/**
 * Deterministic loop: execute HTTP request → verify → retry.
 * No LLM reasoning — strategy is hardcoded.
 */
async function runDeterministicLoop(
  config: AgenticLoopConfig,
  opportunity: AgenticOpportunity,
  memories?: AgentMemoryRow[]
): Promise<AgenticLoopResult> {
  const turns: AgenticTurn[] = [];
  const startTime = Date.now();
  const fetchFn = config.fetchFn ?? globalThis.fetch;
  let lastHttpOutput: { status: number; body: unknown } | null = null;

  // Check for relevant failure memories to adjust strategy
  const failureMemories = (memories ?? []).filter(
    m => m.type === 'failure_pattern' && m.source === opportunity.source
  );
  const hasRateLimitHistory = failureMemories.some(m =>
    m.content.toLowerCase().includes('rate limit')
  );

  for (let turn = 0; turn < config.maxTurns; turn++) {
    // Check timeout
    if (Date.now() - startTime > config.timeoutMs) {
      return {
        turns,
        totalTurns: turns.length,
        finalStatus: 'failed',
        reason: 'timeout_exceeded',
        totalCostSol: 0,
      };
    }

    const turnStart = Date.now();

    if (turn === 0) {
      // Turn 1: Execute initial HTTP request
      const headers = { ...opportunity.headers };
      if (hasRateLimitHistory) {
        // Add small delay hint in user-agent to signal polite client
        headers['x-request-priority'] = 'low';
      }

      const result = await executeHttpRequest(
        {
          url: opportunity.url,
          method: opportunity.method ?? 'POST',
          headers,
          body: opportunity.body,
          timeoutMs: Math.min(config.timeoutMs - (Date.now() - startTime), 20_000),
        },
        fetchFn
      );

      turns.push({
        turnNumber: turn + 1,
        toolName: 'http_request',
        toolInput: { url: opportunity.url, method: opportunity.method ?? 'POST' },
        toolResult: result,
        durationMs: Date.now() - turnStart,
      });

      if (result.output && typeof result.output === 'object') {
        const out = result.output as Record<string, unknown>;
        lastHttpOutput = {
          status: (out.status as number) ?? 0,
          body: out.body,
        };
      }

      // If first request succeeds, verify immediately
      if (result.success && lastHttpOutput) {
        const verifyTurnStart = Date.now();
        const vResult = verifyResult({
          httpStatus: lastHttpOutput.status,
          responseBody: lastHttpOutput.body,
          expectedFields: opportunity.expectedFields,
        });

        turn++; // count verify as a turn
        turns.push({
          turnNumber: turn + 1,
          toolName: 'verify_result',
          toolInput: { httpStatus: lastHttpOutput.status },
          toolResult: vResult,
          durationMs: Date.now() - verifyTurnStart,
        });

        if (vResult.success) {
          return {
            turns,
            totalTurns: turns.length,
            finalStatus: 'executed',
            reason: 'verified_success',
            totalCostSol: 0,
            output: lastHttpOutput.body,
          };
        }
        // Verification failed — continue loop for retry
      }

      if (!result.success) {
        // Check if it's a non-retryable error
        if (
          lastHttpOutput &&
          (lastHttpOutput.status === 401 ||
            lastHttpOutput.status === 403 ||
            lastHttpOutput.status === 404)
        ) {
          return {
            turns,
            totalTurns: turns.length,
            finalStatus: 'failed',
            reason: `non_retryable_http_${lastHttpOutput.status}`,
            totalCostSol: 0,
          };
        }
      }
    } else {
      // Subsequent turns: retry with modifications
      const retryUrl = buildRetryUrl({
        originalUrl: opportunity.url,
        modifications: {
          headers: { 'x-retry-attempt': String(turn) },
        },
      });

      const result = await executeHttpRequest(
        {
          url: retryUrl,
          method: opportunity.method ?? 'POST',
          headers: {
            ...opportunity.headers,
            'x-retry-attempt': String(turn),
          },
          body: opportunity.body,
          timeoutMs: Math.min(config.timeoutMs - (Date.now() - startTime), 20_000),
        },
        fetchFn
      );

      turns.push({
        turnNumber: turn + 1,
        toolName: 'retry_with_modification',
        toolInput: { url: retryUrl, retryAttempt: turn },
        toolResult: result,
        durationMs: Date.now() - turnStart,
      });

      if (result.output && typeof result.output === 'object') {
        const out = result.output as Record<string, unknown>;
        lastHttpOutput = {
          status: (out.status as number) ?? 0,
          body: out.body,
        };
      }

      if (result.success) {
        return {
          turns,
          totalTurns: turns.length,
          finalStatus: 'executed',
          reason: `retry_success_turn_${turn + 1}`,
          totalCostSol: 0,
          output: lastHttpOutput?.body,
        };
      }
    }
  }

  // Exhausted all turns
  return {
    turns,
    totalTurns: turns.length,
    finalStatus: 'failed',
    reason: 'max_turns_exhausted',
    totalCostSol: 0,
    output: lastHttpOutput?.body,
  };
}

/**
 * Determine if an opportunity should use the agentic loop.
 * Simple gating based on source type and failure history.
 */
export function shouldUseAgenticLoop(
  source: string,
  previouslyFailed: boolean,
  memories?: AgentMemoryRow[]
): boolean {
  // Always use agentic loop for marketplace opportunities
  if (source === 'near_market' || source === 'relevance' || source === 'agent_ai') {
    return true;
  }

  // Use agentic loop for previously-failed opportunities (memory-informed retry)
  if (previouslyFailed && memories && memories.length > 0) {
    return true;
  }

  // Simple direct API calls bypass it
  return false;
}

/** Expose tool definitions for future LLM-driven upgrades */
export { getToolDefinitions };
