import assert from 'node:assert/strict';
import test from 'node:test';
import register, { TOOL_NAMES, type AgentTool, type OpenClawPluginApi } from './index.js';

function createMockApi(pluginConfig?: Record<string, unknown>): {
  api: OpenClawPluginApi;
  tools: AgentTool[];
  options: Array<{ optional?: boolean } | undefined>;
} {
  const tools: AgentTool[] = [];
  const options: Array<{ optional?: boolean } | undefined> = [];
  const api: OpenClawPluginApi = {
    pluginConfig,
    registerTool(tool, opts) {
      tools.push(tool);
      options.push(opts);
    },
  };
  return { api, tools, options };
}

test('registers all expected optional tools', () => {
  const { api, tools, options } = createMockApi({ rpcUrl: 'http://localhost:8899' });
  register(api);

  assert.deepEqual(
    tools.map((tool) => tool.name),
    [...TOOL_NAMES],
  );

  for (const opt of options) {
    assert.equal(opt?.optional, true);
  }
});

test('falls back to legacy registerTool signature', () => {
  const tools: AgentTool[] = [];
  let optionedCalls = 0;
  let fallbackCalls = 0;

  const api: OpenClawPluginApi = {
    pluginConfig: { rpcUrl: 'http://localhost:8899' },
    registerTool(tool: AgentTool) {
      if (arguments.length > 1) {
        optionedCalls += 1;
        throw new Error('legacy registerTool does not accept options');
      }
      fallbackCalls += 1;
      tools.push(tool);
    },
  };

  register(api);

  assert.equal(optionedCalls, TOOL_NAMES.length);
  assert.equal(fallbackCalls, TOOL_NAMES.length);
  assert.deepEqual(
    tools.map((tool) => tool.name),
    [...TOOL_NAMES],
  );
});

test('does not swallow non-legacy registerTool errors', () => {
  const api: OpenClawPluginApi = {
    pluginConfig: { rpcUrl: 'http://localhost:8899' },
    registerTool() {
      throw new Error('registration failed');
    },
  };

  assert.throws(
    () => register(api),
    /registration failed/,
  );
});

test('oracle consensus preview returns deterministic result', async () => {
  const { api, tools } = createMockApi({ rpcUrl: 'http://localhost:8899' });
  register(api);

  const tool = tools.find((entry) => entry.name === 'kamiyo_oracle_consensus_preview');
  assert.ok(tool, 'consensus tool must be registered');

  const result = await tool.execute('call-1', { scores: [90, 84, 81, 10], maxDeviation: 15 });
  const details = result.details as {
    consensusScore: number;
    validScores: number[];
    outliers: number[];
  };

  assert.equal(details.consensusScore, 84);
  assert.deepEqual(details.validScores, [81, 84, 90]);
  assert.deepEqual(details.outliers, [10]);
});

test('x402 check price applies timeout signal to fetch', async () => {
  const { api, tools } = createMockApi({ rpcUrl: 'http://localhost:8899', x402TimeoutMs: 5000 });
  register(api);

  const tool = tools.find((entry) => entry.name === 'kamiyo_x402_check_price');
  assert.ok(tool, 'x402 check price tool must be registered');

  const originalFetch = globalThis.fetch;
  let hasSignal = false;
  globalThis.fetch = (async (_input: unknown, init?: RequestInit) => {
    hasSignal = Boolean(init?.signal);
    return new Response(JSON.stringify({ price: 1 }), {
      status: 402,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof globalThis.fetch;

  try {
    await tool.execute('call-3', { url: 'https://example.com/paywalled' });
    assert.equal(hasSignal, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('write operations require signer when no private key is configured', async () => {
  const { api, tools } = createMockApi({ rpcUrl: 'http://localhost:8899' });
  register(api);

  const tool = tools.find((entry) => entry.name === 'kamiyo_staked_identity_create');
  assert.ok(tool, 'identity create tool must be registered');

  await assert.rejects(
    () => tool.execute('call-2', { name: 'agent-1', agentType: 'service', stakeSol: 1 }),
    /requires a signer/i,
  );
});
