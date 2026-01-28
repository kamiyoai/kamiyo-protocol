import Anthropic from '@anthropic-ai/sdk';
import type {
  AgentConfig,
  AgentMessage,
  AgentRunResult,
  ToolCall,
  ToolCallResult,
  ToolConfig,
} from './types.js';

const DEFAULT_MODEL = 'claude-sonnet-4-20250514';
const DEFAULT_MAX_TURNS = 10;
const DEFAULT_TIMEOUT_MS = 30000;
const MAX_HISTORY_SIZE = 50;

export class KamiyoAgent {
  private client: Anthropic;
  private config: AgentConfig;
  private tools: Map<string, ToolConfig>;
  private toolsCache: Anthropic.Tool[] | null = null;
  private messages: AgentMessage[] = [];

  constructor(config: AgentConfig) {
    this.config = config;
    this.client = new Anthropic({ apiKey: config.apiKey });
    this.tools = new Map();

    if (config.tools) {
      for (const tool of config.tools) {
        this.tools.set(tool.name, tool);
      }
    }
  }

  addTool(tool: ToolConfig): void {
    this.tools.set(tool.name, tool);
    this.toolsCache = null;
  }

  removeTool(name: string): void {
    this.tools.delete(name);
    this.toolsCache = null;
  }

  private formatToolsForClaude(): Anthropic.Tool[] {
    if (this.toolsCache) return this.toolsCache;

    this.toolsCache = Array.from(this.tools.values()).map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: {
        type: 'object' as const,
        properties: Object.fromEntries(
          Object.entries(tool.parameters).map(([key, param]) => [
            key,
            {
              type: param.type,
              description: param.description,
              ...(param.enum ? { enum: param.enum } : {}),
            },
          ])
        ),
        required: Object.entries(tool.parameters)
          .filter(([, param]) => param.required)
          .map(([key]) => key),
      },
    }));
    return this.toolsCache;
  }

  private pruneHistory(): void {
    if (this.messages.length > MAX_HISTORY_SIZE) {
      this.messages = [
        this.messages[0],
        ...this.messages.slice(-MAX_HISTORY_SIZE + 1),
      ];
    }
  }

  private async executeToolCall(toolCall: ToolCall): Promise<ToolCallResult> {
    const tool = this.tools.get(toolCall.name);
    if (!tool) {
      return {
        toolCallId: toolCall.id,
        result: { success: false, error: `Unknown tool: ${toolCall.name}` },
      };
    }

    const result = await tool.handler(toolCall.arguments);
    return { toolCallId: toolCall.id, result };
  }

  async run(userMessage: string): Promise<AgentRunResult> {
    const maxTurns = this.config.maxTurns ?? DEFAULT_MAX_TURNS;
    const model = this.config.model ?? DEFAULT_MODEL;
    const timeoutMs = this.config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const toolsUsed = new Set<string>();
    let inputTokens = 0;
    let outputTokens = 0;

    this.messages.push({ role: 'user', content: userMessage });
    this.pruneHistory();

    for (let turn = 0; turn < maxTurns; turn++) {
      const claudeMessages = this.messages.map((msg) => {
        if (msg.role === 'system') return null;
        if (msg.toolResults) {
          return {
            role: 'user' as const,
            content: msg.toolResults.map((tr) => ({
              type: 'tool_result' as const,
              tool_use_id: tr.toolCallId,
              content: JSON.stringify(tr.result),
            })),
          };
        }
        if (msg.toolCalls) {
          return {
            role: 'assistant' as const,
            content: msg.toolCalls.map((tc) => ({
              type: 'tool_use' as const,
              id: tc.id,
              name: tc.name,
              input: tc.arguments,
            })),
          };
        }
        return { role: msg.role as 'user' | 'assistant', content: msg.content };
      }).filter(Boolean) as Anthropic.MessageParam[];

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      let response: Anthropic.Message;
      try {
        response = await this.client.messages.create({
          model,
          max_tokens: 4096,
          system: this.config.systemPrompt,
          tools: this.formatToolsForClaude(),
          messages: claudeMessages,
        }, { signal: controller.signal });
      } finally {
        clearTimeout(timeoutId);
      }

      inputTokens += response.usage.input_tokens;
      outputTokens += response.usage.output_tokens;

      const toolUseBlocks = response.content.filter(
        (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
      );
      const textBlocks = response.content.filter(
        (block): block is Anthropic.TextBlock => block.type === 'text'
      );

      if (toolUseBlocks.length > 0) {
        const toolCalls: ToolCall[] = toolUseBlocks.map((block) => ({
          id: block.id,
          name: block.name,
          arguments: block.input as Record<string, unknown>,
        }));

        this.messages.push({
          role: 'assistant',
          content: textBlocks.map((b) => b.text).join('\n'),
          toolCalls,
        });

        const toolResults: ToolCallResult[] = await Promise.all(
          toolCalls.map((tc) => {
            toolsUsed.add(tc.name);
            return this.executeToolCall(tc);
          })
        );

        this.messages.push({
          role: 'user',
          content: '',
          toolResults,
        });

        if (response.stop_reason === 'end_turn') break;
      } else {
        const finalText = textBlocks.map((b) => b.text).join('\n');
        this.messages.push({ role: 'assistant', content: finalText });

        return {
          messages: this.messages,
          finalResponse: finalText,
          toolsUsed: [...toolsUsed],
          tokenUsage: { input: inputTokens, output: outputTokens },
        };
      }
    }

    const lastAssistantMessage = this.messages.findLast((m) => m.role === 'assistant');
    return {
      messages: this.messages,
      finalResponse: lastAssistantMessage?.content ?? '',
      toolsUsed: [...toolsUsed],
      tokenUsage: { input: inputTokens, output: outputTokens },
    };
  }

  clearHistory(): void {
    this.messages = [];
  }

  getHistory(): AgentMessage[] {
    return [...this.messages];
  }
}

export function createKamiyoAgent(config: AgentConfig): KamiyoAgent {
  return new KamiyoAgent(config);
}
