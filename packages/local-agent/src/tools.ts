import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import type { ChatCompletionTool } from 'openai/resources/chat/completions';

export interface ToolResult {
  output: string;
  error?: boolean;
}

export const TOOL_SCHEMAS: ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'bash',
      description: 'Execute a shell command and return its output.',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'The shell command to execute' },
        },
        required: ['command'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Read a file and return its contents.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Absolute path to the file' },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description: 'Write content to a file, creating or overwriting it.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Absolute path to the file' },
          content: { type: 'string', description: 'File content to write' },
        },
        required: ['path', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'edit_file',
      description:
        'Replace an exact string in a file. old_string must appear exactly once unless replace_all is true.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Absolute path to the file' },
          old_string: { type: 'string', description: 'The exact text to find' },
          new_string: { type: 'string', description: 'The replacement text' },
          replace_all: {
            type: 'boolean',
            description: 'Replace all occurrences (default false)',
            default: false,
          },
        },
        required: ['path', 'old_string', 'new_string'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'grep',
      description: 'Search file contents using a regex pattern. Returns matching lines.',
      parameters: {
        type: 'object',
        properties: {
          pattern: { type: 'string', description: 'Regex pattern to search for' },
          path: { type: 'string', description: 'Directory or file to search in', default: '.' },
          glob: { type: 'string', description: 'File glob filter (e.g. "*.ts")' },
        },
        required: ['pattern'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'glob',
      description: 'Find files matching a glob pattern.',
      parameters: {
        type: 'object',
        properties: {
          pattern: { type: 'string', description: 'Glob pattern (e.g. "src/**/*.ts")' },
          path: { type: 'string', description: 'Base directory', default: '.' },
        },
        required: ['pattern'],
      },
    },
  },
];

const BASH_TIMEOUT = 120_000;
const MAX_OUTPUT = 32_000;

function truncate(s: string): string {
  if (s.length <= MAX_OUTPUT) return s;
  return s.slice(0, MAX_OUTPUT) + '\n... (truncated)';
}

export function executeTool(name: string, args: Record<string, unknown>, cwd: string): ToolResult {
  try {
    switch (name) {
      case 'bash': {
        const cmd = String(args.command ?? '');
        const out = execSync(cmd, {
          cwd,
          encoding: 'utf-8',
          timeout: BASH_TIMEOUT,
          maxBuffer: 10 * 1024 * 1024,
          stdio: ['pipe', 'pipe', 'pipe'],
        });
        return { output: truncate(out) };
      }

      case 'read_file': {
        const p = String(args.path ?? '');
        if (!existsSync(p)) return { output: `File not found: ${p}`, error: true };
        const content = readFileSync(p, 'utf-8');
        return { output: truncate(content) };
      }

      case 'write_file': {
        const p = String(args.path ?? '');
        writeFileSync(p, String(args.content ?? ''), 'utf-8');
        return { output: `Wrote ${p}` };
      }

      case 'edit_file': {
        const p = String(args.path ?? '');
        if (!existsSync(p)) return { output: `File not found: ${p}`, error: true };
        const old = String(args.old_string ?? '');
        const repl = String(args.new_string ?? '');
        let content = readFileSync(p, 'utf-8');
        if (args.replace_all) {
          content = content.split(old).join(repl);
        } else {
          const idx = content.indexOf(old);
          if (idx === -1) return { output: `old_string not found in ${p}`, error: true };
          const second = content.indexOf(old, idx + old.length);
          if (second !== -1)
            return {
              output: `old_string is ambiguous (found multiple times) in ${p}`,
              error: true,
            };
          content = content.slice(0, idx) + repl + content.slice(idx + old.length);
        }
        writeFileSync(p, content, 'utf-8');
        return { output: `Edited ${p}` };
      }

      case 'grep': {
        const pattern = String(args.pattern ?? '');
        const searchPath = String(args.path ?? cwd);
        const globArg = args.glob ? `--glob '${args.glob}'` : '';
        const cmd = `rg --no-heading -n ${globArg} '${pattern.replace(/'/g, "\\'")}' '${searchPath}' 2>/dev/null | head -200`;
        try {
          const out = execSync(cmd, { cwd, encoding: 'utf-8', timeout: 30_000 });
          return { output: truncate(out) || 'No matches found.' };
        } catch {
          return { output: 'No matches found.' };
        }
      }

      case 'glob': {
        const pattern = String(args.pattern ?? '');
        const base = String(args.path ?? cwd);
        const cmd = `find '${base}' -path '${pattern}' -type f 2>/dev/null | head -100`;
        try {
          const out = execSync(cmd, { cwd, encoding: 'utf-8', timeout: 15_000 });
          return { output: truncate(out) || 'No files found.' };
        } catch {
          return { output: 'No files found.' };
        }
      }

      default:
        return { output: `Unknown tool: ${name}`, error: true };
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { output: truncate(msg), error: true };
  }
}
