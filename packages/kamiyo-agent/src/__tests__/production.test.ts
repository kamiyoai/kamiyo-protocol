import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { createAgent } from '../agent';
import { resolveConfig } from '../config';
import { ToolRegistry } from '../tool';
import { ToolExecutor } from '../tool-executor';
import { EventEmitter } from '../events';
import type { LLMProvider, ChatResponse, ChatStreamEvent } from '../provider';
import type { ToolDefinition, ToolContext } from '../tool';

// --- Helpers ---

function mockProvider(responses: ChatResponse[]): LLMProvider {
  let callIdx = 0;
  return {
    name: 'mock',
    defaultModel: 'mock-model',
    async chat(): Promise<ChatResponse> {
      const resp = responses[callIdx];
      if (!resp) throw new Error(`No mock response for call ${callIdx}`);
      callIdx++;
      return resp;
    },
  };
}

function streamProvider(responses: ChatResponse[]): LLMProvider {
  let callIdx = 0;
  return {
    name: 'mock-stream',
    defaultModel: 'mock-model',
    async chat(): Promise<ChatResponse> {
      return responses[callIdx++];
    },
    async *stream(): AsyncIterable<ChatStreamEvent> {
      const resp = responses[callIdx++];
      if (resp.text) {
        for (const char of resp.text) {
          yield { type: 'text', text: char };
        }
      }
      for (const tc of resp.toolCalls) {
        yield { type: 'tool_call_end', toolCall: tc };
      }
      yield { type: 'done', usage: resp.usage };
    },
  };
}

