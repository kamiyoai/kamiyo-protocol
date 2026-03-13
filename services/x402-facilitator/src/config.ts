import { PublicKey } from '@solana/web3.js';

export interface Config {
  SOLANA_RPC_URL: string;
  FACILITATOR_PRIVATE_KEY: string;
  TREASURY_WALLET: string;
  ESCROW_PROGRAM_ID: string;
  DATABASE_URL: string;
  PORT: number;
  NODE_ENV: 'development' | 'production' | 'test';
  LOG_LEVEL: 'debug' | 'info' | 'warn' | 'error';
  SETTLEMENT_FEE_BPS: number;
  ESCROW_FEE_BPS: number;
  DISPUTE_FEE_BPS: number;
  MAX_PAYMENT_AGE_MS: number;
  MAX_SETTLEMENT_AMOUNT: number;
  PRIVACY_ENABLED: boolean;
  SHADOWPAY_API_URL: string;
  SHADOWPAY_API_KEY: string;
  SHADOWPAY_REFERRAL_ID: string;
  BASE_RPC_URL: string;
  BASE_FACILITATOR_KEY: string;
  BASE_TREASURY_ADDRESS: string;
  KIZUNA_ENABLED: boolean;
  KIZUNA_SHADOW_MODE: boolean;
  KIZUNA_MAX_SINGLE_MICRO: number;
  KIZUNA_RESERVATION_TTL_MS: number;
  KIZUNA_INTERNAL_TOKEN: string;
  WALLET_CONTROL_PLANE_URL: string;
  CREDITS_INTERNAL_URL: string;
  KIZUNA_KERNEL_URL: string;
  KIZUNA_KERNEL_TIMEOUT_MS: number;
  KIZUNA_KERNEL_FAIL_CLOSED: boolean;
  KIZUNA_KERNEL_SIGNING_KEYS: Record<string, string>;
  KIZUNA_ENTERPRISE_POOL_ID: string;
  KIZUNA_FASTPATH_POOL_ID: string;
  KIZUNA_ENTERPRISE_REQUIRE_PREFUND: boolean;
  KIZUNA_SECURED_ONLY: boolean;
  KIZUNA_FASTPATH_LTV_CAP_BPS: number;
  KIZUNA_FASTPATH_MIN_HEALTH_FACTOR: number;
  KIZUNA_FASTPATH_ASSET_HAIRCUT_BPS: number;
  KIZUNA_AGENT_REGISTRY_CLUSTER: 'devnet' | 'testnet' | 'mainnet-beta' | 'localnet';
  KIZUNA_AGENT_REGISTRY_RPC_URL: string;
  KIZUNA_AGENT_REGISTRY_INDEXER_GRAPHQL_URL: string;
  KIZUNA_AGENT_REGISTRY_IPFS_GATEWAY_URL: string;
  KIZUNA_PUBLIC_X402_BASE_URL: string;
  KIZUNA_PUBLIC_MCP_URL: string;
  KIZUNA_PUBLIC_A2A_URL: string;
  KIZUNA_PUBLIC_WEB_URL: string;
  KIZUNA_ALLOW_LEGACY_AGENT_IDS: boolean;
}

const REQUIRED_VARS = [
  'SOLANA_RPC_URL',
  'FACILITATOR_PRIVATE_KEY',
  'TREASURY_WALLET',
  'DATABASE_URL'
] as const;

