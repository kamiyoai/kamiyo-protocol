import { z } from 'zod';
import { createContext, runInContext } from 'vm';
import { defineTool, type Capability, type ToolDefinition } from '@kamiyo-org/agent';

export interface CodeConfig {
  timeout?: number;
  allowedModules?: string[];
}

const executeSchema = z.object({
  code: z.string(),
  language: z.enum(['javascript']).optional(),
  timeout: z.number().int().min(100).max(30000).optional(),
});

const evalSchema = z.object({
  expression: z.string(),
});

export function codeCapability(config: CodeConfig = {}): Capability {
  const defaultTimeout = config.timeout ?? 5000;

  const tools: ToolDefinition[] = [
    defineTool({
      name: 'code_execute',
      description:
        'Execute JavaScript code in a sandboxed VM context. Returns the last expression value.',
      schema: executeSchema,
      category: 'code',
      handler: async input => {
        const timeout = input.timeout ?? defaultTimeout;
        const sandbox = {
          console: { log: (...args: unknown[]) => args.map(String).join(' ') },
          JSON,
          Math,
          Date,
          Array,
          Object,
          String,
          Number,
          Boolean,
          RegExp,
          Map,
          Set,
          Promise,
          setTimeout: undefined,
          setInterval: undefined,
          require: undefined,
          process: undefined,
          __result: undefined as undefined,
        };

        const ctx = createContext(sandbox);
        const wrapped = `(function() { ${input.code} })()`;

        try {
          const result = runInContext(wrapped, ctx, { timeout });
          return JSON.stringify({ success: true, result: result ?? null });
        } catch (err) {
          return JSON.stringify({
            success: false,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      },
    }),
    defineTool({
      name: 'code_eval',
      description: 'Evaluate a single JavaScript expression and return the result.',
      schema: evalSchema,
      category: 'code',
      handler: async input => {
        const sandbox = { JSON, Math, Date, Array, Object, String, Number, Boolean, RegExp };
        const ctx = createContext(sandbox);

        try {
          const result = runInContext(input.expression, ctx, { timeout: 2000 });
          return JSON.stringify({ success: true, result });
        } catch (err) {
          return JSON.stringify({
            success: false,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      },
    }),
  ];

  return { name: 'code', description: 'JavaScript code execution in sandboxed VM', tools };
}
