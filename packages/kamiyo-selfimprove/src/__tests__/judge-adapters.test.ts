import { describe, expect, it, vi } from 'vitest';
import { anthropicJudge, geminiJudge, genericChatJudge, openaiJudge } from '../judge-adapters';

describe('judge-adapters/anthropic', () => {
  it('maps sdk response to JudgeResponse', async () => {
    const create = vi.fn().mockResolvedValue({
      content: [{ type: 'text', text: 'hello world' }],
      usage: { input_tokens: 42, output_tokens: 7 },
    });
    const judge = anthropicJudge({ messages: { create } });
    const r = await judge.generate({
      model: 'claude-sonnet-4-6',
      system: 'be terse',
      messages: [{ role: 'user', content: 'hi' }],
      maxTokens: 128,
      temperature: 0.5,
    });
    expect(r.text).toBe('hello world');
    expect(r.inputTokens).toBe(42);
    expect(r.outputTokens).toBe(7);
    expect(create).toHaveBeenCalledWith({
      model: 'claude-sonnet-4-6',
      temperature: 0.5,
      max_tokens: 128,
      system: 'be terse',
      messages: [{ role: 'user', content: 'hi' }],
    });
  });

  it('returns empty string when no text block', async () => {
    const create = vi.fn().mockResolvedValue({
      content: [{ type: 'tool_use' }],
      usage: { input_tokens: 0, output_tokens: 0 },
    });
    const judge = anthropicJudge({ messages: { create } });
    const r = await judge.generate({
      model: 'x',
      system: '',
      messages: [],
      maxTokens: 1,
      temperature: 0,
    });
    expect(r.text).toBe('');
  });
});

describe('judge-adapters/openai', () => {
  it('prepends system to messages and maps usage', async () => {
    const create = vi.fn().mockResolvedValue({
      choices: [{ message: { content: 'out' } }],
      usage: { prompt_tokens: 10, completion_tokens: 5 },
    });
    const judge = openaiJudge({ chat: { completions: { create } } });
    const r = await judge.generate({
      model: 'gpt-4o',
      system: 'sys',
      messages: [{ role: 'user', content: 'q' }],
      maxTokens: 256,
      temperature: 0.1,
    });
    expect(r.text).toBe('out');
    expect(r.inputTokens).toBe(10);
    expect(r.outputTokens).toBe(5);
    const args = create.mock.calls[0][0];
    expect(args.messages[0]).toEqual({ role: 'system', content: 'sys' });
    expect(args.messages[1]).toEqual({ role: 'user', content: 'q' });
  });

  it('handles null content gracefully', async () => {
    const create = vi.fn().mockResolvedValue({
      choices: [{ message: { content: null } }],
    });
    const judge = openaiJudge({ chat: { completions: { create } } });
    const r = await judge.generate({
      model: 'gpt-4o',
      system: '',
      messages: [],
      maxTokens: 1,
      temperature: 0,
    });
    expect(r.text).toBe('');
    expect(r.inputTokens).toBe(0);
  });
});

describe('judge-adapters/gemini', () => {
  it('maps user→user, assistant→model, attaches systemInstruction', async () => {
    const generateContent = vi.fn().mockResolvedValue({
      response: {
        text: () => 'gemini response',
        usageMetadata: { promptTokenCount: 20, candidatesTokenCount: 8 },
      },
    });
    const judge = geminiJudge({ generateContent });
    const r = await judge.generate({
      model: 'gemini-2.5-pro',
      system: 'instr',
      messages: [
        { role: 'user', content: 'u1' },
        { role: 'assistant', content: 'a1' },
      ],
      maxTokens: 512,
      temperature: 0.3,
    });
    expect(r.text).toBe('gemini response');
    expect(r.inputTokens).toBe(20);
    expect(r.outputTokens).toBe(8);
    const args = generateContent.mock.calls[0][0];
    expect(args.contents[0].role).toBe('user');
    expect(args.contents[1].role).toBe('model');
    expect(args.systemInstruction.parts[0].text).toBe('instr');
    expect(args.generationConfig.temperature).toBe(0.3);
    expect(args.generationConfig.maxOutputTokens).toBe(512);
  });

  it('handles missing usageMetadata', async () => {
    const generateContent = vi.fn().mockResolvedValue({
      response: { text: () => 'x' },
    });
    const judge = geminiJudge({ generateContent });
    const r = await judge.generate({
      model: 'g',
      system: '',
      messages: [],
      maxTokens: 1,
      temperature: 0,
    });
    expect(r.inputTokens).toBe(0);
    expect(r.outputTokens).toBe(0);
  });
});

describe('judge-adapters/generic', () => {
  it('passes system+messages to user call', async () => {
    const call = vi.fn().mockResolvedValue({ text: 'result', inputTokens: 5, outputTokens: 3 });
    const judge = genericChatJudge(call);
    const r = await judge.generate({
      model: 'custom-model',
      system: 'sys',
      messages: [{ role: 'user', content: 'hi' }],
      maxTokens: 100,
      temperature: 0.2,
    });
    expect(r.text).toBe('result');
    const args = call.mock.calls[0][0];
    expect(args.messages[0].role).toBe('system');
    expect(args.messages[1].role).toBe('user');
  });

  it('defaults tokens to 0 when adapter omits them', async () => {
    const call = vi.fn().mockResolvedValue({ text: 'x' });
    const judge = genericChatJudge(call);
    const r = await judge.generate({
      model: 'x',
      system: '',
      messages: [],
      maxTokens: 1,
      temperature: 0,
    });
    expect(r.inputTokens).toBe(0);
    expect(r.outputTokens).toBe(0);
  });
});
