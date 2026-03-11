#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';

const [, , groupName, scriptName] = process.argv;

function writeStdout(message) {
  process.stdout.write(`${message}\n`);
}

function writeStderr(message) {
  process.stderr.write(`${message}\n`);
}

if (!groupName || !scriptName) {
  writeStderr('Usage: node scripts/run-workspace-group.mjs <group> <script>');
  process.exit(1);
}

const repoRoot = process.cwd();
const manifestPath = path.join(repoRoot, 'config', 'workspace-groups.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const group = manifest.groups?.[groupName];

if (!group) {
  writeStderr(`Unknown workspace group: ${groupName}`);
  process.exit(1);
}

for (const workspace of group.workspaces) {
  const packageJsonPath = path.join(repoRoot, workspace.path, 'package.json');
  const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
  if (!pkg.scripts || !Object.prototype.hasOwnProperty.call(pkg.scripts, scriptName)) {
    continue;
  }

  const filter = workspace.name || pkg.name;
  writeStdout(`> ${groupName}:${scriptName} -> ${filter}`);
  const result = spawnSync('pnpm', ['--filter', filter, 'run', scriptName], {
    cwd: repoRoot,
    stdio: 'inherit',
    env: process.env,
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
