import { z } from 'zod';

export const MODELS = {
  haiku: 'hf.co/OBLITERATUS/gemma-4-E4B-it-OBLITERATED:Q5_K_M',
  sonnet: 'hf.co/OBLITERATUS/gemma-4-E4B-it-OBLITERATED:Q5_K_M',
  opus: 'hf.co/NousResearch/Hermes-4.3-36B-GGUF:Q4_K_M',
} as const;

const Schema = z
  .object({
    LLM_BASE_URL: z.string().url().default('http://localhost:11434/v1'),
    LLM_API_KEY: z.string().default('ollama'),
    GITHUB_REPO: z.string().regex(/^[^/]+\/[^/]+$/, 'expected owner/repo'),
    GITHUB_TOKEN: z.string().min(1),
    POSTIZ_URL: z.preprocess(v => (v === '' ? undefined : v), z.string().url().optional()),
    POSTIZ_API_KEY: z.preprocess(v => (v === '' ? undefined : v), z.string().min(1).optional()),
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
    MARKETING_AGENT_DB_PATH: z.string().default('.marketing-agent/agent.db'),
    MAX_TURNS: z.coerce.number().int().positive().default(25),
    DAILY_USD_MAX: z.coerce.number().nonnegative().default(0),
    POSTS_PER_DAY: z.coerce.number().int().positive().default(2),
    SELF_IMPROVE_ENABLED: z
      .enum(['true', 'false'])
      .default('true')
      .transform(v => v === 'true'),
    SELF_IMPROVE_TASK_TYPE: z.string().min(1).default('marketing_post_drafting'),
    SELF_IMPROVE_JUDGE_MODEL: z.string().default(MODELS.haiku),
    SELF_IMPROVE_MIN_SAMPLES: z.coerce.number().int().positive().default(5),
    SELF_IMPROVE_P_THRESHOLD: z.coerce.number().min(0).max(1).default(0.1),
    RECONCILE_DELAY_HOURS: z.coerce.number().int().positive().default(2),
    DRY_RUN: z
      .string()
      .optional()
      .transform(v => v === '1' || v === 'true'),
    MARKETING_RECONCILE_ALLOW_MISSING_POSTIZ: z
      .string()
      .optional()
      .transform(v => v === '1' || v === 'true'),
  })
  .refine(
    d =>
      d.DRY_RUN || d.MARKETING_RECONCILE_ALLOW_MISSING_POSTIZ || (d.POSTIZ_URL && d.POSTIZ_API_KEY),
    {
      message: 'POSTIZ_URL and POSTIZ_API_KEY required unless DRY_RUN=1',
    }
  );

export type Config = z.infer<typeof Schema>;

export function loadConfig(): Config {
  const parsed = Schema.safeParse(process.env);
  if (!parsed.success) {
    console.error('[marketing-agent] invalid config:', parsed.error.flatten().fieldErrors);
    process.exit(1);
  }
  return parsed.data;
}
