#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');

const modeFlagIndex = process.argv.indexOf('--mode');
const mode = modeFlagIndex >= 0 ? process.argv[modeFlagIndex + 1] : 'ci';
if (mode !== 'ci' && mode !== 'live') {
  console.error('Invalid mode. Use --mode ci or --mode live.');
  process.exit(1);
}

const isLive = mode === 'live';
const PNPM = 'pnpm';

/** @typedef {'pass' | 'fail' | 'skip'} StepStatus */
/** @typedef {{ name: string; status: StepStatus; detail: string }} StepResult */

/** @type {StepResult[]} */
const results = [];

function record(name, status, detail) {
  results.push({ name, status, detail });
  const symbol = status === 'pass' ? 'PASS' : status === 'skip' ? 'SKIP' : 'FAIL';
  console.log(`[${symbol}] ${name}${detail ? ` - ${detail}` : ''}`);
}

function runCommand(name, cmd, args, options = {}) {
  const child = spawnSync(cmd, args, {
    cwd: repoRoot,
    env: process.env,
    encoding: 'utf8',
    stdio: 'pipe',
    ...options,
  });

  if (child.status === 0) {
    record(name, 'pass', 'ok');
    return true;
  }

  const stdoutLines = (child.stdout ?? '').split('\n').map((line) => line.trim());
  const stderrLines = (child.stderr ?? '').split('\n').map((line) => line.trim());
  const allLines = [...stderrLines, ...stdoutLines]
    .filter(Boolean)
    .filter((line) => !/^npm warn /i.test(line))
    .filter((line) => !/^bigint: Failed to load bindings/i.test(line))
    .filter((line) => !/^node:internal\//i.test(line));

  const priorityLine =
    allLines.find((line) => /(failed|error|missing|not ready|ERR_|ELIFECYCLE)/i.test(line)) ??
    allLines[0] ??
    `${cmd} exited with code ${child.status}`;

  let detail = priorityLine;
  if (/Missing values:$/i.test(priorityLine)) {
    const missingItems = allLines.filter((line) => line.startsWith('- ')).slice(0, 4);
    if (missingItems.length > 0) {
      detail = `${priorityLine} ${missingItems.join(' ')}`;
    }
  }

  record(name, 'fail', detail.slice(0, 220));
  return false;
}

function checkNodeVersion() {
  const major = Number.parseInt(process.versions.node.split('.')[0], 10);
  if (Number.isNaN(major) || major < 20) {
    record('Node.js version', 'fail', `found ${process.versions.node}, requires >= 20`);
    return false;
  }
  record('Node.js version', 'pass', process.versions.node);
  return true;
}

function checkPnpmInstalled() {
  const child = spawnSync('pnpm', ['--version'], {
    cwd: repoRoot,
    env: process.env,
    encoding: 'utf8',
    stdio: 'pipe',
  });
  if (child.status !== 0) {
    record('pnpm availability', 'fail', 'pnpm not found in PATH');
    return false;
  }
  record('pnpm availability', 'pass', child.stdout.trim());
  return true;
}

function resolveDefaultAgentKeypairPath() {
  return path.join(os.homedir(), '.config', 'solana', 'id.json');
}

function hasAgentKeyConfigured() {
  const hasInline = Boolean(process.env.AGENT_PRIVATE_KEY?.trim());
  if (hasInline) {
    return { ready: true, reason: 'AGENT_PRIVATE_KEY configured' };
  }

  const explicitPath = process.env.AGENT_KEYPAIR_PATH?.trim();
  const keypairPath = explicitPath || resolveDefaultAgentKeypairPath();
  if (fs.existsSync(keypairPath)) {
    return { ready: true, reason: `keypair file found (${explicitPath ? 'AGENT_KEYPAIR_PATH' : 'default path'})` };
  }

  return {
    ready: false,
    reason: `missing AGENT_PRIVATE_KEY and keypair file (${keypairPath})`,
  };
}

function runCiChecks() {
  let ok = true;
  ok = checkNodeVersion() && ok;
  ok = checkPnpmInstalled() && ok;
  ok = runCommand('Docs command drift check', PNPM, ['run', 'check:docs']) && ok;
  ok = runCommand('Service onboarding check', PNPM, ['run', 'check:onboarding']) && ok;
  ok = runCommand('API env contract check', PNPM, ['--filter', 'kamiyo-companion', 'run', 'preflight:contract']) && ok;
  ok = runCommand('Operator env contract check', PNPM, ['--filter', '@kamiyo/kamiyo-operator', 'run', 'preflight:contract']) && ok;
  ok = runCommand('MCP tool parity gate', PNPM, ['run', 'check:mcp:parity']) && ok;
  ok = runCommand('MCP tool functionality test', PNPM, ['--filter', '@kamiyo/mcp-server', 'run', 'test:mcp']) && ok;
  return ok;
}

function runLiveChecks() {
  let ok = true;
  ok = runCommand('API runtime env preflight', PNPM, ['--filter', 'kamiyo-companion', 'run', 'preflight:env']) && ok;
  ok = runCommand('Operator runtime env preflight', PNPM, ['--filter', '@kamiyo/kamiyo-operator', 'run', 'preflight:env']) && ok;
  ok = runCommand('MCP live credentials preflight', PNPM, ['--filter', '@kamiyo/mcp-server', 'run', 'test:live-config']) && ok;

  const sdkReady = hasAgentKeyConfigured();
  if (!sdkReady.ready) {
    record('SDK devnet smoke', 'skip', `${sdkReady.reason}; set AGENT_PRIVATE_KEY or AGENT_KEYPAIR_PATH`);
    return ok;
  }

  ok = runCommand('SDK devnet smoke', PNPM, ['--filter', '@kamiyo/sdk', 'run', 'smoke:devnet']) && ok;
  return ok;
}

function printSummary() {
  const passed = results.filter((result) => result.status === 'pass').length;
  const failed = results.filter((result) => result.status === 'fail').length;
  const skipped = results.filter((result) => result.status === 'skip').length;
  console.log('\nSummary');
  console.log(`- Passed: ${passed}`);
  console.log(`- Failed: ${failed}`);
  console.log(`- Skipped: ${skipped}`);
}

console.log(`Enterprise readiness mode: ${mode}`);
const ciOk = runCiChecks();
const liveOk = isLive ? runLiveChecks() : true;
printSummary();

if (!ciOk || !liveOk) {
  process.exit(1);
}
