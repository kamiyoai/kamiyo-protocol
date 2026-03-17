import type { PayAINetwork } from '@kamiyo/x402-client';

export const COMPANION_X402_NETWORKS: PayAINetwork[] = ['base', 'solana', 'polygon', 'arbitrum'];
export const CREDITS_PRICING = {
  chat: { usd: 0.01 },
  market: { usd: 0.005 },
} as const;
export const CREDITS_RATE = '1M KAMIYO = $10';

type CapabilityState = 'ready' | 'disabled';
type DisabledReason = 'merchant_wallet_missing' | 'treasury_wallet_missing' | 'token_mint_missing';
type BaseUrlSource = 'env' | 'default-development' | 'default-production';

function readEnv(env: NodeJS.ProcessEnv, key: string): string | null {
  const value = env[key]?.trim();
  return value ? value : null;
}

function parseConfiguredNetworks(value: string | null): PayAINetwork[] {
  if (!value) {
    return [];
  }

  const configured = value
    .split(/[,\n]/)
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry): entry is PayAINetwork =>
      (COMPANION_X402_NETWORKS as readonly string[]).includes(entry)
    );

  return [...new Set(configured)];
}

function disabledState(reason: DisabledReason) {
  return {
    enabled: false as const,
    state: 'disabled' as CapabilityState,
    reason,
  };
}

export interface CreditsCapability {
  enabled: boolean;
  state: CapabilityState;
  reason: DisabledReason | null;
  treasuryWallet: string | null;
  tokenMint: string | null;
  rate: string;
  pricing: typeof CREDITS_PRICING;
}

export interface X402Capability {
  enabled: boolean;
  state: CapabilityState;
  reason: DisabledReason | null;
  merchantWallet: string | null;
  supportedNetworks: readonly PayAINetwork[];
}

export interface McpCapability {
  enabled: true;
  state: 'ready';
  publicBaseUrl: string;
  source: BaseUrlSource;
}

export function resolveX402SupportedNetworks(env: NodeJS.ProcessEnv = process.env): readonly PayAINetwork[] {
  const configured = parseConfiguredNetworks(readEnv(env, 'X402_SUPPORTED_NETWORKS'));
  if (configured.length > 0) {
    return configured;
  }

  const merchantWallet = readEnv(env, 'X402_MERCHANT_WALLET');
  if (!merchantWallet) {
    return COMPANION_X402_NETWORKS;
  }

  if (merchantWallet.startsWith('0x')) {
    return COMPANION_X402_NETWORKS.filter((network) => network !== 'solana');
  }

  return ['solana'];
}

export function getCreditsCapability(env: NodeJS.ProcessEnv = process.env): CreditsCapability {
  const treasuryWallet = readEnv(env, 'CREDITS_TREASURY_WALLET');
  const tokenMint = readEnv(env, 'KAMIYO_MINT');

  if (!treasuryWallet) {
    return {
      ...disabledState('treasury_wallet_missing'),
      treasuryWallet,
      tokenMint,
      rate: CREDITS_RATE,
      pricing: CREDITS_PRICING,
    };
  }

  if (!tokenMint) {
    return {
      ...disabledState('token_mint_missing'),
      treasuryWallet,
      tokenMint,
      rate: CREDITS_RATE,
      pricing: CREDITS_PRICING,
    };
  }

  return {
    enabled: true,
    state: 'ready',
    reason: null,
    treasuryWallet,
    tokenMint,
    rate: CREDITS_RATE,
    pricing: CREDITS_PRICING,
  };
}

export function getX402Capability(env: NodeJS.ProcessEnv = process.env): X402Capability {
  const merchantWallet = readEnv(env, 'X402_MERCHANT_WALLET');
  const supportedNetworks = resolveX402SupportedNetworks(env);

  if (!merchantWallet) {
    return {
      ...disabledState('merchant_wallet_missing'),
      merchantWallet,
      supportedNetworks,
    };
  }

  return {
    enabled: true,
    state: 'ready',
    reason: null,
    merchantWallet,
    supportedNetworks,
  };
}

export function getMcpCapability(env: NodeJS.ProcessEnv = process.env): McpCapability {
  const configuredBaseUrl = readEnv(env, 'API_BASE_URL');
  if (configuredBaseUrl) {
    return {
      enabled: true,
      state: 'ready',
      publicBaseUrl: new URL(configuredBaseUrl).toString(),
      source: 'env',
    };
  }

  const isDevelopment = env.NODE_ENV === 'development';
  const defaultBaseUrl = isDevelopment
    ? `http://localhost:${readEnv(env, 'PORT') || '3001'}`
    : 'https://api.kamiyo.ai';

  return {
    enabled: true,
    state: 'ready',
    publicBaseUrl: defaultBaseUrl,
    source: isDevelopment ? 'default-development' : 'default-production',
  };
}
