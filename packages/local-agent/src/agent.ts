import OpenAI from 'openai';
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from 'openai/resources/chat/completions';
import { TOOL_SCHEMAS, executeTool, type ToolResult } from './tools';

export interface AgentOptions {
  model: string;
  systemPrompt: string;
  maxTurns: number;
  tools?: ChatCompletionTool[];
  cwd?: string;
  baseUrl?: string;
  apiKey?: string;
  onText?: (text: string) => void;
  onToolCall?: (name: string, args: Record<string, unknown>) => void;
  onToolResult?: (name: string, result: ToolResult) => void;
}

export interface AgentMessage {
  type: 'assistant';
  text: string;
  toolCalls: Array<{ name: string; input: Record<string, unknown> }>;
}

export interface AgentResult {
  type: 'result';
  messages: AgentMessage[];
  totalTurns: number;
  totalToolCalls: number;
  durationMs: number;
}

export async function* runAgent(
  prompt: string,
  options: AgentOptions
): AsyncGenerator<AgentMessage | AgentResult> {
  const client = new OpenAI({
    baseURL: options.baseUrl ?? 'http://localhost:11434/v1',
    apiKey: options.apiKey ?? 'ollama',
  });

  const tools = options.tools ?? TOOL_SCHEMAS;
  const cwd = options.cwd ?? process.cwd();
  const useTools = tools.length > 0;

  const messages: ChatCompletionMessageParam[] = [
    { role: 'system', content: options.systemPrompt },
    { role: 'user', content: prompt },
  ];

  const allMessages: AgentMessage[] = [];
  const startTime = Date.now();
  let totalToolCalls = 0;

  for (let turn = 0; turn < options.maxTurns; turn++) {
    const response = await client.chat.completions.create({
      model: options.model,
      messages,
      ...(useTools ? { tools, tool_choice: 'auto' } : {}),
    });

    const choice = response.choices[0];
    if (!choice) break;

    const msg = choice.message;
    messages.push(msg);

    const text = msg.content ?? '';
    const toolCalls = msg.tool_calls ?? [];

    const agentMsg: AgentMessage = {
      type: 'assistant',
      text,
      toolCalls: toolCalls.map(tc => ({
        name: tc.function.name,
        input: JSON.parse(tc.function.arguments || '{}'),
      })),
    };

    if (text) options.onText?.(text);
    allMessages.push(agentMsg);
    yield agentMsg;

    if (toolCalls.length === 0) break;

    totalToolCalls += toolCalls.length;

    for (const tc of toolCalls) {
      const name = tc.function.name;
      const args = JSON.parse(tc.function.arguments || '{}') as Record<string, unknown>;

      options.onToolCall?.(name, args);
      const result = executeTool(name, args, cwd);
      options.onToolResult?.(name, result);

      messages.push({
        role: 'tool',
        tool_call_id: tc.id,
        content: result.output,
      });
    }
  }

  yield {
    type: 'result',
    messages: allMessages,
    totalTurns: allMessages.length,
    totalToolCalls,
    durationMs: Date.now() - startTime,
  };
}
