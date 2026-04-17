import type { ToolCall, ToolCallResult, ToolContext, ToolDefinition, ToolRegistry } from './tool';
import { ToolError, ToolValidationError, TimeoutError } from './errors';
import type { EventEmitter } from './events';
import { safeSerialize } from './utils';

interface ExecutorConfig {
  defaultTimeout: number;
  defaultRetries: number;
  maxConcurrent: number;
}

const DEFAULT_CONFIG: ExecutorConfig = {
  defaultTimeout: 30_000,
  defaultRetries: 0,
  maxConcurrent: 10,
};

export class ToolExecutor {
  private config: ExecutorConfig;

  constructor(
    private registry: ToolRegistry,
    private events: EventEmitter,
    config?: Partial<ExecutorConfig>
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async executeAll(calls: ToolCall[], ctx: ToolContext): Promise<ToolCallResult[]> {
    const results: ToolCallResult[] = [];
    for (let i = 0; i < calls.length; i += this.config.maxConcurrent) {
      const batch = calls.slice(i, i + this.config.maxConcurrent);
      const batchResults = await Promise.all(batch.map(call => this.execute(call, ctx)));
      results.push(...batchResults);
    }
    return results;
  }

  async execute(call: ToolCall, ctx: ToolContext): Promise<ToolCallResult> {
    const started = Date.now();
    const tool = this.registry.get(call.name);

    if (!tool) {
      return {
        toolCallId: call.id,
        name: call.name,
        output: `Error: unknown tool "${call.name}"`,
        isError: true,
        durationMs: Date.now() - started,
      };
    }

    this.events.emit('tool:call', { runId: ctx.runId, call });

    try {
      const validated = this.validate(tool, call.input);
      const output = await this.executeWithRetry(tool, validated, ctx);
      const serialized = safeSerialize(output);

      const result: ToolCallResult = {
        toolCallId: call.id,
        name: call.name,
        output: serialized,
        isError: false,
        durationMs: Date.now() - started,
      };

      this.events.emit('tool:result', { runId: ctx.runId, result });
      return result;
    } catch (err) {
      this.events.emit('tool:error', { runId: ctx.runId, toolName: call.name, error: err });

      return {
        toolCallId: call.id,
        name: call.name,
        output: `Error: ${err instanceof Error ? err.message : String(err)}`,
        isError: true,
        durationMs: Date.now() - started,
      };
    }
  }

  private validate(tool: ToolDefinition, input: unknown): unknown {
    const result = tool.schema.safeParse(input);
    if (!result.success) {
      const issues = result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`);
      throw new ToolValidationError(tool.name, issues);
    }
    return result.data;
  }

  private async executeWithRetry(
    tool: ToolDefinition,
    input: unknown,
    ctx: ToolContext
  ): Promise<unknown> {
    const maxRetries = tool.retry?.maxRetries ?? this.config.defaultRetries;
    const timeout = tool.timeout ?? this.config.defaultTimeout;
    let lastError: unknown;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      if (ctx.signal.aborted) throw new Error('Aborted');

      if (attempt > 0) {
        const delay =
          (tool.retry?.initialDelayMs ?? 500) *
          Math.pow(tool.retry?.backoffMultiplier ?? 2, attempt - 1);
        await abortableSleep(delay, ctx.signal);
      }

      try {
        return await withTimeout(tool.handler(input, ctx), timeout, tool.name, ctx.signal);
      } catch (err) {
        lastError = err;
        if (err instanceof TimeoutError) throw err;
        if (ctx.signal.aborted) throw new Error('Aborted');
      }
    }

    throw new ToolError(
      `Tool "${tool.name}" failed after ${maxRetries + 1} attempts: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
      tool.name,
      lastError
    );
  }
}

function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string,
  signal?: AbortSignal
): Promise<T> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        reject(new TimeoutError(`Tool "${label}" timed out after ${ms}ms`, ms));
      }
    }, ms);

    const onAbort = () => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        reject(new Error('Aborted'));
      }
    };

    signal?.addEventListener('abort', onAbort, { once: true });

    promise
      .then(v => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          signal?.removeEventListener('abort', onAbort);
          resolve(v);
        }
      })
      .catch(e => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          signal?.removeEventListener('abort', onAbort);
          reject(e);
        }
      });
  });
}

function abortableSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error('Aborted'));
      return;
    }
    const timer = setTimeout(resolve, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new Error('Aborted'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}
