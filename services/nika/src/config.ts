/**
 * Configuration for Nika service
 */

export interface Config {
  // Anthropic
  ANTHROPIC_API_KEY: string;

  // DKG
  DKG_ENDPOINT: string;
  DKG_PORT: number;
  DKG_BLOCKCHAIN: string;
  DKG_PRIVATE_KEY: string;
  NIKA_PARANET_UAL: string;

  // Twitter OAuth 1.0a
  TWITTER_API_KEY: string;
  TWITTER_API_SECRET: string;
  TWITTER_ACCESS_TOKEN: string;
  TWITTER_ACCESS_SECRET: string;
  TWITTER_HANDLE: string;

  // Scheduling
  POST_INTERVAL_MIN_MS: number;
  POST_INTERVAL_MAX_MS: number;

  // Infrastructure
  PORT: number;
  NODE_ENV: 'development' | 'production' | 'test';
  LOG_LEVEL: 'debug' | 'info' | 'warn' | 'error';

  // Alerting
  ALERT_WEBHOOK_URL: string;
  ALERT_WEBHOOK_TYPE: 'slack' | 'discord' | 'generic';
}

const REQUIRED_VARS = [
  'ANTHROPIC_API_KEY',
  'DKG_PRIVATE_KEY',
  'TWITTER_API_KEY',
  'TWITTER_API_SECRET',
  'TWITTER_ACCESS_TOKEN',
  'TWITTER_ACCESS_SECRET',
] as const;

const DEFAULTS: Partial<Config> = {
  DKG_ENDPOINT: 'https://positron.origin-trail.network',
  DKG_PORT: 8900,
  DKG_BLOCKCHAIN: 'otp::mainnet',
  NIKA_PARANET_UAL: '',
  TWITTER_HANDLE: 'nika_entity',
  POST_INTERVAL_MIN_MS: 3 * 60 * 60 * 1000, // 3 hours
  POST_INTERVAL_MAX_MS: 5 * 60 * 60 * 1000, // 5 hours
  PORT: 4020,
  NODE_ENV: 'development',
  LOG_LEVEL: 'info',
  ALERT_WEBHOOK_URL: '',
  ALERT_WEBHOOK_TYPE: 'generic',
};

let cachedConfig: Config | null = null;

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

function isValidUrl(str: string): boolean {
  try {
    const url = new URL(str);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

function isValidPort(str: string): boolean {
  const port = parseInt(str);
  return !isNaN(port) && port >= 1 && port <= 65535;
}

function isValidPrivateKey(str: string): boolean {
  return /^(0x)?[a-fA-F0-9]{64}$/.test(str);
}

export function validateConfig(): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const varName of REQUIRED_VARS) {
    if (!process.env[varName]) {
      errors.push(`Missing required environment variable: ${varName}`);
    }
  }

  if (process.env.DKG_ENDPOINT && !isValidUrl(process.env.DKG_ENDPOINT)) {
    errors.push('DKG_ENDPOINT must be a valid URL');
  }

  if (process.env.DKG_PORT && !isValidPort(process.env.DKG_PORT)) {
    errors.push('DKG_PORT must be a valid port number');
  }

  if (process.env.DKG_PRIVATE_KEY && !isValidPrivateKey(process.env.DKG_PRIVATE_KEY)) {
    errors.push('DKG_PRIVATE_KEY must be a 64-character hex string');
  }

  const minInterval = process.env.POST_INTERVAL_MIN_MS;
  const maxInterval = process.env.POST_INTERVAL_MAX_MS;

  if (minInterval) {
    const min = parseInt(minInterval);
    if (isNaN(min) || min < 60000) {
      errors.push('POST_INTERVAL_MIN_MS must be at least 60000ms');
    }
  }

  if (maxInterval) {
    const max = parseInt(maxInterval);
    if (isNaN(max) || max < 60000) {
      errors.push('POST_INTERVAL_MAX_MS must be at least 60000ms');
    }
  }

  if (minInterval && maxInterval) {
    const min = parseInt(minInterval);
    const max = parseInt(maxInterval);
    if (!isNaN(min) && !isNaN(max) && min >= max) {
      errors.push('POST_INTERVAL_MIN_MS must be less than POST_INTERVAL_MAX_MS');
    }
  }

  const blockchain = process.env.DKG_BLOCKCHAIN;
  if (blockchain && !blockchain.includes('::')) {
    errors.push('DKG_BLOCKCHAIN must be in format "network::chain" (e.g., otp::mainnet)');
  }

  const nodeEnv = process.env.NODE_ENV;
  if (nodeEnv && !['development', 'production', 'test'].includes(nodeEnv)) {
    errors.push("NODE_ENV must be 'development', 'production', or 'test'");
  }

  const logLevel = process.env.LOG_LEVEL;
  if (logLevel && !['debug', 'info', 'warn', 'error'].includes(logLevel)) {
    errors.push("LOG_LEVEL must be 'debug', 'info', 'warn', or 'error'");
  }

  if (process.env.PORT && !isValidPort(process.env.PORT)) {
    errors.push('PORT must be a valid port number');
  }

  if (!process.env.NIKA_PARANET_UAL && !process.env.KAMIYO_PARANET_UAL) {
    warnings.push('NIKA_PARANET_UAL not set - DKG storage will not use a paranet');
  }

  if (process.env.NODE_ENV === 'production') {
    if (!process.env.LOG_LEVEL || process.env.LOG_LEVEL === 'debug') {
      warnings.push('Consider setting LOG_LEVEL=info or higher in production');
    }
  }

  if (process.env.KAMIYO_PARANET_UAL && !process.env.NIKA_PARANET_UAL) {
    warnings.push('KAMIYO_PARANET_UAL is deprecated, use NIKA_PARANET_UAL instead');
  }

  return { valid: errors.length === 0, errors, warnings };
}

