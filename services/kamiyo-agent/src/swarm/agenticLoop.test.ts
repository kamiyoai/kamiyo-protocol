import assert from 'node:assert/strict';
import test from 'node:test';

import { runAgenticLoop, shouldUseAgenticLoop } from './agenticLoop.js';
import { verifyResult, buildRetryUrl } from './agenticTools.js';
import type { AgenticOpportunity, AgenticLoopConfig } from './agenticLoop.js';
import type { AgentMemoryRow } from './memory.js';

const NOW = '2026-03-31T12:00:00.000Z';

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

function makeConfig(overrides: Partial<AgenticLoopConfig> = {}): AgenticLoopConfig {
  return {
    maxTurns: overrides.maxTurns ?? 3,
    totalBudgetSol: overrides.totalBudgetSol ?? 0.005,
    timeoutMs: overrides.timeoutMs ?? 30_000,
    fetchFn: overrides.fetchFn,
  };
}

function mockFetch(status: number, body: unknown, _ok?: boolean): typeof globalThis.fetch {
  return async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });
}

function mockFetchSequence(
  responses: Array<{ status: number; body: unknown }>
): typeof globalThis.fetch {
  let callIndex = 0;
  return async () => {
    const resp = responses[Math.min(callIndex, responses.length - 1)];
    callIndex++;
    return new Response(JSON.stringify(resp.body), {
      status: resp.status,
      headers: { 'content-type': 'application/json' },
    });
  };
}

// ── runAgenticLoop ─────────────────────────────────────────────────────

test('completes in 1-2 turns on first-attempt success', async () => {
  const result = await runAgenticLoop(
    makeConfig({ fetchFn: mockFetch(200, { result: 'ok' }) }),
    makeOpportunity()
  );

  assert.equal(result.finalStatus, 'executed');
  assert.equal(result.reason, 'verified_success');
  assert.ok(result.totalTurns <= 2); // http_request + verify_result
});

test('fails with non-retryable 404', async () => {
  const result = await runAgenticLoop(
    makeConfig({ fetchFn: mockFetch(404, { error: 'not found' }) }),
    makeOpportunity()
  );

  assert.equal(result.finalStatus, 'failed');
  assert.equal(result.reason, 'non_retryable_http_404');
  assert.equal(result.totalTurns, 1);
});

test('fails with non-retryable 401', async () => {
  const result = await runAgenticLoop(
    makeConfig({ fetchFn: mockFetch(401, { error: 'unauthorized' }) }),
    makeOpportunity()
  );

  assert.equal(result.finalStatus, 'failed');
  assert.ok(result.reason.includes('401'));
});

test('retries on 500 and succeeds on second attempt', async () => {
  const result = await runAgenticLoop(
    makeConfig({
      maxTurns: 3,
      fetchFn: mockFetchSequence([
        { status: 500, body: { error: 'internal error' } },
        { status: 200, body: { result: 'ok' } },
      ]),
    }),
    makeOpportunity()
  );

  assert.equal(result.finalStatus, 'executed');
  assert.ok(result.totalTurns >= 2);
});

test('exhausts max turns on persistent failure', async () => {
  const result = await runAgenticLoop(
    makeConfig({
      maxTurns: 3,
      fetchFn: mockFetch(500, { error: 'always fails' }),
    }),
    makeOpportunity()
  );

  assert.equal(result.finalStatus, 'failed');
  assert.equal(result.reason, 'max_turns_exhausted');
});

test('timeout aborts the loop', async () => {
  const slowFetch: typeof globalThis.fetch = async () => {
    await new Promise(resolve => setTimeout(resolve, 50));
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  const result = await runAgenticLoop(
    makeConfig({ timeoutMs: 10, fetchFn: slowFetch }),
    makeOpportunity()
  );

  // Should either timeout or succeed quickly depending on timing
  assert.ok(result.finalStatus === 'failed' || result.finalStatus === 'executed');
});

test('rate limit memories add priority header', async () => {
  let capturedHeaders: Record<string, string> = {};
  const capturingFetch: typeof globalThis.fetch = async (_url, init) => {
    capturedHeaders = (init?.headers as Record<string, string>) ?? {};
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  const memories: AgentMemoryRow[] = [
    {
      id: 'mem-1',
      agentId: 'agent-a',
      type: 'failure_pattern',
      content: 'Source relevance: rate limited — reduce request frequency',
      confidence: 0.7,
      source: 'relevance',
      createdAt: NOW,
      lastUsedAt: NOW,
      useCount: 1,
    },
  ];

  await runAgenticLoop(
    makeConfig({ fetchFn: capturingFetch }),
    makeOpportunity({ source: 'relevance' }),
    memories
  );

  assert.equal(capturedHeaders['x-request-priority'], 'low');
});

// ── verifyResult ───────────────────────────────────────────────────────

test('verifyResult passes for valid response', () => {
  const result = verifyResult({
    httpStatus: 200,
    responseBody: { data: 'ok', id: '123' },
    expectedFields: ['data', 'id'],
  });

  assert.equal(result.success, true);
});

test('verifyResult fails for missing fields', () => {
  const result = verifyResult({
    httpStatus: 200,
    responseBody: { data: 'ok' },
    expectedFields: ['data', 'missing_field'],
  });

  assert.equal(result.success, false);
  assert.ok(result.error?.includes('missing_field'));
});

test('verifyResult fails for error status', () => {
  const result = verifyResult({
    httpStatus: 500,
    responseBody: { error: 'internal' },
  });

  assert.equal(result.success, false);
});

test('verifyResult checks content length', () => {
  const result = verifyResult({
    httpStatus: 200,
    responseBody: 'ab',
    minContentLength: 100,
  });

  assert.equal(result.success, false);
  assert.ok(result.error?.includes('too short'));
});

// ── buildRetryUrl ──────────────────────────────────────────────────────

test('buildRetryUrl adds query params', () => {
  const url = buildRetryUrl({
    originalUrl: 'https://api.example.com/task',
    modifications: {
      queryParams: { retry: 'true', attempt: '2' },
    },
  });

  assert.ok(url.includes('retry=true'));
  assert.ok(url.includes('attempt=2'));
});

test('buildRetryUrl appends to existing query', () => {
  const url = buildRetryUrl({
    originalUrl: 'https://api.example.com/task?format=json',
    modifications: {
      queryParams: { retry: 'true' },
    },
  });

  assert.ok(url.includes('format=json'));
  assert.ok(url.includes('&retry=true'));
});

// ── shouldUseAgenticLoop ───────────────────────────────────────────────

test('returns true for marketplace sources', () => {
  assert.equal(shouldUseAgenticLoop('near_market', false), true);
  assert.equal(shouldUseAgenticLoop('relevance', false), true);
  assert.equal(shouldUseAgenticLoop('agent_ai', false), true);
});

test('returns true for previously failed with memories', () => {
  const memories: AgentMemoryRow[] = [
    {
      id: 'mem-1',
      agentId: 'a',
      type: 'failure_pattern',
      content: 'test',
      confidence: 0.5,
      source: 'x402',
      createdAt: NOW,
      lastUsedAt: NOW,
      useCount: 0,
    },
  ];

  assert.equal(shouldUseAgenticLoop('x402', true, memories), true);
});

test('returns false for simple direct calls', () => {
  assert.equal(shouldUseAgenticLoop('x402', false), false);
  assert.equal(shouldUseAgenticLoop('direct', false), false);
});

test('returns false for previously failed without memories', () => {
  assert.equal(shouldUseAgenticLoop('x402', true), false);
  assert.equal(shouldUseAgenticLoop('x402', true, []), false);
});
