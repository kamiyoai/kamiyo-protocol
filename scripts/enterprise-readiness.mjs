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
const FAILURE_LINE_IGNORES = [/^npm warn /i, /^bigint: Failed to load bindings/i, /^node:internal\//i];
const OPERATOR_SERVICE_ROOT = path.join(repoRoot, 'services', 'kamiyo-operator');

/** @typedef {'pass' | 'fail' | 'skip'} StepStatus */
/** @typedef {{ name: string; status: StepStatus; detail: string }} StepResult */

/** @type {StepResult[]} */
const results = [];

function record(name, status, detail) {
  results.push({ name, status, detail });
  const symbol = status === 'pass' ? 'PASS' : status === 'skip' ? 'SKIP' : 'FAIL';
  console.log(`[${symbol}] ${name}${detail ? ` - ${detail}` : ''}`);
}

function summarizeFailureOutput(stdout, stderr, fallback) {
  const stdoutLines = (stdout ?? '').split('\n').map((line) => line.trim());
  const stderrLines = (stderr ?? '').split('\n').map((line) => line.trim());
  const allLines = [...stderrLines, ...stdoutLines]
    .filter(Boolean)
    .filter((line) => FAILURE_LINE_IGNORES.every((pattern) => !pattern.test(line)));

  const priorityLine =
    allLines.find((line) => /(failed|error|missing|not ready|ERR_|ELIFECYCLE)/i.test(line)) ??
    allLines[0] ??
    fallback;

  let detail = priorityLine;
  if (/Missing values:$/i.test(priorityLine)) {
    const missingItems = allLines.filter((line) => line.startsWith('- ')).slice(0, 4);
    if (missingItems.length > 0) {
      detail = `${priorityLine} ${missingItems.join(' ')}`;
    }
  }

  return detail.slice(0, 220);
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

  const detail = summarizeFailureOutput(
    child.stdout,
    child.stderr,
    `${cmd} exited with code ${child.status}`
  );
  record(name, 'fail', detail);
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

function createCiCommandEnv() {
  const env = { ...process.env };
  const noisyKeys = [
    'AGENT_PRIVATE_KEY',
    'AGENT_KEYPAIR_PATH',
    'KAMIYO_OPERATOR_PRIVATE_KEY',
    'KAMIYO_KYOSHIN_CLAIMER_PRIVATE_KEY',
    'KAMIYO_DKG_PRIVATE_KEY',
    'DKG_PRIVATE_KEY',
    'PARANET_PRIVATE_KEY',
    'MCP_AGENT_KEYPAIR',
  ];
  for (const key of noisyKeys) {
    delete env[key];
  }
  return env;
}

function ensureNativeSqliteBinding() {
  const loadProbe = spawnSync('node', ['-e', 'require("better-sqlite3")'], {
    cwd: OPERATOR_SERVICE_ROOT,
    env: process.env,
    encoding: 'utf8',
    stdio: 'pipe',
  });

  if (loadProbe.status === 0) {
    record('Native sqlite binding', 'pass', 'ok');
    return true;
  }

  const rebuild = spawnSync(PNPM, ['rebuild', 'better-sqlite3'], {
    cwd: repoRoot,
    env: process.env,
    encoding: 'utf8',
    stdio: 'pipe',
  });
  if (rebuild.status !== 0) {
    record(
      'Native sqlite binding',
      'fail',
      summarizeFailureOutput(rebuild.stdout, rebuild.stderr, 'pnpm rebuild better-sqlite3 failed')
    );
    return false;
  }

  const verify = spawnSync('node', ['-e', 'require("better-sqlite3")'], {
    cwd: OPERATOR_SERVICE_ROOT,
    env: process.env,
    encoding: 'utf8',
    stdio: 'pipe',
  });
  if (verify.status === 0) {
    record('Native sqlite binding', 'pass', 'rebuilt');
    return true;
  }

  record(
    'Native sqlite binding',
    'fail',
    summarizeFailureOutput(verify.stdout, verify.stderr, 'better-sqlite3 is unavailable after rebuild')
  );
  return false;
}

function runCiChecks() {
  let ok = true;
  const ciEnv = createCiCommandEnv();
  ok = checkNodeVersion() && ok;
  ok = checkPnpmInstalled() && ok;
  ok = runCommand('Docs command drift check', PNPM, ['run', 'check:docs'], { env: ciEnv }) && ok;
  ok = runCommand('Service onboarding check', PNPM, ['run', 'check:onboarding'], { env: ciEnv }) && ok;
  ok = runCommand('API env contract check', PNPM, ['--filter', 'kamiyo-companion', 'run', 'preflight:contract'], {
    env: ciEnv,
  }) && ok;
  ok = runCommand('Operator env contract check', PNPM, ['--filter', '@kamiyo/kamiyo-operator', 'run', 'preflight:contract'], {
    env: ciEnv,
  }) && ok;
  ok = runCommand('MCP tool parity gate', PNPM, ['run', 'check:mcp:parity'], { env: ciEnv }) && ok;
  ok = runCommand('CDP build', PNPM, ['--filter', '@kamiyo/cdp', 'run', 'build'], { env: ciEnv }) && ok;
  ok = runCommand('Paranet build', PNPM, ['--filter', '@kamiyo/agent-paranet', 'run', 'build'], { env: ciEnv }) && ok;
  ok = runCommand('MCP build', PNPM, ['--filter', '@kamiyo/mcp-server', 'run', 'build'], { env: ciEnv }) && ok;
  ok = runCommand('MCP tool functionality test', PNPM, ['--filter', '@kamiyo/mcp-server', 'run', 'test:mcp'], {
    env: ciEnv,
  }) && ok;
  return ok;
}

function runLiveChecks() {
  let ok = true;
  ok = runCommand('API dependency build', PNPM, ['run', 'build:api']) && ok;
  ok = runCommand('Operator build', PNPM, ['--filter', '@kamiyo/kamiyo-operator', 'run', 'build']) && ok;
  ok = runCommand('MCP build', PNPM, ['--filter', '@kamiyo/mcp-server', 'run', 'build']) && ok;
  ok = ensureNativeSqliteBinding() && ok;

  const apiEnvReady = runCommand('API runtime env preflight', PNPM, ['--filter', 'kamiyo-companion', 'run', 'preflight:env']);
  ok = apiEnvReady && ok;
  if (apiEnvReady) {
    ok = runCommand('API runtime health smoke', PNPM, ['--filter', 'kamiyo-companion', 'run', 'smoke:health']) && ok;
  } else {
    record('API runtime health smoke', 'skip', 'skipped because API env preflight failed');
  }

  const operatorEnvReady = runCommand('Operator runtime env preflight', PNPM, ['--filter', '@kamiyo/kamiyo-operator', 'run', 'preflight:env']);
  ok = operatorEnvReady && ok;
  if (operatorEnvReady) {
    ok = runCommand('Operator runtime boot smoke', PNPM, ['--filter', '@kamiyo/kamiyo-operator', 'run', 'smoke:boot']) && ok;
  } else {
    record('Operator runtime boot smoke', 'skip', 'skipped because operator env preflight failed');
  }

  ok = runCommand('MCP stdio handshake smoke', PNPM, ['--filter', '@kamiyo/mcp-server', 'run', 'smoke:stdio']) && ok;
  const mcpLiveReady = runCommand('MCP live credentials preflight', PNPM, ['--filter', '@kamiyo/mcp-server', 'run', 'test:live-config']);
  ok = mcpLiveReady && ok;
  if (mcpLiveReady) {
    ok =
      runCommand(
        'MCP live CDP transaction smoke',
        PNPM,
        ['--filter', '@kamiyo/mcp-server', 'run', 'test:live-cdp-transaction'],
        {
          env: {
            ...process.env,
            KAMIYO_CDP_SMOKE_CREATE_POLICY: process.env.KAMIYO_CDP_SMOKE_CREATE_POLICY?.trim() || 'false',
            KAMIYO_CDP_SMOKE_ARTIFACT_PATH:
              process.env.KAMIYO_CDP_SMOKE_ARTIFACT_PATH?.trim() || 'reports/cdp-nightly-transaction-smoke.json',
          },
        }
      ) && ok;
  } else {
    record('MCP live CDP transaction smoke', 'skip', 'skipped because MCP live credentials preflight failed');
  }

  const sdkReady = hasAgentKeyConfigured();
  if (!sdkReady.ready) {
    record('SDK devnet smoke', 'skip', `${sdkReady.reason}; set AGENT_PRIVATE_KEY or AGENT_KEYPAIR_PATH`);
    return ok;
  }

  const sdkEnv = {
    ...process.env,
    SOLANA_RPC_URL: process.env.KAMIYO_SDK_SMOKE_RPC_URL?.trim() || 'https://api.devnet.solana.com',
  };
  ok = runCommand('SDK devnet smoke', PNPM, ['--filter', '@kamiyo/sdk', 'run', 'smoke:devnet'], { env: sdkEnv }) && ok;
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
