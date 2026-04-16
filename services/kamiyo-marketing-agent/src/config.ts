import { z } from 'zod';

export const MODELS = {
  haiku: 'claude-haiku-4-5-20251001',
  sonnet: 'claude-sonnet-4-6',
  opus: 'claude-opus-4-6',
} as const;

const Schema = z.object({
  ANTHROPIC_API_KEY: z.string().min(1),
  GITHUB_REPO: z.string().regex(/^[^/]+\/[^/]+$/, 'expected owner/repo'),
  GITHUB_TOKEN: z.string().min(1),
  POSTIZ_URL: z.string().url(),
  POSTIZ_API_KEY: z.string().min(1),
  POSTIZ_INTEGRATIONS: z
    .string()
    .default('')
    .transform(v =>
      v
        .split(',')
        .map(s => s.trim())
        .filter(Boolean)
    ),
  CLAUDE_MODEL: z.string().default(MODELS.haiku),
  MAX_TURNS: z.coerce.number().int().positive().default(25),
  DAILY_USD_MAX: z.coerce.number().positive().default(3),
  POSTS_PER_DAY: z.coerce.number().int().positive().default(2),
  DRY_RUN: z
    .string()
    .optional()
    .transform(v => v === '1' || v === 'true'),
});

export type Config = z.infer<typeof Schema>;

export function loadConfig(): Config {
  const parsed = Schema.safeParse(process.env);
  if (!parsed.success) {
    console.error('[marketing-agent] invalid config:', parsed.error.flatten().fieldErrors);
    process.exit(1);
  }
  return parsed.data;
}
