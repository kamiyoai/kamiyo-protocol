import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  anthropicCreateMock,
  initializeMock,
  checkBalanceMock,
  createEscrowMock,
} = vi.hoisted(() => ({
  anthropicCreateMock: vi.fn(),
  initializeMock: vi.fn(async () => {}),
  checkBalanceMock: vi.fn(async () => ({ balance: 1 })),
  createEscrowMock: vi.fn(async () => ({ escrow: 'escrow-1' })),
}));

vi.mock('@anthropic-ai/sdk', () => ({
  default: class Anthropic {
    messages = {
      create: anthropicCreateMock,
    };
  },
}));

describe('task executor readonly mode', () => {
  beforeEach(() => {
    anthropicCreateMock.mockReset();
    initializeMock.mockClear();
    checkBalanceMock.mockClear();
    createEscrowMock.mockClear();
  });

  it('records a mutating tool attempt when a blocked tool is requested', async () => {
    anthropicCreateMock
      .mockResolvedValueOnce({
        stop_reason: 'tool_use',
        content: [
          {
            type: 'tool_use',
            id: 'tool-1',
            name: 'kamiyo_createEscrow',
            input: { amount: 1 },
          },
        ],
        usage: {
          input_tokens: 10,
          output_tokens: 5,
        },
      })
      .mockResolvedValueOnce({
        stop_reason: 'end_turn',
        content: [
          {
            type: 'text',
            text: 'done',
          },
        ],
        usage: {
          input_tokens: 3,
          output_tokens: 4,
        },
      });

    const { __setCreateKamiyoExtensionForTests, createTaskExecutor } = await import('../task-executor');
    __setCreateKamiyoExtensionForTests(() => ({
      initialize: initializeMock,
      getActions: () => [
        {
          name: 'kamiyo.checkBalance',
          description: 'check balance',
          schema: { type: 'object', properties: {} },
          handler: checkBalanceMock,
        },
        {
          name: 'kamiyo.createEscrow',
          description: 'create escrow',
          schema: { type: 'object', properties: {} },
          handler: createEscrowMock,
        },
      ],
    }));
    const executor = createTaskExecutor({ anthropicApiKey: 'test-key' });
    const result = await executor({
      taskId: 'task-1',
      description: 'Inspect wallet state.',
      budget: 1,
      teamId: 'team-1',
      executionMode: 'readonly',
      allowedTools: ['kamiyo_checkBalance'],
      metadata: {
        agentId: 'agent-1',
      },
    });

    expect(result.status).toBe('completed');
    expect(result.riskFlags).toContain('mutating_tool_attempt');
    expect(createEscrowMock).not.toHaveBeenCalled();
    expect(initializeMock).toHaveBeenCalledOnce();
    __setCreateKamiyoExtensionForTests(null);
  });
});
