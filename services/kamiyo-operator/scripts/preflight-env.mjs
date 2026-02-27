#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bs58 from 'bs58';

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
const ANTHROPIC_API_KEY_MIN_LENGTH = 20;

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

function isPlaceholderSecret(value) {
  const lower = value.trim().toLowerCase();
  return [
    'changeme',
    'replace-me',
    'replace_me',
    'example',
    'your-key',
    'your-api-key',
    'test-key',
  ].some((pattern) => lower.includes(pattern));
}

function parseBoolean(value) {
  if (!hasNonEmpty(value)) return null;
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return null;
}

function isValidPrivateKey(raw) {
  const value = raw.trim();
  if (!value) return false;

  try {
    const decoded = bs58.decode(value);
    if (decoded.length >= 64) return true;
  } catch {
    // continue
  }

  try {
    const decoded = Buffer.from(value, 'base64');
    if (decoded.length >= 64) return true;
  } catch {
    // continue
  }

  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed) && parsed.length >= 64) return true;
  } catch {
    // continue
  }

  return false;
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

  const keypairRaw = fs.readFileSync(keypairPath, 'utf8');
  if (!isValidPrivateKey(keypairRaw)) {
    fail([`Operator runtime env preflight failed. Invalid keypair file format: ${keypairPath}`]);
  }
}

if (hasNonEmpty(runtimeEnv.KAMIYO_OPERATOR_PRIVATE_KEY) && !isValidPrivateKey(runtimeEnv.KAMIYO_OPERATOR_PRIVATE_KEY)) {
  fail(['Operator runtime env preflight failed. Invalid KAMIYO_OPERATOR_PRIVATE_KEY format.']);
}

try {
  const url = new URL(runtimeEnv.SOLANA_RPC_URL);
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('unsupported protocol');
  }
} catch {
  fail([`Operator runtime env preflight failed. Invalid SOLANA_RPC_URL: ${runtimeEnv.SOLANA_RPC_URL}`]);
}

const anthropicApiKey = runtimeEnv.ANTHROPIC_API_KEY.trim();
if (anthropicApiKey.length < ANTHROPIC_API_KEY_MIN_LENGTH) {
  fail([
    `Operator runtime env preflight failed. ANTHROPIC_API_KEY must be at least ${ANTHROPIC_API_KEY_MIN_LENGTH} characters.`,
  ]);
}
if (isPlaceholderSecret(anthropicApiKey)) {
  fail(['Operator runtime env preflight failed. ANTHROPIC_API_KEY appears to be a placeholder value.']);
}

const dkgEnabled = parseBoolean(runtimeEnv.KAMIYO_DKG_ACTIVITY_ENABLED);
if (dkgEnabled === null && hasNonEmpty(runtimeEnv.KAMIYO_DKG_ACTIVITY_ENABLED)) {
  fail(['Operator runtime env preflight failed. KAMIYO_DKG_ACTIVITY_ENABLED must be true/false.']);
}

if (dkgEnabled === true) {
  const missingDkg = [];
  if (!hasNonEmpty(runtimeEnv.KAMIYO_DKG_ENDPOINT)) missingDkg.push('KAMIYO_DKG_ENDPOINT');
  if (!hasNonEmpty(runtimeEnv.KAMIYO_DKG_PRIVATE_KEY)) missingDkg.push('KAMIYO_DKG_PRIVATE_KEY');
  if (!hasNonEmpty(runtimeEnv.KAMIYO_DKG_PARANET_UAL)) missingDkg.push('KAMIYO_DKG_PARANET_UAL');
  if (!KEYPAIR_GROUP.some((key) => hasNonEmpty(runtimeEnv[key])) && !hasNonEmpty(runtimeEnv.KAMIYO_DKG_AGENT_ID)) {
    missingDkg.push('KAMIYO_DKG_AGENT_ID (or operator signer key)');
  }

  if (missingDkg.length > 0) {
    fail([
      'Operator runtime env preflight failed. DKG activity is enabled but required fields are missing:',
      ...missingDkg.map((item) => `- ${item}`),
    ]);
  }

  try {
    const endpoint = new URL(runtimeEnv.KAMIYO_DKG_ENDPOINT.trim());
    if (!['http:', 'https:'].includes(endpoint.protocol)) {
      throw new Error('unsupported protocol');
    }
  } catch {
    fail([`Operator runtime env preflight failed. Invalid KAMIYO_DKG_ENDPOINT: ${runtimeEnv.KAMIYO_DKG_ENDPOINT}`]);
  }

  const dkgPrivateKey = runtimeEnv.KAMIYO_DKG_PRIVATE_KEY.trim();
  if (dkgPrivateKey.length < 32) {
    fail(['Operator runtime env preflight failed. KAMIYO_DKG_PRIVATE_KEY appears too short.']);
  }
  if (isPlaceholderSecret(dkgPrivateKey)) {
    fail(['Operator runtime env preflight failed. KAMIYO_DKG_PRIVATE_KEY appears to be a placeholder value.']);
  }
}

console.log('Operator runtime env preflight passed.');
