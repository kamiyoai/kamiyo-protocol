import type { ResolvedConfig } from './config';
import type { Message, MessageContent, ChatResponse } from './provider';
import type { ToolCallResult, ToolContext } from './tool';
import type { ToolRegistry } from './tool';
import type { ToolExecutor } from './tool-executor';
import type { EventEmitter } from './events';
import type { SelfImproveBridge } from './improve';
import { MaxTurnsError } from './errors';
import { randomUUID } from 'crypto';

export interface RunContext {
  runId?: string;
  signal?: AbortSignal;
  metadata?: Record<string, unknown>;
}

export interface AgentRunResult {
  runId: string;
  text: string;
  turns: number;
  toolsUsed: string[];
  usage: { inputTokens: number; outputTokens: number };
  durationMs: number;
}

export async function executeTurn(
  config: ResolvedConfig,
  toolRegistry: ToolRegistry,
  toolExecutor: ToolExecutor,
  events: EventEmitter,
  bridge: SelfImproveBridge,
  input: string,
  context?: RunContext
): Promise<AgentRunResult> {
  const runId = context?.runId ?? randomUUID();
  const signal = context?.signal ?? new AbortController().signal;
  const started = Date.now();

  events.emit('run:start', { runId, input });

  bridge.routeVariant();

  const overrides = bridge.getOverrides({
    model: config.model,
    system: config.systemPrompt,
    temperature: config.temperature,
    maxTokens: config.maxTokens,
  });

  const messages: Message[] = [];
  messages.push({ role: 'user', content: input });

  const providerTools = toolRegistry.toProviderTools();
  const toolsUsed = new Set<string>();
  let totalInput = 0;
  let totalOutput = 0;

  try {
    for (let turn = 1; turn <= config.maxTurns; turn++) {
      if (signal.aborted) throw new Error('Aborted');

      events.emit('turn:start', { runId, turn, input });

      const response = await config.provider.chat({
        model: overrides.model,
        system: overrides.system || undefined,
        messages,
        tools: providerTools.length > 0 ? providerTools : undefined,
        temperature: overrides.temperature,
        maxTokens: overrides.maxTokens,
      });

      totalInput += response.usage.inputTokens;
      totalOutput += response.usage.outputTokens;

      events.emit('turn:end', { runId, turn, response });

      if (response.toolCalls.length === 0) {
        const result: AgentRunResult = {
          runId,
          text: response.text,
          turns: turn,
          toolsUsed: [...toolsUsed],
          usage: { inputTokens: totalInput, outputTokens: totalOutput },
          durationMs: Date.now() - started,
        };

        events.emit('run:end', {
          runId,
          text: result.text,
          turns: turn,
          durationMs: result.durationMs,
        });

        bridge.recordInteraction({
          input,
          output: result.text,
          latencyMs: result.durationMs,
        });
        bridge.scoreInteraction({ input, output: result.text, runId }).catch(() => {});

        return result;
      }

      messages.push({
        role: 'assistant',
        content: buildAssistantContent(response),
      });

      const toolCtx: ToolContext = { agentId: config.id, runId, signal };
      const results = await toolExecutor.executeAll(response.toolCalls, toolCtx);
      for (const tc of response.toolCalls) toolsUsed.add(tc.name);

      messages.push({
        role: 'user',
        content: buildToolResultContent(results),
      });
    }

    throw new MaxTurnsError(config.maxTurns);
  } catch (err) {
    events.emit('run:error', { runId, error: err });

    if (config.onError === 'return') {
      return {
        runId,
        text: `Error: ${err instanceof Error ? err.message : String(err)}`,
        turns: 0,
        toolsUsed: [...toolsUsed],
        usage: { inputTokens: totalInput, outputTokens: totalOutput },
        durationMs: Date.now() - started,
      };
    }
    throw err;
  }
}

export type AgentStreamEvent =
  | { type: 'text'; text: string }
  | { type: 'tool_call'; name: string; input: unknown }
  | { type: 'tool_result'; name: string; output: string; isError: boolean }
  | { type: 'turn_end'; turn: number }
  | { type: 'error'; error: string }
  | { type: 'done'; result: AgentRunResult };

