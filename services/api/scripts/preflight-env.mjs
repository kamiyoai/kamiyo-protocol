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

const REQUIRED_KEYS = ['SOLANA_RPC_URL', 'JWT_SECRET', 'API_SECRET'];
const PORT_GROUP = ['PORT', 'API_PORT'];
const DKG_ENDPOINT_GROUP = ['DKG_ENDPOINT', 'KAMIYO_DKG_ENDPOINT', 'PARANET_DKG_ENDPOINT', 'OT_NODE_ENDPOINT'];
const DKG_PRIVATE_KEY_GROUP = ['DKG_PRIVATE_KEY', 'KAMIYO_DKG_PRIVATE_KEY', 'PARANET_PRIVATE_KEY'];
const MEISHI_INTERNAL_REQUIRED_KEYS = ['MEISHI_INTERNAL_API_SECRET', 'MEISHI_WRITER_KEYPAIR'];
const JWT_SECRET_MIN_LENGTH = 32;
const API_SECRET_MIN_LENGTH = 24;

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

function isTruthy(value, fallback = false) {
  if (!hasNonEmpty(value)) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
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
    'your-jwt-secret',
    'your-api-secret',
    'test-secret',
  ].some((pattern) => lower.includes(pattern));
}

if (mode === 'contract') {
  const envExamplePath = path.join(serviceRoot, '.env.example');
  if (!fs.existsSync(envExamplePath)) {
    fail(['Missing services/api/.env.example']);
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
  const hasPortKey = PORT_GROUP.some((key) => keys.has(key));
  if (!hasPortKey) {
    missing.push(`one of ${PORT_GROUP.join(', ')}`);
  }
  for (const key of MEISHI_INTERNAL_REQUIRED_KEYS) {
    if (!keys.has(key)) {
      missing.push(key);
    }
  }
  if (!keys.has('MEISHI_INTERNAL_ROUTE_ENABLED')) {
    missing.push('MEISHI_INTERNAL_ROUTE_ENABLED');
  }
  if (!DKG_ENDPOINT_GROUP.some((key) => keys.has(key))) {
    missing.push(`one of ${DKG_ENDPOINT_GROUP.join(', ')}`);
  }
  if (!DKG_PRIVATE_KEY_GROUP.some((key) => keys.has(key))) {
    missing.push(`one of ${DKG_PRIVATE_KEY_GROUP.join(', ')}`);
  }

  if (missing.length > 0) {
    fail([
      'API env contract check failed. Missing keys in .env.example:',
      ...missing.map((item) => `- ${item}`),
    ]);
  }

  console.log('API env contract check passed.');
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

if (!PORT_GROUP.some((key) => hasNonEmpty(runtimeEnv[key]))) {
  missing.push(`one of ${PORT_GROUP.join(', ')}`);
}

if (missing.length > 0) {
  fail([
    'API runtime env preflight failed. Missing values:',
    ...missing.map((item) => `- ${item}`),
  ]);
}

const portRaw = runtimeEnv.API_PORT || runtimeEnv.PORT;
const port = Number.parseInt(portRaw, 10);
if (!Number.isFinite(port) || port < 1 || port > 65535) {
  fail([`API runtime env preflight failed. Invalid port: ${portRaw}`]);
}

try {
  const url = new URL(runtimeEnv.SOLANA_RPC_URL);
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('unsupported protocol');
  }
} catch {
  fail([`API runtime env preflight failed. Invalid SOLANA_RPC_URL: ${runtimeEnv.SOLANA_RPC_URL}`]);
}

const jwtSecret = runtimeEnv.JWT_SECRET.trim();
if (jwtSecret.length < JWT_SECRET_MIN_LENGTH) {
  fail([
    `API runtime env preflight failed. JWT_SECRET must be at least ${JWT_SECRET_MIN_LENGTH} characters.`,
  ]);
}
if (isPlaceholderSecret(jwtSecret)) {
  fail(['API runtime env preflight failed. JWT_SECRET appears to be a placeholder value.']);
}

const apiSecret = runtimeEnv.API_SECRET.trim();
if (apiSecret.length < API_SECRET_MIN_LENGTH) {
  fail([
    `API runtime env preflight failed. API_SECRET must be at least ${API_SECRET_MIN_LENGTH} characters.`,
  ]);
}
if (isPlaceholderSecret(apiSecret)) {
  fail(['API runtime env preflight failed. API_SECRET appears to be a placeholder value.']);
}

if (apiSecret === jwtSecret) {
  fail(['API runtime env preflight failed. API_SECRET must not match JWT_SECRET.']);
}

const meishiInternalEnabled = isTruthy(runtimeEnv.MEISHI_INTERNAL_ROUTE_ENABLED, true);
if (meishiInternalEnabled) {
  const missingMeishi = [];
  for (const key of MEISHI_INTERNAL_REQUIRED_KEYS) {
    if (!hasNonEmpty(runtimeEnv[key])) {
      missingMeishi.push(key);
    }
  }
  if (!DKG_ENDPOINT_GROUP.some((key) => hasNonEmpty(runtimeEnv[key]))) {
    missingMeishi.push(`one of ${DKG_ENDPOINT_GROUP.join(', ')}`);
  }
  if (!DKG_PRIVATE_KEY_GROUP.some((key) => hasNonEmpty(runtimeEnv[key]))) {
    missingMeishi.push(`one of ${DKG_PRIVATE_KEY_GROUP.join(', ')}`);
  }
  if (missingMeishi.length > 0) {
    fail([
      'API runtime env preflight failed. Internal Meishi registration is enabled but required values are missing:',
      ...missingMeishi.map((item) => `- ${item}`),
    ]);
  }

  const internalSecret = runtimeEnv.MEISHI_INTERNAL_API_SECRET.trim();
  if (internalSecret.length < API_SECRET_MIN_LENGTH) {
    fail([
      `API runtime env preflight failed. MEISHI_INTERNAL_API_SECRET must be at least ${API_SECRET_MIN_LENGTH} characters.`,
    ]);
  }
  if (isPlaceholderSecret(internalSecret)) {
    fail(['API runtime env preflight failed. MEISHI_INTERNAL_API_SECRET appears to be a placeholder value.']);
  }

  const writerKeypair = runtimeEnv.MEISHI_WRITER_KEYPAIR.trim();
  if (isPlaceholderSecret(writerKeypair)) {
    fail(['API runtime env preflight failed. MEISHI_WRITER_KEYPAIR appears to be a placeholder value.']);
  }
}

console.log('API runtime env preflight passed.');
