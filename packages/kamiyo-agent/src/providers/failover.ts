import type { LLMProvider, ChatRequest, ChatResponse, ChatStreamEvent } from '../provider';
import { ProviderError } from '../errors';

export function failoverProvider(
  providers: LLMProvider[],
  opts?: { onFallback?: (from: string, to: string, error: Error) => void }
): LLMProvider {
  if (providers.length === 0) throw new Error('failoverProvider requires at least one provider');

  return {
    name: `failover(${providers.map(p => p.name).join(',')})`,
    defaultModel: providers[0].defaultModel,

    async chat(req: ChatRequest): Promise<ChatResponse> {
      let lastError: Error | undefined;

      for (let i = 0; i < providers.length; i++) {
        try {
          const model = i === 0 ? req.model : providers[i].defaultModel;
          return await providers[i].chat({ ...req, model });
        } catch (err) {
          lastError = err instanceof Error ? err : new Error(String(err));
          if (i + 1 < providers.length) {
            opts?.onFallback?.(providers[i].name, providers[i + 1].name, lastError);
          }
        }
      }

      throw new ProviderError(
        `All providers failed. Last error: ${lastError?.message}`,
        'failover',
        lastError
      );
    },

    async *stream(req: ChatRequest): AsyncIterable<ChatStreamEvent> {
      let lastError: Error | undefined;

      for (let i = 0; i < providers.length; i++) {
        try {
          const model = i === 0 ? req.model : providers[i].defaultModel;
          const streamReq = { ...req, model };

          if (providers[i].stream) {
            yield* providers[i].stream!(streamReq);
            return;
          }

          // fallback to chat
          const response = await providers[i].chat(streamReq);
          if (response.text) yield { type: 'text', text: response.text };
          for (const tc of response.toolCalls) {
            yield { type: 'tool_call_end', toolCall: tc };
          }
          yield { type: 'done', usage: response.usage };
          return;
        } catch (err) {
          lastError = err instanceof Error ? err : new Error(String(err));
          if (i + 1 < providers.length) {
            opts?.onFallback?.(providers[i].name, providers[i + 1].name, lastError);
          }
        }
      }

      throw new ProviderError(
        `All providers failed. Last error: ${lastError?.message}`,
        'failover',
        lastError
      );
    },
  };
}