export async function* executeStream(
  config: ResolvedConfig,
  toolRegistry: ToolRegistry,
  toolExecutor: ToolExecutor,
  events: EventEmitter,
  bridge: SelfImproveBridge,
  input: string,
  context?: RunContext
): AsyncGenerator<AgentStreamEvent> {
  const runId = context?.runId ?? randomUUID();
  const signal = context?.signal ?? new AbortController().signal;
  const started = Date.now();

  events.emit('run:start', { runId, input });

  bridge.routeVariant();
  const overrides = bridge.getOverrides({
    model: config.model,
    system: config.systemPrompt,
    temperature: config.temperature,
    maxTokens: config.maxTokens,
  });

  const messages: Message[] = [{ role: 'user', content: input }];
  const providerTools = toolRegistry.toProviderTools();
  const toolsUsed = new Set<string>();
  let totalInput = 0;
  let totalOutput = 0;

  try {
    for (let turn = 1; turn <= config.maxTurns; turn++) {
      if (signal.aborted) throw new Error('Aborted');

      events.emit('turn:start', { runId, turn, input });

      const chatReq = {
        model: overrides.model,
        system: overrides.system || undefined,
        messages,
        tools: providerTools.length > 0 ? providerTools : undefined,
        temperature: overrides.temperature,
        maxTokens: overrides.maxTokens,
      };

      let turnText = '';
      let turnToolCalls: { id: string; name: string; input: unknown }[] = [];

      if (config.provider.stream) {
        let usage = { inputTokens: 0, outputTokens: 0 };

        for await (const event of config.provider.stream(chatReq)) {
          if (event.type === 'text' && event.text) {
            turnText += event.text;
            yield { type: 'text', text: event.text };
          }
          if (event.type === 'tool_call_end' && event.toolCall) {
            const tc = event.toolCall as { id: string; name: string; input: unknown };
            turnToolCalls.push(tc);
            yield { type: 'tool_call', name: tc.name, input: tc.input };
          }
          if (event.type === 'done' && event.usage) {
            usage = event.usage;
          }
        }

        totalInput += usage.inputTokens;
        totalOutput += usage.outputTokens;
      } else {
        const response = await config.provider.chat(chatReq);
        totalInput += response.usage.inputTokens;
        totalOutput += response.usage.outputTokens;
        turnText = response.text;
        turnToolCalls = [...response.toolCalls];

        if (turnText) yield { type: 'text', text: turnText };
        for (const tc of turnToolCalls) yield { type: 'tool_call', name: tc.name, input: tc.input };
      }

      events.emit('turn:end', {
        runId,
        turn,
        response: {
          text: turnText,
          toolCalls: turnToolCalls,
          usage: { inputTokens: totalInput, outputTokens: totalOutput },
          stopReason: turnToolCalls.length > 0 ? 'tool_use' : 'end',
        } as ChatResponse,
      });

      if (turnToolCalls.length === 0) {
        const result: AgentRunResult = {
          runId,
          text: turnText,
          turns: turn,
          toolsUsed: [...toolsUsed],
          usage: { inputTokens: totalInput, outputTokens: totalOutput },
          durationMs: Date.now() - started,
        };

        events.emit('run:end', {
          runId,
          text: result.text,
          turns: turn,
          durationMs: result.durationMs,
        });
        bridge.recordInteraction({ input, output: turnText, latencyMs: result.durationMs });
        bridge.scoreInteraction({ input, output: turnText, runId }).catch(() => {});
        yield { type: 'done', result };
        return;
      }

      const assistContent: MessageContent[] = [];
      if (turnText) assistContent.push({ type: 'text', text: turnText });
      for (const tc of turnToolCalls)
        assistContent.push({ type: 'tool_use', id: tc.id, name: tc.name, input: tc.input });
      messages.push({ role: 'assistant', content: assistContent });

      const toolCtx: ToolContext = { agentId: config.id, runId, signal };
      const results = await toolExecutor.executeAll(turnToolCalls, toolCtx);
      for (const tc of turnToolCalls) toolsUsed.add(tc.name);
      for (const r of results)
        yield { type: 'tool_result', name: r.name, output: r.output, isError: r.isError };
      messages.push({ role: 'user', content: buildToolResultContent(results) });

      yield { type: 'turn_end', turn };
    }

    throw new MaxTurnsError(config.maxTurns);
  } catch (err) {
    events.emit('run:error', { runId, error: err });

    if (config.onError === 'return') {
      const errorText = `Error: ${err instanceof Error ? err.message : String(err)}`;
      yield { type: 'error', error: errorText };
      yield {
        type: 'done',
        result: {
          runId,
          text: errorText,
          turns: 0,
          toolsUsed: [...toolsUsed],
          usage: { inputTokens: totalInput, outputTokens: totalOutput },
          durationMs: Date.now() - started,
        },
      };
      return;
    }
    throw err;
  }
}

function buildAssistantContent(response: ChatResponse): MessageContent[] {
  const content: MessageContent[] = [];
  if (response.text) {
    content.push({ type: 'text', text: response.text });
  }
  for (const tc of response.toolCalls) {
    content.push({ type: 'tool_use', id: tc.id, name: tc.name, input: tc.input });
  }
  return content;
}

function buildToolResultContent(results: ToolCallResult[]): MessageContent[] {
  return results.map(r => ({
    type: 'tool_result' as const,
    tool_use_id: r.toolCallId,
    content: r.output,
    is_error: r.isError,
  }));
}
