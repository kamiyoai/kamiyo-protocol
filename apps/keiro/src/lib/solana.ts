import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { SOLANA_RPC_URL } from './constants';

let connectionInstance: Connection | null = null;

export function getConnection(): Connection {
  if (!connectionInstance) {
    connectionInstance = new Connection(SOLANA_RPC_URL, 'confirmed');
  }
  return connectionInstance;
}

export async function getBalance(publicKey: PublicKey): Promise<number> {
  const balance = await getConnection().getBalance(publicKey);
  return balance / LAMPORTS_PER_SOL;
}

export function shortenAddress(address: string, chars = 4): string {
  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
}

export function lamportsToSol(lamports: number): number {
  return lamports / LAMPORTS_PER_SOL;
}

export function solToLamports(sol: number): number {
  return Math.floor(sol * LAMPORTS_PER_SOL);
}

export function isValidPublicKey(address: string): boolean {
  try {
    new PublicKey(address);
    return true;
  } catch {
    return false;
  }
}

export function formatSol(amount: number, decimals = 4, showSymbol = true): string {
  const formatted = amount.toFixed(decimals);
  return showSymbol ? `${formatted} SOL` : formatted;
}

export function formatUsd(amount: number, decimals = 2): string {
  return `$${amount.toFixed(decimals)}`;
}

const SOL_USD_RATE = 150;

export function solToUsd(sol: number): number {
  return sol * SOL_USD_RATE;
}

export function usdToSol(usd: number): number {
  return usd / SOL_USD_RATE;
}
