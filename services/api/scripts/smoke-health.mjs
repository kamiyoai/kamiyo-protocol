#!/usr/bin/env node

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const serviceRoot = path.resolve(scriptDir, '..');
const entryPath = path.join(serviceRoot, 'dist', 'api-server.js');

if (!fs.existsSync(entryPath)) {
  console.error('Missing dist/api-server.js. Run `pnpm --filter kamiyo-companion run build` first.');
  process.exit(1);
}

const port = Number.parseInt(process.env.API_PORT || process.env.PORT || '3001', 10);
if (!Number.isFinite(port) || port < 1 || port > 65535) {
  console.error(`Invalid API_PORT/PORT value: ${process.env.API_PORT || process.env.PORT}`);
  process.exit(1);
}

const baseUrl = `http://127.0.0.1:${port}`;
const timeoutMs = Number.parseInt(process.env.KAMIYO_API_SMOKE_TIMEOUT_MS || '30000', 10);

const child = spawn('node', [entryPath], {
  cwd: serviceRoot,
  env: {
    ...process.env,
    API_PORT: String(port),
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});

let output = '';
const appendOutput = (chunk) => {
  output += chunk.toString();
  if (output.length > 8000) {
    output = output.slice(-8000);
  }
};

if (child.stdout) child.stdout.on('data', appendOutput);
if (child.stderr) child.stderr.on('data', appendOutput);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function firstUsefulLine(text) {
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const visible = lines.filter(
    (line) =>
      !/^npm warn /i.test(line) &&
      !/^bigint: Failed to load bindings/i.test(line)
  );
  return (
    visible.find((line) => /(error|failed|exception|ERR_)/i.test(line)) ??
    visible[0] ??
    'service exited without output'
  );
}

async function waitForHealth(url, deadlineMs) {
  while (Date.now() < deadlineMs) {
    if (child.exitCode != null) {
      throw new Error(`API process exited early: ${firstUsefulLine(output)}`);
    }

    try {
      const res = await fetch(url, { method: 'GET' });
      if (res.ok) {
        const body = await res.json().catch(() => ({}));
        if (body && body.status === 'ok') {
          return;
        }
      }
    } catch {
      // service might still be booting
    }

    await sleep(400);
  }

  throw new Error(`Timed out waiting for API health endpoint (${url})`);
}

async function waitForReady(url, deadlineMs) {
  while (Date.now() < deadlineMs) {
    if (child.exitCode != null) {
      throw new Error(`API process exited before readiness: ${firstUsefulLine(output)}`);
    }

    try {
      const res = await fetch(url, { method: 'GET' });
      if (res.ok) {
        const body = await res.json().catch(() => ({}));
        if (body && body.status === 'ready') {
          return;
        }
      }
    } catch {
      // service might still be booting
    }

    await sleep(500);
  }

  throw new Error(`Timed out waiting for API readiness endpoint (${url})`);
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
  await waitForHealth(`${baseUrl}/health`, deadline);
  await waitForReady(`${baseUrl}/ready`, deadline);
  console.log(`API health smoke passed on ${baseUrl}`);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`API health smoke failed: ${message}`);
  const preview = firstUsefulLine(output);
  if (preview) {
    console.error(`Last service output: ${preview}`);
  }
  await stopChild();
  process.exit(1);
}

await stopChild();
