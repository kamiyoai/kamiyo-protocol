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

const envSchema = z.object({
  SOLANA_RPC_URL: z.string().url().default('https://api.mainnet-beta.solana.com'),
  SOLANA_RPC_FALLBACK_URLS: csvList,
  KAMIYO_RPC_READ_TIMEOUT_MS: z.coerce.number().int().positive().default(12_000),
  KAMIYO_RPC_READ_RETRIES: z.coerce.number().int().nonnegative().default(2),

  KAMIYO_OPERATOR_KEYPAIR_PATH: optionalNonEmptyString,
  KAMIYO_OPERATOR_PRIVATE_KEY: optionalNonEmptyString,

  KAMIYO_MODE: z.enum(['propose', 'execute']).default('propose'),
  KAMIYO_EXECUTION_STAGE: z.enum(['canary_0', 'canary_1', 'canary_2', 'full']).default('canary_0'),
  KAMIYO_EXECUTION_HARD_STOP: z
    .enum(['true', 'false'])
    .default('false')
    .transform(v => v === 'true'),
  KAMIYO_RUN_ONCE: z
    .enum(['true', 'false'])
    .default('false')
    .transform(v => v === 'true'),
  KAMIYO_LOOP_INTERVAL_SECONDS: z.coerce.number().int().positive().default(180),

  KAMIYO_DB_PATH: z.string().default('output/kyoshin/state.db'),
  KAMIYO_OUTBOX_DIR: z.string().default('output/kyoshin/outbox'),
  KAMIYO_RETENTION_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform(v => v === 'true'),
  KAMIYO_RETENTION_INTERVAL_MINUTES: z.coerce.number().int().positive().default(360),
  KAMIYO_RETENTION_TICKS_DAYS: z.coerce.number().int().positive().default(30),
  KAMIYO_RETENTION_OBSERVATIONS_DAYS: z.coerce.number().int().positive().default(30),
  KAMIYO_RETENTION_ACTIONS_DAYS: z.coerce.number().int().positive().default(30),
  KAMIYO_RETENTION_LLM_USAGE_DAYS: z.coerce.number().int().positive().default(30),

  KAMIYO_SOL_DAILY_CAP: z.coerce.number().positive().default(0.1),
  KAMIYO_SOL_PER_TX_CAP: z.coerce.number().positive().default(0.02),
  KAMIYO_MAX_TX_PER_DAY: z.coerce.number().int().positive().default(25),
  KAMIYO_MAX_FEE_CLAIMS_PER_DAY: z.coerce.number().int().positive().default(1),

  KAMIYO_FEE_VAULT: optionalNonEmptyString,
  KAMIYO_AUTO_CLAIM_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform(v => v === 'true'),
  KAMIYO_AUTO_CLAIM_MIN_LAMPORTS: z.coerce.number().int().nonnegative().default(1_000_000),

  KAMIYO_STAKING_POOL: optionalNonEmptyString,
  KAMIYO_ALLOWED_STAKING_POOLS: csvList,
  KAMIYO_REQUIRE_STAKING_POOL_ALLOWLIST: z
    .enum(['true', 'false'])
    .default('true')
    .transform(v => v === 'true'),
  KAMIYO_AUTO_STAKE_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform(v => v === 'true'),
  KAMIYO_AUTO_STAKE_MIN_LAMPORTS: z.coerce.number().int().nonnegative().default(50_000_000),
  KAMIYO_AUTO_STAKE_RESERVE_LAMPORTS: z.coerce.number().int().nonnegative().default(200_000_000),
  KAMIYO_AUTO_STAKE_AVAILABLE_BPS: z.coerce.number().int().min(1).max(10_000).default(5000),
  KAMIYO_AUTO_STAKE_MAX_LAMPORTS_PER_TX: z.coerce.number().int().nonnegative().default(0),
  KAMIYO_AUTO_STAKE_MAX_FEEDS_PER_DAY: z.coerce.number().int().positive().default(24),

  KAMIYO_KYOSHIN_STAKING_POOL: optionalNonEmptyString,
  KAMIYO_FUNDRY_API_BASE_URL: z.string().url().default('https://fundry.collaterize.com'),
  KAMIYO_KYOSHIN_CLAIMER_KEYPAIR_PATH: optionalNonEmptyString,
  KAMIYO_KYOSHIN_CLAIMER_PRIVATE_KEY: optionalNonEmptyString,
  KAMIYO_KYOSHIN_AUTO_CLAIM_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform(v => v === 'true'),
  KAMIYO_KYOSHIN_AUTO_CLAIM_MIN_LAMPORTS: z.coerce.number().int().nonnegative().default(0),
  KAMIYO_KYOSHIN_AUTO_CLAIM_MAX_PERIODS_PER_RUN: z.coerce.number().int().positive().default(8),

  KAMIYO_SWARM_ENABLED: z
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
  KAMIYO_SWARM_NEAR_MARKET_FEED_URL: optionalNonEmptyString,
  KAMIYO_SWARM_NEAR_MARKET_API_KEY: optionalNonEmptyString,
  KAMIYO_SWARM_NEAR_MARKET_AUTH_HEADER: z.string().min(1).default('authorization'),
  KAMIYO_SWARM_NEAR_MARKET_AGENT_ID: optionalNonEmptyString,
  KAMIYO_SWARM_NEAR_MARKET_BASE_URL: z.string().url().default('https://market.near.ai'),
  KAMIYO_SWARM_NEAR_MARKET_NEAR_PRICE_USD: z.coerce.number().positive().default(4),
  KAMIYO_SWARM_NEAR_MARKET_MIN_BUDGET_NEAR: z.coerce.number().nonnegative().default(0.05),
  KAMIYO_SWARM_NEAR_MARKET_MAX_BUDGET_NEAR: z.coerce.number().positive().default(20),
  KAMIYO_SWARM_NEAR_MARKET_BID_DISCOUNT_BPS: z.coerce.number().int().min(1).max(10_000).default(7000),
  KAMIYO_SWARM_NEAR_MARKET_MIN_BID_NEAR: z.coerce.number().nonnegative().default(0.03),
  KAMIYO_SWARM_NEAR_MARKET_MAX_BID_NEAR: z.coerce.number().positive().default(10),
  KAMIYO_SWARM_NEAR_MARKET_MAX_EXISTING_BIDS: z.coerce.number().int().nonnegative().default(12),
  KAMIYO_SWARM_NEAR_MARKET_ETA_SECONDS: z.coerce.number().int().positive().default(3600),
  KAMIYO_SWARM_NEAR_MARKET_ALLOW_COMPETITION: z
    .enum(['true', 'false'])
    .default('false')
    .transform(v => v === 'true'),
  KAMIYO_SWARM_NEAR_MARKET_PROPOSAL_TEMPLATE: z
    .string()
    .default('Autonomous delivery with proof artifacts, deterministic output, and deadline compliance.'),
  KAMIYO_SWARM_NEAR_MARKET_SETTLEMENT_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform(v => v === 'true'),
  KAMIYO_SWARM_NEAR_MARKET_SETTLEMENT_INTERVAL_MINUTES: z.coerce.number().int().positive().default(10),
  KAMIYO_SWARM_NEAR_MARKET_SETTLEMENT_LIMIT: z.coerce.number().int().positive().default(50),
  KAMIYO_SWARM_NEAR_MARKET_AUTO_SUBMIT_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform(v => v === 'true'),
  KAMIYO_SWARM_NEAR_MARKET_SUBMIT_INTERVAL_MINUTES: z.coerce.number().int().positive().default(5),
  KAMIYO_SWARM_NEAR_MARKET_SUBMIT_LIMIT: z.coerce.number().int().positive().default(6),
  KAMIYO_SWARM_NEAR_MARKET_BID_SYNC_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform(v => v === 'true'),
  KAMIYO_SWARM_NEAR_MARKET_BID_SYNC_INTERVAL_MINUTES: z.coerce.number().int().positive().default(5),
  KAMIYO_SWARM_NEAR_MARKET_BID_SYNC_LIMIT: z.coerce.number().int().positive().default(300),

  KAMIYO_SWARM_JOB_MAX_OPEN: z.coerce.number().int().positive().default(12),
  KAMIYO_SWARM_JOB_MIN_REWARD_USD: z.coerce.number().nonnegative().default(5),
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
  KAMIYO_SWARM_INTAKE_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform(v => v === 'true'),
  KAMIYO_SWARM_INTAKE_MAX_OPEN: z.coerce.number().int().positive().default(16),
  KAMIYO_SWARM_INTAKE_RETRY_LIMIT: z.coerce.number().int().positive().default(4),
  KAMIYO_SWARM_INTAKE_RETRY_BASE_SECONDS: z.coerce.number().int().positive().default(120),
  KAMIYO_SWARM_INTAKE_RETRY_MAX_SECONDS: z.coerce.number().int().positive().default(3600),
  KAMIYO_SWARM_LEAD_CONVERSION_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform(v => v === 'true'),
  KAMIYO_SWARM_LEAD_CONVERSION_MAX_PER_TICK: z.coerce.number().int().positive().default(6),
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
  KAMIYO_SWARM_LEAD_CONTRACT_VALIDATION: z
    .enum(['true', 'false'])
    .default('true')
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

  KAMIYO_SWARM_SOURCE_FEEDBACK_WINDOW_HOURS: z.coerce.number().int().positive().default(168),
  KAMIYO_SWARM_SOURCE_FEEDBACK_MIN_SAMPLES: z.coerce.number().int().positive().default(3),

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
  KAMIYO_REVENUE_POLICY_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform(v => v === 'true'),
  KAMIYO_REVENUE_SETTLE_INTERVAL_MINUTES: z.coerce.number().int().positive().default(30),
  KAMIYO_REVENUE_MIN_NET_SOL: z.coerce.number().nonnegative().default(0.001),
  KAMIYO_REVENUE_ROUTE_BPS: z.coerce.number().int().min(0).max(10_000).default(7000),
  KAMIYO_REVENUE_RESERVE_BPS: z.coerce.number().int().min(0).max(10_000).default(2000),
  KAMIYO_REVENUE_OPERATIONS_BPS: z.coerce.number().int().min(0).max(10_000).default(1000),
  KAMIYO_SELF_IMPROVE_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform(v => v === 'true'),
  KAMIYO_SELF_IMPROVE_INTERVAL_MINUTES: z.coerce.number().int().positive().default(60),
  KAMIYO_SELF_IMPROVE_WINDOW_HOURS: z.coerce.number().int().positive().default(24),
  KAMIYO_SELF_IMPROVE_MIN_JOBS: z.coerce.number().int().positive().default(10),
  KAMIYO_SELF_IMPROVE_FAIL_RATE_UPPER: z.coerce.number().min(0).max(1).default(0.35),
  KAMIYO_SELF_IMPROVE_FAIL_RATE_LOWER: z.coerce.number().min(0).max(1).default(0.1),
  KAMIYO_SELF_IMPROVE_MARGIN_STEP_SOL: z.coerce.number().positive().default(0.0002),
  KAMIYO_SELF_IMPROVE_MIN_MARGIN_FLOOR_SOL: z.coerce.number().nonnegative().default(0.0002),
  KAMIYO_SELF_IMPROVE_MAX_EXECUTIONS_PER_TICK: z.coerce.number().int().positive().default(4),

  KYOSHIN_HTTP_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform(v => v === 'true'),
  KYOSHIN_HTTP_HOST: z.string().min(1).default('0.0.0.0'),
  KYOSHIN_HTTP_PORT: z.coerce.number().int().positive().default(4020),
  KYOSHIN_HTTP_TOKEN: optionalNonEmptyString,
});

export type Env = z.infer<typeof envSchema>;
export const env = envSchema.parse(process.env);
