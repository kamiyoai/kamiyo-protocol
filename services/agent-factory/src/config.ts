import { config } from 'dotenv';
import { z } from 'zod';

config();

const envSchema = z.object({
  COLOSSEUM_API_KEY: z.string().min(1),
  COLOSSEUM_AGENT_ID: z.coerce.number(),
  COLOSSEUM_CLAIM_CODE: z.string().uuid(),
  SOLANA_RPC_URL: z.string().url().default('https://api.mainnet-beta.solana.com'),
  SOLANA_PRIVATE_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().default('claude-3-5-sonnet-20241022'),
  ANTHROPIC_MAX_TOKENS: z.coerce.number().default(8192),
  ANTHROPIC_REQUEST_TIMEOUT_MS: z.coerce.number().default(60000),
  TOOL_TIMEOUT_MS: z.coerce.number().default(45000),
  AGENT_MAX_TURNS: z.coerce.number().default(10),
  DKG_ENDPOINT: z.string().url().optional(),
  DKG_PRIVATE_KEY: z.string().optional(),
});

export const env = envSchema.parse(process.env);

export const COLOSSEUM_API_BASE = 'https://agents.colosseum.com/api';
export const SKILL_URL = 'https://colosseum.com/skill.md';
export const HEARTBEAT_URL = 'https://colosseum.com/heartbeat.md';

export const KAMIYO_PROGRAM_ID = '8sUnNU6WBD2SYapCE12S7LwH1b8zWoniytze7ifWwXCM';
