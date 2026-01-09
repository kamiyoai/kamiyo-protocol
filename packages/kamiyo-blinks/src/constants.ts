import { PublicKey } from '@solana/web3.js';

export const KAMIYO_PROGRAM_ID = new PublicKey('8sUnNU6WBD2SYapCE12S7LwH1b8zWoniytze7ifWwXCM');

export const RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';

export const BASE_URL = process.env.BLINKS_BASE_URL || 'https://blinks.kamiyo.ai';

export const ICON_URL = `${BASE_URL}/icon.png`;

export const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, Accept-Encoding, X-Action-Version, X-Blockchain-Ids',
  'Access-Control-Expose-Headers': 'X-Action-Version, X-Blockchain-Ids',
  'X-Action-Version': '2.2',
  'X-Blockchain-Ids': 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
  'Content-Type': 'application/json',
};

export const ESCROW_CONFIG = {
  MIN_AMOUNT_SOL: 0.001,
  MAX_AMOUNT_SOL: 1000,
  DEFAULT_TIMELOCK_HOURS: 24,
  QUICK_AMOUNTS: [0.1, 0.5, 1, 5],
} as const;

export const TIMELOCK_OPTIONS = {
  '1h': 3600,
  '24h': 86400,
  '7d': 604800,
  '30d': 2592000,
} as const;
