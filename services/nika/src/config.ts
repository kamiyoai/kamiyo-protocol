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

  // Scheduling (legacy interval-based)
  POST_INTERVAL_MIN_MS: number;
  POST_INTERVAL_MAX_MS: number;

  // Scheduling (daily windows)
  POSTS_PER_DAY: number;
  MORNING_WINDOW_START_UTC: number;
  MORNING_WINDOW_END_UTC: number;
  EVENING_WINDOW_START_UTC: number;
  EVENING_WINDOW_END_UTC: number;

  // Content context
  THOUGHTLEADER_ACCOUNTS: string[];

  // Infrastructure
  PORT: number;
  NODE_ENV: 'development' | 'production' | 'test';
  LOG_LEVEL: 'debug' | 'info' | 'warn' | 'error';

  // Alerting
  ALERT_WEBHOOK_URL: string;
  ALERT_WEBHOOK_TYPE: 'slack' | 'discord' | 'generic';

  // xAI (Grok) for image generation
  XAI_API_KEY: string;

  // Mention monitor behavior
  MENTION_MAX_RETRIES: number;
  MENTION_CONVERSATION_COOLDOWN_MS: number;
  MENTION_PROCESSED_TTL_MS: number;
  NIKA_MENTION_STATE_FILE: string;
  SHARED_STATE_REDIS_URL: string;
  SHARED_STATE_PREFIX: string;

  // Holder gate (X -> wallet -> holdings)
  HOLDER_GATE_API_BASE_URL: string;
  HOLDER_GATE_API_SECRET: string;
  HOLDER_GATE_TIMEOUT_MS: number;
  HOLDER_GATE_CACHE_TTL_MS: number;

  // Claude SDK mentions
  NIKA_MENTION_ENGINE: 'kamiyo' | 'claude_sdk';
  NIKA_SESSION_REDIS_URL: string;
  NIKA_SESSION_PREFIX: string;

  // Repo knowledge monitor
  NIKA_REPO_WATCH_ENABLED: boolean;
  NIKA_REPO_WATCH_INTERVAL_MS: number;
  NIKA_REPO_ROOT: string;

  // Autonomous execution
  AUTONOMY_ENABLED: boolean;
  AUTONOMY_DRY_RUN: boolean;
  AUTONOMY_API_TOKEN: string;
  AUTONOMY_COMMAND_PREFIX: string;
  AUTONOMY_TICK_INTERVAL_MS: number;
  AUTONOMY_MAX_QUEUE_SIZE: number;
  AUTONOMY_MAX_TASK_HISTORY: number;
  AUTONOMY_OBJECTIVE_MAX_LENGTH: number;
  AUTONOMY_MEISHI_VERIFY_URL: string;
  AUTONOMY_MEISHI_AGENT_ID: string;
  AUTONOMY_MEISHI_MIN_SCORE: number;
  AUTONOMY_MEISHI_REQUIRE_COMPLIANT: boolean;
  AUTONOMY_X_COMMANDS_ENABLED: boolean;
  AUTONOMY_X_PUBLIC: boolean;
  AUTONOMY_X_ALLOWLIST: string[];
  AUTONOMY_OPENCLAW_BASE_URL: string;
  AUTONOMY_OPENCLAW_MODE: 'hooks' | 'tools_invoke';
  AUTONOMY_OPENCLAW_HOOK_PATH: string;
  AUTONOMY_OPENCLAW_HOOK_TOKEN: string;
  AUTONOMY_OPENCLAW_AGENT_ID: string;
  AUTONOMY_OPENCLAW_GATEWAY_TOKEN: string;
  AUTONOMY_OPENCLAW_CALLER_SESSION_KEY: string;
  AUTONOMY_OPENCLAW_TARGET_SESSION_PREFIX: string;
  AUTONOMY_OPENCLAW_RUN_TIMEOUT_SECONDS: number;
  AUTONOMY_OPENCLAW_TIMEOUT_MS: number;
}

