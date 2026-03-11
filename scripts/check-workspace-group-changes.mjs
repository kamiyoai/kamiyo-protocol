#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';

function parseArgs(argv) {
  const args = {};
  for (let index = 2; index < argv.length; index += 1) {
    const key = argv[index];
    if (!key.startsWith('--')) continue;
    const value = argv[index + 1] && !argv[index + 1].startsWith('--') ? argv[index + 1] : 'true';
    args[key.slice(2)] = value;
    if (value !== 'true') index += 1;
  }
  return args;
}

function runGit(args) {
  const result = spawnSync('git', args, { cwd: process.cwd(), encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || `git ${args.join(' ')} failed`);
  }
  return result.stdout.trim();
}

function isZeroSha(value) {
  return !value || /^0+$/.test(value);
}

function resolveChangedFiles(base, head) {
  if (!isZeroSha(base)) {
    const diff = runGit(['diff', '--name-only', base, head]);
    return diff ? diff.split('\n').filter(Boolean) : [];
  }

  const tree = runGit(['diff-tree', '--no-commit-id', '--name-only', '-r', head]);
  return tree ? tree.split('\n').filter(Boolean) : [];
}

function matches(file, rule) {
  if (rule.endsWith('/')) {
    return file.startsWith(rule);
  }
  return file === rule;
}

const args = parseArgs(process.argv);
const base = args.base || process.env.GITHUB_BASE_SHA || '';
const head = args.head || process.env.GITHUB_SHA || 'HEAD';
const repoRoot = process.cwd();
const manifest = JSON.parse(readFileSync(path.join(repoRoot, 'config', 'workspace-groups.json'), 'utf8'));
const changedFiles = resolveChangedFiles(base, head);
const outputs = {};

for (const [groupName, group] of Object.entries(manifest.groups || {})) {
  outputs[groupName] = changedFiles.some((file) => group.paths.some((rule) => matches(file, rule)));
}

if (args['github-output'] && process.env.GITHUB_OUTPUT) {
  const lines = Object.entries(outputs).map(([key, value]) => `${key}=${value}`);
  spawnSync('sh', ['-c', `cat >> "$GITHUB_OUTPUT" <<'OUT'\n${lines.join('\n')}\nOUT`], {
    cwd: repoRoot,
    stdio: 'inherit',
    env: process.env,
  });
}

process.stdout.write(JSON.stringify({ changedFiles, outputs }, null, 2));
process.stdout.write('\n');
