import { Keypair } from '@solana/web3.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SERVICE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function resolve(inputPath: string): string {
  for (const candidate of [
    inputPath,
    path.resolve(process.cwd(), inputPath),
    path.resolve(SERVICE_DIR, inputPath),
  ]) {
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error(`Keypair file not found: ${inputPath}`);
}

function parseKey(raw: string): Keypair {
  const value = raw.trim();
  try {
    return Keypair.fromSecretKey(new Uint8Array(JSON.parse(value)));
  } catch {
    /* */
  }
  try {
    return Keypair.fromSecretKey(Buffer.from(value, 'base64'));
  } catch {
    /* */
  }
  // bs58 import is heavy; JSON array is the primary format for file-based keys
  throw new Error('private key must be a JSON array or base64');
}

export function loadKeypair(env: {
  OPERATOR_KEYPAIR_PATH?: string;
  OPERATOR_PRIVATE_KEY?: string;
}): Keypair {
  if (env.OPERATOR_KEYPAIR_PATH) {
    const raw = fs.readFileSync(resolve(env.OPERATOR_KEYPAIR_PATH), 'utf-8');
    return parseKey(raw);
  }
  if (env.OPERATOR_PRIVATE_KEY) {
    return parseKey(env.OPERATOR_PRIVATE_KEY);
  }
  throw new Error('Set OPERATOR_KEYPAIR_PATH or OPERATOR_PRIVATE_KEY');
}
