import type { LLMProvider, ChatRequest, ChatResponse, ProviderToolCall } from '../provider';
import { ProviderError } from '../errors';

export interface GenericProviderConfig {
  name?: string;
  baseUrl: string;
  apiKey?: string;
  defaultModel: string;
  headers?: Record<string, string>;
}

export function genericProvider(config: GenericProviderConfig): LLMProvider {
  const { baseUrl, apiKey, headers: extraHeaders } = config;

  return {
    name: config.name ?? 'generic',
    defaultModel: config.defaultModel,

    async chat(req: ChatRequest): Promise<ChatResponse> {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...extraHeaders,
      };
      if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

      const messages: Array<{
        role: string;
        content: string | null;
        tool_call_id?: string;
        tool_calls?: Array<{
          id: string;
          type: 'function';
          function: { name: string; arguments: string };
        }>;
      }> = [];
      if (req.system) messages.push({ role: 'system', content: req.system });

      for (const m of req.messages) {
        if (m.role === 'system') continue;
        if (typeof m.content === 'string') {
          messages.push({ role: m.role, content: m.content });
          continue;
        }

        if (m.role === 'assistant') {
          const textParts: string[] = [];
          const toolCalls: Array<{
            id: string;
            type: 'function';
            function: { name: string; arguments: string };
          }> = [];

          for (const c of m.content) {
            if (c.type === 'text') textParts.push(c.text);
            else if (c.type === 'tool_use') {
              toolCalls.push({
                id: c.id,
                type: 'function',
                function: { name: c.name, arguments: JSON.stringify(c.input) },
              });
            }
          }

          const msg: Record<string, unknown> = {
            role: 'assistant',
            content: textParts.length > 0 ? textParts.join('') : null,
          };
          if (toolCalls.length > 0) msg.tool_calls = toolCalls;
          messages.push(msg as (typeof messages)[number]);
          continue;
        }

        for (const c of m.content) {
          if (c.type === 'text') messages.push({ role: m.role, content: c.text });
          else if (c.type === 'tool_result') {
            messages.push({ role: 'tool', content: c.content, tool_call_id: c.tool_use_id });
          }
        }
      }

      interface OpenAICompatTool {
        type: 'function';
        function: { name: string; description: string; parameters: Record<string, unknown> };
      }

      const body: {
        model: string;
        messages: typeof messages;
        max_tokens: number;
        temperature?: number;
        tools?: OpenAICompatTool[];
      } = {
        model: req.model,
        messages,
        max_tokens: req.maxTokens ?? 4096,
        temperature: req.temperature,
      };

      if (req.tools) {
        body.tools = req.tools.map(t => ({
          type: 'function' as const,
          function: { name: t.name, description: t.description, parameters: t.inputSchema },
        }));
      }

      try {
        const url = `${baseUrl.replace(/\/$/, '')}/chat/completions`;
        const res = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          const errText = await res.text();
          throw new Error(`HTTP ${res.status}: ${errText}`);
        }

        const raw = (await res.json()) as {
          choices: Array<{
            message: {
              content: string | null;
              tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }>;
            };
            finish_reason: string;
          }>;
          usage: { prompt_tokens: number; completion_tokens: number };
        };

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
            inputTokens: raw.usage?.prompt_tokens ?? 0,
            outputTokens: raw.usage?.completion_tokens ?? 0,
          },
          stopReason: stopMap[choice.finish_reason] ?? 'end',
          raw,
        };
      } catch (err) {
        if (err instanceof ProviderError) throw err;
        throw new ProviderError(
          `${config.name ?? 'Generic'} API error: ${err instanceof Error ? err.message : String(err)}`,
          config.name ?? 'generic',
          err
        );
      }
    },
  };
}
