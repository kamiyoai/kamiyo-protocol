// SPDX-License-Identifier: MIT
import { z } from 'zod';

export const MODELS = {
  haiku: 'hf.co/OBLITERATUS/gemma-4-E4B-it-OBLITERATED:Q5_K_M',
  sonnet: 'hf.co/OBLITERATUS/gemma-4-E4B-it-OBLITERATED:Q5_K_M',
  opus: 'hf.co/NousResearch/Hermes-4.3-36B-GGUF:Q4_K_M',
} as const;

export type ModelTier = keyof typeof MODELS;

const Schema = z.object({
  LLM_BASE_URL: z.string().url().default('http://localhost:11434/v1'),
  LLM_API_KEY: z.string().default('ollama'),
  GITHUB_TOKEN: z.string().min(1),
  GITHUB_REPO: z.string().regex(/^[^/]+\/[^/]+$/, 'expected owner/repo'),
  CLAUDE_MODEL: z.string().default(MODELS.sonnet),
  AUTOPILOT_DB_PATH: z.string().default('.autopilot/agent.db'),
  MAX_TURNS: z.coerce.number().int().positive().default(30),
  DAILY_USD_MAX: z.coerce.number().nonnegative().default(0),
  SELF_IMPROVE_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform(v => v === 'true'),
  SELF_IMPROVE_TASK_TYPE: z.string().min(1).default('autopilot_issue_resolution'),
  SELF_IMPROVE_JUDGE_MODEL: z.string().default(MODELS.haiku),
  SELF_IMPROVE_MIN_SAMPLES: z.coerce.number().int().positive().default(5),
  SELF_IMPROVE_P_THRESHOLD: z.coerce.number().min(0).max(1).default(0.1),
  AGENT_LABEL: z.string().default('agent'),
  APPROVED_LABEL: z.string().default('agent-approved'),
  HALT_LABEL: z.string().default('halt-autopilot'),
  BOT_LOGIN: z.string().default('kamiyo-bot'),
  DRY_RUN: z
    .string()
    .optional()
    .transform(v => v === '1' || v === 'true'),
});

export type Config = z.infer<typeof Schema>;

export function loadConfig(): Config {
  const parsed = Schema.safeParse(process.env);
  if (!parsed.success) {
    console.error('[autopilot] invalid config:', parsed.error.flatten().fieldErrors);
    process.exit(1);
  }
  return parsed.data;
}
