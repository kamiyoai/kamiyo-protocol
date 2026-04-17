import { z } from 'zod';
import type { ProviderTool } from './provider';

// zod-to-json-schema has deep generics that blow up tsc — import at runtime only
// eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
const { zodToJsonSchema } = require('zod-to-json-schema') as {
  zodToJsonSchema: (schema: unknown, opts?: unknown) => Record<string, unknown>;
};

function toJsonSchema(schema: z.ZodType): Record<string, unknown> {
  return zodToJsonSchema(schema, { target: 'openApi3' }) as Record<string, unknown>;
}

export interface ToolContext {
  agentId: string;
  runId: string;
  signal: AbortSignal;
}

export interface RetryConfig {
  maxRetries: number;
  initialDelayMs?: number;
  backoffMultiplier?: number;
}

export interface ToolDefinition<TInput = unknown, TOutput = unknown> {
  name: string;
  description: string;
  schema: z.ZodType<TInput>;
  handler: (input: TInput, ctx: ToolContext) => Promise<TOutput>;
  category?: string;
  requiresApproval?: boolean;
  timeout?: number;
  retry?: RetryConfig;
}

export interface ToolCall {
  id: string;
  name: string;
  input: unknown;
}

export interface ToolCallResult {
  toolCallId: string;
  name: string;
  output: string;
  isError: boolean;
  durationMs: number;
}

export interface Capability {
  name: string;
  description?: string;
  tools: ToolDefinition[];
  setup?(agentId: string): Promise<void>;
  teardown?(): Promise<void>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function defineTool<T extends z.ZodType<any>>(
  def: Omit<ToolDefinition<z.infer<T>, unknown>, 'schema'> & { schema: T }
): ToolDefinition {
  return def as ToolDefinition;
}

export class ToolRegistry {
  private tools = new Map<string, ToolDefinition>();

  register(tool: ToolDefinition): void {
    if (!tool.name || !/^[a-zA-Z0-9_-]+$/.test(tool.name)) {
      throw new Error(`Invalid tool name "${tool.name}": must match [a-zA-Z0-9_-]+`);
    }
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool "${tool.name}" already registered`);
    }
    this.tools.set(tool.name, tool);
  }

  registerCapability(cap: Capability): void {
    for (const tool of cap.tools) {
      this.register(tool);
    }
  }

  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  list(): ToolDefinition[] {
    return [...this.tools.values()];
  }

  names(): string[] {
    return [...this.tools.keys()];
  }

  toProviderTools(): ProviderTool[] {
    return this.list().map(t => ({
      name: t.name,
      description: t.description,
      inputSchema: toJsonSchema(t.schema),
    }));
  }

  clear(): void {
    this.tools.clear();
  }
}
