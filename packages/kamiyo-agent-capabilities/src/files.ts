import { z } from 'zod';
import { readFile, writeFile, readdir, stat, realpath } from 'fs/promises';
import { join, resolve } from 'path';
import { defineTool, type Capability, type ToolDefinition } from '@kamiyo-org/agent';

export interface FilesConfig {
  rootDir: string;
  allowWrite?: boolean;
  maxFileSize?: number;
}

const readSchema = z.object({
  path: z.string(),
  encoding: z.enum(['utf-8', 'base64']).optional(),
});

const writeSchema = z.object({
  path: z.string(),
  content: z.string(),
  encoding: z.enum(['utf-8', 'base64']).optional(),
});

const listSchema = z.object({
  path: z.string().optional(),
  recursive: z.boolean().optional(),
});

const searchSchema = z.object({
  pattern: z.string(),
  path: z.string().optional(),
});

async function safePath(root: string, rel: string): Promise<string> {
  const resolved = resolve(root, rel);
  if (!resolved.startsWith(resolve(root))) {
    throw new Error('Path traversal blocked');
  }
  // resolve symlinks to detect escapes
  try {
    const real = await realpath(resolved);
    const realRoot = await realpath(root);
    if (!real.startsWith(realRoot)) {
      throw new Error('Path traversal blocked (symlink escape)');
    }
    return real;
  } catch (err) {
    // file doesn't exist yet (write case) — parent must be safe
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return resolved;
    throw err;
  }
}

export function filesCapability(config: FilesConfig): Capability {
  const maxSize = config.maxFileSize ?? 10 * 1024 * 1024; // 10MB
  let resolvedRoot: string | null = null;

  async function getRoot(): Promise<string> {
    if (resolvedRoot) return resolvedRoot;
    try {
      resolvedRoot = await realpath(resolve(config.rootDir));
    } catch {
      resolvedRoot = resolve(config.rootDir);
    }
    return resolvedRoot;
  }

  const tools: ToolDefinition[] = [
    defineTool({
      name: 'file_read',
      description: 'Read a file from the filesystem.',
      schema: readSchema,
      category: 'files',
      handler: async input => {
        const path = await safePath(await getRoot(), input.path);
        const stats = await stat(path);
        if (stats.size > maxSize) throw new Error(`File too large: ${stats.size} bytes`);
        if (input.encoding === 'base64') {
          const buf = await readFile(path);
          return buf.toString('base64');
        }
        return await readFile(path, 'utf-8');
      },
    }),
    defineTool({
      name: 'file_write',
      description: 'Write content to a file.',
      schema: writeSchema,
      category: 'files',
      requiresApproval: true,
      handler: async input => {
        if (!config.allowWrite) throw new Error('Write access not enabled');
        const path = await safePath(await getRoot(), input.path);
        if (input.encoding === 'base64') {
          await writeFile(path, Buffer.from(input.content, 'base64'));
        } else {
          await writeFile(path, input.content, 'utf-8');
        }
        return JSON.stringify({ written: true, path: input.path });
      },
    }),
    defineTool({
      name: 'file_list',
      description: 'List files in a directory.',
      schema: listSchema,
      category: 'files',
      handler: async input => {
        const dir = await safePath(await getRoot(), input.path ?? '.');
        const entries = await listDir(dir, await getRoot(), input.recursive ?? false);
        return JSON.stringify(entries);
      },
    }),
    defineTool({
      name: 'file_search',
      description: 'Search for files matching a glob-like pattern.',
      schema: searchSchema,
      category: 'files',
      handler: async input => {
        const dir = await safePath(await getRoot(), input.path ?? '.');
        const all = await listDir(dir, await getRoot(), true);
        const pattern = input.pattern.toLowerCase();
        const matches = all.filter(f => f.name.toLowerCase().includes(pattern));
        return JSON.stringify(matches);
      },
    }),
  ];

  return { name: 'files', description: 'Filesystem read, write, list, and search tools', tools };
}

interface FileEntry {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size?: number;
}

async function listDir(dir: string, root: string, recursive: boolean): Promise<FileEntry[]> {
  const entries: FileEntry[] = [];
  const items = await readdir(dir, { withFileTypes: true });

  for (const item of items) {
    const full = join(dir, item.name);
    const rel = full.slice(root.length + 1);
    if (item.isDirectory()) {
      entries.push({ name: item.name, path: rel, type: 'directory' });
      if (recursive) {
        entries.push(...(await listDir(full, root, true)));
      }
    } else {
      const s = await stat(full).catch(() => null);
      entries.push({ name: item.name, path: rel, type: 'file', size: s?.size });
    }
  }
  return entries;
}
