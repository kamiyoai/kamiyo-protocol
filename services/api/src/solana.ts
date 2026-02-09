import { Connection } from '@solana/web3.js';

const DEFAULT_MAINNET_RPC = 'https://api.mainnet-beta.solana.com';

export function resolveSolanaRpcUrl(): string {
  const explicit = process.env.SOLANA_RPC_URL?.trim();
  if (explicit) return explicit;

  const heliusKey = process.env.HELIUS_API_KEY?.trim();
  if (heliusKey) {
    return `https://mainnet.helius-rpc.com/?api-key=${heliusKey}`;
  }

  return DEFAULT_MAINNET_RPC;
}

let cachedUrl: string | null = null;
let cachedConn: Connection | null = null;

export function getSolanaConnection(): Connection {
  const url = resolveSolanaRpcUrl();
  if (cachedConn && cachedUrl === url) return cachedConn;
  cachedUrl = url;
  cachedConn = new Connection(url, 'confirmed');
  return cachedConn;
}
