import assert from 'node:assert/strict';
import test from 'node:test';
import type OpenAI from 'openai';

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
    model: overrides.model ?? 'gpt-4o-mini',
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

// ── Mock OpenAI Client (chat completions format) ───────────────────────

type MockCompletion = {
  choices: Array<{
    message: {
      role: 'assistant';
      content: string | null;
      tool_calls?: Array<{
        id: string;
        type: 'function';
        function: { name: string; arguments: string };
      }>;
    };
    finish_reason: string;
  }>;
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
};

function makeMockClient(responses: MockCompletion[]): (apiKey: string, baseUrl?: string) => OpenAI {
  return () => {
    let callIndex = 0;
    return {
      chat: {
        completions: {
          create: async () => {
            const resp = responses[Math.min(callIndex, responses.length - 1)];
            callIndex++;
            return resp;
          },
        },
      },
    } as unknown as OpenAI;
  };
}

function makeToolCall(name: string, args: Record<string, unknown>, id?: string) {
  return {
    id: id ?? `call-${name}`,
    type: 'function' as const,
    function: { name, arguments: JSON.stringify(args) },
  };
}

function makeCompletion(
  content: string | null,
  toolCalls?: ReturnType<typeof makeToolCall>[],
  usage?: { prompt_tokens: number; completion_tokens: number }
): MockCompletion {
  const u = usage ?? { prompt_tokens: 500, completion_tokens: 200 };
  return {
    choices: [
      {
        message: {
          role: 'assistant',
          content,
          tool_calls: toolCalls && toolCalls.length > 0 ? toolCalls : undefined,
        },
        finish_reason: toolCalls && toolCalls.length > 0 ? 'tool_calls' : 'stop',
      },
    ],
    usage: { ...u, total_tokens: u.prompt_tokens + u.completion_tokens },
  };
}

// ── Tests ──────────────────────────────────────────────────────────────

test('LLM loop: happy path — http_request → report_outcome(executed)', async () => {
  const responses: MockCompletion[] = [
    makeCompletion('Making the request now.', [
      makeToolCall('http_request', { url: 'https://api.example.com/task', method: 'POST' }),
    ]),
    makeCompletion('Request succeeded.', [
      makeToolCall('report_outcome', {
        status: 'executed',
        reason: 'task_completed',
        output: { result: 'ok' },
      }),
    ]),
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
  const responses: MockCompletion[] = [
    makeCompletion(null, [
      makeToolCall('http_request', { url: 'https://api.example.com/task', method: 'POST' }),
    ]),
    makeCompletion(null, [
      makeToolCall('report_outcome', { status: 'failed', reason: 'endpoint_unavailable' }),
    ]),
  ];

  const result = await runAgenticLoopLlm(
    makeLlmConfig({ clientFactory: makeMockClient(responses) }),
    makeOpportunity()
  );

  assert.equal(result.finalStatus, 'failed');
  assert.equal(result.reason, 'endpoint_unavailable');
});

test('LLM loop: cost cap exceeded', async () => {
  const expensive = { prompt_tokens: 100_000, completion_tokens: 50_000 };
  const responses: MockCompletion[] = [
    makeCompletion(
      null,
      [makeToolCall('http_request', { url: 'https://api.example.com/task', method: 'POST' })],
      expensive
    ),
    makeCompletion(
      null,
      [makeToolCall('http_request', { url: 'https://api.example.com/task', method: 'POST' })],
      expensive
    ),
  ];

  const result = await runAgenticLoopLlm(
    makeLlmConfig({
      maxCostUsd: 0.001,
      clientFactory: makeMockClient(responses),
    }),
    makeOpportunity()
  );

  assert.equal(result.finalStatus, 'failed');
  assert.equal(result.reason, 'cost_cap_exceeded');
});

test('LLM loop: overall timeout exceeded', async () => {
  const slowClient = () => {
    return {
      chat: {
        completions: {
          create: async () => {
            await new Promise(res => setTimeout(res, 30));
            return makeCompletion(null, [
              makeToolCall('http_request', { url: 'https://api.example.com/task', method: 'POST' }),
            ]);
          },
        },
      },
    } as unknown as OpenAI;
  };

  const result = await runAgenticLoopLlm(
    makeLlmConfig({
      timeoutMs: 20,
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
      chat: {
        completions: {
          create: async () => {
            throw new Error('API rate limited');
          },
        },
      },
    } as unknown as OpenAI;
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
  const responses: MockCompletion[] = [makeCompletion('I cannot execute this opportunity.')];

  const result = await runAgenticLoopLlm(
    makeLlmConfig({ clientFactory: makeMockClient(responses) }),
    makeOpportunity()
  );

  assert.equal(result.reason, 'llm_ended_without_report');
  assert.equal(result.totalTurns, 0);
});

test('LLM loop: max turns exhausted', async () => {
  const responses: MockCompletion[] = Array.from({ length: 5 }, () =>
    makeCompletion(null, [
      makeToolCall('http_request', { url: 'https://api.example.com/task', method: 'POST' }),
    ])
  );

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

  const responses: MockCompletion[] = [
    makeCompletion(
      null,
      [makeToolCall('http_request', { url: 'https://api.example.com/task', method: 'POST' })],
      { prompt_tokens: 300, completion_tokens: 100 }
    ),
    makeCompletion(null, [makeToolCall('report_outcome', { status: 'executed', reason: 'done' })], {
      prompt_tokens: 400,
      completion_tokens: 150,
    }),
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
  assert.equal(usageEvents[0].model, 'gpt-4o-mini');
  assert.equal(usageEvents[0].usage.input_tokens, 300);
});

test('dispatcher: LLM failure falls back to deterministic loop', async () => {
  const failingClient = () => {
    return {
      chat: {
        completions: {
          create: async () => {
            throw new Error('LLM unavailable');
          },
        },
      },
    } as unknown as OpenAI;
  };

  const result = await runAgenticLoop(
    {
      maxTurns: 3,
      totalBudgetSol: 0.005,
      timeoutMs: 30_000,
      fetchFn: mockFetch(200, { result: 'ok' }),
      llm: {
        apiKey: 'test-key',
        model: 'gpt-4o-mini',
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
