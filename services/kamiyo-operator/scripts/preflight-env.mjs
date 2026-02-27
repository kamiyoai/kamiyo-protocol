#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const serviceRoot = path.resolve(scriptDir, '..');

const modeFlagIndex = process.argv.indexOf('--mode');
const mode = modeFlagIndex >= 0 ? process.argv[modeFlagIndex + 1] : 'runtime';
if (mode !== 'contract' && mode !== 'runtime') {
  console.error('Invalid mode. Use --mode contract or --mode runtime.');
  process.exit(1);
}

const REQUIRED_KEYS = ['ANTHROPIC_API_KEY', 'SOLANA_RPC_URL'];
const KEYPAIR_GROUP = ['KAMIYO_OPERATOR_KEYPAIR_PATH', 'KAMIYO_OPERATOR_PRIVATE_KEY'];

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const content = fs.readFileSync(filePath, 'utf8');
  const values = {};
  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim();
    values[key] = value;
  }
  return values;
}

function hasNonEmpty(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function fail(lines) {
  for (const line of lines) {
    console.error(line);
  }
  process.exit(1);
}

if (mode === 'contract') {
  const envExamplePath = path.join(serviceRoot, '.env.example');
  if (!fs.existsSync(envExamplePath)) {
    fail(['Missing services/kamiyo-operator/.env.example']);
  }

  const keys = new Set(
    fs.readFileSync(envExamplePath, 'utf8')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .filter((line) => !line.startsWith('#'))
      .map((line) => line.split('=')[0]?.trim())
      .filter(Boolean)
  );

  const missing = REQUIRED_KEYS.filter((key) => !keys.has(key));
  const hasSignerKey = KEYPAIR_GROUP.some((key) => keys.has(key));
  if (!hasSignerKey) {
    missing.push(`one of ${KEYPAIR_GROUP.join(', ')}`);
  }

  if (missing.length > 0) {
    fail([
      'Operator env contract check failed. Missing keys in .env.example:',
      ...missing.map((item) => `- ${item}`),
    ]);
  }

  console.log('Operator env contract check passed.');
  process.exit(0);
}

const runtimeEnv = {
  ...parseEnvFile(path.join(serviceRoot, '.env')),
  ...process.env,
};

const missing = [];
for (const key of REQUIRED_KEYS) {
  if (!hasNonEmpty(runtimeEnv[key])) {
    missing.push(key);
  }
}

if (!KEYPAIR_GROUP.some((key) => hasNonEmpty(runtimeEnv[key]))) {
  missing.push(`one of ${KEYPAIR_GROUP.join(', ')}`);
}

if (missing.length > 0) {
  fail([
    'Operator runtime env preflight failed. Missing values:',
    ...missing.map((item) => `- ${item}`),
  ]);
}

if (hasNonEmpty(runtimeEnv.KAMIYO_OPERATOR_KEYPAIR_PATH)) {
  const keypairPath = path.isAbsolute(runtimeEnv.KAMIYO_OPERATOR_KEYPAIR_PATH)
    ? runtimeEnv.KAMIYO_OPERATOR_KEYPAIR_PATH
    : path.resolve(serviceRoot, runtimeEnv.KAMIYO_OPERATOR_KEYPAIR_PATH);
  if (!fs.existsSync(keypairPath)) {
    fail([`Operator runtime env preflight failed. Missing keypair file: ${keypairPath}`]);
  }
}

try {
  const url = new URL(runtimeEnv.SOLANA_RPC_URL);
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('unsupported protocol');
  }
} catch {
  fail([`Operator runtime env preflight failed. Invalid SOLANA_RPC_URL: ${runtimeEnv.SOLANA_RPC_URL}`]);
}

console.log('Operator runtime env preflight passed.');
