import type {
  LLMProvider,
  ChatRequest,
  ChatResponse,
  ProviderTool,
  ProviderToolCall,
} from '../provider';
import { ProviderError } from '../errors';

type GeminiPart =
  | { text: string }
  | { functionCall: { name: string; args: Record<string, unknown> } }
  | { functionResponse: { name: string; response: { content: string } } };

interface GeminiToolDeclaration {
  functionDeclarations: Array<{
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  }>;
}

export interface GeminiClient {
  models: {
    generateContent(params: {
      model: string;
      contents: Array<{ role: string; parts: GeminiPart[] }>;
      tools?: GeminiToolDeclaration[];
      systemInstruction?: { parts: Array<{ text: string }> };
      generationConfig?: { temperature?: number; maxOutputTokens?: number };
    }): Promise<{
      response: {
        candidates: Array<{
          content: {
            parts: Array<{
              text?: string;
              functionCall?: { name: string; args: Record<string, unknown> };
            }>;
          };
          finishReason: string;
        }>;
        usageMetadata: { promptTokenCount: number; candidatesTokenCount: number };
      };
    }>;
  };
}

function formatMessages(
  messages: ChatRequest['messages']
): Array<{ role: string; parts: GeminiPart[] }> {
  return messages
    .filter(m => m.role !== 'system')
    .map(m => {
      const role = m.role === 'assistant' ? 'model' : 'user';
      if (typeof m.content === 'string') {
        return { role, parts: [{ text: m.content }] as GeminiPart[] };
      }

      const parts: GeminiPart[] = [];
      const toolCallNames = new Map<string, string>();

      // first pass: collect tool_use id→name mappings
      for (const c of m.content) {
        if (c.type === 'tool_use') toolCallNames.set(c.id, c.name);
      }

      for (const c of m.content) {
        if (c.type === 'text') parts.push({ text: c.text });
        else if (c.type === 'tool_use') {
          parts.push({ functionCall: { name: c.name, args: c.input as Record<string, unknown> } });
        } else if (c.type === 'tool_result') {
          parts.push({
            functionResponse: {
              name: toolCallNames.get(c.tool_use_id) ?? c.tool_use_id,
              response: { content: c.content },
            },
          });
        }
      }
      return { role, parts };
    });
}

function formatTools(tools: ProviderTool[]): GeminiToolDeclaration[] {
  return [
    {
      functionDeclarations: tools.map(t => ({
        name: t.name,
        description: t.description,
        parameters: t.inputSchema,
      })),
    },
  ];
}

export function geminiProvider(client: GeminiClient, defaultModel?: string): LLMProvider {
  return {
    name: 'gemini',
    defaultModel: defaultModel ?? 'gemini-2.0-flash',

    async chat(req: ChatRequest): Promise<ChatResponse> {
      try {
        const result = await client.models.generateContent({
          model: req.model,
          contents: formatMessages(req.messages),
          tools: req.tools ? formatTools(req.tools) : undefined,
          systemInstruction: req.system ? { parts: [{ text: req.system }] } : undefined,
          generationConfig: {
            temperature: req.temperature,
            maxOutputTokens: req.maxTokens,
          },
        });

        const candidate = result.response.candidates[0];
        if (!candidate) throw new Error('No candidates in response');

        let text = '';
        const toolCalls: ProviderToolCall[] = [];
        let callIdx = 0;

        for (const part of candidate.content.parts) {
          if (part.text) text += part.text;
          if (part.functionCall) {
            toolCalls.push({
              id: `gemini-${callIdx++}`,
              name: part.functionCall.name,
              input: part.functionCall.args,
            });
          }
        }

        const stopMap: Record<string, ChatResponse['stopReason']> = {
          STOP: 'end',
          MAX_TOKENS: 'max_tokens',
        };

        return {
          text,
          toolCalls,
          usage: {
            inputTokens: result.response.usageMetadata.promptTokenCount,
            outputTokens: result.response.usageMetadata.candidatesTokenCount,
          },
          stopReason:
            toolCalls.length > 0 ? 'tool_use' : (stopMap[candidate.finishReason] ?? 'end'),
          raw: result,
        };
      } catch (err) {
        if (err instanceof ProviderError) throw err;
        throw new ProviderError(
          `Gemini API error: ${err instanceof Error ? err.message : String(err)}`,
          'gemini',
          err
        );
      }
    },
  };
}
