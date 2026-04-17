export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string | MessageContent[];
}

export type MessageContent =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: unknown }
  | { type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean };

export interface ChatRequest {
  model: string;
  system?: string;
  messages: Message[];
  tools?: ProviderTool[];
  temperature?: number;
  maxTokens?: number;
}

export interface ProviderTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface ChatResponse {
  text: string;
  toolCalls: ProviderToolCall[];
  usage: { inputTokens: number; outputTokens: number };
  stopReason: 'end' | 'tool_use' | 'max_tokens';
  raw?: unknown;
}

export interface ProviderToolCall {
  id: string;
  name: string;
  input: unknown;
}

export interface ChatStreamEvent {
  type: 'text' | 'tool_call_start' | 'tool_call_delta' | 'tool_call_end' | 'done';
  text?: string;
  toolCall?: Partial<ProviderToolCall>;
  usage?: { inputTokens: number; outputTokens: number };
}

export interface LLMProvider {
  readonly name: string;
  readonly defaultModel: string;
  chat(request: ChatRequest): Promise<ChatResponse>;
  stream?(request: ChatRequest): AsyncIterable<ChatStreamEvent>;
}
