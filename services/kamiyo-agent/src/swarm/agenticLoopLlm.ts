/**
 * LLM-Driven Agentic Loop
 *
 * Upgrades the bounded agentic loop from deterministic tool selection
 * to LLM-driven multi-step reasoning. Uses the OpenAI-compatible API
 * so any provider works: OpenAI, Anthropic, OpenRouter, Together,
 * Groq, Ollama, or any compatible endpoint.
 *
 * Activates when KAMIYO_AGENTIC_LOOP_API_KEY is set; falls back to
 * deterministic loop on any LLM failure.
 *
 * @module swarm/agenticLoopLlm
 */

import OpenAI from 'openai';
import type { AgentMemoryRow } from './memory.js';
import { formatMemoryInjection } from './memory.js';
import type { AgenticLoopResult, AgenticOpportunity, AgenticTurn } from './agenticLoop.js';
import type { ReportOutcomeInput } from './agenticTools.js';
import {
  executeHttpRequest,
  verifyResult,
  buildRetryUrl,
  getToolDefinitions,
} from './agenticTools.js';

// ── Types ──────────────────────────────────────────────────────────────

export type LlmLoopConfig = {
  maxTurns: number;
  totalBudgetSol: number;
  timeoutMs: number;
  fetchFn?: typeof globalThis.fetch;
  apiKey: string;
  baseUrl?: string;
  model: string;
  maxTokens: number;
  maxCostUsd: number;
  llmTimeoutMs: number;
  onTurn?: (turn: AgenticTurn, llmReasoning?: string) => void;
  onUsage?: (model: string, usage: { input_tokens: number; output_tokens: number }) => void;
  clientFactory?: (apiKey: string, baseUrl?: string) => OpenAI;
};

export class LlmFallbackError extends Error {
  constructor(
    message: string,
    public readonly partialTurns: AgenticTurn[],
    public readonly costUsdSoFar: number
  ) {
    super(message);
    this.name = 'LlmFallbackError';
  }
}

// ── Cost Estimation ────────────────────────────────────────────────────

const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'claude-sonnet-4-20250514': { input: 3, output: 15 },
  'claude-haiku-4-20250514': { input: 0.8, output: 4 },
  'gpt-4o': { input: 2.5, output: 10 },
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  'gpt-4.1-mini': { input: 0.4, output: 1.6 },
  'gpt-4.1-nano': { input: 0.1, output: 0.4 },
  'deepseek-chat': { input: 0.14, output: 0.28 },
  'meta-llama/llama-4-maverick': { input: 0.2, output: 0.6 },
};

function estimateCostUsd(
  model: string,
  usage: { input_tokens: number; output_tokens: number }
): number {
  const pricing = MODEL_PRICING[model] ?? { input: 3, output: 15 };
  return (
    (usage.input_tokens / 1_000_000) * pricing.input +
    (usage.output_tokens / 1_000_000) * pricing.output
  );
}

function usdToSol(usd: number, solPriceUsd = 150): number {
  return usd / solPriceUsd;
}

// ── Retry / Timeout Helpers ────────────────────────────────────────────

async function withRetries<T>(
  fn: () => Promise<T>,
  opts: { retries: number; baseDelayMs: number }
): Promise<T> {
  let attempt = 0;
  let delay = opts.baseDelayMs;
  for (;;) {
    try {
      return await fn();
    } catch (e) {
      attempt += 1;
      if (attempt > opts.retries) throw e;
      await new Promise(res => setTimeout(res, delay));
      delay = Math.min(delay * 2, 5000);
    }
  }
}