function textResponse(text: string): ChatResponse {
  return { text, toolCalls: [], usage: { inputTokens: 10, outputTokens: 20 }, stopReason: 'end' };
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

const slowTool: ToolDefinition<Record<string, never>, string> = {
  name: 'slow_op',
  description: 'Takes a while',
  schema: z.object({}),
  timeout: 200,
  handler: async () => {
    await new Promise(r => setTimeout(r, 5000));
    return 'done';
  },
};

const circularTool: ToolDefinition<Record<string, never>, unknown> = {
  name: 'circular',
  description: 'Returns circular ref',
  schema: z.object({}),
  handler: async () => {
    const obj: Record<string, unknown> = {};
    obj.self = obj;
    return obj;
  },
};

// --- Config Validation ---

describe('Config validation', () => {
  it('rejects empty id', () => {
    expect(() => resolveConfig({ id: '', provider: mockProvider([]) })).toThrow('non-empty string');
  });

  it('rejects missing provider', () => {
    expect(() => resolveConfig({ id: 'test', provider: null as any })).toThrow('LLMProvider');
  });

  it('rejects temperature out of range', () => {
    expect(() => resolveConfig({ id: 'test', provider: mockProvider([]), temperature: 5 })).toThrow(
      'temperature'
    );
    expect(() =>
      resolveConfig({ id: 'test', provider: mockProvider([]), temperature: -1 })
    ).toThrow('temperature');
  });

  it('rejects invalid maxTurns', () => {
    expect(() => resolveConfig({ id: 'test', provider: mockProvider([]), maxTurns: 0 })).toThrow(
      'maxTurns'
    );
    expect(() => resolveConfig({ id: 'test', provider: mockProvider([]), maxTurns: -5 })).toThrow(
      'maxTurns'
    );
  });

  it('rejects invalid maxTokens', () => {
    expect(() => resolveConfig({ id: 'test', provider: mockProvider([]), maxTokens: 0 })).toThrow(
      'maxTokens'
    );
  });

  it('rejects tiny toolTimeoutMs', () => {
    expect(() =>
      resolveConfig({ id: 'test', provider: mockProvider([]), toolTimeoutMs: 10 })
    ).toThrow('toolTimeoutMs');
  });

  it('accepts valid config', () => {
    const config = resolveConfig({
      id: 'my-agent',
      provider: mockProvider([]),
      temperature: 0.5,
      maxTurns: 5,
      maxTokens: 2048,
    });
    expect(config.id).toBe('my-agent');
    expect(config.temperature).toBe(0.5);
  });
});

// --- Tool Name Validation ---

describe('Tool name validation', () => {
  it('rejects tool names with spaces', () => {
    const registry = new ToolRegistry();
    expect(() =>
      registry.register({
        name: 'my tool',
        description: 'bad name',
        schema: z.object({}),
        handler: async () => 'ok',
      })
    ).toThrow('Invalid tool name');
  });

  it('rejects empty tool names', () => {
    const registry = new ToolRegistry();
    expect(() =>
      registry.register({
        name: '',
        description: 'no name',
        schema: z.object({}),
        handler: async () => 'ok',
      })
    ).toThrow('Invalid tool name');
  });

  it('rejects tool names with special chars', () => {
    const registry = new ToolRegistry();
    expect(() =>
      registry.register({
        name: 'my.tool!',
        description: 'bad chars',
        schema: z.object({}),
        handler: async () => 'ok',
      })
    ).toThrow('Invalid tool name');
  });

  it('accepts valid tool names', () => {
    const registry = new ToolRegistry();
    registry.register({
      name: 'my-tool_v2',
      description: 'good name',
      schema: z.object({}),
      handler: async () => 'ok',
    });
    expect(registry.has('my-tool_v2')).toBe(true);
  });
});

// --- Abort Signal ---

describe('Abort signal handling', () => {
  it('respects abort signal between turns', async () => {
    const controller = new AbortController();
    const provider: LLMProvider = {
      name: 'abort-test',
      defaultModel: 'model',
      async chat() {
        // first call succeeds with tool call, then abort fires before second turn
        return toolCallResponse('echo', { message: 'hi' });
      },
    };

    const agent = createAgent({ id: 'test', provider, maxTurns: 5 });
    agent.useTool(echoTool);

    // abort after first turn completes
    agent.on('turn:end', () => controller.abort());

    await expect(agent.run('hi', { signal: controller.signal })).rejects.toThrow('Aborted');
  });

  it('tool timeout fires correctly', async () => {
    const agent = createAgent({
      id: 'test',
      provider: mockProvider([toolCallResponse('slow_op', {}), textResponse('recovered')]),
    });
    agent.useTool(slowTool);

    const result = await agent.run('do slow thing');
    expect(result.text).toBe('recovered');
    expect(result.turns).toBe(2);
  });
});

// --- Circular Ref Safety ---

describe('Output serialization safety', () => {
  it('handles circular references in tool output', async () => {
    const agent = createAgent({
      id: 'test',
      provider: mockProvider([toolCallResponse('circular', {}), textResponse('handled it')]),
    });
    agent.useTool(circularTool);

    const result = await agent.run('make a circle');
    expect(result.text).toBe('handled it');
  });
});

// --- Streaming ---

describe('Streaming', () => {
  it('streams text character by character', async () => {
    const agent = createAgent({
      id: 'test',
      provider: streamProvider([textResponse('Hello')]),
    });

    const events: string[] = [];
    for await (const event of agent.stream('hi')) {
      events.push(event.type);
      if (event.type === 'done') break;
    }

    expect(events).toContain('text');
    expect(events).toContain('done');
  });

  it('streams tool calls and results', async () => {
    const agent = createAgent({
      id: 'test',
      provider: streamProvider([toolCallResponse('echo', { message: 'hi' }), textResponse('Done')]),
    });
    agent.useTool(echoTool);

    const events: string[] = [];
    for await (const event of agent.stream('use echo')) {
      events.push(event.type);
    }

    expect(events).toContain('tool_call');
    expect(events).toContain('tool_result');
    expect(events).toContain('turn_end');
    expect(events).toContain('done');
  });

  it('stream emits error event for onError=return', async () => {
    const provider: LLMProvider = {
      name: 'fail',
      defaultModel: 'model',
      async chat() {
        throw new Error('provider down');
      },
    };

    const agent = createAgent({ id: 'test', provider, onError: 'return' });
    const events: string[] = [];

    for await (const event of agent.stream('hi')) {
      events.push(event.type);
    }

    expect(events).toContain('error');
    expect(events).toContain('done');
  });

  it('stream throws for onError=throw', async () => {
    const provider: LLMProvider = {
      name: 'fail',
      defaultModel: 'model',
      async chat() {
        throw new Error('provider down');
      },
    };

    const agent = createAgent({ id: 'test', provider });

    await expect(async () => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      for await (const _ of agent.stream('hi')) {
        /* drain */
      }
    }).rejects.toThrow('provider down');
  });
});

// --- Provider Error Wrapping ---

describe('Provider error wrapping', () => {
  it('wraps provider errors in ProviderError', async () => {
    const provider: LLMProvider = {
      name: 'broken',
      defaultModel: 'model',
      async chat() {
        throw new Error('network timeout');
      },
    };

    const agent = createAgent({ id: 'test', provider, onError: 'return' });
    const result = await agent.run('hi');
    expect(result.text).toContain('Error');
  });

  it('handles null/undefined provider response gracefully', async () => {
    const provider: LLMProvider = {
      name: 'null-resp',
      defaultModel: 'model',
      async chat() {
        return null as any;
      },
    };

    const agent = createAgent({ id: 'test', provider, onError: 'return' });
    const result = await agent.run('hi');
    expect(result.text).toContain('Error');
  });
});

