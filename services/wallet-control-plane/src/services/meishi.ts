import { Connection, Keypair } from '@solana/web3.js';
import { MeishiClient } from '@kamiyo/meishi';
import { getConfig } from '../config.js';

let cached: MeishiClient | null = null;

export function getMeishiClient(): MeishiClient {
  if (cached) return cached;

  const config = getConfig();
  const connection = new Connection(config.SOLANA_RPC_URL, 'confirmed');
  const keypair = Keypair.generate();

  cached = new MeishiClient({
    connection,
    keypair,
    programId: config.MEISHI_PROGRAM_ID || undefined,
  });

  return cached;
}
