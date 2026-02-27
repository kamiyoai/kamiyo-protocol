#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(scriptDir, '..');
const entryPath = path.join(packageRoot, 'dist', 'index.js');

if (!fs.existsSync(entryPath)) {
  console.error('Missing dist/index.js. Run `pnpm --filter @kamiyo/mcp-server run build` first.');
  process.exit(1);
}

const timeoutMs = Number.parseInt(process.env.KAMIYO_MCP_STDIO_SMOKE_TIMEOUT_MS || '20000', 10);

function withTimeout(promise, message) {
  const timeout = new Promise((_, reject) => {
    const id = setTimeout(() => reject(new Error(message)), timeoutMs);
    id.unref();
  });
  return Promise.race([promise, timeout]);
}

const transport = new StdioClientTransport({
  command: 'node',
  args: [entryPath],
  cwd: packageRoot,
  env: process.env,
  stderr: 'pipe',
});

let stderrPreview = '';
if (transport.stderr) {
  transport.stderr.on('data', (chunk) => {
    stderrPreview += chunk.toString();
    if (stderrPreview.length > 4000) {
      stderrPreview = stderrPreview.slice(-4000);
    }
  });
}

const client = new Client({
  name: 'kamiyo-enterprise-readiness',
  version: '1.0.0',
});

const requiredTools = [
  'create_escrow',
  'x402_check_pricing',
  'paranet_env_status',
  'cdp_env_status',
];

try {
  await withTimeout(client.connect(transport), 'Timed out connecting to MCP stdio server');
  const response = await withTimeout(client.listTools(), 'Timed out listing MCP tools');
  const toolNames = response.tools.map((tool) => tool.name);

  const missing = requiredTools.filter((name) => !toolNames.includes(name));
  if (missing.length > 0) {
    throw new Error(`MCP stdio handshake missing required tools: ${missing.join(', ')}`);
  }

  if (toolNames.length < 20) {
    throw new Error(`MCP stdio handshake returned too few tools: ${toolNames.length}`);
  }

  console.log(`MCP stdio handshake passed (${toolNames.length} tools).`);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`MCP stdio handshake failed: ${message}`);
  const preview = stderrPreview
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .find((line) => !/^npm warn /i.test(line));
  if (preview) {
    console.error(`Server stderr: ${preview}`);
  }
  process.exitCode = 1;
} finally {
  await client.close().catch(() => {});
  await transport.close().catch(() => {});
}
