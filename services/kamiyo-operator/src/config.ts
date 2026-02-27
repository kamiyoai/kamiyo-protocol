import { config as loadDotenv } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const CONFIG_DIR = path.dirname(fileURLToPath(import.meta.url));
loadDotenv({ path: path.resolve(CONFIG_DIR, '../.env') });

const optionalNonEmptyString = z.preprocess(v => {
  if (typeof v !== 'string') return v;
  const trimmed = v.trim();
  return trimmed ? trimmed : undefined;
}, z.string().min(1).optional());

const csvList = z
  .string()
  .default('')
  .transform(value =>
    value
      .split(',')
      .map(item => item.trim())
      .filter(Boolean)
  );

const envSchema = z
  .object({
  SOLANA_RPC_URL: z.string().url().default('https://api.mainnet-beta.solana.com'),
  SOLANA_RPC_FALLBACK_URLS: csvList,
  KAMIYO_RPC_READ_TIMEOUT_MS: z.coerce.number().int().positive().default(12_000),
  KAMIYO_RPC_READ_RETRIES: z.coerce.number().int().nonnegative().default(2),

  KAMIYO_OPERATOR_KEYPAIR_PATH: optionalNonEmptyString,
  KAMIYO_OPERATOR_PRIVATE_KEY: optionalNonEmptyString,

  KAMIYO_IDENTITY: z
    .enum(['kamiyo', 'kyoshin', 'kyushin'])
    .default('kyoshin')
    .transform(v => (v === 'kyushin' ? 'kyoshin' : v)),

  KAMIYO_AGENT_NAME: z.string().min(1).default('kamiyo-operator'),
  KAMIYO_AUTO_CREATE_AGENT: z
    .enum(['true', 'false'])
    .default('false')
    .transform(v => v === 'true'),
  KAMIYO_AGENT_TYPE: z.enum(['Trading', 'Service', 'Oracle', 'Custom']).default('Service'),
  KAMIYO_AGENT_STAKE_SOL: z.coerce.number().positive().default(0.5),

  KAMIYO_TARGET_MINT: optionalNonEmptyString,
  KAMIYO_FEE_VAULT: optionalNonEmptyString,
  KAMIYO_STAKING_POOL: optionalNonEmptyString,
  KAMIYO_FUNDRY_API_BASE_URL: z.string().url().default('https://fundry.collaterize.com'),
  KAMIYO_FUNDRY_HTTP_RETRIES: z.coerce.number().int().nonnegative().default(3),
  KAMIYO_FUNDRY_HTTP_BASE_BACKOFF_MS: z.coerce.number().int().positive().default(350),
  KAMIYO_FUNDRY_HTTP_MAX_BACKOFF_MS: z.coerce.number().int().positive().default(5000),
  KAMIYO_FUNDRY_METRICS_WINDOW_MINUTES: z.coerce.number().int().positive().default(60),
  KAMIYO_KYOSHIN_STAKING_POOL: optionalNonEmptyString,
  KAMIYO_KYOSHIN_CLAIMER_KEYPAIR_PATH: optionalNonEmptyString,
  KAMIYO_KYOSHIN_CLAIMER_PRIVATE_KEY: optionalNonEmptyString,
  KAMIYO_PRIME_DIRECTIVE: z
    .string()
    .min(1)
    .default(
      'Work for $KAMIYO: maximize SOL fees/revenue and route that SOL into the $KAMIYO staking pool so $KAMIYO stakers are paid.'
    ),
  KAMIYO_DKG_ACTIVITY_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform(v => v === 'true'),
  KAMIYO_DKG_ENDPOINT: optionalNonEmptyString,
  KAMIYO_DKG_PORT: z.coerce.number().int().positive().default(8900),
  KAMIYO_DKG_BLOCKCHAIN: z.enum(['base:8453', 'gnosis:100', 'otp:2043']).default('base:8453'),
  KAMIYO_DKG_PRIVATE_KEY: optionalNonEmptyString,
  KAMIYO_DKG_PARANET_UAL: optionalNonEmptyString,
  KAMIYO_DKG_AGENT_ID: optionalNonEmptyString,
  KAMIYO_DKG_AUDIT_SOURCE: z.string().min(1).default('kamiyo-operator'),
  KAMIYO_DKG_JURISDICTION: z.string().min(1).default('global'),
  KAMIYO_DKG_EPOCHS: z.coerce.number().int().positive().default(12),
  KAMIYO_DKG_RATE_LIMIT_COOLDOWN_SECONDS: z.coerce.number().int().positive().default(600),
  KAMIYO_MEISHI_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform(v => v === 'true'),
  KAMIYO_MEISHI_PROGRAM_ID: optionalNonEmptyString,
  KAMIYO_MEISHI_AGENT_PROGRAM_ID: optionalNonEmptyString,
  KAMIYO_MEISHI_AUTO_CREATE_AGENT: z
    .enum(['true', 'false'])
    .default('true')
    .transform(v => v === 'true'),
  KAMIYO_MEISHI_JURISDICTION: z.enum(['global', 'eu', 'us', 'uk', 'apac']).default('global'),
  KAMIYO_MEISHI_AUTO_CREATE_PASSPORT: z
    .enum(['true', 'false'])
    .default('true')
    .transform(v => v === 'true'),
  KAMIYO_MEISHI_AUTO_SET_MANDATE: z
    .enum(['true', 'false'])
    .default('true')
    .transform(v => v === 'true'),
  KAMIYO_MEISHI_AUTO_BASELINE_AUDIT: z
    .enum(['true', 'false'])
    .default('true')
    .transform(v => v === 'true'),
  KAMIYO_MEISHI_BASELINE_SCORE: z.coerce.number().int().min(-1000).max(1000).default(650),
  KAMIYO_MEISHI_MANDATE_DURATION_DAYS: z.coerce.number().int().min(1).max(365).default(30),
  KAMIYO_MEISHI_TX_LIMIT_USD: z.coerce.number().positive().default(500),
  KAMIYO_MEISHI_DAILY_LIMIT_USD: z.coerce.number().positive().default(2500),
  KAMIYO_MEISHI_MONTHLY_LIMIT_USD: z.coerce.number().positive().default(25000),
  KAMIYO_MEISHI_HUMAN_APPROVAL_USD: z.coerce.number().positive().default(250),
  KAMIYO_MEISHI_FINDINGS_PREFIX: z.string().min(1).default('urn:kamiyo:meishi:kyoshin'),
  KAMIYO_MEISHI_CATEGORY_WHITELIST_HEX: optionalNonEmptyString,
  KAMIYO_MEISHI_MERCHANT_WHITELIST_HEX: optionalNonEmptyString,

  KAMIYO_MODE: z.enum(['propose', 'execute']).default('propose'),
  KAMIYO_RUN_ONCE: z
    .enum(['true', 'false'])
    .default('false')
    .transform(v => v === 'true'),
  KAMIYO_LOCK_PATH: z.string().default('output/kamiyo-operator/runner.lock'),
  KAMIYO_STUCK_TICK_TIMEOUT_MINUTES: z.coerce.number().int().positive().default(70),
  KAMIYO_TICK_TIMEOUT_MINUTES: z.coerce.number().int().positive().default(10),
  KAMIYO_TICK_SOFT_TIMEOUT_BUFFER_SECONDS: z.coerce.number().int().nonnegative().default(45),
  KAMIYO_TICK_MIN_REMAINING_MS_FOR_SWARM_AGENT: z.coerce.number().int().positive().default(30_000),
  KAMIYO_TICK_MIN_REMAINING_MS_FOR_LLM: z.coerce.number().int().positive().default(75_000),

  KAMIYO_SOL_DAILY_CAP: z.coerce.number().positive().default(0.1),
  KAMIYO_SOL_PER_TX_CAP: z.coerce.number().positive().default(0.02),
  KAMIYO_MAX_TX_PER_DAY: z.coerce.number().int().positive().default(25),
  KAMIYO_MAX_FEE_CLAIMS_PER_DAY: z.coerce.number().int().positive().default(1),
  KAMIYO_AUTO_CLAIM_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform(v => v === 'true'),
  KAMIYO_AUTO_CLAIM_MIN_LAMPORTS: z.coerce.number().int().nonnegative().default(1_000_000),
  KAMIYO_KYOSHIN_AUTO_CLAIM_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform(v => v === 'true'),
  KAMIYO_KYOSHIN_AUTO_CLAIM_MIN_LAMPORTS: z.coerce.number().int().nonnegative().default(0),
  KAMIYO_KYOSHIN_AUTO_CLAIM_MAX_PERIODS_PER_RUN: z.coerce.number().int().positive().default(8),
  KAMIYO_AUTO_STAKE_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform(v => v === 'true'),
  KAMIYO_AUTO_STAKE_MIN_LAMPORTS: z.coerce.number().int().nonnegative().default(50_000_000),
  KAMIYO_AUTO_STAKE_RESERVE_LAMPORTS: z.coerce.number().int().nonnegative().default(200_000_000),
  KAMIYO_AUTO_STAKE_AVAILABLE_BPS: z.coerce.number().int().min(1).max(10_000).default(5000),
  KAMIYO_AUTO_STAKE_MAX_LAMPORTS_PER_TX: z.coerce.number().int().nonnegative().default(0),
  KAMIYO_AUTO_STAKE_MAX_FEEDS_PER_DAY: z.coerce.number().int().positive().default(24),

  KAMIYO_LLM_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform(v => v === 'true'),
  ANTHROPIC_API_KEY: optionalNonEmptyString,
  ANTHROPIC_MODEL: z.string().min(1).default('claude-opus-4-20250514'),
  ANTHROPIC_TEMPERATURE: z.coerce.number().min(0).max(1).default(0.3),
  ANTHROPIC_TOOL_CHOICE: z.enum(['auto', 'any', 'none']).default('auto'),
  ANTHROPIC_DISABLE_PARALLEL_TOOL_USE: z
    .enum(['true', 'false'])
    .default('false')
    .transform(v => v === 'true'),
  ANTHROPIC_THINKING_BUDGET_TOKENS: z.coerce.number().int().nonnegative().default(1024),
  KAMIYO_MAX_OUTPUT_TOKENS_PER_TURN: z.coerce.number().int().positive().default(2048),
  KAMIYO_MAX_TURNS_PER_TICK: z.coerce.number().int().positive().default(6),
  KAMIYO_ANTHROPIC_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(60_000),

  KAMIYO_LLM_MAX_TURNS_PER_DAY: z.coerce.number().int().positive().default(24),
  KAMIYO_LLM_MAX_INPUT_TOKENS_PER_DAY: z.coerce.number().int().positive().default(150_000),
  KAMIYO_LLM_MAX_OUTPUT_TOKENS_PER_DAY: z.coerce.number().int().positive().default(30_000),

  KAMIYO_LOOP_INTERVAL_SECONDS: z.coerce.number().int().positive().default(3600),
  KAMIYO_METRICS_HTTP_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform(v => v === 'true'),
  KAMIYO_METRICS_HTTP_HOST: z.string().min(1).default('127.0.0.1'),
  KAMIYO_METRICS_HTTP_PORT: z.coerce.number().int().positive().default(9464),
  KAMIYO_METRICS_HTTP_PATH: z.string().min(1).default('/metrics'),
  KAMIYO_SWARM_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform(v => v === 'true'),
  KAMIYO_SWARM_PROPOSE_ONLY: z
    .enum(['true', 'false'])
    .default('true')
    .transform(v => v === 'true'),
  KAMIYO_SWARM_REGISTRY_PATH: z.string().default('output/kamiyo-operator/swarm.registry.json'),
  KAMIYO_SWARM_MISSIONS_PER_TICK: z.coerce.number().int().positive().default(3),
  KAMIYO_SWARM_MAX_ACTIVE_AGENTS: z.coerce.number().int().positive().default(5),
  KAMIYO_SWARM_JOB_INTAKE_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform(v => v === 'true'),
  KAMIYO_SWARM_JOB_FEED_PATH: z.string().default('output/kamiyo-operator/swarm.jobs.json'),
  KAMIYO_SWARM_JOB_FEED_URLS: csvList,
  KAMIYO_SWARM_RELEVANCE_FEED_URL: optionalNonEmptyString,
  KAMIYO_SWARM_RELEVANCE_API_KEY: optionalNonEmptyString,
  KAMIYO_SWARM_RELEVANCE_AUTH_HEADER: z.string().min(1).default('authorization'),
  KAMIYO_SWARM_AGENTAI_FEED_URL: optionalNonEmptyString,
  KAMIYO_SWARM_AGENTAI_API_KEY: optionalNonEmptyString,
  KAMIYO_SWARM_AGENTAI_AUTH_HEADER: z.string().min(1).default('authorization'),
  KAMIYO_SWARM_KORE_FEED_URL: optionalNonEmptyString,
  KAMIYO_SWARM_KORE_API_KEY: optionalNonEmptyString,
  KAMIYO_SWARM_KORE_AUTH_HEADER: z.string().min(1).default('authorization'),
  KAMIYO_SWARM_JOB_MAX_OPEN: z.coerce.number().int().positive().default(12),
  KAMIYO_SWARM_JOB_MIN_REWARD_USD: z.coerce.number().nonnegative().default(5),
  KAMIYO_SWARM_LEAD_CONVERSION_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform(v => v === 'true'),
  KAMIYO_SWARM_LEAD_CONVERSION_MAX_PER_TICK: z.coerce.number().int().positive().default(4),
  KAMIYO_SWARM_LEAD_CONVERSION_DEFAULT_PAYOUT_USD: z.coerce.number().nonnegative().default(12),
  KAMIYO_SWARM_LEAD_CONVERSION_REQUIRE_ENDPOINT: z
    .enum(['true', 'false'])
    .default('true')
    .transform(v => v === 'true'),
  KAMIYO_SWARM_LEAD_CONVERSION_SIMULATE_ONLY: z
    .enum(['true', 'false'])
    .default('false')
    .transform(v => v === 'true'),
  KAMIYO_SWARM_LEAD_CONVERSION_MIN_CONFIDENCE: z.coerce.number().min(0).max(1).default(0.6),
  KAMIYO_SWARM_LEAD_CONTRACT_VALIDATION_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform(v => v === 'true'),
  KAMIYO_SWARM_SOURCE_FEEDBACK_WINDOW_HOURS: z.coerce.number().int().positive().default(168),
  KAMIYO_SWARM_SOURCE_FEEDBACK_MIN_SAMPLES: z.coerce.number().int().positive().default(3),
  KAMIYO_SWARM_SOL_PRICE_USD: z.coerce.number().positive().default(150),
  KAMIYO_SWARM_JOB_FETCH_TIMEOUT_MS: z.coerce.number().int().positive().default(8000),
  KAMIYO_SWARM_JOB_EXECUTION_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform(v => v === 'true'),
  KAMIYO_SWARM_JOB_EXECUTIONS_PER_TICK: z.coerce.number().int().positive().default(2),
  KAMIYO_SWARM_JOB_HTTP_TIMEOUT_MS: z.coerce.number().int().positive().default(20_000),
  KAMIYO_SWARM_JOB_MIN_MARGIN_SOL: z.coerce.number().nonnegative().default(0.0005),
  KAMIYO_SWARM_JOB_ESTIMATED_FEE_SOL: z.coerce.number().nonnegative().default(0.00001),
  KAMIYO_SWARM_JOB_REQUIRE_EXPECTED_REWARD: z
    .enum(['true', 'false'])
    .default('false')
    .transform(v => v === 'true'),
  KAMIYO_SWARM_X402_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform(v => v === 'true'),
  KAMIYO_SWARM_X402_MAX_PRICE_USD: z.coerce.number().positive().default(2),
  KAMIYO_SWARM_X402_PREFERRED_NETWORK: z.string().min(1).default('solana:mainnet'),
  KAMIYO_SWARM_X402_FACILITATOR_POLICY: z
    .enum(['auto', 'prefer-kamiyo', 'force-kamiyo', 'disable-kamiyo'])
    .default('prefer-kamiyo'),
  KAMIYO_SWARM_CIRCUIT_BREAKER_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform(v => v === 'true'),
  KAMIYO_SWARM_CIRCUIT_NEG_MARGIN_STREAK: z.coerce.number().int().positive().default(3),
  KAMIYO_SWARM_CIRCUIT_COOLDOWN_MINUTES: z.coerce.number().int().positive().default(180),
  KAMIYO_SWARM_CIRCUIT_STATE_KEEP_DAYS: z.coerce.number().int().positive().default(30),
  KAMIYO_SWARM_REVENUE_REPORT_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform(v => v === 'true'),
  KAMIYO_SWARM_REVENUE_REPORT_INTERVAL_MINUTES: z.coerce.number().int().positive().default(60),
  KAMIYO_SWARM_SLO_REPORT_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform(v => v === 'true'),
  KAMIYO_SWARM_SLO_REPORT_WINDOW_DAYS: z.coerce.number().int().positive().default(30),
  KAMIYO_SWARM_SLO_REPORT_INTERVAL_HOURS: z.coerce.number().int().positive().default(24),
  KAMIYO_SWARM_SLO_ALERT_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform(v => v === 'true'),
  KAMIYO_SWARM_SLO_ALERT_COOLDOWN_HOURS: z.coerce.number().int().positive().default(6),
  KAMIYO_SWARM_SLO_ALERT_WEBHOOK_URL: optionalNonEmptyString,
  KAMIYO_SWARM_SLO_ALERT_WEBHOOK_SECRET: optionalNonEmptyString,
  KAMIYO_SWARM_SLO_ALERT_WEBHOOK_TIMEOUT_MS: z.coerce.number().int().positive().default(8000),
  KAMIYO_SWARM_ROLLBACK_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform(v => v === 'true'),
  KAMIYO_SWARM_ROLLBACK_EVAL_INTERVAL_HOURS: z.coerce.number().int().positive().default(24),
  KAMIYO_SWARM_ROLLBACK_WINDOW_DAYS: z.coerce.number().int().positive().default(7),
  KAMIYO_SWARM_ROLLBACK_NET_SOL_TRIGGER: z.coerce.number().default(-0.02),
  KAMIYO_SWARM_ROLLBACK_RECOVERY_NET_SOL: z.coerce.number().default(0),
  KAMIYO_SWARM_ROLLBACK_MIN_JOBS: z.coerce.number().int().positive().default(5),
  KAMIYO_SWARM_ROLLBACK_SOURCE_MIN_JOBS: z.coerce.number().int().positive().default(2),
  KAMIYO_SWARM_ROLLBACK_MAX_DISABLED_SOURCES: z.coerce.number().int().positive().default(2),
  KAMIYO_SWARM_ROLLBACK_COOLDOWN_HOURS: z.coerce.number().int().positive().default(24),
  KAMIYO_SWARM_WEEKLY_SUMMARY_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform(v => v === 'true'),
  KAMIYO_SWARM_WEEKLY_SUMMARY_INTERVAL_HOURS: z.coerce.number().int().positive().default(168),
  KAMIYO_RETENTION_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform(v => v === 'true'),
  KAMIYO_RETENTION_INTERVAL_MINUTES: z.coerce.number().int().positive().default(360),
  KAMIYO_RETENTION_TICKS_DAYS: z.coerce.number().int().positive().default(30),
  KAMIYO_RETENTION_OBSERVATIONS_DAYS: z.coerce.number().int().positive().default(30),
  KAMIYO_RETENTION_ACTIONS_DAYS: z.coerce.number().int().positive().default(30),
  KAMIYO_RETENTION_LLM_USAGE_DAYS: z.coerce.number().int().positive().default(30),
  KAMIYO_RETENTION_OUTBOX_DAYS: z.coerce.number().int().positive().default(14),
  KAMIYO_RETENTION_OUTBOX_MAX_FILES: z.coerce.number().int().nonnegative().default(3000),

  KAMIYO_ANNOUNCE_CHANNELS: z
    .string()
    .default('x,telegram')
    .transform(s =>
      s
        .split(',')
        .map(v => v.trim())
        .filter(Boolean)
    ),

  KAMIYO_DB_PATH: z.string().default('output/kamiyo-operator/state.db'),
  KAMIYO_OUTBOX_DIR: z.string().default('output/kamiyo-operator/outbox'),
  KAMIYO_ALERT_STALE_MINUTES: z.coerce.number().int().positive().default(70),
  KAMIYO_ALERT_RUNNING_STALE_MINUTES: z.coerce.number().int().positive().default(70),
  KAMIYO_ALERT_CLAIM_ERROR_LOOKBACK_HOURS: z.coerce.number().int().positive().default(24),
  KAMIYO_ALERT_STAKE_ERROR_LOOKBACK_HOURS: z.coerce.number().int().positive().default(24),
  KAMIYO_ALERT_FUNDRY_LOOKBACK_HOURS: z.coerce.number().int().positive().default(1),
  KAMIYO_ALERT_FUNDRY_MIN_ATTEMPTS: z.coerce.number().int().nonnegative().default(5),
  KAMIYO_ALERT_FUNDRY_MAX_ERROR_RATE: z.coerce.number().min(0).max(1).default(0.25),
  KAMIYO_ALERT_FUNDRY_MAX_429_COUNT: z.coerce.number().int().nonnegative().default(8),
  })
  .superRefine((value, ctx) => {
    if (value.KAMIYO_LLM_ENABLED && !value.ANTHROPIC_API_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['ANTHROPIC_API_KEY'],
        message: 'ANTHROPIC_API_KEY is required when KAMIYO_LLM_ENABLED=true',
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

export const env = envSchema.parse(process.env);
