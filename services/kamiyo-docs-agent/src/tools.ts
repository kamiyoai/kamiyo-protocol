import { execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { defineTool, type ToolDefinition } from '@kamiyo-org/agent';

const BASH_TIMEOUT_MS = 120_000;
const MAX_OUTPUT_CHARS = 32_000;
const READ_ONLY_GIT_SUBCOMMANDS = new Set(['diff', 'log', 'ls-tree', 'rev-parse', 'show', 'status']);
const READ_ONLY_SHELL_COMMANDS = new Set(['head', 'ls', 'pwd', 'sed', 'sort', 'tail', 'uniq', 'wc']);

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

function resolveRepoPath(targetPath: string, repoRoot: string): string {
  const absolutePath = path.isAbsolute(targetPath)
    ? path.resolve(targetPath)
    : path.resolve(repoRoot, targetPath);
  const relative = path.relative(repoRoot, absolutePath);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Path must stay inside repo root: ${absolutePath}`);
  }
  return absolutePath;
}

function assertWritableDocPath(targetPath: string, repoRoot: string): string {
  const absolutePath = resolveRepoPath(targetPath, repoRoot);
  const base = path.basename(absolutePath);
  if (base !== 'README.md' && base !== 'CHANGELOG.md') {
    throw new Error(`Only README.md and CHANGELOG.md are writable: ${absolutePath}`);
  }
  return absolutePath;
}

function firstToken(segment: string): string {
  const match = segment.trim().match(/^([A-Za-z0-9._/-]+)/);
  if (!match) {
    throw new Error(`Unsupported shell segment: ${segment}`);
  }
  return match[1];
}

function assertReadOnlyShellCommand(command: string): void {
  if (!command.trim()) {
    throw new Error('Command must not be empty.');
  }
  if (/[;\n\r]/.test(command) || command.includes('&&') || command.includes('||')) {
    throw new Error('Only a single read-only command or pipeline is allowed.');
  }
  if (/[<>]/.test(command) || command.includes('`') || command.includes('$(')) {
    throw new Error('Shell redirection and command substitution are not allowed.');
  }

  for (const segment of command.split('|')) {
    const token = firstToken(segment);
    if (token === 'git') {
      const [, subcommand] = segment.trim().split(/\s+/, 3);
      if (!subcommand || !READ_ONLY_GIT_SUBCOMMANDS.has(subcommand)) {
        throw new Error(`git ${subcommand || '<missing>'} is not allowed in docs-agent bash.`);
      }
      continue;
    }

    if (!READ_ONLY_SHELL_COMMANDS.has(token)) {
      throw new Error(`Command "${token}" is not allowed in docs-agent bash.`);
    }
  }
}

export function createDocsAgentTools(repoRoot: string): ToolDefinition[] {
  return [
    defineTool({
      name: 'bash',
      description:
        'Execute a read-only inspection command or pipeline. Allowed commands: git diff/log/show/status/rev-parse/ls-tree, pwd, ls, head, tail, sed, wc, sort, uniq.',
      schema: z.object({
        command: z.string().min(1),
      }),
      timeout: BASH_TIMEOUT_MS,
      handler: async input => {
        assertReadOnlyShellCommand(input.command);
        return truncate(runShell(input.command, repoRoot));
      },
    }),

    defineTool({
      name: 'read_file',
      description:
        'Read a repo file and return its contents. The path must stay inside the repo root and can be absolute or repo-relative.',
      schema: z.object({
        path: z.string().min(1),
      }),
      handler: async input => {
        const filePath = resolveRepoPath(input.path, repoRoot);
        if (!existsSync(filePath)) {
          throw new Error(`File not found: ${filePath}`);
        }
        return truncate(readFileSync(filePath, 'utf-8'));
      },
    }),

    defineTool({
      name: 'write_file',
      description:
        'Write content to a docs file, creating or overwriting it. Only README.md and CHANGELOG.md inside the repo root are allowed.',
      schema: z.object({
        path: z.string().min(1),
        content: z.string(),
      }),
      handler: async input => {
        const filePath = assertWritableDocPath(input.path, repoRoot);
        writeFileSync(filePath, input.content, 'utf-8');
        return `Wrote ${filePath}`;
      },
    }),

    defineTool({
      name: 'edit_file',
      description:
        'Replace an exact string in a docs file. Only README.md and CHANGELOG.md inside the repo root are allowed. old_string must appear exactly once unless replace_all is true.',
      schema: z.object({
        path: z.string().min(1),
        old_string: z.string(),
        new_string: z.string(),
        replace_all: z.boolean().optional().default(false),
      }),
      handler: async input => {
        const filePath = assertWritableDocPath(input.path, repoRoot);
        if (!existsSync(filePath)) {
          throw new Error(`File not found: ${filePath}`);
        }

        const original = readFileSync(filePath, 'utf-8');
        let next = original;
        if (input.replace_all) {
          next = original.split(input.old_string).join(input.new_string);
        } else {
          const firstIndex = original.indexOf(input.old_string);
          if (firstIndex === -1) {
            throw new Error(`old_string not found in ${filePath}`);
          }
          const secondIndex = original.indexOf(
            input.old_string,
            firstIndex + input.old_string.length
          );
          if (secondIndex !== -1) {
            throw new Error(`old_string is ambiguous (found multiple times) in ${filePath}`);
          }
          next =
            original.slice(0, firstIndex) +
            input.new_string +
            original.slice(firstIndex + input.old_string.length);
        }

        writeFileSync(filePath, next, 'utf-8');
        return `Edited ${filePath}`;
      },
    }),

    defineTool({
      name: 'grep',
      description:
        'Search repo files using a regex pattern. The search path must stay inside the repo root and can be absolute or repo-relative.',
      schema: z.object({
        pattern: z.string().min(1),
        path: z.string().optional().default('.'),
        glob: z.string().optional(),
      }),
      handler: async input => {
        const searchPath = resolveRepoPath(input.path, repoRoot);
        const globArg = input.glob ? `--glob '${input.glob.replace(/'/g, "'\\''")}'` : '';
        const command =
          `rg --no-heading -n ${globArg} ` +
          `'${input.pattern.replace(/'/g, "'\\''")}' ` +
          `'${searchPath.replace(/'/g, "'\\''")}' 2>/dev/null | head -200`;
        try {
          const output = runShell(command, repoRoot, 30_000);
          return truncate(output || 'No matches found.');
        } catch {
          return 'No matches found.';
        }
      },
    }),

    defineTool({
      name: 'glob',
      description:
        'Find repo files matching a glob pattern. The base path must stay inside the repo root and can be absolute or repo-relative.',
      schema: z.object({
        pattern: z.string().min(1),
        path: z.string().optional().default('.'),
      }),
      handler: async input => {
        const basePath = resolveRepoPath(input.path, repoRoot);
        const command =
          `find '${basePath.replace(/'/g, "'\\''")}' ` +
          `-path '${input.pattern.replace(/'/g, "'\\''")}' -type f 2>/dev/null | head -100`;
        try {
          const output = runShell(command, repoRoot, 15_000);
          return truncate(output || 'No files found.');
        } catch {
          return 'No files found.';
        }
      },
    }),
  ];
}