// --- Event Consistency ---

describe('Event lifecycle', () => {
  it('emits correct event sequence for tool use', async () => {
    const events: string[] = [];
    const agent = createAgent({
      id: 'test',
      provider: mockProvider([toolCallResponse('echo', { message: 'hi' }), textResponse('done')]),
    });
    agent.useTool(echoTool);

    agent.on('run:start', () => events.push('run:start'));
    agent.on('turn:start', () => events.push('turn:start'));
    agent.on('tool:call', () => events.push('tool:call'));
    agent.on('tool:result', () => events.push('tool:result'));
    agent.on('turn:end', () => events.push('turn:end'));
    agent.on('run:end', () => events.push('run:end'));

    await agent.run('echo hi');
    expect(events).toEqual([
      'run:start',
      'turn:start',
      'turn:end', // turn 1: tool call
      'tool:call',
      'tool:result', // tool execution
      'turn:start',
      'turn:end', // turn 2: text response
      'run:end',
    ]);
  });

  it('emits run:error on failure', async () => {
    let errorEmitted = false;
    const agent = createAgent({
      id: 'test',
      provider: mockProvider(
        Array.from({ length: 2 }, () => toolCallResponse('echo', { message: 'loop' }))
      ),
      maxTurns: 1,
    });
    agent.useTool(echoTool);
    agent.on('run:error', () => {
      errorEmitted = true;
    });

    await expect(agent.run('loop')).rejects.toThrow('max turns');
    expect(errorEmitted).toBe(true);
  });

  it('event handlers survive stop/start cycle', async () => {
    const events: string[] = [];
    const agent = createAgent({
      id: 'test',
      provider: mockProvider([textResponse('first'), textResponse('second')]),
    });

    agent.on('run:end', () => events.push('end'));

    await agent.run('hi');
    await agent.stop();
    await agent.run('hi again');

    expect(events).toEqual(['end', 'end']);
  });
});

// --- Agent Lifecycle ---

describe('Agent lifecycle', () => {
  it('start is idempotent', async () => {
    const setup = vi.fn();
    const agent = createAgent({ id: 'test', provider: mockProvider([textResponse('ok')]) });
    agent.use({ name: 'cap', tools: [], setup });

    await agent.start();
    await agent.start();
    expect(setup).toHaveBeenCalledTimes(1);
  });

  it('stop is idempotent', async () => {
    const teardown = vi.fn();
    const agent = createAgent({ id: 'test', provider: mockProvider([textResponse('ok')]) });
    agent.use({ name: 'cap', tools: [], teardown });

    await agent.start();
    await agent.stop();
    await agent.stop();
    expect(teardown).toHaveBeenCalledTimes(1);
  });

  it('can restart after stop', async () => {
    const agent = createAgent({
      id: 'test',
      provider: mockProvider([textResponse('first'), textResponse('second')]),
    });

    const r1 = await agent.run('hi');
    expect(r1.text).toBe('first');

    await agent.stop();

    const r2 = await agent.run('hi again');
    expect(r2.text).toBe('second');
  });
});

// --- Multi-tool Parallel Execution ---

describe('Parallel tool execution', () => {
  it('executes multiple tool calls concurrently', async () => {
    const timestamps: number[] = [];
    const parallelTool: ToolDefinition<{ id: number }, string> = {
      name: 'timed',
      description: 'Records execution time',
      schema: z.object({ id: z.number() }),
      handler: async input => {
        timestamps.push(Date.now());
        await new Promise(r => setTimeout(r, 50));
        return `done-${input.id}`;
      },
    };

    const agent = createAgent({
      id: 'test',
      provider: mockProvider([
        {
          text: '',
          toolCalls: [
            { id: 'tc_1', name: 'timed', input: { id: 1 } },
            { id: 'tc_2', name: 'timed', input: { id: 2 } },
            { id: 'tc_3', name: 'timed', input: { id: 3 } },
          ],
          usage: { inputTokens: 10, outputTokens: 10 },
          stopReason: 'tool_use',
        },
        textResponse('all done'),
      ]),
    });
    agent.useTool(parallelTool);

    const result = await agent.run('run all');
    expect(result.text).toBe('all done');

    // all 3 should have started within ~10ms of each other (parallel, not sequential)
    const spread = Math.max(...timestamps) - Math.min(...timestamps);
    expect(spread).toBeLessThan(30);
  });
});

