import type {
  LLMProvider,
  ChatRequest,
  ChatResponse,
  ProviderTool,
  ProviderToolCall,
} from '../provider';
import { ProviderError } from '../errors';

interface AnthropicTool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

type AnthropicMessageContent =
  | string
  | Array<{
      type: string;
      text?: string;
      id?: string;
      name?: string;
      input?: unknown;
      tool_use_id?: string;
      content?: string;
      is_error?: boolean;
    }>;

interface AnthropicContentBlock {
  type: string;
  text?: string;
  id?: string;
  name?: string;
  input?: unknown;
}

export interface AnthropicClient {
  messages: {
    create(params: {
      model: string;
      system?: string;
      messages: Array<{ role: string; content: AnthropicMessageContent }>;
      tools?: AnthropicTool[];
      max_tokens: number;
      temperature?: number;
    }): Promise<{
      content: AnthropicContentBlock[];
      usage: { input_tokens: number; output_tokens: number };
      stop_reason: string;
    }>;
  };
}

function formatMessages(
  messages: ChatRequest['messages']
): Array<{ role: string; content: AnthropicMessageContent }> {
  return messages
    .filter(m => m.role !== 'system')
    .map(m => {
      if (typeof m.content === 'string') return { role: m.role, content: m.content };

      const blocks: AnthropicMessageContent = m.content.map(c => {
        if (c.type === 'text') return { type: 'text' as const, text: c.text };
        if (c.type === 'tool_use')
          return { type: 'tool_use' as const, id: c.id, name: c.name, input: c.input };
        if (c.type === 'tool_result')
          return {
            type: 'tool_result' as const,
            tool_use_id: c.tool_use_id,
            content: c.content,
            is_error: c.is_error ?? false,
          };
        return c as { type: string };
      });
      return { role: m.role, content: blocks };
    });
}

function formatTools(tools: ProviderTool[]): AnthropicTool[] {
  return tools.map(t => ({
    name: t.name,
    description: t.description,
    input_schema: t.inputSchema,
  }));
}

function parseResponse(
  raw: Awaited<ReturnType<AnthropicClient['messages']['create']>>
): ChatResponse {
  let text = '';
  const toolCalls: ProviderToolCall[] = [];

  for (const block of raw.content) {
    if (block.type === 'text' && block.text) {
      text += block.text;
    } else if (block.type === 'tool_use' && block.id && block.name) {
      toolCalls.push({ id: block.id, name: block.name, input: block.input });
    }
  }

  const stopMap: Record<string, ChatResponse['stopReason']> = {
    end_turn: 'end',
    tool_use: 'tool_use',
    max_tokens: 'max_tokens',
  };

  return {
    text,
    toolCalls,
    usage: { inputTokens: raw.usage.input_tokens, outputTokens: raw.usage.output_tokens },
    stopReason: stopMap[raw.stop_reason] ?? 'end',
    raw,
  };
}

export function anthropicProvider(client: AnthropicClient, defaultModel?: string): LLMProvider {
  return {
    name: 'anthropic',
    defaultModel: defaultModel ?? 'claude-sonnet-4-20250514',

    async chat(req: ChatRequest): Promise<ChatResponse> {
      try {
        const raw = await client.messages.create({
          model: req.model,
          system: req.system,
          messages: formatMessages(req.messages),
          tools: req.tools ? formatTools(req.tools) : undefined,
          max_tokens: req.maxTokens ?? 4096,
          temperature: req.temperature,
        });
        return parseResponse(raw);
      } catch (err) {
        throw new ProviderError(
          `Anthropic API error: ${err instanceof Error ? err.message : String(err)}`,
          'anthropic',
          err
        );
      }
    },
  };
}
