import fs from 'fs';
import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';

export function loadSolanaKeypair(secret: string): Keypair {
  if (secret.includes('/') || secret.includes('\\')) {
    const data = JSON.parse(fs.readFileSync(secret, 'utf-8'));
    return Keypair.fromSecretKey(new Uint8Array(data));
  }

  try {
    return Keypair.fromSecretKey(bs58.decode(secret));
  } catch {
    try {
      return Keypair.fromSecretKey(Buffer.from(secret, 'base64'));
    } catch {
      const data = JSON.parse(secret);
      return Keypair.fromSecretKey(new Uint8Array(data));
    }
  }
}
