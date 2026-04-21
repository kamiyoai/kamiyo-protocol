import { mkdtempSync, mkdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import test from 'node:test';
import { execSync } from 'node:child_process';
import type { ToolContext, ToolDefinition } from '@kamiyo-org/agent';
import { createDocsAgentTools } from './tools';

function makeContext(): ToolContext {
  return {
    agentId: 'test-agent',
    runId: 'test-run',
    signal: new AbortController().signal,
  };
}

function getTool(
  tools: ToolDefinition[],
  name: string
): ToolDefinition<Record<string, unknown>, unknown> {
  const tool = tools.find(candidate => candidate.name === name);
  assert.ok(tool, `expected tool ${name} to exist`);
  return tool as ToolDefinition<Record<string, unknown>, unknown>;
}

test('docs tools allow repo-relative reads and restrict writes to docs files', async () => {
  const repoRoot = mkdtempSync(path.join(tmpdir(), 'kamiyo-docs-tools-'));
  mkdirSync(path.join(repoRoot, 'src'), { recursive: true });
  writeFileSync(path.join(repoRoot, 'README.md'), '# Docs\n', 'utf-8');
  writeFileSync(path.join(repoRoot, 'src', 'index.ts'), 'export const value = 1;\n', 'utf-8');

  const tools = createDocsAgentTools(repoRoot);
  const readFile = getTool(tools, 'read_file');
  const writeFile = getTool(tools, 'write_file');

  const content = await readFile.handler({ path: 'README.md' }, makeContext());
  assert.equal(content, '# Docs\n');

  await assert.rejects(
    () => writeFile.handler({ path: 'src/index.ts', content: 'nope\n' }, makeContext()),
    /Only README\.md and CHANGELOG\.md are writable/
  );

  rmSync(repoRoot, { recursive: true, force: true });
});

test('docs bash only allows read-only inspection commands', async () => {
  const repoRoot = mkdtempSync(path.join(tmpdir(), 'kamiyo-docs-bash-'));
  writeFileSync(path.join(repoRoot, 'README.md'), '# Docs\n', 'utf-8');
  execSync('git init -q', { cwd: repoRoot });

  const tools = createDocsAgentTools(repoRoot);
  const bash = getTool(tools, 'bash');

  const pwdOutput = await bash.handler({ command: 'pwd' }, makeContext());
  assert.equal(realpathSync(String(pwdOutput).trim()), realpathSync(repoRoot));

  await assert.rejects(
    () => bash.handler({ command: 'git checkout -b docs-test' }, makeContext()),
    /not allowed/
  );
  await assert.rejects(
    () => bash.handler({ command: 'pwd > /tmp/docs-agent-test' }, makeContext()),
    /not allowed/
  );

  rmSync(repoRoot, { recursive: true, force: true });
});

test('docs grep and glob stay inside the repo root', async () => {
  const repoRoot = mkdtempSync(path.join(tmpdir(), 'kamiyo-docs-search-'));
  const nested = path.join(repoRoot, 'services', 'kamiyo-docs-agent');
  mkdirSync(nested, { recursive: true });
  writeFileSync(path.join(nested, 'README.md'), 'shared runtime\n', 'utf-8');

  const tools = createDocsAgentTools(repoRoot);
  const grep = getTool(tools, 'grep');
  const glob = getTool(tools, 'glob');

  const grepOutput = await grep.handler(
    { pattern: 'shared runtime', path: 'services' },
    makeContext()
  );
  assert.match(String(grepOutput), /README\.md/);

  const globOutput = await glob.handler(
    { pattern: '*README.md', path: 'services' },
    makeContext()
  );
  assert.match(String(globOutput), /README\.md/);

  await assert.rejects(
    () => grep.handler({ pattern: 'root', path: '/../' }, makeContext()),
    /Path must stay inside repo root/
  );

  rmSync(repoRoot, { recursive: true, force: true });
});