const DEFAULTS: Partial<Config> = {
  ESCROW_PROGRAM_ID: 'FVnvAs8bahMwAvjcLq5ZrXksuu5Qeu2MRkbjwB9mua3u',
  PORT: 3500,
  NODE_ENV: 'development',
  LOG_LEVEL: 'info',
  SETTLEMENT_FEE_BPS: 10,
  ESCROW_FEE_BPS: 50,
  DISPUTE_FEE_BPS: 100,
  MAX_PAYMENT_AGE_MS: 300_000,
  MAX_SETTLEMENT_AMOUNT: 100_000,
  PRIVACY_ENABLED: false,
  SHADOWPAY_API_URL: 'https://shadow.radr.fun/shadowpay/api',
  SHADOWPAY_API_KEY: '',
  SHADOWPAY_REFERRAL_ID: '64b30531ab33da27',
  BASE_RPC_URL: '',
  BASE_FACILITATOR_KEY: '',
  BASE_TREASURY_ADDRESS: '',
  KIZUNA_ENABLED: false,
  KIZUNA_SHADOW_MODE: false,
  KIZUNA_MAX_SINGLE_MICRO: 2_000_000,
  KIZUNA_RESERVATION_TTL_MS: 120_000,
  KIZUNA_INTERNAL_TOKEN: '',
  WALLET_CONTROL_PLANE_URL: '',
  CREDITS_INTERNAL_URL: '',
  KIZUNA_KERNEL_URL: '',
  KIZUNA_KERNEL_TIMEOUT_MS: 1500,
  KIZUNA_KERNEL_FAIL_CLOSED: true,
  KIZUNA_ENTERPRISE_POOL_ID: 'enterprise-main',
  KIZUNA_FASTPATH_POOL_ID: 'fastpath-main',
  KIZUNA_ENTERPRISE_REQUIRE_PREFUND: true,
  KIZUNA_SECURED_ONLY: false,
  KIZUNA_FASTPATH_LTV_CAP_BPS: 4000,
  KIZUNA_FASTPATH_MIN_HEALTH_FACTOR: 1.8,
  KIZUNA_FASTPATH_ASSET_HAIRCUT_BPS: 0,
  KIZUNA_AGENT_REGISTRY_CLUSTER: 'mainnet-beta',
  KIZUNA_AGENT_REGISTRY_RPC_URL: '',
  KIZUNA_AGENT_REGISTRY_INDEXER_GRAPHQL_URL: '',
  KIZUNA_AGENT_REGISTRY_IPFS_GATEWAY_URL: 'https://ipfs.io/ipfs/',
  KIZUNA_PUBLIC_X402_BASE_URL: '',
  KIZUNA_PUBLIC_MCP_URL: '',
  KIZUNA_PUBLIC_A2A_URL: '',
  KIZUNA_PUBLIC_WEB_URL: '',
  KIZUNA_ALLOW_LEGACY_AGENT_IDS: false,
};

