import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { createAgent } from '../agent';
import type { LLMProvider, ChatRequest, ChatResponse } from '../provider';
import type { ToolDefinition } from '../tool';

function mockProvider(responses: ChatResponse[]): LLMProvider {
  let callIdx = 0;
  return {
    name: 'mock',
    defaultModel: 'mock-model',
    async chat(_req: ChatRequest): Promise<ChatResponse> {
      const resp = responses[callIdx];
      if (!resp) throw new Error(`No mock response for call ${callIdx}`);
      callIdx++;
      return resp;
    },
  };
}

function textResponse(text: string): ChatResponse {
  return {
    text,
    toolCalls: [],
    usage: { inputTokens: 10, outputTokens: 20 },
    stopReason: 'end',
  };
}

function toolCallResponse(name: string, input: unknown, id = 'tc_1'): ChatResponse {
  return {
    text: '',
    toolCalls: [{ id, name, input }],
    usage: { inputTokens: 10, outputTokens: 15 },
    stopReason: 'tool_use',
  };
}

const echoTool: ToolDefinition<{ message: string }, string> = {
  name: 'echo',
  description: 'Echoes back the message',
  schema: z.object({ message: z.string() }),
  handler: async input => `Echo: ${input.message}`,
};

const failTool: ToolDefinition<{ crash: boolean }, string> = {
  name: 'fail',
  description: 'Always fails',
  schema: z.object({ crash: z.boolean() }),
  handler: async () => {
    throw new Error('boom');
  },
};

describe('Agent', () => {
  it('runs a simple text conversation', async () => {
    const agent = createAgent({
      id: 'test-bot',
      provider: mockProvider([textResponse('Hello human!')]),
    });

    const result = await agent.run('Hi');
    expect(result.text).toBe('Hello human!');
    expect(result.turns).toBe(1);
    expect(result.toolsUsed).toEqual([]);
    expect(result.usage.inputTokens).toBe(10);
    expect(result.usage.outputTokens).toBe(20);
  });

  it('executes tool calls and returns final text', async () => {
    const agent = createAgent({
      id: 'test-bot',
      provider: mockProvider([
        toolCallResponse('echo', { message: 'hello' }),
        textResponse('Done! The echo said hello.'),
      ]),
    });
    agent.useTool(echoTool);

    const result = await agent.run('Echo something');
    expect(result.text).toBe('Done! The echo said hello.');
    expect(result.turns).toBe(2);
    expect(result.toolsUsed).toContain('echo');
  });

  it('handles tool errors gracefully', async () => {
    const agent = createAgent({
      id: 'test-bot',
      provider: mockProvider([
        toolCallResponse('fail', { crash: true }),
        textResponse('Tool failed, sorry.'),
      ]),
    });
    agent.useTool(failTool);

    const result = await agent.run('Do the thing');
    expect(result.text).toBe('Tool failed, sorry.');
    expect(result.turns).toBe(2);
  });

  it('handles unknown tool calls', async () => {
    const agent = createAgent({
      id: 'test-bot',
      provider: mockProvider([
        toolCallResponse('nonexistent', {}),
        textResponse('That tool does not exist.'),
      ]),
    });

    const result = await agent.run('Use a fake tool');
    expect(result.text).toBe('That tool does not exist.');
    expect(result.turns).toBe(2);
  });

  it('handles tool validation errors', async () => {
    const agent = createAgent({
      id: 'test-bot',
      provider: mockProvider([
        toolCallResponse('echo', { wrong_field: 123 }),
        textResponse('Invalid input.'),
      ]),
    });
    agent.useTool(echoTool);

    const result = await agent.run('Bad input');
    expect(result.text).toBe('Invalid input.');
  });

  it('throws MaxTurnsError when exceeding maxTurns', async () => {
    const infinite = Array.from({ length: 5 }, () => toolCallResponse('echo', { message: 'loop' }));
    const agent = createAgent({
      id: 'test-bot',
      provider: mockProvider(infinite),
      maxTurns: 3,
    });
    agent.useTool(echoTool);

    await expect(agent.run('Loop forever')).rejects.toThrow('max turns');
  });

  it('returns error instead of throwing when onError=return', async () => {
    const agent = createAgent({
      id: 'test-bot',
      provider: mockProvider(
        Array.from({ length: 3 }, () => toolCallResponse('echo', { message: 'loop' }))
      ),
      maxTurns: 2,
      onError: 'return',
    });
    agent.useTool(echoTool);

    const result = await agent.run('Loop');
    expect(result.text).toContain('Error');
    expect(result.turns).toBe(0);
  });

  it('emits events during execution', async () => {
    const events: string[] = [];
    const agent = createAgent({
      id: 'test-bot',
      provider: mockProvider([textResponse('yo')]),
    });

    agent.on('run:start', () => events.push('start'));
    agent.on('turn:start', () => events.push('turn'));
    agent.on('turn:end', () => events.push('turn:end'));
    agent.on('run:end', () => events.push('end'));

    await agent.run('Hi');
    expect(events).toEqual(['start', 'turn', 'turn:end', 'end']);
  });

  it('chains .use() for capabilities', async () => {
    const agent = createAgent({
      id: 'test-bot',
      provider: mockProvider([textResponse('ok')]),
    });

    const cap = {
      name: 'test-cap',
      tools: [echoTool],
    };

    const returned = agent.use(cap);
    expect(returned).toBe(agent);
    expect(agent.tools).toContain('echo');
  });

  it('calls capability setup and teardown', async () => {
    const setup = vi.fn();
    const teardown = vi.fn();

    const agent = createAgent({
      id: 'test-bot',
      provider: mockProvider([textResponse('ok')]),
    });

    agent.use({
      name: 'lifecycle-cap',
      tools: [],
      setup,
      teardown,
    });

    await agent.start();
    expect(setup).toHaveBeenCalledWith('test-bot');

    await agent.stop();
    expect(teardown).toHaveBeenCalled();
  });

  it('auto-starts on first run()', async () => {
    const setup = vi.fn();
    const agent = createAgent({
      id: 'test-bot',
      provider: mockProvider([textResponse('ok')]),
    });

    agent.use({ name: 'auto', tools: [], setup });

    await agent.run('Hi');
    expect(setup).toHaveBeenCalled();
  });

  it('multiple tool calls in one turn', async () => {
    const agent = createAgent({
      id: 'test-bot',
      provider: mockProvider([
        {
          text: '',
          toolCalls: [
            { id: 'tc_1', name: 'echo', input: { message: 'first' } },
            { id: 'tc_2', name: 'echo', input: { message: 'second' } },
          ],
          usage: { inputTokens: 10, outputTokens: 15 },
          stopReason: 'tool_use',
        },
        textResponse('Both echoed.'),
      ]),
    });
    agent.useTool(echoTool);

    const result = await agent.run('Echo twice');
    expect(result.text).toBe('Both echoed.');
    expect(result.turns).toBe(2);
    expect(result.toolsUsed).toEqual(['echo']);
  });
});
