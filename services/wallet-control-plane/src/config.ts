import { CDP_ENV, inspectCdpEnv } from '@kamiyo/cdp';
import { PublicKey } from '@solana/web3.js';

export type Config = {
  DATABASE_URL: string;
  SOLANA_RPC_URL: string;
  MEISHI_PROGRAM_ID: string;
  PORT: number;
  NODE_ENV: 'development' | 'production' | 'test';
};

const REQUIRED_VARS = [
  'DATABASE_URL',
  'SOLANA_RPC_URL',
] as const;

const DEFAULTS: Pick<Config, 'MEISHI_PROGRAM_ID' | 'PORT' | 'NODE_ENV'> = {
  MEISHI_PROGRAM_ID: '',
  PORT: 3600,
  NODE_ENV: 'development',
};

let cached: Config | null = null;

export type ValidationResult = {
  valid: boolean;
  errors: string[];
  warnings: string[];
};

export function validateConfig(): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const key of REQUIRED_VARS) {
    if (!process.env[key]?.trim()) errors.push(`Missing required: ${key}`);
  }

  const cdpEnv = inspectCdpEnv();
  if (!cdpEnv.fields.apiKeyId.configured) {
    errors.push(`Missing required: ${CDP_ENV.apiKeyId}`);
  }
  if (!cdpEnv.fields.apiKeySecret.configured) {
    errors.push(`Missing required: ${CDP_ENV.apiKeySecret}`);
  }
  if (!cdpEnv.fields.walletSecret.configured) {
    errors.push(`Missing required: ${CDP_ENV.walletSecret}`);
  }

  const rpc = process.env.SOLANA_RPC_URL;
  if (rpc && !/^https?:\/\//i.test(rpc)) errors.push('SOLANA_RPC_URL must be http(s)');

  const meishiProgramId = process.env.MEISHI_PROGRAM_ID;
  if (meishiProgramId && meishiProgramId.trim()) {
    try {
      new PublicKey(meishiProgramId.trim());
    } catch {
      errors.push('MEISHI_PROGRAM_ID must be a valid Solana address');
    }
  }

  if (process.env.NODE_ENV === 'production' && !process.env.DATABASE_URL?.startsWith('postgresql')) {
    warnings.push('DATABASE_URL should use postgresql:// in production');
  }

  return { valid: errors.length === 0, errors, warnings };
}

export function getConfig(): Config {
  if (cached) return cached;

  const validation = validateConfig();
  if (!validation.valid) {
    throw new Error(`Invalid configuration: ${validation.errors.join(', ')}`);
  }

  cached = {
    DATABASE_URL: process.env.DATABASE_URL!.trim(),
    SOLANA_RPC_URL: process.env.SOLANA_RPC_URL!.trim(),
    MEISHI_PROGRAM_ID: process.env.MEISHI_PROGRAM_ID?.trim() || DEFAULTS.MEISHI_PROGRAM_ID,
    PORT: Math.min(65535, Math.max(1, parseInt(process.env.PORT || String(DEFAULTS.PORT), 10) || DEFAULTS.PORT)),
    NODE_ENV: (process.env.NODE_ENV as Config['NODE_ENV']) || DEFAULTS.NODE_ENV,
  };

  return cached;
}

export function getRedactedConfig(): Record<string, string> {
  const config = getConfig();
  return {
    DATABASE_URL: '[REDACTED]',
    SOLANA_RPC_URL: config.SOLANA_RPC_URL,
    MEISHI_PROGRAM_ID: config.MEISHI_PROGRAM_ID || '',
    PORT: String(config.PORT),
    NODE_ENV: config.NODE_ENV,
    [CDP_ENV.apiKeyId]: '[REDACTED]',
    [CDP_ENV.apiKeySecret]: '[REDACTED]',
    [CDP_ENV.walletSecret]: '[REDACTED]',
  };
}
