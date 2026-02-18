import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';

loadDotenv();

const envSchema = z.object({
  SOLANA_RPC_URL: z.string().url().default('https://api.mainnet-beta.solana.com'),

  KISO_OPERATOR_KEYPAIR_PATH: z.string().min(1).optional(),
  KISO_OPERATOR_PRIVATE_KEY: z.string().min(1).optional(),

  KAMIYO_AGENT_NAME: z.string().min(1).default('kiso-operator'),
  KISO_AUTO_CREATE_AGENT: z
    .enum(['true', 'false'])
    .default('false')
    .transform(v => v === 'true'),
  KISO_AGENT_TYPE: z.enum(['Trading', 'Service', 'Oracle', 'Custom']).default('Service'),
  KISO_AGENT_STAKE_SOL: z.coerce.number().positive().default(0.5),

  KISO_TARGET_MINT: z.string().min(1).optional(),
  KISO_FEE_VAULT: z.string().min(1).optional(),

  KISO_MODE: z.enum(['propose', 'execute']).default('propose'),

  KISO_SOL_DAILY_CAP: z.coerce.number().positive().default(0.1),
  KISO_SOL_PER_TX_CAP: z.coerce.number().positive().default(0.02),
  KISO_MAX_TX_PER_DAY: z.coerce.number().int().positive().default(25),

  ANTHROPIC_API_KEY: z.string().min(1),
  ANTHROPIC_MODEL: z.string().min(1).default('claude-opus-4-20250514'),
  KISO_MAX_OUTPUT_TOKENS_PER_TURN: z.coerce.number().int().positive().default(2048),
  KISO_MAX_TURNS_PER_TICK: z.coerce.number().int().positive().default(6),

  KISO_LLM_MAX_TURNS_PER_DAY: z.coerce.number().int().positive().default(24),
  KISO_LLM_MAX_INPUT_TOKENS_PER_DAY: z.coerce.number().int().positive().default(150_000),
  KISO_LLM_MAX_OUTPUT_TOKENS_PER_DAY: z.coerce.number().int().positive().default(30_000),

  KISO_LOOP_INTERVAL_SECONDS: z.coerce.number().int().positive().default(3600),

  KISO_ANNOUNCE_CHANNELS: z
    .string()
    .default('x,telegram')
    .transform(s => s.split(',').map(v => v.trim()).filter(Boolean)),

  KISO_DB_PATH: z.string().default('output/kiso-operator/state.db'),
  KISO_OUTBOX_DIR: z.string().default('output/kiso-operator/outbox'),
});

export type Env = z.infer<typeof envSchema>;

export const env = envSchema.parse(process.env);
