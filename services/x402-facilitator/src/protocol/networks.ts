import { PublicKey } from '@solana/web3.js';
import { isAddress } from 'ethers';

export const SOLANA_MAINNET_CAIP2 = 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp';
export const SOLANA_DEVNET_CAIP2 = 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1';
export const BASE_MAINNET_CAIP2 = 'eip155:8453';

const SOLANA_MAINNET_ALIASES = new Set<string>([
  SOLANA_MAINNET_CAIP2,
  'solana:mainnet',
  'solana:mainnet-beta',
]);

const SOLANA_DEVNET_ALIASES = new Set<string>([
  SOLANA_DEVNET_CAIP2,
  'solana:devnet',
]);

const BASE_MAINNET_ALIASES = new Set<string>([
  BASE_MAINNET_CAIP2,
]);

export function canonicalizeNetwork(network: string): string | null {
  const trimmed = network.trim();
  if (SOLANA_MAINNET_ALIASES.has(trimmed)) return SOLANA_MAINNET_CAIP2;
  if (SOLANA_DEVNET_ALIASES.has(trimmed)) return SOLANA_DEVNET_CAIP2;
  if (BASE_MAINNET_ALIASES.has(trimmed)) return BASE_MAINNET_CAIP2;
  return null;
}

export function isSolanaMainnet(network: string): boolean {
  return canonicalizeNetwork(network) === SOLANA_MAINNET_CAIP2;
}

export function isBaseMainnet(network: string): boolean {
  return canonicalizeNetwork(network) === BASE_MAINNET_CAIP2;
}

export function getSupportedNetworkIds(baseEnabled: boolean): string[] {
  return baseEnabled
    ? [SOLANA_MAINNET_CAIP2, BASE_MAINNET_CAIP2]
    : [SOLANA_MAINNET_CAIP2];
}

export function isSupportedNetwork(network: string, baseEnabled: boolean): boolean {
  const canonical = canonicalizeNetwork(network);
  if (canonical === SOLANA_MAINNET_CAIP2) return true;
  if (canonical === BASE_MAINNET_CAIP2) return baseEnabled;
  return false;
}

export function isValidPayerForNetwork(payer: string, network: string): boolean {
  const canonical = canonicalizeNetwork(network);
  if (!canonical) return false;

  if (canonical === BASE_MAINNET_CAIP2) {
    return isAddress(payer);
  }

  try {
    new PublicKey(payer);
    return true;
  } catch {
    return false;
  }
}
