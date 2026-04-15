import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const dir = mkdtempSync(join(tmpdir(), 'kamiyo-executor-variants-'));
process.env.DATA_DIR = dir;
process.env.JWT_SECRET = 'test';
process.env.VARIANT_ROUTING_ENABLED = 'true';

const { anthropicCreateMock, initializeMock } = vi.hoisted(() => ({
  anthropicCreateMock: vi.fn(),
  initializeMock: vi.fn(async () => {}),
}));

vi.mock('@anthropic-ai/sdk', () => ({
  default: class Anthropic {
    messages = { create: anthropicCreateMock };
  },
}));

describe('task executor variant routing', () => {
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  beforeEach(() => {
    anthropicCreateMock.mockReset();
    initializeMock.mockClear();
  });

  it('stamps variantDecision on result when routing is enabled and variant exists', async () => {
    const { createVariant } = await import('../variants/service');
    createVariant({
      agentId: 'test-agent',
      taskType: 'general',
      genome: {
        promptTemplate: 'custom system prompt',
        modelId: 'claude-sonnet-4-6',
        toolAllowlist: [],
        temperature: 0.5,
        maxTokens: 1024,
        systemGuardrails: '',
      },
    });

    anthropicCreateMock.mockResolvedValueOnce({
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: 'ok' }],
      usage: { input_tokens: 10, output_tokens: 5 },
    });

    const { __setCreateKamiyoExtensionForTests, createTaskExecutor } =
      await import('../task-executor');
    __setCreateKamiyoExtensionForTests(() => ({
      initialize: initializeMock,
      getActions: () => [],
    }));

    const executor = createTaskExecutor({ anthropicApiKey: 'test-key' });
    const result = await executor({
      taskId: 't1',
      description: 'do something general',
      budget: 0.1,
      teamId: 'team-a',
    });

    expect(result.status).toBe('completed');
    expect(result.variantDecision).toBeDefined();
    expect(result.variantDecision?.strategy).toMatch(/thompson|promoted/);

    const call = anthropicCreateMock.mock.calls[0][0];
    expect(call.system).toBe('custom system prompt');
  });

  it('skips variant stamping when flag is off', async () => {
    process.env.VARIANT_ROUTING_ENABLED = 'false';

    anthropicCreateMock.mockResolvedValueOnce({
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: 'ok' }],
      usage: { input_tokens: 10, output_tokens: 5 },
    });

    const { __setCreateKamiyoExtensionForTests, createTaskExecutor } =
      await import('../task-executor');
    __setCreateKamiyoExtensionForTests(() => ({
      initialize: initializeMock,
      getActions: () => [],
    }));

    const executor = createTaskExecutor({ anthropicApiKey: 'test-key' });
    const result = await executor({
      taskId: 't2',
      description: 'another general task',
      budget: 0.1,
      teamId: 'team-a',
    });

    expect(result.status).toBe('completed');
    expect(result.variantDecision).toBeUndefined();

    process.env.VARIANT_ROUTING_ENABLED = 'true';
  });
});
