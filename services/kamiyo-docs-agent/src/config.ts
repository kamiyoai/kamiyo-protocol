import { z } from 'zod';

export const MODELS = {
  haiku: 'hf.co/OBLITERATUS/gemma-4-E4B-it-OBLITERATED:Q5_K_M',
  sonnet: 'hf.co/OBLITERATUS/gemma-4-E4B-it-OBLITERATED:Q5_K_M',
  opus: 'hf.co/NousResearch/Hermes-4.3-36B-GGUF:Q4_K_M',
} as const;

const Schema = z.object({
  LLM_BASE_URL: z.string().url().default('http://localhost:11434/v1'),
  LLM_API_KEY: z.string().default('ollama'),
  GITHUB_REPO: z.string().regex(/^[^/]+\/[^/]+$/, 'expected owner/repo'),
  CLAUDE_MODEL: z.string().default(MODELS.haiku),
  MAX_TURNS: z.coerce.number().int().positive().default(20),
  DAILY_USD_MAX: z.coerce.number().positive().default(5),
  MERGE_SHA: z.string().optional(),
  DRY_RUN: z
    .string()
    .optional()
    .transform(v => v === '1' || v === 'true'),
});

export type Config = z.infer<typeof Schema>;

export function loadConfig(): Config {
  const parsed = Schema.safeParse(process.env);
  if (!parsed.success) {
    console.error('[docs-agent] invalid config:', parsed.error.flatten().fieldErrors);
    process.exit(1);
  }
  return parsed.data;
}
