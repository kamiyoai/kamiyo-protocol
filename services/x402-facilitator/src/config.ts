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
  MAX_PAYMENT_AGE_MS: number;
  MAX_SETTLEMENT_AMOUNT: number;
}

const REQUIRED_VARS = [
  'SOLANA_RPC_URL',
  'FACILITATOR_PRIVATE_KEY',
  'TREASURY_WALLET',
  'DATABASE_URL',
] as const;

const DEFAULTS: Partial<Config> = {
  ESCROW_PROGRAM_ID: 'FVnvAs8bahMwAvjcLq5ZrXksuu5Qeu2MRkbjwB9mua3u',
  PORT: 3500,
  NODE_ENV: 'development',
  LOG_LEVEL: 'info',
  SETTLEMENT_FEE_BPS: 10,
  ESCROW_FEE_BPS: 50,
  MAX_PAYMENT_AGE_MS: 300_000,
  MAX_SETTLEMENT_AMOUNT: 100_000,
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

  if (process.env.NODE_ENV === 'production' && !process.env.DATABASE_URL?.startsWith('postgresql')) {
    warnings.push('DATABASE_URL should use postgresql:// in production');
  }
  if (process.env.NODE_ENV === 'production' && process.env.LOG_LEVEL === 'debug') {
    warnings.push('LOG_LEVEL=debug in production');
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
    MAX_PAYMENT_AGE_MS: parseInt(process.env.MAX_PAYMENT_AGE_MS || String(DEFAULTS.MAX_PAYMENT_AGE_MS), 10),
    MAX_SETTLEMENT_AMOUNT: parseInt(process.env.MAX_SETTLEMENT_AMOUNT || String(DEFAULTS.MAX_SETTLEMENT_AMOUNT), 10),
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
    MAX_PAYMENT_AGE_MS: String(config.MAX_PAYMENT_AGE_MS),
    MAX_SETTLEMENT_AMOUNT: String(config.MAX_SETTLEMENT_AMOUNT),
  };
}
