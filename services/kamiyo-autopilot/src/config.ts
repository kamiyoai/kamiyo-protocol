import { z } from 'zod';

export const MODELS = {
  haiku: 'claude-haiku-4-5-20251001',
  sonnet: 'claude-sonnet-4-6',
  opus: 'claude-opus-4-6',
} as const;

export type ModelTier = keyof typeof MODELS;

const Schema = z.object({
  ANTHROPIC_API_KEY: z.string().min(1),
  GITHUB_TOKEN: z.string().min(1),
  GITHUB_REPO: z.string().regex(/^[^/]+\/[^/]+$/, 'expected owner/repo'),
  CLAUDE_MODEL: z.string().default(MODELS.sonnet),
  MAX_TURNS: z.coerce.number().int().positive().default(30),
  DAILY_USD_MAX: z.coerce.number().positive().default(50),
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
