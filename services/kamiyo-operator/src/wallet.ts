import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import fs from 'node:fs';
import path from 'node:path';

function loadKeypairFromPath(filePath: string): Keypair {
  const raw = fs.readFileSync(filePath, 'utf-8');
  const bytes = new Uint8Array(JSON.parse(raw));
  return Keypair.fromSecretKey(bytes);
}

function parsePrivateKey(raw: string): Keypair {
  const value = raw.trim();

  try {
    return Keypair.fromSecretKey(bs58.decode(value));
  } catch {
    // fallthrough
  }

  try {
    return Keypair.fromSecretKey(Buffer.from(value, 'base64'));
  } catch {
    // fallthrough
  }

  const arr = JSON.parse(value);
  if (!Array.isArray(arr)) throw new Error('private key must be base58/base64 or a JSON array');
  return Keypair.fromSecretKey(new Uint8Array(arr));
}

export function loadOperatorKeypair(env: {
  KAMIYO_OPERATOR_KEYPAIR_PATH?: string;
  KAMIYO_OPERATOR_PRIVATE_KEY?: string;
}): { keypair: Keypair; source: string } {
  if (env.KAMIYO_OPERATOR_KEYPAIR_PATH) {
    return {
      keypair: loadKeypairFromPath(env.KAMIYO_OPERATOR_KEYPAIR_PATH),
      source: 'KAMIYO_OPERATOR_KEYPAIR_PATH',
    };
  }

  if (env.KAMIYO_OPERATOR_PRIVATE_KEY) {
    return {
      keypair: parsePrivateKey(env.KAMIYO_OPERATOR_PRIVATE_KEY),
      source: 'KAMIYO_OPERATOR_PRIVATE_KEY',
    };
  }

  const home = process.env.HOME?.trim();
  if (home) {
    const defaultPath = path.join(home, '.config/solana/id.json');
    if (fs.existsSync(defaultPath)) {
      return { keypair: loadKeypairFromPath(defaultPath), source: '~/.config/solana/id.json' };
    }
  }

  throw new Error(
    'Missing operator keypair. Set KAMIYO_OPERATOR_KEYPAIR_PATH or KAMIYO_OPERATOR_PRIVATE_KEY.'
  );
}
