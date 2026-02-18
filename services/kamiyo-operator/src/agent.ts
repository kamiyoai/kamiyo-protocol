import Anthropic from '@anthropic-ai/sdk';

import type { KamiyoDb } from './db.js';
import { writeOutbox } from './outbox.js';

export type KamiyoMode = 'propose' | 'execute';

export type ToolResult = {
  success: boolean;
  data?: unknown;
  error?: string;
};

export type ToolHandler = (params: Record<string, unknown>) => Promise<ToolResult>;

export type ToolConfig = {
  name: string;
  description: string;
  parameters: Record<
    string,
    {
      type: string;
      description: string;
      required?: boolean;
      enum?: string[];
    }
  >;
  handler: ToolHandler;
};

const SENSITIVE_KEYS = [
  'apiKey',
  'apikey',
  'authorization',
  'auth',
  'token',
  'secret',
  'password',
  'privateKey',
  'private_key',
  'key',
  'bearer',
  'access_token',
  'x-api-key',
  'x-apiKey',
];

function redactValue(k: string, v: unknown): unknown {
  const key = k.toLowerCase();
  const isSensitive = SENSITIVE_KEYS.some(s => key.includes(s.toLowerCase()));
  if (!isSensitive) return v;
  if (typeof v === 'string') return '[redacted]';
  if (typeof v === 'number') return 0;
  if (typeof v === 'boolean') return false;
  if (v && typeof v === 'object') return '[redacted]';
  return '[redacted]';
}

function redactObject(input: unknown): unknown {
  if (!input || typeof input !== 'object') return input;
  if (Array.isArray(input)) return input.map(redactObject);

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      out[k] = redactObject(
        SENSITIVE_KEYS.some(s => k.toLowerCase().includes(s.toLowerCase())) ? '[redacted]' : v
      );
      continue;
    }

    out[k] = redactValue(k, v);
  }

  return out;
}

