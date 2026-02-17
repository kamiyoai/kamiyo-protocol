export const CDP_ENV = {
  apiKeyId: 'CDP_API_KEY_ID',
  apiKeySecret: 'CDP_API_KEY_SECRET',
  walletSecret: 'CDP_WALLET_SECRET',
} as const;

export const CAIP2 = {
  base: 'eip155:8453',
  baseSepolia: 'eip155:84532',
  solanaMainnet: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
  solanaDevnet: 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1',
} as const;

export const USDC = {
  base: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  baseSepolia: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
  solanaMainnet: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  solanaDevnet: '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU',
} as const;