let cachedConfig: Config | null = null;

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export function validateConfig(): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const varName of REQUIRED_VARS) {
    if (!process.env[varName]) errors.push(`Missing required: ${varName}`);
  }

  const rpc = process.env.SOLANA_RPC_URL;
  if (rpc && !/^https?:\/\//i.test(rpc)) errors.push('SOLANA_RPC_URL must be http(s)');

  const pk = process.env.FACILITATOR_PRIVATE_KEY;
  if (pk) {
    try {
      const bytes = JSON.parse(pk);
      if (!Array.isArray(bytes) || bytes.length !== 64) errors.push('FACILITATOR_PRIVATE_KEY must be a 64-byte JSON array');
    } catch {
      if (!/^[1-9A-HJ-NP-Za-km-z]{80,100}$/.test(pk)) errors.push('FACILITATOR_PRIVATE_KEY must be base58 or JSON array');
    }
  }

  const treasury = process.env.TREASURY_WALLET;
  if (treasury) {
    try { new PublicKey(treasury); } catch { errors.push('TREASURY_WALLET must be a valid Solana address'); }
  }

  const escrowPid = process.env.ESCROW_PROGRAM_ID || DEFAULTS.ESCROW_PROGRAM_ID!;
  try { new PublicKey(escrowPid); } catch { errors.push('ESCROW_PROGRAM_ID must be a valid Solana address'); }

  const feeBps = process.env.SETTLEMENT_FEE_BPS;
  if (feeBps) {
    const n = parseInt(feeBps, 10);
    if (isNaN(n) || n < 0 || n > 1000) errors.push('SETTLEMENT_FEE_BPS must be 0-1000');
  }

  const escrowBps = process.env.ESCROW_FEE_BPS;
  if (escrowBps) {
    const n = parseInt(escrowBps, 10);
    if (isNaN(n) || n < 0 || n > 1000) errors.push('ESCROW_FEE_BPS must be 0-1000');
  }

  const disputeBps = process.env.DISPUTE_FEE_BPS;
  if (disputeBps) {
    const n = parseInt(disputeBps, 10);
    if (isNaN(n) || n < 0 || n > 1000) errors.push('DISPUTE_FEE_BPS must be 0-1000');
  }

  const ageMs = process.env.MAX_PAYMENT_AGE_MS;
  if (ageMs) {
    const n = parseInt(ageMs, 10);
    if (isNaN(n) || n <= 0) errors.push('MAX_PAYMENT_AGE_MS must be a positive integer');
  }

  const maxAmt = process.env.MAX_SETTLEMENT_AMOUNT;
  if (maxAmt) {
    const n = parseInt(maxAmt, 10);
    if (isNaN(n) || n <= 0) errors.push('MAX_SETTLEMENT_AMOUNT must be a positive integer');
  }

  const shadowUrl = process.env.SHADOWPAY_API_URL || DEFAULTS.SHADOWPAY_API_URL!;
  try {
    const u = new URL(shadowUrl);
    if (u.protocol !== 'https:') errors.push('SHADOWPAY_API_URL must be https');
  } catch {
    errors.push('SHADOWPAY_API_URL must be a valid URL');
  }

  if (process.env.NODE_ENV === 'production' && !process.env.DATABASE_URL?.startsWith('postgresql')) {
    warnings.push('DATABASE_URL should use postgresql:// in production');
  }
  if (process.env.NODE_ENV === 'production' && process.env.LOG_LEVEL === 'debug') {
    warnings.push('LOG_LEVEL=debug in production');
  }
  if (process.env.PRIVACY_ENABLED === 'true' && !process.env.SHADOWPAY_API_KEY) {
    warnings.push('PRIVACY_ENABLED=true but SHADOWPAY_API_KEY is empty');
  }

  const baseRpc = process.env.BASE_RPC_URL;
  if (baseRpc && !/^https?:\/\//i.test(baseRpc)) {
    errors.push('BASE_RPC_URL must be http(s)');
  }
  if (baseRpc && !process.env.BASE_FACILITATOR_KEY) {
    warnings.push('BASE_RPC_URL set but BASE_FACILITATOR_KEY is empty');
  }
  const baseKey = process.env.BASE_FACILITATOR_KEY;
  if (baseKey && !/^0x[0-9a-fA-F]{64}$/.test(baseKey)) {
    errors.push('BASE_FACILITATOR_KEY must be a 0x-prefixed 32-byte hex string');
  }

  const baseTreasury = process.env.BASE_TREASURY_ADDRESS;
  if (baseTreasury && !/^0x[0-9a-fA-F]{40}$/.test(baseTreasury)) {
    errors.push('BASE_TREASURY_ADDRESS must be a valid EVM address');
  }
  if (!baseRpc && baseKey) {
    warnings.push('BASE_FACILITATOR_KEY set but BASE_RPC_URL is empty');
  }

  const kizunaEnabled = process.env.KIZUNA_ENABLED === 'true';
  const kizunaMaxSingleMicro = process.env.KIZUNA_MAX_SINGLE_MICRO;
  if (kizunaMaxSingleMicro) {
    const n = parseInt(kizunaMaxSingleMicro, 10);
    if (!Number.isSafeInteger(n) || n <= 0) {
      errors.push('KIZUNA_MAX_SINGLE_MICRO must be a positive integer');
    }
  }

  const kizunaReservationTtlMs = process.env.KIZUNA_RESERVATION_TTL_MS;
  if (kizunaReservationTtlMs) {
    const n = parseInt(kizunaReservationTtlMs, 10);
    if (!Number.isSafeInteger(n) || n <= 0) {
      errors.push('KIZUNA_RESERVATION_TTL_MS must be a positive integer');
    }
  }

  const walletControlPlaneUrl = process.env.WALLET_CONTROL_PLANE_URL;
  if (walletControlPlaneUrl) {
    try {
      new URL(walletControlPlaneUrl);
    } catch {
      errors.push('WALLET_CONTROL_PLANE_URL must be a valid URL');
    }
  }

  const creditsInternalUrl = process.env.CREDITS_INTERNAL_URL;
  if (creditsInternalUrl) {
    try {
      new URL(creditsInternalUrl);
    } catch {
      errors.push('CREDITS_INTERNAL_URL must be a valid URL');
    }
  }

  const kizunaKernelUrl = process.env.KIZUNA_KERNEL_URL;
  if (kizunaKernelUrl) {
    try {
      new URL(kizunaKernelUrl);
    } catch {
      errors.push('KIZUNA_KERNEL_URL must be a valid URL');
    }
  }

  const kernelTimeoutRaw = process.env.KIZUNA_KERNEL_TIMEOUT_MS;
  if (kernelTimeoutRaw) {
    const n = parseInt(kernelTimeoutRaw, 10);
    if (!Number.isSafeInteger(n) || n <= 0) {
      errors.push('KIZUNA_KERNEL_TIMEOUT_MS must be a positive integer');
    }
  }

  const ltvCapRaw = process.env.KIZUNA_FASTPATH_LTV_CAP_BPS;
  if (ltvCapRaw) {
    const n = parseInt(ltvCapRaw, 10);
    if (!Number.isSafeInteger(n) || n <= 0 || n > 10_000) {
      errors.push('KIZUNA_FASTPATH_LTV_CAP_BPS must be between 1 and 10000');
    }
  }

  const minHealthRaw = process.env.KIZUNA_FASTPATH_MIN_HEALTH_FACTOR;
  if (minHealthRaw) {
    const n = Number(minHealthRaw);
    if (!Number.isFinite(n) || n <= 0) {
      errors.push('KIZUNA_FASTPATH_MIN_HEALTH_FACTOR must be a positive number');
    }
  }

  const assetHaircutRaw = process.env.KIZUNA_FASTPATH_ASSET_HAIRCUT_BPS;
  if (assetHaircutRaw) {
    const n = parseInt(assetHaircutRaw, 10);
    if (!Number.isSafeInteger(n) || n < 0 || n > 10_000) {
      errors.push('KIZUNA_FASTPATH_ASSET_HAIRCUT_BPS must be between 0 and 10000');
    }
  }

  const registryCluster =
    process.env.KIZUNA_AGENT_REGISTRY_CLUSTER || DEFAULTS.KIZUNA_AGENT_REGISTRY_CLUSTER!;
  if (!['devnet', 'testnet', 'mainnet-beta', 'localnet'].includes(registryCluster)) {
    errors.push('KIZUNA_AGENT_REGISTRY_CLUSTER must be devnet, testnet, mainnet-beta, or localnet');
  }

  const registryRpcUrl = process.env.KIZUNA_AGENT_REGISTRY_RPC_URL;
  if (registryRpcUrl) {
    try {
      new URL(registryRpcUrl);
    } catch {
      errors.push('KIZUNA_AGENT_REGISTRY_RPC_URL must be a valid URL');
    }
  }

  const registryIndexerUrl = process.env.KIZUNA_AGENT_REGISTRY_INDEXER_GRAPHQL_URL;
  if (registryIndexerUrl) {
    try {
      new URL(registryIndexerUrl);
    } catch {
      errors.push('KIZUNA_AGENT_REGISTRY_INDEXER_GRAPHQL_URL must be a valid URL');
    }
  }

  const registryGatewayUrl =
    process.env.KIZUNA_AGENT_REGISTRY_IPFS_GATEWAY_URL ||
    DEFAULTS.KIZUNA_AGENT_REGISTRY_IPFS_GATEWAY_URL!;
  try {
    const url = new URL(registryGatewayUrl);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      errors.push('KIZUNA_AGENT_REGISTRY_IPFS_GATEWAY_URL must use http(s)');
    }
  } catch {
    errors.push('KIZUNA_AGENT_REGISTRY_IPFS_GATEWAY_URL must be a valid URL');
  }

  for (const [envName, envValue] of [
    ['KIZUNA_PUBLIC_X402_BASE_URL', process.env.KIZUNA_PUBLIC_X402_BASE_URL],
    ['KIZUNA_PUBLIC_MCP_URL', process.env.KIZUNA_PUBLIC_MCP_URL],
    ['KIZUNA_PUBLIC_A2A_URL', process.env.KIZUNA_PUBLIC_A2A_URL],
    ['KIZUNA_PUBLIC_WEB_URL', process.env.KIZUNA_PUBLIC_WEB_URL],
  ] as const) {
    if (!envValue) continue;
    try {
      new URL(envValue);
    } catch {
      errors.push(`${envName} must be a valid URL`);
    }
  }

  const kernelSigningKeysRaw = process.env.KIZUNA_KERNEL_SIGNING_KEYS;
  if (kernelSigningKeysRaw) {
    try {
      const parsed = JSON.parse(kernelSigningKeysRaw) as unknown;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        errors.push('KIZUNA_KERNEL_SIGNING_KEYS must be a JSON object');
      } else {
        for (const [keyId, keyValue] of Object.entries(parsed as Record<string, unknown>)) {
          if (!keyId.trim() || typeof keyValue !== 'string' || !keyValue.trim()) {
            errors.push('KIZUNA_KERNEL_SIGNING_KEYS entries must be non-empty strings');
            break;
          }
        }
      }
    } catch {
      errors.push('KIZUNA_KERNEL_SIGNING_KEYS must be valid JSON');
    }
  }

  if (kizunaEnabled) {
    if (!process.env.KIZUNA_INTERNAL_TOKEN?.trim()) {
      errors.push('KIZUNA_INTERNAL_TOKEN is required when KIZUNA_ENABLED=true');
    }
    if (!walletControlPlaneUrl?.trim()) {
      errors.push('WALLET_CONTROL_PLANE_URL is required when KIZUNA_ENABLED=true');
    }
    if (!creditsInternalUrl?.trim()) {
      errors.push('CREDITS_INTERNAL_URL is required when KIZUNA_ENABLED=true');
    }
    if (!(process.env.KIZUNA_ENTERPRISE_POOL_ID || DEFAULTS.KIZUNA_ENTERPRISE_POOL_ID)?.trim()) {
      errors.push('KIZUNA_ENTERPRISE_POOL_ID is required when KIZUNA_ENABLED=true');
    }
    if (!(process.env.KIZUNA_FASTPATH_POOL_ID || DEFAULTS.KIZUNA_FASTPATH_POOL_ID)?.trim()) {
      errors.push('KIZUNA_FASTPATH_POOL_ID is required when KIZUNA_ENABLED=true');
    }
    const enterpriseRequirePrefundRaw =
      process.env.KIZUNA_ENTERPRISE_REQUIRE_PREFUND ??
      String(DEFAULTS.KIZUNA_ENTERPRISE_REQUIRE_PREFUND);
    if (enterpriseRequirePrefundRaw !== 'true' && enterpriseRequirePrefundRaw !== 'false') {
      errors.push('KIZUNA_ENTERPRISE_REQUIRE_PREFUND must be true or false');
    }
    const kernelFailClosed = (process.env.KIZUNA_KERNEL_FAIL_CLOSED || String(DEFAULTS.KIZUNA_KERNEL_FAIL_CLOSED)) === 'true';
    if (kernelFailClosed && !kizunaKernelUrl?.trim()) {
      errors.push('KIZUNA_KERNEL_URL is required when fail-closed mode is enabled');
    }
    if (kernelFailClosed && !kernelSigningKeysRaw?.trim()) {
      errors.push('KIZUNA_KERNEL_SIGNING_KEYS is required when fail-closed mode is enabled');
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

export function getConfig(): Config {
  if (cachedConfig) return cachedConfig;

  const validation = validateConfig();
  if (!validation.valid) throw new Error(`Invalid configuration: ${validation.errors.join(', ')}`);

  cachedConfig = {
    SOLANA_RPC_URL: process.env.SOLANA_RPC_URL!,
    FACILITATOR_PRIVATE_KEY: process.env.FACILITATOR_PRIVATE_KEY!,
    TREASURY_WALLET: process.env.TREASURY_WALLET!,
    ESCROW_PROGRAM_ID: process.env.ESCROW_PROGRAM_ID || DEFAULTS.ESCROW_PROGRAM_ID!,
    DATABASE_URL: process.env.DATABASE_URL!,
    PORT: parseInt(process.env.PORT || String(DEFAULTS.PORT), 10),
    NODE_ENV: (process.env.NODE_ENV as Config['NODE_ENV']) || DEFAULTS.NODE_ENV!,
    LOG_LEVEL: (process.env.LOG_LEVEL as Config['LOG_LEVEL']) || DEFAULTS.LOG_LEVEL!,
    SETTLEMENT_FEE_BPS: parseInt(process.env.SETTLEMENT_FEE_BPS || String(DEFAULTS.SETTLEMENT_FEE_BPS), 10),
    ESCROW_FEE_BPS: parseInt(process.env.ESCROW_FEE_BPS || String(DEFAULTS.ESCROW_FEE_BPS), 10),
    DISPUTE_FEE_BPS: parseInt(process.env.DISPUTE_FEE_BPS || String(DEFAULTS.DISPUTE_FEE_BPS), 10),
    MAX_PAYMENT_AGE_MS: parseInt(process.env.MAX_PAYMENT_AGE_MS || String(DEFAULTS.MAX_PAYMENT_AGE_MS), 10),
    MAX_SETTLEMENT_AMOUNT: parseInt(process.env.MAX_SETTLEMENT_AMOUNT || String(DEFAULTS.MAX_SETTLEMENT_AMOUNT), 10),
    PRIVACY_ENABLED: process.env.PRIVACY_ENABLED === 'true',
    SHADOWPAY_API_URL: process.env.SHADOWPAY_API_URL || DEFAULTS.SHADOWPAY_API_URL!,
    SHADOWPAY_API_KEY: process.env.SHADOWPAY_API_KEY || DEFAULTS.SHADOWPAY_API_KEY!,
    SHADOWPAY_REFERRAL_ID: process.env.SHADOWPAY_REFERRAL_ID || DEFAULTS.SHADOWPAY_REFERRAL_ID!,
    BASE_RPC_URL: process.env.BASE_RPC_URL || DEFAULTS.BASE_RPC_URL!,
    BASE_FACILITATOR_KEY: process.env.BASE_FACILITATOR_KEY || DEFAULTS.BASE_FACILITATOR_KEY!,
    BASE_TREASURY_ADDRESS: process.env.BASE_TREASURY_ADDRESS || DEFAULTS.BASE_TREASURY_ADDRESS!,
    KIZUNA_ENABLED: process.env.KIZUNA_ENABLED === 'true',
    KIZUNA_SHADOW_MODE: process.env.KIZUNA_SHADOW_MODE === 'true',
    KIZUNA_MAX_SINGLE_MICRO: parseInt(
      process.env.KIZUNA_MAX_SINGLE_MICRO || String(DEFAULTS.KIZUNA_MAX_SINGLE_MICRO),
      10
    ),
    KIZUNA_RESERVATION_TTL_MS: parseInt(
      process.env.KIZUNA_RESERVATION_TTL_MS || String(DEFAULTS.KIZUNA_RESERVATION_TTL_MS),
      10
    ),
    KIZUNA_INTERNAL_TOKEN: process.env.KIZUNA_INTERNAL_TOKEN || DEFAULTS.KIZUNA_INTERNAL_TOKEN!,
    WALLET_CONTROL_PLANE_URL:
      process.env.WALLET_CONTROL_PLANE_URL || DEFAULTS.WALLET_CONTROL_PLANE_URL!,
    CREDITS_INTERNAL_URL: process.env.CREDITS_INTERNAL_URL || DEFAULTS.CREDITS_INTERNAL_URL!,
    KIZUNA_KERNEL_URL: process.env.KIZUNA_KERNEL_URL || DEFAULTS.KIZUNA_KERNEL_URL!,
    KIZUNA_KERNEL_TIMEOUT_MS: parseInt(
      process.env.KIZUNA_KERNEL_TIMEOUT_MS || String(DEFAULTS.KIZUNA_KERNEL_TIMEOUT_MS),
      10
    ),
    KIZUNA_KERNEL_FAIL_CLOSED:
      (process.env.KIZUNA_KERNEL_FAIL_CLOSED || String(DEFAULTS.KIZUNA_KERNEL_FAIL_CLOSED)) ===
      'true',
    KIZUNA_KERNEL_SIGNING_KEYS: (() => {
      const raw = process.env.KIZUNA_KERNEL_SIGNING_KEYS;
      if (!raw) return {};
      const parsed = JSON.parse(raw) as Record<string, string>;
      return Object.fromEntries(
        Object.entries(parsed).filter(
          ([key, value]) => key.trim().length > 0 && typeof value === 'string' && value.trim().length > 0
        )
      );
    })(),
    KIZUNA_ENTERPRISE_POOL_ID:
      process.env.KIZUNA_ENTERPRISE_POOL_ID || DEFAULTS.KIZUNA_ENTERPRISE_POOL_ID!,
    KIZUNA_FASTPATH_POOL_ID:
      process.env.KIZUNA_FASTPATH_POOL_ID || DEFAULTS.KIZUNA_FASTPATH_POOL_ID!,
    KIZUNA_ENTERPRISE_REQUIRE_PREFUND:
      (
        process.env.KIZUNA_ENTERPRISE_REQUIRE_PREFUND ||
        String(DEFAULTS.KIZUNA_ENTERPRISE_REQUIRE_PREFUND)
      ) === 'true',
    KIZUNA_SECURED_ONLY:
      (process.env.KIZUNA_SECURED_ONLY || String(DEFAULTS.KIZUNA_SECURED_ONLY)) === 'true',
    KIZUNA_FASTPATH_LTV_CAP_BPS: parseInt(
      process.env.KIZUNA_FASTPATH_LTV_CAP_BPS || String(DEFAULTS.KIZUNA_FASTPATH_LTV_CAP_BPS),
      10
    ),
    KIZUNA_FASTPATH_MIN_HEALTH_FACTOR: Number(
      process.env.KIZUNA_FASTPATH_MIN_HEALTH_FACTOR ||
        String(DEFAULTS.KIZUNA_FASTPATH_MIN_HEALTH_FACTOR)
    ),
    KIZUNA_FASTPATH_ASSET_HAIRCUT_BPS: parseInt(
      process.env.KIZUNA_FASTPATH_ASSET_HAIRCUT_BPS ||
        String(DEFAULTS.KIZUNA_FASTPATH_ASSET_HAIRCUT_BPS),
      10
    ),
    KIZUNA_AGENT_REGISTRY_CLUSTER:
      (process.env.KIZUNA_AGENT_REGISTRY_CLUSTER as Config['KIZUNA_AGENT_REGISTRY_CLUSTER']) ||
      DEFAULTS.KIZUNA_AGENT_REGISTRY_CLUSTER!,
    KIZUNA_AGENT_REGISTRY_RPC_URL:
      process.env.KIZUNA_AGENT_REGISTRY_RPC_URL || DEFAULTS.KIZUNA_AGENT_REGISTRY_RPC_URL!,
    KIZUNA_AGENT_REGISTRY_INDEXER_GRAPHQL_URL:
      process.env.KIZUNA_AGENT_REGISTRY_INDEXER_GRAPHQL_URL ||
      DEFAULTS.KIZUNA_AGENT_REGISTRY_INDEXER_GRAPHQL_URL!,
    KIZUNA_AGENT_REGISTRY_IPFS_GATEWAY_URL:
      process.env.KIZUNA_AGENT_REGISTRY_IPFS_GATEWAY_URL ||
      DEFAULTS.KIZUNA_AGENT_REGISTRY_IPFS_GATEWAY_URL!,
    KIZUNA_PUBLIC_X402_BASE_URL:
      process.env.KIZUNA_PUBLIC_X402_BASE_URL || DEFAULTS.KIZUNA_PUBLIC_X402_BASE_URL!,
    KIZUNA_PUBLIC_MCP_URL:
      process.env.KIZUNA_PUBLIC_MCP_URL || DEFAULTS.KIZUNA_PUBLIC_MCP_URL!,
    KIZUNA_PUBLIC_A2A_URL:
      process.env.KIZUNA_PUBLIC_A2A_URL || DEFAULTS.KIZUNA_PUBLIC_A2A_URL!,
    KIZUNA_PUBLIC_WEB_URL:
      process.env.KIZUNA_PUBLIC_WEB_URL || DEFAULTS.KIZUNA_PUBLIC_WEB_URL!,
    KIZUNA_ALLOW_LEGACY_AGENT_IDS:
      (process.env.KIZUNA_ALLOW_LEGACY_AGENT_IDS ||
        String(DEFAULTS.KIZUNA_ALLOW_LEGACY_AGENT_IDS)) === 'true',
  };

  return cachedConfig;
}

export function clearConfigCache(): void {
  cachedConfig = null;
}

export function getRedactedConfig(): Record<string, string> {
  const config = getConfig();
  return {
    SOLANA_RPC_URL: config.SOLANA_RPC_URL,
    FACILITATOR_PRIVATE_KEY: '[REDACTED]',
    TREASURY_WALLET: config.TREASURY_WALLET,
    ESCROW_PROGRAM_ID: config.ESCROW_PROGRAM_ID,
    DATABASE_URL: '[REDACTED]',
    PORT: String(config.PORT),
    NODE_ENV: config.NODE_ENV,
    LOG_LEVEL: config.LOG_LEVEL,
    SETTLEMENT_FEE_BPS: String(config.SETTLEMENT_FEE_BPS),
    ESCROW_FEE_BPS: String(config.ESCROW_FEE_BPS),
    DISPUTE_FEE_BPS: String(config.DISPUTE_FEE_BPS),
    MAX_PAYMENT_AGE_MS: String(config.MAX_PAYMENT_AGE_MS),
    MAX_SETTLEMENT_AMOUNT: String(config.MAX_SETTLEMENT_AMOUNT),
    PRIVACY_ENABLED: String(config.PRIVACY_ENABLED),
    SHADOWPAY_API_URL: config.SHADOWPAY_API_URL,
    SHADOWPAY_API_KEY: config.SHADOWPAY_API_KEY ? '[REDACTED]' : '',
    SHADOWPAY_REFERRAL_ID: config.SHADOWPAY_REFERRAL_ID,
    BASE_RPC_URL: config.BASE_RPC_URL || '',
    BASE_FACILITATOR_KEY: config.BASE_FACILITATOR_KEY ? '[REDACTED]' : '',
    BASE_TREASURY_ADDRESS: config.BASE_TREASURY_ADDRESS || '',
    KIZUNA_ENABLED: String(config.KIZUNA_ENABLED),
    KIZUNA_SHADOW_MODE: String(config.KIZUNA_SHADOW_MODE),
    KIZUNA_MAX_SINGLE_MICRO: String(config.KIZUNA_MAX_SINGLE_MICRO),
    KIZUNA_RESERVATION_TTL_MS: String(config.KIZUNA_RESERVATION_TTL_MS),
    KIZUNA_INTERNAL_TOKEN: config.KIZUNA_INTERNAL_TOKEN ? '[REDACTED]' : '',
    WALLET_CONTROL_PLANE_URL: config.WALLET_CONTROL_PLANE_URL,
    CREDITS_INTERNAL_URL: config.CREDITS_INTERNAL_URL,
    KIZUNA_KERNEL_URL: config.KIZUNA_KERNEL_URL,
    KIZUNA_KERNEL_TIMEOUT_MS: String(config.KIZUNA_KERNEL_TIMEOUT_MS),
    KIZUNA_KERNEL_FAIL_CLOSED: String(config.KIZUNA_KERNEL_FAIL_CLOSED),
    KIZUNA_KERNEL_SIGNING_KEYS: Object.keys(config.KIZUNA_KERNEL_SIGNING_KEYS).join(','),
    KIZUNA_ENTERPRISE_POOL_ID: config.KIZUNA_ENTERPRISE_POOL_ID,
    KIZUNA_FASTPATH_POOL_ID: config.KIZUNA_FASTPATH_POOL_ID,
    KIZUNA_ENTERPRISE_REQUIRE_PREFUND: String(config.KIZUNA_ENTERPRISE_REQUIRE_PREFUND),
    KIZUNA_SECURED_ONLY: String(config.KIZUNA_SECURED_ONLY),
    KIZUNA_FASTPATH_LTV_CAP_BPS: String(config.KIZUNA_FASTPATH_LTV_CAP_BPS),
    KIZUNA_FASTPATH_MIN_HEALTH_FACTOR: String(config.KIZUNA_FASTPATH_MIN_HEALTH_FACTOR),
    KIZUNA_FASTPATH_ASSET_HAIRCUT_BPS: String(config.KIZUNA_FASTPATH_ASSET_HAIRCUT_BPS),
    KIZUNA_AGENT_REGISTRY_CLUSTER: config.KIZUNA_AGENT_REGISTRY_CLUSTER,
    KIZUNA_AGENT_REGISTRY_RPC_URL: config.KIZUNA_AGENT_REGISTRY_RPC_URL,
    KIZUNA_AGENT_REGISTRY_INDEXER_GRAPHQL_URL: config.KIZUNA_AGENT_REGISTRY_INDEXER_GRAPHQL_URL,
    KIZUNA_AGENT_REGISTRY_IPFS_GATEWAY_URL: config.KIZUNA_AGENT_REGISTRY_IPFS_GATEWAY_URL,
    KIZUNA_PUBLIC_X402_BASE_URL: config.KIZUNA_PUBLIC_X402_BASE_URL,
    KIZUNA_PUBLIC_MCP_URL: config.KIZUNA_PUBLIC_MCP_URL,
    KIZUNA_PUBLIC_A2A_URL: config.KIZUNA_PUBLIC_A2A_URL,
    KIZUNA_PUBLIC_WEB_URL: config.KIZUNA_PUBLIC_WEB_URL,
    KIZUNA_ALLOW_LEGACY_AGENT_IDS: String(config.KIZUNA_ALLOW_LEGACY_AGENT_IDS),
  };
}
