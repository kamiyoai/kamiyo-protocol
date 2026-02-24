export const CATEGORIES = [
  'All',
  'Agent Duels',
  'Cross-Chain',
  'Oracle Court',
  'Politics',
  'Sports',
  'Culture',
  'Crypto',
  'Climate',
  'Economics',
  'Companies',
  'Financials',
  'Tech & Science',
] as const;

export const MARKET_STATUS_LABELS: Record<string, string> = {
  active: 'Active',
  paused: 'Paused',
  closed: 'Closed',
  resolved: 'Resolved',
  cancelled: 'Cancelled',
};

export const ORDER_STATUS_LABELS: Record<string, string> = {
  open: 'Open',
  partially_filled: 'Partial',
  filled: 'Filled',
  cancelled: 'Cancelled',
  expired: 'Expired',
};

export const USDC_DECIMALS = 6;
export const TOKEN_DECIMALS = 6;

export const DEFAULT_SLIPPAGE_BPS = 50; // 0.5%
export const MAX_PRICE_BPS = 9900; // 99%
export const MIN_PRICE_BPS = 100; // 1%
export const SINGULARITY_TRADING_FEE_BPS = 50; // 0.5%

export const KAMIYO_STAKING_POOL_ADDRESS =
  '9mEd5iRcdbNUwaCmkPqYggLfg25B2DsTn1w6gNrgvC9d';
export const KAMIYO_STAKING_POOL_URL =
  `https://fundry.collaterize.com/staking/${KAMIYO_STAKING_POOL_ADDRESS}`;
export const KAMIYO_FEE_ROUTING = {
  stakingPoolShareBps: 10_000,
  destinationLabel: '$KAMIYO staking pool',
} as const;

export const RPC_ENDPOINT =
  process.env.NEXT_PUBLIC_RPC_URL || 'https://api.devnet.solana.com';

export const API_URL =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080/v1';