async function withTimeout<T>(p: Promise<T>, ms: number, msg?: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      p,
      new Promise<T>((_, rej) => {
        timer = setTimeout(() => rej(new Error(msg ?? `timeout after ${ms}ms`)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// ── System Prompt ──────────────────────────────────────────────────────

function buildSystemPrompt(opportunity: AgenticOpportunity, memories: AgentMemoryRow[]): string {
  const memoryBlock = formatMemoryInjection(memories);

  return `You are the KAMIYO autonomous agent executing an opportunity.

## Opportunity
- ID: ${opportunity.id}
- Source: ${opportunity.source}
- Title: ${opportunity.title}
- URL: ${opportunity.url}
- Method: ${opportunity.method ?? 'POST'}${opportunity.expectedFields ? `\n- Expected response fields: ${opportunity.expectedFields.join(', ')}` : ''}${opportunity.body ? `\n- Request body: ${opportunity.body}` : ''}

## Your Task
Execute this opportunity by making HTTP requests, verifying responses, and retrying with modifications if needed.

## Strategy
1. Make the HTTP request to the opportunity endpoint.
2. Verify the response quality against expected fields and status codes.
3. If verification fails, analyze the error and retry with modifications.
4. Call report_outcome with your final result to exit.

## Constraints
- Minimize unnecessary requests.
- 401, 403, 404 are non-retryable — report failure immediately.
- 429 (rate limited) — note for future reference, retry with backoff headers.
- Always call report_outcome as your final action.
${memoryBlock ? `\n## Agent Memory\n${memoryBlock}` : ''}`;
}

// ── Tool Conversion (OpenAI function calling format) ───────────────────

function buildOpenAiTools(): OpenAI.ChatCompletionTool[] {
  return getToolDefinitions().map(tool => ({
    type: 'function' as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: {
        type: 'object' as const,
        ...tool.parameters,
      },
    },
  }));
}

// ── Tool Executor ──────────────────────────────────────────────────────

async function executeTool(
  name: string,
  input: Record<string, unknown>,
  fetchFn: typeof globalThis.fetch,
  timeoutMs: number
): Promise<import('./agenticTools.js').AgenticToolResult> {
  switch (name) {
    case 'http_request':
      return executeHttpRequest(
        {
          url: input.url as string,
          method: input.method as string as 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
          headers: input.headers as Record<string, string> | undefined,
          body: input.body as string | undefined,
          timeoutMs,
        },
        fetchFn
      );

    case 'verify_result':
      return verifyResult({
        httpStatus: input.httpStatus as number,
        responseBody: input.responseBody,
        expectedFields: input.expectedFields as string[] | undefined,
        minContentLength: input.minContentLength as number | undefined,
      });

    case 'retry_with_modification': {
      const modifications = (input.modifications ?? {}) as Record<string, unknown>;
      const retryUrl = buildRetryUrl({
        originalUrl: input.originalUrl as string,
        modifications: modifications as {
          headers?: Record<string, string>;
          body?: string;
          method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
          queryParams?: Record<string, string>;
        },
      });
      return executeHttpRequest(
        {
          url: retryUrl,
          method: ((modifications.method as string) ?? 'POST') as
            | 'GET'
            | 'POST'
            | 'PUT'
            | 'PATCH'
            | 'DELETE',
          headers: modifications.headers as Record<string, string> | undefined,
          body: modifications.body as string | undefined,
          timeoutMs,
        },
        fetchFn
      );
    }

    case 'report_outcome':
      return {
        tool: 'report_outcome',
        success: true,
        output: input,
      };

    default:
      return {
        tool: name as 'report_outcome',
        success: false,
        output: null,
        error: `Unknown tool: ${name}`,
      };
  }
}

// ── Main LLM Loop ──────────────────────────────────────────────────────

export async function runAgenticLoopLlm(
  config: LlmLoopConfig,
  opportunity: AgenticOpportunity,
  memories?: AgentMemoryRow[]
): Promise<AgenticLoopResult> {
  const client = config.clientFactory
    ? config.clientFactory(config.apiKey, config.baseUrl)
    : new OpenAI({
        apiKey: config.apiKey,
        ...(config.baseUrl ? { baseURL: config.baseUrl } : {}),
      });
  const fetchFn = config.fetchFn ?? globalThis.fetch;
  const tools = buildOpenAiTools();
  const systemPrompt = buildSystemPrompt(opportunity, memories ?? []);

  const turns: AgenticTurn[] = [];
  const startTime = Date.now();
  let totalCostUsd = 0;

  const messages: OpenAI.ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt },
    {
      role: 'user',
      content: `Execute this opportunity now. Start by making the HTTP request to ${opportunity.url}.`,
    },
  ];

  for (let turn = 0; turn < config.maxTurns; turn++) {
    // Check overall timeout
    if (Date.now() - startTime > config.timeoutMs) {
      return {
        turns,
        totalTurns: turns.length,
        finalStatus: 'failed',
        reason: 'timeout_exceeded',
        totalCostSol: usdToSol(totalCostUsd),
      };
    }

    // Check cost cap
    if (totalCostUsd >= config.maxCostUsd) {
      return {
        turns,
        totalTurns: turns.length,
        finalStatus: 'failed',
        reason: 'cost_cap_exceeded',
        totalCostSol: usdToSol(totalCostUsd),
      };
    }

    // Call LLM
    let response: OpenAI.ChatCompletion;
    try {
      const createCall = () =>
        client.chat.completions.create({
          model: config.model,
          max_tokens: config.maxTokens,
          tools,
          messages,
        });

      response = await withRetries(
        () => withTimeout(createCall(), config.llmTimeoutMs, 'LLM request timed out'),
        { retries: 1, baseDelayMs: 300 }
      );
    } catch (err) {
      throw new LlmFallbackError(
        `LLM call failed on turn ${turn + 1}: ${err instanceof Error ? err.message : String(err)}`,
        turns,
        totalCostUsd
      );
    }

    // Track usage
    if (response.usage) {
      const usage = {
        input_tokens: response.usage.prompt_tokens,
        output_tokens: response.usage.completion_tokens,
      };
      const turnCost = estimateCostUsd(config.model, usage);
      totalCostUsd += turnCost;
      config.onUsage?.(config.model, usage);
    }

    // Parse response
    const choice = response.choices[0];
    if (!choice) {
      return {
        turns,
        totalTurns: turns.length,
        finalStatus: 'failed',
        reason: 'llm_empty_response',
        totalCostSol: usdToSol(totalCostUsd),
      };
    }

    const assistantMessage = choice.message;
    const toolCalls = assistantMessage.tool_calls ?? [];
    const reasoning = assistantMessage.content ?? '';

    messages.push(assistantMessage);

    // No tool calls — model ended naturally
    if (toolCalls.length === 0) {
      return {
        turns,
        totalTurns: turns.length,
        finalStatus: turns.some(t => t.toolResult.success) ? 'executed' : 'failed',
        reason: 'llm_ended_without_report',
        totalCostSol: usdToSol(totalCostUsd),
        output: reasoning || undefined,
      };
    }

    // Execute each tool call and collect results
    for (const call of toolCalls) {
      const turnStart = Date.now();
      const fnArgs = JSON.parse(call.function.arguments) as Record<string, unknown>;
      const remainingMs = config.timeoutMs - (Date.now() - startTime);

      const toolResult = await executeTool(
        call.function.name,
        fnArgs,
        fetchFn,
        Math.min(remainingMs, 20_000)
      );

      const agenticTurn: AgenticTurn = {
        turnNumber: turns.length + 1,
        toolName: call.function.name,
        toolInput: fnArgs,
        toolResult,
        durationMs: Date.now() - turnStart,
      };
      turns.push(agenticTurn);
      config.onTurn?.(agenticTurn, reasoning);

      // Check if this is report_outcome — exit the loop
      if (call.function.name === 'report_outcome') {
        const outcome = fnArgs as unknown as ReportOutcomeInput;
        return {
          turns,
          totalTurns: turns.length,
          finalStatus: outcome.status,
          reason: outcome.reason,
          totalCostSol: usdToSol(totalCostUsd),
          output: outcome.output,
        };
      }

      // Push tool result back for the next LLM turn
      messages.push({
        role: 'tool',
        tool_call_id: call.id,
        content: JSON.stringify(toolResult),
      });
    }
  }

  // Max turns exhausted
  return {
    turns,
    totalTurns: turns.length,
    finalStatus: 'failed',
    reason: 'max_turns_exhausted',
    totalCostSol: usdToSol(totalCostUsd),
  };
}
