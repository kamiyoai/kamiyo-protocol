import type { JudgeLLM } from './adapters';

type AnthropicClient = {
  messages: {
    create(params: {
      model: string;
      temperature: number;
      max_tokens: number;
      system: string;
      messages: Array<{ role: 'user' | 'assistant'; content: string }>;
    }): Promise<{
      content: Array<{ type: string; text?: string }>;
      usage: { input_tokens: number; output_tokens: number };
    }>;
  };
};

export function anthropicJudge(client: AnthropicClient): JudgeLLM {
  return {
    async generate(p) {
      const r = await client.messages.create({
        model: p.model,
        temperature: p.temperature,
        max_tokens: p.maxTokens,
        system: p.system,
        messages: p.messages.map(m => ({ role: m.role, content: m.content })),
      });
      const part = r.content.find(c => c.type === 'text');
      return {
        text: part?.text ?? '',
        inputTokens: r.usage.input_tokens,
        outputTokens: r.usage.output_tokens,
      };
    },
  };
}

type OpenAIClient = {
  chat: {
    completions: {
      create(params: {
        model: string;
        temperature: number;
        max_tokens: number;
        messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
      }): Promise<{
        choices: Array<{ message: { content: string | null } }>;
        usage?: { prompt_tokens: number; completion_tokens: number };
      }>;
    };
  };
};

export function openaiJudge(client: OpenAIClient): JudgeLLM {
  return {
    async generate(p) {
      const r = await client.chat.completions.create({
        model: p.model,
        temperature: p.temperature,
        max_tokens: p.maxTokens,
        messages: [
          { role: 'system', content: p.system },
          ...p.messages.map(m => ({ role: m.role, content: m.content })),
        ],
      });
      return {
        text: r.choices[0]?.message?.content ?? '',
        inputTokens: r.usage?.prompt_tokens ?? 0,
        outputTokens: r.usage?.completion_tokens ?? 0,
      };
    },
  };
}

type GeminiModel = {
  generateContent(req: {
    contents: Array<{ role: string; parts: Array<{ text: string }> }>;
    generationConfig?: { temperature?: number; maxOutputTokens?: number };
    systemInstruction?: { parts: Array<{ text: string }> };
  }): Promise<{
    response: {
      text(): string;
      usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
    };
  }>;
};

export function geminiJudge(model: GeminiModel): JudgeLLM {
  return {
    async generate(p) {
      const r = await model.generateContent({
        contents: p.messages.map(m => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }],
        })),
        systemInstruction: { parts: [{ text: p.system }] },
        generationConfig: {
          temperature: p.temperature,
          maxOutputTokens: p.maxTokens,
        },
      });
      return {
        text: r.response.text(),
        inputTokens: r.response.usageMetadata?.promptTokenCount ?? 0,
        outputTokens: r.response.usageMetadata?.candidatesTokenCount ?? 0,
      };
    },
  };
}

type ChatCompletionsFetch = (request: {
  model: string;
  temperature: number;
  max_tokens: number;
  messages: Array<{ role: string; content: string }>;
}) => Promise<{
  text: string;
  inputTokens?: number;
  outputTokens?: number;
}>;

export function genericChatJudge(call: ChatCompletionsFetch): JudgeLLM {
  return {
    async generate(p) {
      const r = await call({
        model: p.model,
        temperature: p.temperature,
        max_tokens: p.maxTokens,
        messages: [
          { role: 'system', content: p.system },
          ...p.messages.map(m => ({ role: m.role, content: m.content })),
        ],
      });
      return {
        text: r.text,
        inputTokens: r.inputTokens ?? 0,
        outputTokens: r.outputTokens ?? 0,
      };
    },
  };
}
