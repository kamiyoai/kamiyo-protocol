import assert from 'node:assert/strict';
import test from 'node:test';
import type Anthropic from '@anthropic-ai/sdk';

import { runAgenticLoopLlm, LlmFallbackError } from './agenticLoopLlm.js';
import { runAgenticLoop } from './agenticLoop.js';
import type { AgenticOpportunity } from './agenticLoop.js';
import type { LlmLoopConfig } from './agenticLoopLlm.js';
import type { AgenticTurn } from './agenticLoop.js';

// ── Factories ──────────────────────────────────────────────────────────

function makeOpportunity(overrides: Partial<AgenticOpportunity> = {}): AgenticOpportunity {
  return {
    id: overrides.id ?? 'opp-1',
    source: overrides.source ?? 'relevance',
    title: overrides.title ?? 'Test opportunity',
    url: overrides.url ?? 'https://api.example.com/task',
    method: overrides.method ?? 'POST',
    headers: overrides.headers,
    body: overrides.body,
    expectedFields: overrides.expectedFields,
  };
}

function makeLlmConfig(overrides: Partial<LlmLoopConfig> = {}): LlmLoopConfig {
  return {
    maxTurns: overrides.maxTurns ?? 5,
    totalBudgetSol: overrides.totalBudgetSol ?? 0.005,
    timeoutMs: overrides.timeoutMs ?? 30_000,
    fetchFn: overrides.fetchFn ?? mockFetch(200, { result: 'ok' }),
    apiKey: overrides.apiKey ?? 'test-key',
    model: overrides.model ?? 'claude-sonnet-4-20250514',
    maxTokens: overrides.maxTokens ?? 4096,
    maxCostUsd: overrides.maxCostUsd ?? 0.05,
    llmTimeoutMs: overrides.llmTimeoutMs ?? 30_000,
    onTurn: overrides.onTurn,
    onUsage: overrides.onUsage,
    clientFactory: overrides.clientFactory,
  };
}

function mockFetch(status: number, body: unknown): typeof globalThis.fetch {
  return async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });
}

// ── Mock Anthropic Client ──────────────────────────────────────────────

type MockMessage = {
  content: Array<
    | { type: 'text'; text: string }
    | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  >;
  usage: { input_tokens: number; output_tokens: number };
  stop_reason: string;
};

function makeMockClient(responses: MockMessage[]): (apiKey: string) => Anthropic {
  return () => {
    let callIndex = 0;
    return {
      messages: {
        create: async () => {
          const resp = responses[Math.min(callIndex, responses.length - 1)];
          callIndex++;
          return resp;
        },
      },
    } as unknown as Anthropic;
  };
}

function makeToolUse(name: string, input: Record<string, unknown>, id?: string) {
  return { type: 'tool_use' as const, id: id ?? `call-${name}`, name, input };
}

function makeTextBlock(text: string) {
  return { type: 'text' as const, text };
}

const SMALL_USAGE = { input_tokens: 500, output_tokens: 200 };

// ── Tests ──────────────────────────────────────────────────────────────

test('LLM loop: happy path — http_request → report_outcome(executed)', async () => {
  const responses: MockMessage[] = [
    // Turn 1: Claude calls http_request
    {
      content: [
        makeTextBlock('Making the request now.'),
        makeToolUse('http_request', {
          url: 'https://api.example.com/task',
          method: 'POST',
        }),
      ],
      usage: SMALL_USAGE,
      stop_reason: 'tool_use',
    },
    // Turn 2: Claude calls report_outcome
    {
      content: [
        makeTextBlock('Request succeeded.'),
        makeToolUse('report_outcome', {
          status: 'executed',
          reason: 'task_completed',
          output: { result: 'ok' },
        }),
      ],
      usage: SMALL_USAGE,
      stop_reason: 'tool_use',
    },
  ];

  const result = await runAgenticLoopLlm(
    makeLlmConfig({ clientFactory: makeMockClient(responses) }),
    makeOpportunity()
  );

  assert.equal(result.finalStatus, 'executed');
  assert.equal(result.reason, 'task_completed');
  assert.ok(result.totalTurns >= 1);
  assert.ok(result.totalCostSol > 0);
});

test('LLM loop: report_outcome with failure', async () => {
  const responses: MockMessage[] = [
    {
      content: [
        makeToolUse('http_request', {
          url: 'https://api.example.com/task',
          method: 'POST',
        }),
      ],
      usage: SMALL_USAGE,
      stop_reason: 'tool_use',
    },
    {
      content: [
        makeToolUse('report_outcome', {
          status: 'failed',
          reason: 'endpoint_unavailable',
        }),
      ],
      usage: SMALL_USAGE,
      stop_reason: 'tool_use',
    },
  ];

  const result = await runAgenticLoopLlm(
    makeLlmConfig({ clientFactory: makeMockClient(responses) }),
    makeOpportunity()
  );

  assert.equal(result.finalStatus, 'failed');
  assert.equal(result.reason, 'endpoint_unavailable');
});

test('LLM loop: cost cap exceeded', async () => {
  // Each call uses a lot of tokens
  const expensiveUsage = { input_tokens: 100_000, output_tokens: 50_000 };
  const responses: MockMessage[] = [
    {
      content: [
        makeToolUse('http_request', {
          url: 'https://api.example.com/task',
          method: 'POST',
        }),
      ],
      usage: expensiveUsage,
      stop_reason: 'tool_use',
    },
    {
      content: [
        makeToolUse('http_request', {
          url: 'https://api.example.com/task',
          method: 'POST',
        }),
      ],
      usage: expensiveUsage,
      stop_reason: 'tool_use',
    },
  ];

  const result = await runAgenticLoopLlm(
    makeLlmConfig({
      maxCostUsd: 0.001, // Very low cap
      clientFactory: makeMockClient(responses),
    }),
    makeOpportunity()
  );

  assert.equal(result.finalStatus, 'failed');
  assert.equal(result.reason, 'cost_cap_exceeded');
});

