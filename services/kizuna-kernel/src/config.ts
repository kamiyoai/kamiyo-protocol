import { z } from 'zod';

export type KizunaLane = 'enterprise' | 'crypto-fast';
export type SigningBackend = 'local-pem' | 'aws-kms';

export interface Config {
  DATABASE_URL: string;
  PORT: number;
  NODE_ENV: 'development' | 'production' | 'test';
  LOG_LEVEL: 'debug' | 'info' | 'warn' | 'error';
  KIZUNA_KERNEL_INTERNAL_TOKEN: string;
  KIZUNA_KERNEL_OPERATOR_TOKEN: string;
  KIZUNA_KERNEL_SIGNING_BACKEND: SigningBackend;
  KIZUNA_KERNEL_ACTIVE_SIGNING_KID: string;
  KIZUNA_KERNEL_LOCAL_PRIVATE_KEYS: Record<string, string>;
  KIZUNA_KERNEL_AWS_REGION: string;
  KIZUNA_KERNEL_AWS_KMS_KEY_IDS: Record<string, string>;
  KIZUNA_KERNEL_ACTIVE_POLICY_PACKS: Record<KizunaLane, string>;
  KIZUNA_KERNEL_ENVELOPE_TTL_MS: number;
}

const DEFAULTS = {
  PORT: 3610,
  NODE_ENV: 'development',
  LOG_LEVEL: 'info',
  KIZUNA_KERNEL_SIGNING_BACKEND: 'local-pem',
  KIZUNA_KERNEL_ENVELOPE_TTL_MS: 120_000,
} as const;

let cachedConfig: Config | null = null;

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

function parseStringMap(raw: string | undefined, label: string, errors: string[]): Record<string, string> {
  if (!raw?.trim()) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      errors.push(`${label} must be a JSON object`);
      return {};
    }

    const entries = Object.entries(parsed as Record<string, unknown>);
    const result: Record<string, string> = {};
    for (const [key, value] of entries) {
      if (!key.trim() || typeof value !== 'string' || !value.trim()) {
        errors.push(`${label} entries must be non-empty strings`);
        return {};
      }
      result[key.trim()] = value.trim();
    }
    return result;
  } catch {
    errors.push(`${label} must be valid JSON`);
    return {};
  }
}

function parseActivePolicyPacks(raw: string | undefined, errors: string[]): Record<KizunaLane, string> {
  if (!raw?.trim()) {
    errors.push('KIZUNA_KERNEL_ACTIVE_POLICY_PACKS is required');
    return {
      enterprise: '',
      'crypto-fast': '',
    };
  }

  try {
    const parsed = z
      .object({
        enterprise: z.string().trim().min(1),
        'crypto-fast': z.string().trim().min(1),
      })
      .parse(JSON.parse(raw));
    return parsed;
  } catch {
    errors.push(
      'KIZUNA_KERNEL_ACTIVE_POLICY_PACKS must be valid JSON with enterprise and crypto-fast keys'
    );
    return {
      enterprise: '',
      'crypto-fast': '',
    };
  }
}