function withTimeout<T>(p: Promise<T>, ms: number, msg?: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return Promise.race([
      p,
      new Promise<T>((_, rej) => {
        timer = setTimeout(() => rej(new Error(msg ?? `timeout after ${ms}ms`)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export class KamiyoAgent {
  private tools = new Map<string, ToolConfig>();
  private anthropicTools: Anthropic.Tool[] = [];

  constructor(
    private deps: {
      db: KamiyoDb;
      outboxDir: string;
      mode: KamiyoMode;
      client: Anthropic;
      model: string;
      maxOutputTokens: number;
      maxTurnsPerTick: number;
      allowedChannels: string[];
      requestTimeoutMs?: number;
    }
  ) {
    this.addTool({
      name: 'draft_announcement',
      description: 'Draft an announcement for an allowed channel. Writes to the outbox.',
      parameters: {
        channel: {
          type: 'string',
          description: `One of: ${deps.allowedChannels.join(', ')}`,
          required: true,
          enum: deps.allowedChannels,
        },
        text: {
          type: 'string',
          description: 'Announcement text (keep it concise and specific).',
          required: true,
        },
      },
      handler: async input => {
        const channel = String(input.channel || '').trim();
        const text = String(input.text || '').trim();

        if (!deps.allowedChannels.includes(channel)) {
          return { success: false, error: `Channel not allowed: ${channel}` };
        }

        if (!text) return { success: false, error: 'text is required' };

        const filePath = writeOutbox(deps.outboxDir, `announce-${channel}`, { channel, text });
        return { success: true, data: { channel, filePath } };
      },
    });

    this.addTool({
      name: 'propose_action',
      description: 'Propose a higher-risk action for human approval. Writes a proposal JSON to the outbox.',
      parameters: {
        title: { type: 'string', description: 'Short proposal title', required: true },
        rationale: { type: 'string', description: 'Why this is worth doing now', required: true },
        steps: { type: 'string', description: 'Concrete steps to execute', required: true },
        risk: { type: 'string', description: 'Risks and mitigations', required: true },
      },
      handler: async input => {
        const title = String(input.title || '').trim();
        const rationale = String(input.rationale || '').trim();
        const steps = String(input.steps || '').trim();
        const risk = String(input.risk || '').trim();

        if (!title || !rationale || !steps || !risk) {
          return { success: false, error: 'title, rationale, steps, and risk are required' };
        }

        const filePath = writeOutbox(deps.outboxDir, 'proposal', {
          title,
          rationale,
          steps,
          risk,
          createdAt: new Date().toISOString(),
        });

        return { success: true, data: { filePath } };
      },
    });
  }

  registerTool(tool: ToolConfig): void {
    this.addTool(tool);
  }

  async runTick(params: {
    tickId: string;
    systemPrompt: string;
    userPrompt: string;
  }): Promise<{ finalText: string } | { finalText: string; warning: string }> {
    const messages: Anthropic.MessageParam[] = [{ role: 'user', content: params.userPrompt }];

    for (let turn = 0; turn < this.deps.maxTurnsPerTick; turn++) {
      const response = await withTimeout(
        this.deps.client.messages.create({
          model: this.deps.model,
          max_tokens: this.deps.maxOutputTokens,
          system: params.systemPrompt,
          tools: this.anthropicTools,
          messages,
        }),
        this.deps.requestTimeoutMs ?? 60_000,
        'Anthropic request timed out'
      );

      if (response.usage) {
        this.deps.db.addUsage(params.tickId, response.model, {
          input_tokens: response.usage.input_tokens,
          output_tokens: response.usage.output_tokens,
        });
      }

      const assistantBlocks: Anthropic.ContentBlock[] = [];
      const toolCalls: { id: string; name: string; input: Record<string, unknown> }[] = [];

      let lastText = '';
      for (const block of response.content) {
        assistantBlocks.push(block);

        if (block.type === 'text') lastText = block.text;

        if (block.type === 'tool_use') {
          toolCalls.push({
            id: block.id,
            name: block.name,
            input: (block.input ?? {}) as Record<string, unknown>,
          });
        }
      }

      messages.push({ role: 'assistant', content: assistantBlocks });

      if (toolCalls.length === 0) {
        return { finalText: lastText };
      }

      for (const call of toolCalls) {
        const tool = this.tools.get(call.name);
        if (!tool) {
          const error = `Unknown tool: ${call.name}`;
          this.deps.db.addAction(params.tickId, call.name, call.input, null, error);
          messages.push({
            role: 'user',
            content: [
              {
                type: 'tool_result',
                tool_use_id: call.id,
                content: error,
                is_error: true,
              },
            ],
          });
          continue;
        }

        try {
          const result = await tool.handler(call.input);
          this.deps.db.addAction(params.tickId, tool.name, redactObject(call.input), redactObject(result));

          messages.push({
            role: 'user',
            content: [
              {
                type: 'tool_result',
                tool_use_id: call.id,
                content: JSON.stringify(result),
                is_error: result.success === false,
              },
            ],
          });
        } catch (e) {
          const err = e instanceof Error ? e.message : String(e);
          this.deps.db.addAction(params.tickId, tool.name, redactObject(call.input), null, err);

          messages.push({
            role: 'user',
            content: [
              {
                type: 'tool_result',
                tool_use_id: call.id,
                content: err,
                is_error: true,
              },
            ],
          });
        }
      }
    }

    return { finalText: '', warning: 'maxTurnsPerTick reached' };
  }

  private addTool(tool: ToolConfig): void {
    this.tools.set(tool.name, tool);

    const properties: Record<string, unknown> = {};
    const required: string[] = [];

    for (const [key, param] of Object.entries(tool.parameters)) {
      properties[key] = {
        type: param.type,
        description: param.description,
        ...(param.enum ? { enum: param.enum } : {}),
      };

      if (param.required) required.push(key);
    }

    this.anthropicTools.push({
      name: tool.name,
      description: tool.description,
      input_schema: {
        type: 'object',
        properties,
        required,
      },
    });
  }
}
