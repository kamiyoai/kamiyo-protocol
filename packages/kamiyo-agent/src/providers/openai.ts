import type {
  LLMProvider,
  ChatRequest,
  ChatResponse,
  ProviderTool,
  ProviderToolCall,
} from '../provider';
import { ProviderError } from '../errors';

// duck-typed — user passes their own OpenAI client instance
interface OpenAIMessage {
  role: string;
  content: string | null;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
}

interface OpenAITool {
  type: 'function';
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

export interface OpenAIClient {
  chat: {
    completions: {
      create(params: {
        model: string;
        messages: OpenAIMessage[];
        tools?: OpenAITool[];
        max_tokens?: number;
        temperature?: number;
      }): Promise<{
        choices: Array<{
          message: {
            content: string | null;
            tool_calls?: Array<{
              id: string;
              function: { name: string; arguments: string };
            }>;
          };
          finish_reason: string;
        }>;
        usage: { prompt_tokens: number; completion_tokens: number };
      }>;
    };
  };
}

function formatMessages(req: ChatRequest): OpenAIMessage[] {
  const out: OpenAIMessage[] = [];

  if (req.system) {
    out.push({ role: 'system', content: req.system });
  }

  for (const m of req.messages) {
    if (m.role === 'system') continue;

    if (typeof m.content === 'string') {
      out.push({ role: m.role, content: m.content });
      continue;
    }

    // assistant messages with tool_use blocks → OpenAI tool_calls format
    if (m.role === 'assistant') {
      const textParts: string[] = [];
      const toolCalls: OpenAIMessage['tool_calls'] = [];

      for (const c of m.content) {
        if (c.type === 'text') textParts.push(c.text);
        if (c.type === 'tool_use') {
          toolCalls!.push({
            id: c.id,
            type: 'function',
            function: { name: c.name, arguments: JSON.stringify(c.input) },
          });
        }
      }

      const msg: OpenAIMessage = {
        role: 'assistant',
        content: textParts.length > 0 ? textParts.join('') : null,
      };
      if (toolCalls!.length > 0) msg.tool_calls = toolCalls;
      out.push(msg);
      continue;
    }

    // user messages with tool_result blocks → OpenAI tool role messages
    for (const c of m.content) {
      if (c.type === 'tool_result') {
        out.push({ role: 'tool', content: c.content, tool_call_id: c.tool_use_id });
      } else if (c.type === 'text') {
        out.push({ role: m.role, content: c.text });
      }
    }
  }

  return out;
}

function formatTools(tools: ProviderTool[]): OpenAITool[] {
  return tools.map(t => ({
    type: 'function',
    function: {
      name: t.name,
      description: t.description,
      parameters: t.inputSchema,
    },
  }));
}

export function openaiProvider(client: OpenAIClient, defaultModel?: string): LLMProvider {
  return {
    name: 'openai',
    defaultModel: defaultModel ?? 'gpt-4o',

    async chat(req: ChatRequest): Promise<ChatResponse> {
      try {
        const raw = await client.chat.completions.create({
          model: req.model,
          messages: formatMessages(req),
          tools: req.tools ? formatTools(req.tools) : undefined,
          max_tokens: req.maxTokens ?? 4096,
          temperature: req.temperature,
        });

        const choice = raw.choices[0];
        if (!choice) throw new Error('No choices in response');

        const toolCalls: ProviderToolCall[] = (choice.message.tool_calls ?? []).map(tc => ({
          id: tc.id,
          name: tc.function.name,
          input: JSON.parse(tc.function.arguments),
        }));

        const stopMap: Record<string, ChatResponse['stopReason']> = {
          stop: 'end',
          tool_calls: 'tool_use',
          length: 'max_tokens',
        };

        return {
          text: choice.message.content ?? '',
          toolCalls,
          usage: {
            inputTokens: raw.usage.prompt_tokens,
            outputTokens: raw.usage.completion_tokens,
          },
          stopReason: stopMap[choice.finish_reason] ?? 'end',
          raw,
        };
      } catch (err) {
        if (err instanceof ProviderError) throw err;
        throw new ProviderError(
          `OpenAI API error: ${err instanceof Error ? err.message : String(err)}`,
          'openai',
          err
        );
      }
    },
  };
}