export function validateConfig(): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!process.env.DATABASE_URL?.trim()) {
    errors.push('DATABASE_URL is required');
  }

  const portRaw = process.env.PORT;
  if (portRaw) {
    const port = Number.parseInt(portRaw, 10);
    if (!Number.isSafeInteger(port) || port <= 0) {
      errors.push('PORT must be a positive integer');
    }
  }

  const nodeEnv = process.env.NODE_ENV || DEFAULTS.NODE_ENV;
  if (!['development', 'production', 'test'].includes(nodeEnv)) {
    errors.push('NODE_ENV must be development, production, or test');
  }

  const logLevel = process.env.LOG_LEVEL || DEFAULTS.LOG_LEVEL;
  if (!['debug', 'info', 'warn', 'error'].includes(logLevel)) {
    errors.push('LOG_LEVEL must be debug, info, warn, or error');
  }

  if (!process.env.KIZUNA_KERNEL_INTERNAL_TOKEN?.trim()) {
    errors.push('KIZUNA_KERNEL_INTERNAL_TOKEN is required');
  }
  if (!process.env.KIZUNA_KERNEL_OPERATOR_TOKEN?.trim()) {
    errors.push('KIZUNA_KERNEL_OPERATOR_TOKEN is required');
  }

  const signingBackend =
    (process.env.KIZUNA_KERNEL_SIGNING_BACKEND as SigningBackend | undefined) ||
    DEFAULTS.KIZUNA_KERNEL_SIGNING_BACKEND;
  if (signingBackend !== 'local-pem' && signingBackend !== 'aws-kms') {
    errors.push('KIZUNA_KERNEL_SIGNING_BACKEND must be local-pem or aws-kms');
  }

  const activeSigningKid = process.env.KIZUNA_KERNEL_ACTIVE_SIGNING_KID?.trim();
  if (!activeSigningKid) {
    errors.push('KIZUNA_KERNEL_ACTIVE_SIGNING_KID is required');
  }

  const localPrivateKeys = parseStringMap(
    process.env.KIZUNA_KERNEL_LOCAL_PRIVATE_KEYS,
    'KIZUNA_KERNEL_LOCAL_PRIVATE_KEYS',
    errors
  );
  const awsKmsKeys = parseStringMap(
    process.env.KIZUNA_KERNEL_AWS_KMS_KEY_IDS,
    'KIZUNA_KERNEL_AWS_KMS_KEY_IDS',
    errors
  );
  const activePolicyPacks = parseActivePolicyPacks(
    process.env.KIZUNA_KERNEL_ACTIVE_POLICY_PACKS,
    errors
  );

  if (signingBackend === 'local-pem') {
    if (!localPrivateKeys[activeSigningKid || '']) {
      errors.push('KIZUNA_KERNEL_LOCAL_PRIVATE_KEYS must include the active signing kid');
    }
  }

  if (signingBackend === 'aws-kms') {
    if (!process.env.KIZUNA_KERNEL_AWS_REGION?.trim()) {
      errors.push('KIZUNA_KERNEL_AWS_REGION is required when KIZUNA_KERNEL_SIGNING_BACKEND=aws-kms');
    }
    if (!awsKmsKeys[activeSigningKid || '']) {
      errors.push('KIZUNA_KERNEL_AWS_KMS_KEY_IDS must include the active signing kid');
    }
  }

  const ttlRaw = process.env.KIZUNA_KERNEL_ENVELOPE_TTL_MS;
  if (ttlRaw) {
    const ttl = Number.parseInt(ttlRaw, 10);
    if (!Number.isSafeInteger(ttl) || ttl <= 0) {
      errors.push('KIZUNA_KERNEL_ENVELOPE_TTL_MS must be a positive integer');
    }
  }

  if (nodeEnv === 'production' && signingBackend === 'local-pem') {
    warnings.push('KIZUNA kernel is using local-pem signing in production mode');
  }

  if (
    nodeEnv === 'production' &&
    process.env.DATABASE_URL &&
    !process.env.DATABASE_URL.startsWith('postgresql')
  ) {
    warnings.push('DATABASE_URL should use postgresql:// in production');
  }

  void activePolicyPacks;

  return { valid: errors.length === 0, errors, warnings };
}