test('LLM loop: overall timeout exceeded', async () => {
  // Use a slow mock that delays long enough for the timeout to trigger
  const slowClient = () => {
    return {
      messages: {
        create: async () => {
          // First call succeeds fast, but the tool execution + second call
          // will exceed the timeout
          await new Promise(res => setTimeout(res, 30));
          return {
            content: [
              makeToolUse('http_request', {
                url: 'https://api.example.com/task',
                method: 'POST',
              }),
            ],
            usage: SMALL_USAGE,
            stop_reason: 'tool_use',
          };
        },
      },
    } as unknown as Anthropic;
  };

  const result = await runAgenticLoopLlm(
    makeLlmConfig({
      timeoutMs: 20, // Very short — will expire after first slow LLM call
      clientFactory: () => slowClient(),
    }),
    makeOpportunity()
  );

  assert.equal(result.finalStatus, 'failed');
  assert.equal(result.reason, 'timeout_exceeded');
});

test('LLM loop: API error throws LlmFallbackError', async () => {
  const failingClient = () => {
    return {
      messages: {
        create: async () => {
          throw new Error('API rate limited');
        },
      },
    } as unknown as Anthropic;
  };

  await assert.rejects(
    () =>
      runAgenticLoopLlm(makeLlmConfig({ clientFactory: () => failingClient() }), makeOpportunity()),
    (err: unknown) => {
      assert.ok(err instanceof LlmFallbackError);
      assert.ok(err.message.includes('API rate limited'));
      return true;
    }
  );
});

test('LLM loop: no tool calls — graceful end', async () => {
  const responses: MockMessage[] = [
    {
      content: [makeTextBlock('I cannot execute this opportunity.')],
      usage: SMALL_USAGE,
      stop_reason: 'end_turn',
    },
  ];

  const result = await runAgenticLoopLlm(
    makeLlmConfig({ clientFactory: makeMockClient(responses) }),
    makeOpportunity()
  );

  assert.equal(result.reason, 'llm_ended_without_report');
  assert.equal(result.totalTurns, 0);
});

test('LLM loop: max turns exhausted', async () => {
  // Always returns http_request, never report_outcome
  const responses: MockMessage[] = Array.from({ length: 5 }, () => ({
    content: [
      makeToolUse('http_request', {
        url: 'https://api.example.com/task',
        method: 'POST',
      }),
    ],
    usage: SMALL_USAGE,
    stop_reason: 'tool_use' as const,
  }));

  const result = await runAgenticLoopLlm(
    makeLlmConfig({
      maxTurns: 3,
      clientFactory: makeMockClient(responses),
    }),
    makeOpportunity()
  );

  assert.equal(result.finalStatus, 'failed');
  assert.equal(result.reason, 'max_turns_exhausted');
});

test('LLM loop: onTurn and onUsage callbacks fire', async () => {
  const turnEvents: AgenticTurn[] = [];
  const usageEvents: Array<{
    model: string;
    usage: { input_tokens: number; output_tokens: number };
  }> = [];

  const responses: MockMessage[] = [
    {
      content: [
        makeToolUse('http_request', {
          url: 'https://api.example.com/task',
          method: 'POST',
        }),
      ],
      usage: { input_tokens: 300, output_tokens: 100 },
      stop_reason: 'tool_use',
    },
    {
      content: [
        makeToolUse('report_outcome', {
          status: 'executed',
          reason: 'done',
        }),
      ],
      usage: { input_tokens: 400, output_tokens: 150 },
      stop_reason: 'tool_use',
    },
  ];

  await runAgenticLoopLlm(
    makeLlmConfig({
      clientFactory: makeMockClient(responses),
      onTurn: turn => turnEvents.push(turn),
      onUsage: (model, usage) => usageEvents.push({ model, usage }),
    }),
    makeOpportunity()
  );

  assert.ok(turnEvents.length >= 1);
  assert.equal(turnEvents[0].toolName, 'http_request');
  assert.equal(usageEvents.length, 2);
  assert.equal(usageEvents[0].model, 'claude-sonnet-4-20250514');
  assert.equal(usageEvents[0].usage.input_tokens, 300);
});

test('dispatcher: LLM failure falls back to deterministic loop', async () => {
  const failingClient = () => {
    return {
      messages: {
        create: async () => {
          throw new Error('LLM unavailable');
        },
      },
    } as unknown as Anthropic;
  };

  const result = await runAgenticLoop(
    {
      maxTurns: 3,
      totalBudgetSol: 0.005,
      timeoutMs: 30_000,
      fetchFn: mockFetch(200, { result: 'ok' }),
      llm: {
        apiKey: 'test-key',
        model: 'claude-sonnet-4-20250514',
        maxTokens: 4096,
        maxCostUsd: 0.05,
        llmTimeoutMs: 30_000,
        clientFactory: () => failingClient(),
      },
    },
    makeOpportunity()
  );

  // Should succeed via deterministic fallback
  assert.equal(result.finalStatus, 'executed');
  assert.equal(result.reason, 'verified_success');
  assert.equal(result.totalCostSol, 0); // No LLM cost — deterministic
});
