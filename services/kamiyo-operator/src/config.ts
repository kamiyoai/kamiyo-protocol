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

const envSchema = z.object({
  SOLANA_RPC_URL: z.string().url().default('https://api.mainnet-beta.solana.com'),

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
  KAMIYO_PRIME_DIRECTIVE: z
    .string()
    .min(1)
    .default(
      'Work for $KAMIYO: maximize SOL fees/revenue and route that SOL into the $KAMIYO staking pool so $KAMIYO stakers are paid.'
    ),

  KAMIYO_MODE: z.enum(['propose', 'execute']).default('propose'),
  KAMIYO_RUN_ONCE: z
    .enum(['true', 'false'])
    .default('false')
    .transform(v => v === 'true'),
  KAMIYO_LOCK_PATH: z.string().default('output/kamiyo-operator/runner.lock'),
  KAMIYO_STUCK_TICK_TIMEOUT_MINUTES: z.coerce.number().int().positive().default(70),
  KAMIYO_TICK_TIMEOUT_MINUTES: z.coerce.number().int().positive().default(10),

  KAMIYO_SOL_DAILY_CAP: z.coerce.number().positive().default(0.1),
  KAMIYO_SOL_PER_TX_CAP: z.coerce.number().positive().default(0.02),
  KAMIYO_MAX_TX_PER_DAY: z.coerce.number().int().positive().default(25),
  KAMIYO_MAX_FEE_CLAIMS_PER_DAY: z.coerce.number().int().positive().default(1),
  KAMIYO_AUTO_CLAIM_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform(v => v === 'true'),
  KAMIYO_AUTO_CLAIM_MIN_LAMPORTS: z.coerce.number().int().nonnegative().default(1_000_000),
  KAMIYO_AUTO_STAKE_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform(v => v === 'true'),
  KAMIYO_AUTO_STAKE_MIN_LAMPORTS: z.coerce.number().int().nonnegative().default(50_000_000),
  KAMIYO_AUTO_STAKE_RESERVE_LAMPORTS: z.coerce.number().int().nonnegative().default(200_000_000),
  KAMIYO_AUTO_STAKE_AVAILABLE_BPS: z.coerce.number().int().min(1).max(10_000).default(5000),
  KAMIYO_AUTO_STAKE_MAX_LAMPORTS_PER_TX: z.coerce.number().int().nonnegative().default(0),
  KAMIYO_AUTO_STAKE_MAX_FEEDS_PER_DAY: z.coerce.number().int().positive().default(24),

  ANTHROPIC_API_KEY: z.string().min(1),
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

  KAMIYO_LLM_MAX_TURNS_PER_DAY: z.coerce.number().int().positive().default(24),
  KAMIYO_LLM_MAX_INPUT_TOKENS_PER_DAY: z.coerce.number().int().positive().default(150_000),
  KAMIYO_LLM_MAX_OUTPUT_TOKENS_PER_DAY: z.coerce.number().int().positive().default(30_000),

  KAMIYO_LOOP_INTERVAL_SECONDS: z.coerce.number().int().positive().default(3600),
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
    .transform(s => s.split(',').map(v => v.trim()).filter(Boolean)),

  KAMIYO_DB_PATH: z.string().default('output/kamiyo-operator/state.db'),
  KAMIYO_OUTBOX_DIR: z.string().default('output/kamiyo-operator/outbox'),
  KAMIYO_ALERT_STALE_MINUTES: z.coerce.number().int().positive().default(70),
  KAMIYO_ALERT_RUNNING_STALE_MINUTES: z.coerce.number().int().positive().default(70),
  KAMIYO_ALERT_CLAIM_ERROR_LOOKBACK_HOURS: z.coerce.number().int().positive().default(24),
});

export type Env = z.infer<typeof envSchema>;

export const env = envSchema.parse(process.env);