const REQUIRED_VARS = [
  'ANTHROPIC_API_KEY',
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
  POST_INTERVAL_MIN_MS: 3 * 60 * 60 * 1000, // 3 hours (legacy)
  POST_INTERVAL_MAX_MS: 5 * 60 * 60 * 1000, // 5 hours (legacy)
  POSTS_PER_DAY: 2,
  MORNING_WINDOW_START_UTC: 7,
  MORNING_WINDOW_END_UTC: 10,
  EVENING_WINDOW_START_UTC: 17,
  EVENING_WINDOW_END_UTC: 21,
  THOUGHTLEADER_ACCOUNTS: [],
  PORT: 4020,
  NODE_ENV: 'development',
  LOG_LEVEL: 'info',
  ALERT_WEBHOOK_URL: '',
  ALERT_WEBHOOK_TYPE: 'generic',
  XAI_API_KEY: '',
  MENTION_MAX_RETRIES: 3,
  MENTION_CONVERSATION_COOLDOWN_MS: 24 * 60 * 60 * 1000,
  MENTION_PROCESSED_TTL_MS: 14 * 24 * 60 * 60 * 1000,
  NIKA_MENTION_STATE_FILE: '',
  SHARED_STATE_REDIS_URL: '',
  SHARED_STATE_PREFIX: 'nika:mentions',
  HOLDER_GATE_API_BASE_URL: '',
  HOLDER_GATE_API_SECRET: '',
  HOLDER_GATE_TIMEOUT_MS: 3000,
  HOLDER_GATE_CACHE_TTL_MS: 10 * 60 * 1000,
  NIKA_MENTION_ENGINE: 'kamiyo',
  NIKA_SESSION_REDIS_URL: '',
  NIKA_SESSION_PREFIX: 'nika:sessions',
  NIKA_REPO_WATCH_ENABLED: true,
  NIKA_REPO_WATCH_INTERVAL_MS: 6 * 60 * 60 * 1000,
  NIKA_REPO_ROOT: '',
  AUTONOMY_ENABLED: false,
  AUTONOMY_DRY_RUN: true,
  AUTONOMY_API_TOKEN: '',
  AUTONOMY_COMMAND_PREFIX: '/autonomy',
  AUTONOMY_TICK_INTERVAL_MS: 15_000,
  AUTONOMY_MAX_QUEUE_SIZE: 100,
  AUTONOMY_MAX_TASK_HISTORY: 500,
  AUTONOMY_OBJECTIVE_MAX_LENGTH: 1_200,
  AUTONOMY_MEISHI_VERIFY_URL: '',
  AUTONOMY_MEISHI_AGENT_ID: '',
  AUTONOMY_MEISHI_MIN_SCORE: 1,
  AUTONOMY_MEISHI_REQUIRE_COMPLIANT: true,
  AUTONOMY_X_COMMANDS_ENABLED: true,
  AUTONOMY_X_PUBLIC: false,
  AUTONOMY_X_ALLOWLIST: [],
  AUTONOMY_OPENCLAW_BASE_URL: 'http://127.0.0.1:18789',
  AUTONOMY_OPENCLAW_MODE: 'hooks',
  AUTONOMY_OPENCLAW_HOOK_PATH: '/hooks',
  AUTONOMY_OPENCLAW_HOOK_TOKEN: '',
  AUTONOMY_OPENCLAW_AGENT_ID: 'main',
  AUTONOMY_OPENCLAW_GATEWAY_TOKEN: '',
  AUTONOMY_OPENCLAW_CALLER_SESSION_KEY: 'main',
  AUTONOMY_OPENCLAW_TARGET_SESSION_PREFIX: 'hook:nika',
  AUTONOMY_OPENCLAW_RUN_TIMEOUT_SECONDS: 60,
  AUTONOMY_OPENCLAW_TIMEOUT_MS: 60_000,
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

function isValidRedisUrl(str: string): boolean {
  try {
    const url = new URL(str);
    return url.protocol === 'redis:' || url.protocol === 'rediss:';
  } catch {
    return false;
  }
}

function isValidPort(str: string): boolean {
  const port = parseInt(str);
  return !isNaN(port) && port >= 1 && port <= 65535;
}

function parseBoolean(input: string | undefined, fallback: boolean): boolean {
  if (input === undefined) return fallback;
  const normalized = input.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

function parseMentionEngine(
  raw: string | undefined,
  fallback: Config['NIKA_MENTION_ENGINE']
): Config['NIKA_MENTION_ENGINE'] {
  if (raw === undefined) return fallback;
  const normalized = raw.trim().toLowerCase();
  return normalized === 'claude_sdk' ? 'claude_sdk' : 'kamiyo';
}

function normalizeXUsername(input: string): string {
  return input.trim().replace(/^@/, '').toLowerCase();
}

function parseXAllowlist(raw: string | undefined): string[] {
  if (raw === undefined) return DEFAULTS.AUTONOMY_X_ALLOWLIST!;
  const normalized = raw
    .split(',')
    .map((entry) => normalizeXUsername(entry))
    .filter(Boolean);
  return Array.from(new Set(normalized));
}

function isValidXUsername(value: string): boolean {
  return /^[a-z0-9_]{1,15}$/.test(value);
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

  if (process.env.MENTION_MAX_RETRIES) {
    const retries = parseInt(process.env.MENTION_MAX_RETRIES, 10);
    if (isNaN(retries) || retries < 1 || retries > 20) {
      errors.push('MENTION_MAX_RETRIES must be an integer between 1 and 20');
    }
  }

  if (process.env.MENTION_CONVERSATION_COOLDOWN_MS) {
    const cooldownMs = parseInt(process.env.MENTION_CONVERSATION_COOLDOWN_MS, 10);
    if (isNaN(cooldownMs) || cooldownMs < 60000) {
      errors.push('MENTION_CONVERSATION_COOLDOWN_MS must be at least 60000');
    }
  }

  if (process.env.MENTION_PROCESSED_TTL_MS) {
    const ttlMs = parseInt(process.env.MENTION_PROCESSED_TTL_MS, 10);
    if (isNaN(ttlMs) || ttlMs < 60000) {
      errors.push('MENTION_PROCESSED_TTL_MS must be at least 60000');
    }
  }

  if (process.env.SHARED_STATE_REDIS_URL && !isValidRedisUrl(process.env.SHARED_STATE_REDIS_URL)) {
    errors.push('SHARED_STATE_REDIS_URL must be a valid redis:// or rediss:// URL');
  }

  if (process.env.SHARED_STATE_PREFIX !== undefined && process.env.SHARED_STATE_PREFIX.trim().length === 0) {
    errors.push('SHARED_STATE_PREFIX must not be empty when set');
  }

  if (process.env.HOLDER_GATE_API_BASE_URL && !isValidUrl(process.env.HOLDER_GATE_API_BASE_URL)) {
    errors.push('HOLDER_GATE_API_BASE_URL must be a valid URL');
  }

  const mentionEngine = parseMentionEngine(process.env.NIKA_MENTION_ENGINE, DEFAULTS.NIKA_MENTION_ENGINE!);
  if (process.env.NODE_ENV === 'production' && mentionEngine === 'claude_sdk') {
    if (!(process.env.HOLDER_GATE_API_BASE_URL || '').trim()) {
      errors.push('HOLDER_GATE_API_BASE_URL is required when NIKA_MENTION_ENGINE=claude_sdk in production');
    }
    if (!(process.env.HOLDER_GATE_API_SECRET || '').trim()) {
      errors.push('HOLDER_GATE_API_SECRET is required when NIKA_MENTION_ENGINE=claude_sdk in production');
    }
  }

  if (process.env.HOLDER_GATE_TIMEOUT_MS) {
    const timeout = parseInt(process.env.HOLDER_GATE_TIMEOUT_MS, 10);
    if (isNaN(timeout) || timeout < 250 || timeout > 30000) {
      errors.push('HOLDER_GATE_TIMEOUT_MS must be between 250 and 30000');
    }
  }

  if (process.env.HOLDER_GATE_CACHE_TTL_MS) {
    const ttl = parseInt(process.env.HOLDER_GATE_CACHE_TTL_MS, 10);
    if (isNaN(ttl) || ttl < 0 || ttl > 24 * 60 * 60 * 1000) {
      errors.push('HOLDER_GATE_CACHE_TTL_MS must be between 0 and 86400000');
    }
  }

  if (process.env.NIKA_SESSION_REDIS_URL && !isValidRedisUrl(process.env.NIKA_SESSION_REDIS_URL)) {
    errors.push('NIKA_SESSION_REDIS_URL must be a valid redis:// or rediss:// URL');
  }

  if (process.env.NIKA_SESSION_PREFIX !== undefined && process.env.NIKA_SESSION_PREFIX.trim().length === 0) {
    errors.push('NIKA_SESSION_PREFIX must not be empty when set');
  }

  if (process.env.NIKA_REPO_WATCH_INTERVAL_MS) {
    const intervalMs = parseInt(process.env.NIKA_REPO_WATCH_INTERVAL_MS, 10);
    if (isNaN(intervalMs) || intervalMs < 60_000) {
      errors.push('NIKA_REPO_WATCH_INTERVAL_MS must be at least 60000');
    }
  }

  if (process.env.AUTONOMY_TICK_INTERVAL_MS) {
    const tickIntervalMs = parseInt(process.env.AUTONOMY_TICK_INTERVAL_MS, 10);
    if (isNaN(tickIntervalMs) || tickIntervalMs < 1_000) {
      errors.push('AUTONOMY_TICK_INTERVAL_MS must be at least 1000');
    }
  }

  if (process.env.AUTONOMY_MAX_QUEUE_SIZE) {
    const maxQueueSize = parseInt(process.env.AUTONOMY_MAX_QUEUE_SIZE, 10);
    if (isNaN(maxQueueSize) || maxQueueSize < 1 || maxQueueSize > 10_000) {
      errors.push('AUTONOMY_MAX_QUEUE_SIZE must be between 1 and 10000');
    }
  }

  if (process.env.AUTONOMY_MAX_TASK_HISTORY) {
    const maxHistory = parseInt(process.env.AUTONOMY_MAX_TASK_HISTORY, 10);
    if (isNaN(maxHistory) || maxHistory < 10 || maxHistory > 100_000) {
      errors.push('AUTONOMY_MAX_TASK_HISTORY must be between 10 and 100000');
    }
  }

  if (process.env.AUTONOMY_OBJECTIVE_MAX_LENGTH) {
    const maxObjectiveLength = parseInt(process.env.AUTONOMY_OBJECTIVE_MAX_LENGTH, 10);
    if (isNaN(maxObjectiveLength) || maxObjectiveLength < 32 || maxObjectiveLength > 20_000) {
      errors.push('AUTONOMY_OBJECTIVE_MAX_LENGTH must be between 32 and 20000');
    }
  }

  if (process.env.AUTONOMY_MEISHI_MIN_SCORE) {
    const minScore = parseInt(process.env.AUTONOMY_MEISHI_MIN_SCORE, 10);
    if (isNaN(minScore) || minScore < -1_000 || minScore > 1_000) {
      errors.push('AUTONOMY_MEISHI_MIN_SCORE must be between -1000 and 1000');
    }
  }

  const autonomyEnabled = parseBoolean(process.env.AUTONOMY_ENABLED, DEFAULTS.AUTONOMY_ENABLED!);
  const autonomyDryRun = parseBoolean(process.env.AUTONOMY_DRY_RUN, DEFAULTS.AUTONOMY_DRY_RUN!);
  const autonomyXCommandsEnabled = parseBoolean(
    process.env.AUTONOMY_X_COMMANDS_ENABLED,
    DEFAULTS.AUTONOMY_X_COMMANDS_ENABLED!
  );
  const autonomyXPublic = parseBoolean(process.env.AUTONOMY_X_PUBLIC, DEFAULTS.AUTONOMY_X_PUBLIC!);
  const autonomyXAllowlist = parseXAllowlist(process.env.AUTONOMY_X_ALLOWLIST);

  if (autonomyEnabled) {
    const autonomyApiToken = (process.env.AUTONOMY_API_TOKEN || '').trim();
    if (!autonomyApiToken) {
      errors.push('AUTONOMY_API_TOKEN is required when AUTONOMY_ENABLED=true');
    }

    const meishiVerifyUrl = (process.env.AUTONOMY_MEISHI_VERIFY_URL || '').trim();
    if (!meishiVerifyUrl) {
      errors.push('AUTONOMY_MEISHI_VERIFY_URL is required when AUTONOMY_ENABLED=true');
    } else if (!isValidUrl(meishiVerifyUrl)) {
      errors.push('AUTONOMY_MEISHI_VERIFY_URL must be a valid URL');
    }

    if (!process.env.AUTONOMY_MEISHI_AGENT_ID?.trim()) {
      errors.push('AUTONOMY_MEISHI_AGENT_ID is required when AUTONOMY_ENABLED=true');
    }

    const openClawBaseUrl = (process.env.AUTONOMY_OPENCLAW_BASE_URL || DEFAULTS.AUTONOMY_OPENCLAW_BASE_URL!).trim();
    if (!isValidUrl(openClawBaseUrl)) {
      errors.push('AUTONOMY_OPENCLAW_BASE_URL must be a valid URL');
    }

    const modeRaw = (process.env.AUTONOMY_OPENCLAW_MODE || DEFAULTS.AUTONOMY_OPENCLAW_MODE!).trim().toLowerCase();
    if (!['hooks', 'tools_invoke'].includes(modeRaw)) {
      errors.push("AUTONOMY_OPENCLAW_MODE must be 'hooks' or 'tools_invoke'");
    }

    const hookPath = (process.env.AUTONOMY_OPENCLAW_HOOK_PATH || DEFAULTS.AUTONOMY_OPENCLAW_HOOK_PATH!).trim();
    if (!hookPath.startsWith('/')) {
      errors.push('AUTONOMY_OPENCLAW_HOOK_PATH must start with /');
    }

    const commandPrefix = (process.env.AUTONOMY_COMMAND_PREFIX || DEFAULTS.AUTONOMY_COMMAND_PREFIX!).trim();
    if (!commandPrefix) {
      errors.push('AUTONOMY_COMMAND_PREFIX must not be empty');
    }

    const runTimeoutRaw = process.env.AUTONOMY_OPENCLAW_RUN_TIMEOUT_SECONDS;
    if (runTimeoutRaw) {
      const timeoutSeconds = parseInt(runTimeoutRaw, 10);
      if (isNaN(timeoutSeconds) || timeoutSeconds < 0 || timeoutSeconds > 3600) {
        errors.push('AUTONOMY_OPENCLAW_RUN_TIMEOUT_SECONDS must be between 0 and 3600');
      }
    }

    const callerSessionKey = (process.env.AUTONOMY_OPENCLAW_CALLER_SESSION_KEY || DEFAULTS.AUTONOMY_OPENCLAW_CALLER_SESSION_KEY!).trim();
    if (!callerSessionKey) {
      errors.push('AUTONOMY_OPENCLAW_CALLER_SESSION_KEY must not be empty');
    }

    const targetSessionPrefix = (process.env.AUTONOMY_OPENCLAW_TARGET_SESSION_PREFIX || DEFAULTS.AUTONOMY_OPENCLAW_TARGET_SESSION_PREFIX!).trim();
    if (!targetSessionPrefix) {
      errors.push('AUTONOMY_OPENCLAW_TARGET_SESSION_PREFIX must not be empty');
    }

    const maxQueueSize = parseInt(
      process.env.AUTONOMY_MAX_QUEUE_SIZE || String(DEFAULTS.AUTONOMY_MAX_QUEUE_SIZE),
      10
    );
    const maxHistory = parseInt(
      process.env.AUTONOMY_MAX_TASK_HISTORY || String(DEFAULTS.AUTONOMY_MAX_TASK_HISTORY),
      10
    );
    if (Number.isFinite(maxQueueSize) && Number.isFinite(maxHistory) && maxHistory < maxQueueSize) {
      warnings.push('AUTONOMY_MAX_TASK_HISTORY is less than AUTONOMY_MAX_QUEUE_SIZE; task history trimming may be ineffective');
    }

    if (!autonomyDryRun) {
      const mode = modeRaw === 'tools_invoke' ? 'tools_invoke' : 'hooks';
      if (mode === 'hooks' && !(process.env.AUTONOMY_OPENCLAW_HOOK_TOKEN || '').trim()) {
        errors.push('AUTONOMY_OPENCLAW_HOOK_TOKEN is required when AUTONOMY_OPENCLAW_MODE=hooks and AUTONOMY_DRY_RUN=false');
      }

      if (mode === 'tools_invoke' && !(process.env.AUTONOMY_OPENCLAW_GATEWAY_TOKEN || '').trim()) {
        errors.push('AUTONOMY_OPENCLAW_GATEWAY_TOKEN is required when AUTONOMY_OPENCLAW_MODE=tools_invoke and AUTONOMY_DRY_RUN=false');
      }

      if (autonomyXCommandsEnabled && !autonomyXPublic && autonomyXAllowlist.length === 0) {
        errors.push('AUTONOMY_X_ALLOWLIST is required when AUTONOMY_X_COMMANDS_ENABLED=true and AUTONOMY_X_PUBLIC=false in live mode');
      }
    }

    if (process.env.AUTONOMY_X_ALLOWLIST) {
      const invalid = autonomyXAllowlist.filter((value) => !isValidXUsername(value));
      if (invalid.length > 0) {
        warnings.push(`AUTONOMY_X_ALLOWLIST contains invalid usernames: ${invalid.join(', ')}`);
      }
    }
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

  const openClawModeRaw = (process.env.AUTONOMY_OPENCLAW_MODE || DEFAULTS.AUTONOMY_OPENCLAW_MODE!)
    .trim()
    .toLowerCase();
  const openClawMode: Config['AUTONOMY_OPENCLAW_MODE'] =
    openClawModeRaw === 'tools_invoke' ? 'tools_invoke' : 'hooks';

  const mentionEngine = parseMentionEngine(process.env.NIKA_MENTION_ENGINE, DEFAULTS.NIKA_MENTION_ENGINE!);

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

    POSTS_PER_DAY: parseInt(process.env.POSTS_PER_DAY || String(DEFAULTS.POSTS_PER_DAY)),
    MORNING_WINDOW_START_UTC: parseInt(
      process.env.MORNING_WINDOW_START_UTC || String(DEFAULTS.MORNING_WINDOW_START_UTC)
    ),
    MORNING_WINDOW_END_UTC: parseInt(
      process.env.MORNING_WINDOW_END_UTC || String(DEFAULTS.MORNING_WINDOW_END_UTC)
    ),
    EVENING_WINDOW_START_UTC: parseInt(
      process.env.EVENING_WINDOW_START_UTC || String(DEFAULTS.EVENING_WINDOW_START_UTC)
    ),
    EVENING_WINDOW_END_UTC: parseInt(
      process.env.EVENING_WINDOW_END_UTC || String(DEFAULTS.EVENING_WINDOW_END_UTC)
    ),

    THOUGHTLEADER_ACCOUNTS: process.env.THOUGHTLEADER_ACCOUNTS
      ? process.env.THOUGHTLEADER_ACCOUNTS.split(',').map((s) => s.trim()).filter(Boolean)
      : DEFAULTS.THOUGHTLEADER_ACCOUNTS!,

    PORT: parseInt(process.env.PORT || String(DEFAULTS.PORT)),
    NODE_ENV: (process.env.NODE_ENV as Config['NODE_ENV']) || DEFAULTS.NODE_ENV!,
    LOG_LEVEL: (process.env.LOG_LEVEL as Config['LOG_LEVEL']) || DEFAULTS.LOG_LEVEL!,

    ALERT_WEBHOOK_URL: process.env.ALERT_WEBHOOK_URL || DEFAULTS.ALERT_WEBHOOK_URL!,
    ALERT_WEBHOOK_TYPE:
      (process.env.ALERT_WEBHOOK_TYPE as Config['ALERT_WEBHOOK_TYPE']) ||
      DEFAULTS.ALERT_WEBHOOK_TYPE!,

    XAI_API_KEY: process.env.XAI_API_KEY || DEFAULTS.XAI_API_KEY!,

    MENTION_MAX_RETRIES: parseInt(
      process.env.MENTION_MAX_RETRIES || String(DEFAULTS.MENTION_MAX_RETRIES),
      10
    ),
    MENTION_CONVERSATION_COOLDOWN_MS: parseInt(
      process.env.MENTION_CONVERSATION_COOLDOWN_MS || String(DEFAULTS.MENTION_CONVERSATION_COOLDOWN_MS),
      10
    ),
    MENTION_PROCESSED_TTL_MS: parseInt(
      process.env.MENTION_PROCESSED_TTL_MS || String(DEFAULTS.MENTION_PROCESSED_TTL_MS),
      10
    ),
    NIKA_MENTION_STATE_FILE: process.env.NIKA_MENTION_STATE_FILE || DEFAULTS.NIKA_MENTION_STATE_FILE!,
    SHARED_STATE_REDIS_URL: process.env.SHARED_STATE_REDIS_URL || DEFAULTS.SHARED_STATE_REDIS_URL!,
    SHARED_STATE_PREFIX: process.env.SHARED_STATE_PREFIX || DEFAULTS.SHARED_STATE_PREFIX!,
    HOLDER_GATE_API_BASE_URL: (process.env.HOLDER_GATE_API_BASE_URL || DEFAULTS.HOLDER_GATE_API_BASE_URL!).trim(),
    HOLDER_GATE_API_SECRET: (process.env.HOLDER_GATE_API_SECRET || DEFAULTS.HOLDER_GATE_API_SECRET!).trim(),
    HOLDER_GATE_TIMEOUT_MS: parseInt(
      process.env.HOLDER_GATE_TIMEOUT_MS || String(DEFAULTS.HOLDER_GATE_TIMEOUT_MS),
      10
    ),
    HOLDER_GATE_CACHE_TTL_MS: parseInt(
      process.env.HOLDER_GATE_CACHE_TTL_MS || String(DEFAULTS.HOLDER_GATE_CACHE_TTL_MS),
      10
    ),
    NIKA_MENTION_ENGINE: mentionEngine,
    NIKA_SESSION_REDIS_URL: (process.env.NIKA_SESSION_REDIS_URL || DEFAULTS.NIKA_SESSION_REDIS_URL!).trim(),
    NIKA_SESSION_PREFIX: (process.env.NIKA_SESSION_PREFIX || DEFAULTS.NIKA_SESSION_PREFIX!).trim(),
    NIKA_REPO_WATCH_ENABLED: parseBoolean(
      process.env.NIKA_REPO_WATCH_ENABLED,
      DEFAULTS.NIKA_REPO_WATCH_ENABLED!
    ),
    NIKA_REPO_WATCH_INTERVAL_MS: parseInt(
      process.env.NIKA_REPO_WATCH_INTERVAL_MS || String(DEFAULTS.NIKA_REPO_WATCH_INTERVAL_MS),
      10
    ),
    NIKA_REPO_ROOT: (process.env.NIKA_REPO_ROOT || DEFAULTS.NIKA_REPO_ROOT!).trim(),

    AUTONOMY_ENABLED: parseBoolean(process.env.AUTONOMY_ENABLED, DEFAULTS.AUTONOMY_ENABLED!),
    AUTONOMY_DRY_RUN: parseBoolean(process.env.AUTONOMY_DRY_RUN, DEFAULTS.AUTONOMY_DRY_RUN!),
    AUTONOMY_API_TOKEN: (process.env.AUTONOMY_API_TOKEN || DEFAULTS.AUTONOMY_API_TOKEN!).trim(),
    AUTONOMY_COMMAND_PREFIX: (process.env.AUTONOMY_COMMAND_PREFIX || DEFAULTS.AUTONOMY_COMMAND_PREFIX!).trim(),
    AUTONOMY_TICK_INTERVAL_MS: parseInt(
      process.env.AUTONOMY_TICK_INTERVAL_MS || String(DEFAULTS.AUTONOMY_TICK_INTERVAL_MS),
      10
    ),
    AUTONOMY_MAX_QUEUE_SIZE: parseInt(
      process.env.AUTONOMY_MAX_QUEUE_SIZE || String(DEFAULTS.AUTONOMY_MAX_QUEUE_SIZE),
      10
    ),
    AUTONOMY_MAX_TASK_HISTORY: parseInt(
      process.env.AUTONOMY_MAX_TASK_HISTORY || String(DEFAULTS.AUTONOMY_MAX_TASK_HISTORY),
      10
    ),
    AUTONOMY_OBJECTIVE_MAX_LENGTH: parseInt(
      process.env.AUTONOMY_OBJECTIVE_MAX_LENGTH || String(DEFAULTS.AUTONOMY_OBJECTIVE_MAX_LENGTH),
      10
    ),
    AUTONOMY_MEISHI_VERIFY_URL: (
      process.env.AUTONOMY_MEISHI_VERIFY_URL || DEFAULTS.AUTONOMY_MEISHI_VERIFY_URL!
    ).trim(),
    AUTONOMY_MEISHI_AGENT_ID: (
      process.env.AUTONOMY_MEISHI_AGENT_ID || DEFAULTS.AUTONOMY_MEISHI_AGENT_ID!
    ).trim(),
    AUTONOMY_MEISHI_MIN_SCORE: parseInt(
      process.env.AUTONOMY_MEISHI_MIN_SCORE || String(DEFAULTS.AUTONOMY_MEISHI_MIN_SCORE),
      10
    ),
    AUTONOMY_MEISHI_REQUIRE_COMPLIANT: parseBoolean(
      process.env.AUTONOMY_MEISHI_REQUIRE_COMPLIANT,
      DEFAULTS.AUTONOMY_MEISHI_REQUIRE_COMPLIANT!
    ),
    AUTONOMY_X_COMMANDS_ENABLED: parseBoolean(
      process.env.AUTONOMY_X_COMMANDS_ENABLED,
      DEFAULTS.AUTONOMY_X_COMMANDS_ENABLED!
    ),
    AUTONOMY_X_PUBLIC: parseBoolean(process.env.AUTONOMY_X_PUBLIC, DEFAULTS.AUTONOMY_X_PUBLIC!),
    AUTONOMY_X_ALLOWLIST: parseXAllowlist(process.env.AUTONOMY_X_ALLOWLIST),
    AUTONOMY_OPENCLAW_BASE_URL: (
      process.env.AUTONOMY_OPENCLAW_BASE_URL || DEFAULTS.AUTONOMY_OPENCLAW_BASE_URL!
    ).trim(),
    AUTONOMY_OPENCLAW_MODE: openClawMode,
    AUTONOMY_OPENCLAW_HOOK_PATH: (
      process.env.AUTONOMY_OPENCLAW_HOOK_PATH || DEFAULTS.AUTONOMY_OPENCLAW_HOOK_PATH!
    ).trim(),
    AUTONOMY_OPENCLAW_HOOK_TOKEN: (
      process.env.AUTONOMY_OPENCLAW_HOOK_TOKEN || DEFAULTS.AUTONOMY_OPENCLAW_HOOK_TOKEN!
    ).trim(),
    AUTONOMY_OPENCLAW_AGENT_ID: (
      process.env.AUTONOMY_OPENCLAW_AGENT_ID || DEFAULTS.AUTONOMY_OPENCLAW_AGENT_ID!
    ).trim(),
    AUTONOMY_OPENCLAW_GATEWAY_TOKEN: (
      process.env.AUTONOMY_OPENCLAW_GATEWAY_TOKEN || DEFAULTS.AUTONOMY_OPENCLAW_GATEWAY_TOKEN!
    ).trim(),
    AUTONOMY_OPENCLAW_CALLER_SESSION_KEY: (
      process.env.AUTONOMY_OPENCLAW_CALLER_SESSION_KEY || DEFAULTS.AUTONOMY_OPENCLAW_CALLER_SESSION_KEY!
    ).trim(),
    AUTONOMY_OPENCLAW_TARGET_SESSION_PREFIX: (
      process.env.AUTONOMY_OPENCLAW_TARGET_SESSION_PREFIX || DEFAULTS.AUTONOMY_OPENCLAW_TARGET_SESSION_PREFIX!
    ).trim(),
    AUTONOMY_OPENCLAW_RUN_TIMEOUT_SECONDS: parseInt(
      process.env.AUTONOMY_OPENCLAW_RUN_TIMEOUT_SECONDS || String(DEFAULTS.AUTONOMY_OPENCLAW_RUN_TIMEOUT_SECONDS),
      10
    ),
    AUTONOMY_OPENCLAW_TIMEOUT_MS: parseInt(
      process.env.AUTONOMY_OPENCLAW_TIMEOUT_MS || String(DEFAULTS.AUTONOMY_OPENCLAW_TIMEOUT_MS),
      10
    ),
  };

  return cachedConfig!;
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
    MENTION_MAX_RETRIES: String(config.MENTION_MAX_RETRIES),
    MENTION_CONVERSATION_COOLDOWN_MS: String(config.MENTION_CONVERSATION_COOLDOWN_MS),
    MENTION_PROCESSED_TTL_MS: String(config.MENTION_PROCESSED_TTL_MS),
    NIKA_MENTION_STATE_FILE: config.NIKA_MENTION_STATE_FILE || '(default)',
    SHARED_STATE_REDIS_URL: config.SHARED_STATE_REDIS_URL ? '[CONFIGURED]' : '(not set)',
    SHARED_STATE_PREFIX: config.SHARED_STATE_PREFIX,
    HOLDER_GATE_API_BASE_URL: config.HOLDER_GATE_API_BASE_URL || '(not set)',
    HOLDER_GATE_API_SECRET: config.HOLDER_GATE_API_SECRET ? '[CONFIGURED]' : '(not set)',
    HOLDER_GATE_TIMEOUT_MS: String(config.HOLDER_GATE_TIMEOUT_MS),
    HOLDER_GATE_CACHE_TTL_MS: String(config.HOLDER_GATE_CACHE_TTL_MS),
    NIKA_MENTION_ENGINE: config.NIKA_MENTION_ENGINE,
    NIKA_SESSION_REDIS_URL: config.NIKA_SESSION_REDIS_URL ? '[CONFIGURED]' : '(not set)',
    NIKA_SESSION_PREFIX: config.NIKA_SESSION_PREFIX,
    NIKA_REPO_WATCH_ENABLED: String(config.NIKA_REPO_WATCH_ENABLED),
    NIKA_REPO_WATCH_INTERVAL_MS: String(config.NIKA_REPO_WATCH_INTERVAL_MS),
    NIKA_REPO_ROOT: config.NIKA_REPO_ROOT || '(auto)',
    AUTONOMY_ENABLED: String(config.AUTONOMY_ENABLED),
    AUTONOMY_DRY_RUN: String(config.AUTONOMY_DRY_RUN),
    AUTONOMY_API_TOKEN: config.AUTONOMY_API_TOKEN ? '[CONFIGURED]' : '(not set)',
    AUTONOMY_COMMAND_PREFIX: config.AUTONOMY_COMMAND_PREFIX,
    AUTONOMY_TICK_INTERVAL_MS: String(config.AUTONOMY_TICK_INTERVAL_MS),
    AUTONOMY_MAX_QUEUE_SIZE: String(config.AUTONOMY_MAX_QUEUE_SIZE),
    AUTONOMY_MAX_TASK_HISTORY: String(config.AUTONOMY_MAX_TASK_HISTORY),
    AUTONOMY_OBJECTIVE_MAX_LENGTH: String(config.AUTONOMY_OBJECTIVE_MAX_LENGTH),
    AUTONOMY_MEISHI_VERIFY_URL: config.AUTONOMY_MEISHI_VERIFY_URL || '(not set)',
    AUTONOMY_MEISHI_AGENT_ID: config.AUTONOMY_MEISHI_AGENT_ID || '(not set)',
    AUTONOMY_MEISHI_MIN_SCORE: String(config.AUTONOMY_MEISHI_MIN_SCORE),
    AUTONOMY_MEISHI_REQUIRE_COMPLIANT: String(config.AUTONOMY_MEISHI_REQUIRE_COMPLIANT),
    AUTONOMY_X_COMMANDS_ENABLED: String(config.AUTONOMY_X_COMMANDS_ENABLED),
    AUTONOMY_X_PUBLIC: String(config.AUTONOMY_X_PUBLIC),
    AUTONOMY_X_ALLOWLIST:
      config.AUTONOMY_X_ALLOWLIST.length > 0 ? config.AUTONOMY_X_ALLOWLIST.join(',') : '(not set)',
    AUTONOMY_OPENCLAW_BASE_URL: config.AUTONOMY_OPENCLAW_BASE_URL,
    AUTONOMY_OPENCLAW_MODE: config.AUTONOMY_OPENCLAW_MODE,
    AUTONOMY_OPENCLAW_HOOK_PATH: config.AUTONOMY_OPENCLAW_HOOK_PATH,
    AUTONOMY_OPENCLAW_HOOK_TOKEN: config.AUTONOMY_OPENCLAW_HOOK_TOKEN ? '[CONFIGURED]' : '(not set)',
    AUTONOMY_OPENCLAW_AGENT_ID: config.AUTONOMY_OPENCLAW_AGENT_ID,
    AUTONOMY_OPENCLAW_GATEWAY_TOKEN: config.AUTONOMY_OPENCLAW_GATEWAY_TOKEN ? '[CONFIGURED]' : '(not set)',
    AUTONOMY_OPENCLAW_CALLER_SESSION_KEY: config.AUTONOMY_OPENCLAW_CALLER_SESSION_KEY,
    AUTONOMY_OPENCLAW_TARGET_SESSION_PREFIX: config.AUTONOMY_OPENCLAW_TARGET_SESSION_PREFIX,
    AUTONOMY_OPENCLAW_RUN_TIMEOUT_SECONDS: String(config.AUTONOMY_OPENCLAW_RUN_TIMEOUT_SECONDS),
    AUTONOMY_OPENCLAW_TIMEOUT_MS: String(config.AUTONOMY_OPENCLAW_TIMEOUT_MS),
  };
}
