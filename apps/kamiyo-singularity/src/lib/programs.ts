import { PublicKey } from '@solana/web3.js';

// Program IDs - Devnet
export const PROGRAM_IDS = {
  market: new PublicKey('98jqxMe88XGjXzCY3bwV1Kuqzj32fcwdhPZa193RUffQ'),
  orderbook: new PublicKey('59LqZtVU2YBrhv8B2E1iASJMzcyBHWhY2JuaJsCXkAS8'),
  privacy: new PublicKey('9QGtHZJvmjMKTME1s3mVfNXtGpEdXDQZJTxsxqve9GsL'),
} as const;

// RPC Endpoints
export const RPC_ENDPOINTS = {
  devnet: 'https://api.devnet.solana.com',
  mainnet: process.env.NEXT_PUBLIC_MAINNET_RPC_URL || 'https://api.mainnet-beta.solana.com',
} as const;

// Current network
export const NETWORK = 'devnet' as const;
export const RPC_ENDPOINT = RPC_ENDPOINTS[NETWORK];

// IDL imports
export { default as MarketIDL } from './idl/kamiyo_singularity_market.json';
export { default as OrderbookIDL } from './idl/kamiyo_singularity_orderbook.json';
export { default as PrivacyIDL } from './idl/kamiyo_singularity_privacy.json';