export function getConfig(): Config {
  if (cachedConfig) {
    return cachedConfig;
  }

  const validation = validateConfig();
  if (!validation.valid) {
    throw new Error(`Invalid configuration: ${validation.errors.join(', ')}`);
  }

  cachedConfig = {
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY!,

    DKG_ENDPOINT: process.env.DKG_ENDPOINT || DEFAULTS.DKG_ENDPOINT!,
    DKG_PORT: parseInt(process.env.DKG_PORT || String(DEFAULTS.DKG_PORT)),
    DKG_BLOCKCHAIN: process.env.DKG_BLOCKCHAIN || DEFAULTS.DKG_BLOCKCHAIN!,
    DKG_PRIVATE_KEY: process.env.DKG_PRIVATE_KEY!,
    NIKA_PARANET_UAL: process.env.NIKA_PARANET_UAL || process.env.KAMIYO_PARANET_UAL || '',

    TWITTER_API_KEY: process.env.TWITTER_API_KEY!,
    TWITTER_API_SECRET: process.env.TWITTER_API_SECRET!,
    TWITTER_ACCESS_TOKEN: process.env.TWITTER_ACCESS_TOKEN!,
    TWITTER_ACCESS_SECRET: process.env.TWITTER_ACCESS_SECRET!,
    TWITTER_HANDLE: process.env.TWITTER_HANDLE || DEFAULTS.TWITTER_HANDLE!,

    POST_INTERVAL_MIN_MS: parseInt(
      process.env.POST_INTERVAL_MIN_MS || String(DEFAULTS.POST_INTERVAL_MIN_MS)
    ),
    POST_INTERVAL_MAX_MS: parseInt(
      process.env.POST_INTERVAL_MAX_MS || String(DEFAULTS.POST_INTERVAL_MAX_MS)
    ),

    PORT: parseInt(process.env.PORT || String(DEFAULTS.PORT)),
    NODE_ENV: (process.env.NODE_ENV as Config['NODE_ENV']) || DEFAULTS.NODE_ENV!,
    LOG_LEVEL: (process.env.LOG_LEVEL as Config['LOG_LEVEL']) || DEFAULTS.LOG_LEVEL!,

    ALERT_WEBHOOK_URL: process.env.ALERT_WEBHOOK_URL || DEFAULTS.ALERT_WEBHOOK_URL!,
    ALERT_WEBHOOK_TYPE:
      (process.env.ALERT_WEBHOOK_TYPE as Config['ALERT_WEBHOOK_TYPE']) ||
      DEFAULTS.ALERT_WEBHOOK_TYPE!,
  };

  return cachedConfig;
}

export function clearConfigCache(): void {
  cachedConfig = null;
}

export function getRedactedConfig(): Record<string, string> {
  const config = getConfig();
  return {
    ANTHROPIC_API_KEY: '[REDACTED]',
    DKG_ENDPOINT: config.DKG_ENDPOINT,
    DKG_PORT: String(config.DKG_PORT),
    DKG_BLOCKCHAIN: config.DKG_BLOCKCHAIN,
    DKG_PRIVATE_KEY: '[REDACTED]',
    NIKA_PARANET_UAL: config.NIKA_PARANET_UAL || '(not set)',
    TWITTER_API_KEY: '[REDACTED]',
    TWITTER_API_SECRET: '[REDACTED]',
    TWITTER_ACCESS_TOKEN: '[REDACTED]',
    TWITTER_ACCESS_SECRET: '[REDACTED]',
    TWITTER_HANDLE: config.TWITTER_HANDLE,
    POST_INTERVAL_MIN_MS: String(config.POST_INTERVAL_MIN_MS),
    POST_INTERVAL_MAX_MS: String(config.POST_INTERVAL_MAX_MS),
    PORT: String(config.PORT),
    NODE_ENV: config.NODE_ENV,
    LOG_LEVEL: config.LOG_LEVEL,
    ALERT_WEBHOOK_URL: config.ALERT_WEBHOOK_URL ? '[CONFIGURED]' : '(not set)',
    ALERT_WEBHOOK_TYPE: config.ALERT_WEBHOOK_TYPE,
  };
}
