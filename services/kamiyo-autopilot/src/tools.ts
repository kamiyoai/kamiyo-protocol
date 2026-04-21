// SPDX-License-Identifier: MIT
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { z } from 'zod';
import { defineTool, type ToolDefinition } from '@kamiyo-org/agent';

const BASH_TIMEOUT_MS = 120_000;
const MAX_OUTPUT_CHARS = 32_000;

function truncate(value: string): string {
  if (value.length <= MAX_OUTPUT_CHARS) return value;
  return `${value.slice(0, MAX_OUTPUT_CHARS)}\n... (truncated)`;
}

function runShell(command: string, cwd: string, timeout = BASH_TIMEOUT_MS): string {
  return execSync(command, {
    cwd,
    encoding: 'utf-8',
    timeout,
    maxBuffer: 10 * 1024 * 1024,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}

function requiredAbsolutePath(path: string): string {
  if (!path.startsWith('/')) {
    throw new Error(`Expected an absolute path, got "${path}"`);
  }
  return path;
}

export function createAutopilotTools(cwd = process.cwd()): ToolDefinition[] {
  return [
    defineTool({
      name: 'bash',
      description: 'Execute a shell command and return its output.',
      schema: z.object({
        command: z.string().min(1),
      }),
      timeout: BASH_TIMEOUT_MS,
      handler: async input => truncate(runShell(input.command, cwd)),
    }),

    defineTool({
      name: 'read_file',
      description: 'Read a file and return its contents.',
      schema: z.object({
        path: z.string().min(1),
      }),
      handler: async input => {
        const path = requiredAbsolutePath(input.path);
        if (!existsSync(path)) {
          throw new Error(`File not found: ${path}`);
        }
        return truncate(readFileSync(path, 'utf-8'));
      },
    }),

    defineTool({
      name: 'write_file',
      description: 'Write content to a file, creating or overwriting it.',
      schema: z.object({
        path: z.string().min(1),
        content: z.string(),
      }),
      handler: async input => {
        const path = requiredAbsolutePath(input.path);
        writeFileSync(path, input.content, 'utf-8');
        return `Wrote ${path}`;
      },
    }),

    defineTool({
      name: 'edit_file',
      description:
        'Replace an exact string in a file. old_string must appear exactly once unless replace_all is true.',
      schema: z.object({
        path: z.string().min(1),
        old_string: z.string(),
        new_string: z.string(),
        replace_all: z.boolean().optional().default(false),
      }),
      handler: async input => {
        const path = requiredAbsolutePath(input.path);
        if (!existsSync(path)) {
          throw new Error(`File not found: ${path}`);
        }

        const original = readFileSync(path, 'utf-8');
        let next = original;
        if (input.replace_all) {
          next = original.split(input.old_string).join(input.new_string);
        } else {
          const firstIndex = original.indexOf(input.old_string);
          if (firstIndex === -1) {
            throw new Error(`old_string not found in ${path}`);
          }
          const secondIndex = original.indexOf(
            input.old_string,
            firstIndex + input.old_string.length
          );
          if (secondIndex !== -1) {
            throw new Error(`old_string is ambiguous (found multiple times) in ${path}`);
          }
          next =
            original.slice(0, firstIndex) +
            input.new_string +
            original.slice(firstIndex + input.old_string.length);
        }

        writeFileSync(path, next, 'utf-8');
        return `Edited ${path}`;
      },
    }),

    defineTool({
      name: 'grep',
      description: 'Search file contents using a regex pattern. Returns matching lines.',
      schema: z.object({
        pattern: z.string().min(1),
        path: z.string().optional().default('.'),
        glob: z.string().optional(),
      }),
      handler: async input => {
        const globArg = input.glob ? `--glob '${input.glob.replace(/'/g, "'\\''")}'` : '';
        const command =
          `rg --no-heading -n ${globArg} ` +
          `'${input.pattern.replace(/'/g, "'\\''")}' ` +
          `'${input.path.replace(/'/g, "'\\''")}' 2>/dev/null | head -200`;
        try {
          const output = runShell(command, cwd, 30_000);
          return truncate(output || 'No matches found.');
        } catch {
          return 'No matches found.';
        }
      },
    }),

    defineTool({
      name: 'glob',
      description: 'Find files matching a glob pattern.',
      schema: z.object({
        pattern: z.string().min(1),
        path: z.string().optional().default('.'),
      }),
      handler: async input => {
        const command =
          `find '${input.path.replace(/'/g, "'\\''")}' ` +
          `-path '${input.pattern.replace(/'/g, "'\\''")}' -type f 2>/dev/null | head -100`;
        try {
          const output = runShell(command, cwd, 15_000);
          return truncate(output || 'No files found.');
        } catch {
          return 'No files found.';
        }
      },
    }),
  ];
}
