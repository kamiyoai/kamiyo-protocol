#!/usr/bin/env node

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const serviceRoot = path.resolve(scriptDir, '..');
const entryPath = path.join(serviceRoot, 'dist', 'index.js');

if (!fs.existsSync(entryPath)) {
  console.error('Missing dist/index.js. Run `pnpm --filter @kamiyo/kamiyo-operator run build` first.');
  process.exit(1);
}

const timeoutMs = Number.parseInt(process.env.KAMIYO_OPERATOR_SMOKE_TIMEOUT_MS || '40000', 10);
const successMarker = 'RPC endpoint ready:';
const smokeDir = path.join(os.tmpdir(), 'kamiyo-operator-smoke');
fs.mkdirSync(smokeDir, { recursive: true });
const smokeToken = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const child = spawn('node', [entryPath], {
  cwd: serviceRoot,
  env: {
    ...process.env,
    KAMIYO_RUN_ONCE: 'true',
    KAMIYO_MODE: process.env.KAMIYO_MODE || 'propose',
    KAMIYO_LOOP_INTERVAL_SECONDS: '1',
    KAMIYO_LOCK_PATH: path.join(smokeDir, `${smokeToken}.lock`),
    KAMIYO_DB_PATH: path.join(smokeDir, `${smokeToken}.db`),
    KAMIYO_OUTBOX_DIR: path.join(smokeDir, `${smokeToken}-outbox`),
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});

let output = '';
let sawReadyMarker = false;

const onData = (chunk) => {
  const text = chunk.toString();
  output += text;
  if (output.length > 12000) {
    output = output.slice(-12000);
  }
  if (text.includes(successMarker)) {
    sawReadyMarker = true;
  }
};

if (child.stdout) child.stdout.on('data', onData);
if (child.stderr) child.stderr.on('data', onData);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function firstUsefulLine(text) {
  return (
    text
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .find(
        (line) =>
          !/^npm warn /i.test(line) &&
          !/^bigint: Failed to load bindings/i.test(line)
      ) || 'operator exited without output'
  );
}

async function stopChild() {
  if (child.exitCode != null) return;
  child.kill('SIGTERM');
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    if (child.exitCode != null) return;
    await sleep(100);
  }
  if (child.exitCode == null) {
    child.kill('SIGKILL');
  }
}

try {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (sawReadyMarker) {
      console.log('Operator boot smoke passed (RPC initialization succeeded).');
      await stopChild();
      process.exit(0);
    }

    if (child.exitCode != null) {
      throw new Error(`Operator exited early: ${firstUsefulLine(output)}`);
    }

    await sleep(250);
  }

  throw new Error(`Timed out waiting for operator boot marker: "${successMarker}"`);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Operator boot smoke failed: ${message}`);
  const preview = firstUsefulLine(output);
  if (preview) {
    console.error(`Last operator output: ${preview}`);
  }
  await stopChild();
  process.exit(1);
}
