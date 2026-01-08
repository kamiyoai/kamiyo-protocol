import { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import type { IAgentRuntime, KamiyoNetwork } from './types';
import { NETWORKS } from './types';

export function getNetworkConfig(runtime: IAgentRuntime) {
  const network = (runtime.getSetting('KAMIYO_NETWORK') as KamiyoNetwork) || 'devnet';
  return { network, ...NETWORKS[network] };
}

export function getKeypair(runtime: IAgentRuntime): Keypair | null {
  const privateKey = runtime.getSetting('SOLANA_PRIVATE_KEY');
  if (!privateKey) return null;
  try {
    return Keypair.fromSecretKey(Buffer.from(privateKey, 'base64'));
  } catch {
    return null;
  }
}

export function createConnection(rpcUrl: string): Connection {
  return new Connection(rpcUrl, 'confirmed');
}

export function generateId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function parseAmount(text: string): number | null {
  const match = text.match(/(\d+\.?\d*)\s*SOL/i);
  return match ? parseFloat(match[1]) : null;
}

export function parseAddress(text: string): string | null {
  const match = text.match(/[1-9A-HJ-NP-Za-km-z]{32,44}/);
  return match?.[0] || null;
}

export function parseQuality(text: string): number | null {
  const match = text.match(/(\d+)%/);
  return match ? parseInt(match[1], 10) : null;
}

export function getRefundPercent(quality: number): number {
  if (quality < 50) return 100;
  if (quality < 65) return 75;
  if (quality < 80) return 35;
  return 0;
}

export function lamportsToSol(lamports: number): number {
  return lamports / LAMPORTS_PER_SOL;
}

export function solToLamports(sol: number): number {
  return Math.floor(sol * LAMPORTS_PER_SOL);
}