// --- Tool Retry ---

describe('Tool retry', () => {
  it('retries on failure up to maxRetries', async () => {
    let attempts = 0;
    const flaky: ToolDefinition<Record<string, never>, string> = {
      name: 'flaky',
      description: 'Fails first 2 times',
      schema: z.object({}),
      retry: { maxRetries: 2, initialDelayMs: 10 },
      handler: async () => {
        attempts++;
        if (attempts < 3) throw new Error(`fail #${attempts}`);
        return 'success';
      },
    };

    const agent = createAgent({
      id: 'test',
      provider: mockProvider([toolCallResponse('flaky', {}), textResponse('it worked')]),
    });
    agent.useTool(flaky);

    const result = await agent.run('try flaky');
    expect(result.text).toBe('it worked');
    expect(attempts).toBe(3);
  });
});

// --- Empty/Edge Inputs ---

describe('Edge case inputs', () => {
  it('handles empty string input', async () => {
    const agent = createAgent({
      id: 'test',
      provider: mockProvider([textResponse('got empty')]),
    });

    const result = await agent.run('');
    expect(result.text).toBe('got empty');
  });

  it('handles very long input', async () => {
    const longInput = 'x'.repeat(100_000);
    const agent = createAgent({
      id: 'test',
      provider: mockProvider([textResponse('processed')]),
    });

    const result = await agent.run(longInput);
    expect(result.text).toBe('processed');
  });
});

// --- OpenAI Message Format ---

describe('OpenAI provider message format', () => {
  it('formats tool_use assistant messages as tool_calls', async () => {
    const { openaiProvider } = await import('../providers/openai');
    let capturedMessages: any[] = [];

    const mockClient = {
      chat: {
        completions: {
          create: vi.fn().mockImplementation(async (params: any) => {
            capturedMessages = params.messages;
            return {
              choices: [
                {
                  message: { content: 'final answer', tool_calls: undefined },
                  finish_reason: 'stop',
                },
              ],
              usage: { prompt_tokens: 10, completion_tokens: 5 },
            };
          }),
        },
      },
    };

    const provider = openaiProvider(mockClient as any);

    // simulate the message format that runtime.ts sends:
    // 1. user message
    // 2. assistant with tool_use blocks
    // 3. user with tool_result blocks
    await provider.chat({
      model: 'gpt-4o',
      messages: [
        { role: 'user', content: 'search for cats' },
        {
          role: 'assistant',
          content: [
            { type: 'text', text: 'Let me search for that.' },
            { type: 'tool_use', id: 'call_123', name: 'web_search', input: { query: 'cats' } },
          ],
        },
        {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'call_123',
              content: 'Results about cats...',
              is_error: false,
            },
          ],
        },
      ],
    });

    // verify assistant message has tool_calls array, not content blocks
    const assistantMsg = capturedMessages.find((m: any) => m.role === 'assistant');
    expect(assistantMsg).toBeDefined();
    expect(assistantMsg.tool_calls).toBeDefined();
    expect(assistantMsg.tool_calls[0].id).toBe('call_123');
    expect(assistantMsg.tool_calls[0].function.name).toBe('web_search');
    expect(assistantMsg.content).toBe('Let me search for that.');

    // verify tool result is formatted as tool role
    const toolMsg = capturedMessages.find((m: any) => m.role === 'tool');
    expect(toolMsg).toBeDefined();
    expect(toolMsg.tool_call_id).toBe('call_123');
    expect(toolMsg.content).toBe('Results about cats...');
  });
});

// --- Concurrency Limit ---

describe('Tool executor concurrency', () => {
  it('batches execution with maxConcurrent', async () => {
    const registry = new ToolRegistry();
    const events = new EventEmitter();
    let concurrent = 0;
    let maxConcurrent = 0;

    registry.register({
      name: 'track',
      description: 'tracks concurrency',
      schema: z.object({}),
      handler: async () => {
        concurrent++;
        maxConcurrent = Math.max(maxConcurrent, concurrent);
        await new Promise(r => setTimeout(r, 50));
        concurrent--;
        return 'ok';
      },
    });

    const executor = new ToolExecutor(registry, events, { maxConcurrent: 2 });
    const ctx: ToolContext = { agentId: 'test', runId: 'r1', signal: new AbortController().signal };

    const calls = Array.from({ length: 6 }, (_, i) => ({
      id: `tc_${i}`,
      name: 'track',
      input: {},
    }));

    await executor.executeAll(calls, ctx);
    expect(maxConcurrent).toBeLessThanOrEqual(2);
  });
});