export function getConfig(): Config {
  if (cachedConfig) return cachedConfig;

  const validation = validateConfig();
  if (!validation.valid) {
    throw new Error(`Invalid configuration: ${validation.errors.join(', ')}`);
  }

  const activeSigningKid = process.env.KIZUNA_KERNEL_ACTIVE_SIGNING_KID!.trim();
  cachedConfig = {
    DATABASE_URL: process.env.DATABASE_URL!,
    PORT: Number.parseInt(process.env.PORT || String(DEFAULTS.PORT), 10),
    NODE_ENV: (process.env.NODE_ENV as Config['NODE_ENV']) || DEFAULTS.NODE_ENV,
    LOG_LEVEL: (process.env.LOG_LEVEL as Config['LOG_LEVEL']) || DEFAULTS.LOG_LEVEL,
    KIZUNA_KERNEL_INTERNAL_TOKEN: process.env.KIZUNA_KERNEL_INTERNAL_TOKEN!,
    KIZUNA_KERNEL_OPERATOR_TOKEN: process.env.KIZUNA_KERNEL_OPERATOR_TOKEN!,
    KIZUNA_KERNEL_SIGNING_BACKEND:
      (process.env.KIZUNA_KERNEL_SIGNING_BACKEND as SigningBackend | undefined) ||
      DEFAULTS.KIZUNA_KERNEL_SIGNING_BACKEND,
    KIZUNA_KERNEL_ACTIVE_SIGNING_KID: activeSigningKid,
    KIZUNA_KERNEL_LOCAL_PRIVATE_KEYS: parseStringMap(
      process.env.KIZUNA_KERNEL_LOCAL_PRIVATE_KEYS,
      'KIZUNA_KERNEL_LOCAL_PRIVATE_KEYS',
      []
    ),
    KIZUNA_KERNEL_AWS_REGION: process.env.KIZUNA_KERNEL_AWS_REGION || '',
    KIZUNA_KERNEL_AWS_KMS_KEY_IDS: parseStringMap(
      process.env.KIZUNA_KERNEL_AWS_KMS_KEY_IDS,
      'KIZUNA_KERNEL_AWS_KMS_KEY_IDS',
      []
    ),
    KIZUNA_KERNEL_ACTIVE_POLICY_PACKS: parseActivePolicyPacks(
      process.env.KIZUNA_KERNEL_ACTIVE_POLICY_PACKS,
      []
    ),
    KIZUNA_KERNEL_ENVELOPE_TTL_MS: Number.parseInt(
      process.env.KIZUNA_KERNEL_ENVELOPE_TTL_MS ||
        String(DEFAULTS.KIZUNA_KERNEL_ENVELOPE_TTL_MS),
      10
    ),
  };

  return cachedConfig;
}

export function clearConfigCache(): void {
  cachedConfig = null;
}

export function getRedactedConfig(): Record<string, string> {
  const config = getConfig();
  return {
    DATABASE_URL: '[REDACTED]',
    PORT: String(config.PORT),
    NODE_ENV: config.NODE_ENV,
    LOG_LEVEL: config.LOG_LEVEL,
    KIZUNA_KERNEL_INTERNAL_TOKEN: '[REDACTED]',
    KIZUNA_KERNEL_OPERATOR_TOKEN: '[REDACTED]',
    KIZUNA_KERNEL_SIGNING_BACKEND: config.KIZUNA_KERNEL_SIGNING_BACKEND,
    KIZUNA_KERNEL_ACTIVE_SIGNING_KID: config.KIZUNA_KERNEL_ACTIVE_SIGNING_KID,
    KIZUNA_KERNEL_LOCAL_PRIVATE_KEYS: Object.keys(config.KIZUNA_KERNEL_LOCAL_PRIVATE_KEYS).join(','),
    KIZUNA_KERNEL_AWS_REGION: config.KIZUNA_KERNEL_AWS_REGION,
    KIZUNA_KERNEL_AWS_KMS_KEY_IDS: Object.keys(config.KIZUNA_KERNEL_AWS_KMS_KEY_IDS).join(','),
    KIZUNA_KERNEL_ACTIVE_POLICY_PACKS: JSON.stringify(config.KIZUNA_KERNEL_ACTIVE_POLICY_PACKS),
    KIZUNA_KERNEL_ENVELOPE_TTL_MS: String(config.KIZUNA_KERNEL_ENVELOPE_TTL_MS),
  };
}
