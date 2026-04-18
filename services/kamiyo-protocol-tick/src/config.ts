import { config as loadDotenv } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const SERVICE_DIR = path.dirname(fileURLToPath(import.meta.url));
loadDotenv({ path: path.resolve(SERVICE_DIR, '../.env') });

const optionalNonEmpty = z.preprocess(
  v => (typeof v === 'string' && v.trim() === '' ? undefined : v),
  z.string().min(1).optional()
);

const schema = z.object({
  SOLANA_RPC_URL: z.string().url().default('https://api.mainnet-beta.solana.com'),
  OPERATOR_KEYPAIR_PATH: optionalNonEmpty,
  OPERATOR_PRIVATE_KEY: optionalNonEmpty,

  LLM_BASE_URL: z.string().url().default('http://localhost:11434/v1'),
  LLM_API_KEY: z.string().default('ollama'),
  LLM_MODEL: z.string().default('hf.co/OBLITERATUS/gemma-4-E4B-it-OBLITERATED:Q5_K_M'),

  TICK_INTERVAL_SECONDS: z.coerce.number().int().positive().default(900),
  TICK_RUN_ONCE: z
    .string()
    .optional()
    .transform(v => v === '1' || v === 'true'),

  ESCROW_AMOUNT_LAMPORTS: z.coerce.number().int().positive().default(10_000),
  ESCROW_QUALITY_THRESHOLD: z.coerce.number().int().min(0).max(100).default(50),
  ESCROW_EXPIRES_SECONDS: z.coerce.number().int().positive().default(300),
  MODEL_NAME: z.string().default('kamiyo-protocol-tick-v1'),
  PROGRAM_ID: z.string().default('8sUnNU6WBD2SYapCE12S7LwH1b8zWoniytze7ifWwXCM'),

  DRY_RUN: z
    .string()
    .optional()
    .transform(v => v === '1' || v === 'true'),
});

export type Config = z.infer<typeof schema>;

export function loadConfig(): Config {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    console.error('[protocol-tick] invalid config:', parsed.error.flatten().fieldErrors);
    process.exit(1);
  }
  return parsed.data;
}
