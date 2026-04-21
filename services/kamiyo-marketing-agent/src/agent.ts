import path from 'node:path';
import { mkdirSync } from 'node:fs';
import {
  assessAgentOutcome,
  createAgent,
  genericProvider,
  type DB,
  type OutcomeAssessment as AgentOutcomeAssessment,
} from '@kamiyo-org/agent';
import { createVariant, genericChatJudge } from '@kamiyo-org/selfimprove';
import { z } from 'zod';
import type { Config } from './config';

type MarketingDatabase = DB & { close(): void };

const DraftPostSchema = z.object({
  text: z.string().trim().min(1).max(280),
  reason: z.string().trim().min(1),
});
const DraftPostsSchema = z.array(DraftPostSchema);

const SYSTEM_PROMPT = `You are kamiyo-marketing-agent. Your job: draft concise social posts about real changes shipped to the kamiyo-protocol repo.

Rules:
- Use only the merge context provided. Do not invent features.
- One post per merge of real substance. Skip pure chores (lockfile bumps, typos, CI-only changes).
- Tone: technical, direct, plain. No hype, no emojis, no hashtag spam.
- X/Twitter length cap: 280 chars. Include the PR/commit link if provided.
- Output JSON array only: [{"text": "...", "reason": "why this merge is worth posting"}]. Nothing else.

Final response format:
[{"text":"...","reason":"..."}]`;

const SELF_IMPROVE_RUBRIC = `Score the final execution outcome for a marketing drafting run.

Give high scores only when all of the following are true:
- Every drafted post is grounded in the provided merge context and reflects a real shipped change.
- The run skips trivial commits cleanly instead of forcing weak posts.
- Each drafted post stays concise, technically accurate, and within the 280 character X limit.
- The final outcome matches execution: no_posts when nothing worth posting was found, drafted_posts for dry runs, or scheduled_posts when posts were actually scheduled.
- The number of posts drafted and scheduled is internally consistent with the result metadata.

Penalize:
- Invented claims, exaggerated framing, or posts about chores and low-signal changes.
- Malformed output, missing reasons, or posts that exceed the X limit.
- Partial scheduling that is not reflected in the recorded outcome.`;

export interface MarketingDraftResult {
  posts: Array<{ text: string; reason: string }>;
  costUsd: number;
  durationMs: number;
  turnCount: number;
  variantId: string | null;
  variantStrategy: string | null;
  recordOutcomeScore(assessment: AgentOutcomeAssessment): boolean;
  cleanup(): Promise<void>;
}

function resolveMarketingDbPath(dbPath: string): string {
  const resolved = path.isAbsolute(dbPath) ? dbPath : path.resolve(process.cwd(), dbPath);
  mkdirSync(path.dirname(resolved), { recursive: true });
  return resolved;
}

function openMarketingDatabase(dbPath: string): MarketingDatabase {
  // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
  const Database = require('better-sqlite3') as new (filename: string) => MarketingDatabase;
  return new Database(resolveMarketingDbPath(dbPath));
}

function createMarketingJudge(cfg: Config) {
  const baseUrl = cfg.LLM_BASE_URL.replace(/\/$/, '');
  return genericChatJudge(async request => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (cfg.LLM_API_KEY) {
      headers.Authorization = `Bearer ${cfg.LLM_API_KEY}`;
    }

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: request.model,
        temperature: request.temperature,
        max_tokens: request.max_tokens,
        messages: request.messages,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`judge HTTP ${response.status}: ${errorText}`);
    }

    const raw = (await response.json()) as {
      choices?: Array<{ message?: { content?: string | null } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    return {
      text: raw.choices?.[0]?.message?.content ?? '',
      inputTokens: raw.usage?.prompt_tokens ?? 0,
      outputTokens: raw.usage?.completion_tokens ?? 0,
    };
  });
}

function seedMarketingVariants(agentId: string, taskType: string, model: string): void {
  const variants = [
    {
      promptTemplate: SYSTEM_PROMPT,
      temperature: 0.2,
      maxTokens: 1536,
      notes: 'baseline-marketing-agent',
    },
    {
      promptTemplate: `${SYSTEM_PROMPT}\n\nExecution style: be selective. Prefer returning fewer posts when the merge set is mostly chores, and only draft when the shipped change is concrete and externally meaningful.`,
      temperature: 0.1,
      maxTokens: 1280,
      notes: 'selective-marketing-agent',
    },
    {
      promptTemplate: `${SYSTEM_PROMPT}\n\nExecution style: emphasize the compounding system change behind the merge. Focus on why the shipped improvement matters operationally, but stay grounded in the provided context and keep the language plain.`,
      temperature: 0.25,
      maxTokens: 1536,
      notes: 'compound-story-marketing-agent',
    },
  ];

  for (const variant of variants) {
    createVariant({
      agentId,
      taskType,
      notes: variant.notes,
      genome: {
        promptTemplate: variant.promptTemplate,
        modelId: model,
        toolAllowlist: [],
        temperature: variant.temperature,
        maxTokens: variant.maxTokens,
        systemGuardrails:
          'Use only the supplied merge context. Do not invent features or discuss changes that are not clearly present. Keep every post within 280 characters.',
      },
    });
  }
}

export function parseDraftPosts(output: string, maxPosts: number): Array<{ text: string; reason: string }> {
  const match = output.match(/\[[\s\S]*\]/);
  if (!match) {
    throw new Error(`no JSON array in agent output: ${output}`);
  }

  const parsed = DraftPostsSchema.parse(JSON.parse(match[0]));
  return parsed.slice(0, maxPosts).map(post => ({
    text: post.text.trim(),
    reason: post.reason.trim(),
  }));
}

export function assessMarketingOutcome(params: {
  model: string;
  durationMs: number;
  turnCount?: number;
  postsPerDay: number;
  posts: Array<{ text: string; reason: string }>;
  scheduledCount: number;
  dryRun: boolean;
  costUsd?: number;
  variantId?: string | null;
  variantStrategy?: string | null;
}): AgentOutcomeAssessment {
  const drafted = params.posts.length;
  const scheduleCoverage = drafted === 0 ? 1 : params.scheduledCount / drafted;
  const draftCoverage = params.postsPerDay > 0 ? Math.min(drafted / params.postsPerDay, 1) : 0;
  const scheduledAll = drafted === 0 || params.scheduledCount >= drafted;
  const status = drafted === 0 ? 'neutral' : scheduledAll ? 'success' : 'partial';

  return assessAgentOutcome({
    service: 'kamiyo-marketing-agent',
    taskType: 'marketing_post_drafting',
    status,
    outcome: drafted === 0 ? 'no_posts' : params.dryRun ? 'drafted_posts' : 'scheduled_posts',
    model: params.model,
    durationMs: params.durationMs,
    costUsd: params.costUsd ?? 0,
    turnCount: params.turnCount ?? 0,
    variantId: params.variantId,
    variantStrategy: params.variantStrategy,
    signals: [
      { name: 'valid_json_response', value: true, weight: 1.5 },
      { name: 'draft_coverage', value: draftCoverage, weight: 2 },
      { name: 'schedule_coverage', value: Math.min(scheduleCoverage, 1), weight: 3 },
      { name: 'reasons_present', value: params.posts.every(post => post.reason.trim().length > 0), weight: 1 },
      { name: 'within_x_length_cap', value: params.posts.every(post => post.text.length <= 280), weight: 1 },
      { name: 'clean_skip', value: drafted === 0, weight: 1 },
      { name: 'dry_run_respected', value: !params.dryRun || scheduledAll, weight: 1 },
    ],
    metadata: {
      posts_drafted: drafted,
      posts_scheduled: params.scheduledCount,
      posts_per_day: params.postsPerDay,
      dry_run: params.dryRun,
    },
  });
}

export async function draftPosts(cfg: Config, mergeContext: string): Promise<MarketingDraftResult> {
  const model = cfg.CLAUDE_MODEL;
  console.log(`[marketing-agent] model=${model}`);
  const db = cfg.SELF_IMPROVE_ENABLED ? openMarketingDatabase(cfg.MARKETING_AGENT_DB_PATH) : undefined;
  const agent = createAgent({
    id: 'kamiyo-marketing-agent',
    name: 'kamiyo-marketing-agent',
    provider: genericProvider({
      name: 'marketing-agent-local',
      baseUrl: cfg.LLM_BASE_URL,
      apiKey: cfg.LLM_API_KEY,
      defaultModel: model,
    }),
    model,
    systemPrompt: SYSTEM_PROMPT,
    temperature: 0.2,
    maxTokens: 1536,
    maxTurns: cfg.MAX_TURNS,
    onError: 'return',
    db,
    selfImprove: cfg.SELF_IMPROVE_ENABLED
      ? {
          enabled: true,
          taskType: cfg.SELF_IMPROVE_TASK_TYPE,
          rubric: SELF_IMPROVE_RUBRIC,
          rubricModel: cfg.SELF_IMPROVE_JUDGE_MODEL,
          rubricBudgetUsd: cfg.DAILY_USD_MAX,
          minSamples: cfg.SELF_IMPROVE_MIN_SAMPLES,
          pThreshold: cfg.SELF_IMPROVE_P_THRESHOLD,
          sweepIntervalMs: 12 * 60 * 60 * 1000,
        }
      : { enabled: false },
    selfImproveInit: cfg.SELF_IMPROVE_ENABLED ? { judgeLLM: createMarketingJudge(cfg) } : undefined,
  });

  const userPrompt = `Draft up to ${cfg.POSTS_PER_DAY} posts from these recent merges on ${cfg.GITHUB_REPO}:

${mergeContext}

Return JSON only.`;

  let output = '';
  let durationMs = 0;
  let turnCount = 0;
  let cleanedUp = false;

  const cleanup = async () => {
    if (cleanedUp) return;
    cleanedUp = true;
    await agent.stop();
    db?.close();
  };

  try {
    await agent.start();
    if (cfg.SELF_IMPROVE_ENABLED) {
      seedMarketingVariants(agent.id, agent.selfImprove.taskType, model);
    }

    for await (const event of agent.stream(userPrompt)) {
      if (event.type === 'text' && event.text) {
        output += event.text;
        continue;
      }

      if (event.type === 'done') {
        durationMs = event.result.durationMs;
        turnCount = event.result.turns;
        console.log(`[marketing-agent] draft complete: duration=${durationMs}ms`);
      }
    }
  } catch (error) {
    await cleanup();
    throw error;
  }

  try {
    return {
      posts: parseDraftPosts(output, cfg.POSTS_PER_DAY),
      costUsd: 0,
      durationMs,
      turnCount,
      variantId: agent.selfImprove.currentVariantId,
      variantStrategy: agent.selfImprove.currentStrategy,
      recordOutcomeScore(assessment) {
        return agent.selfImprove.recordOutcomeScore({
          qualityScore: assessment.qualityScore,
          latencyMs: assessment.metric.duration_ms,
          costUsd: assessment.metric.cost_usd,
          outcome: assessment.metric.outcome,
          variantId: assessment.metric.variant_id,
        });
      },
      cleanup,
    };
  } catch (error) {
    await cleanup();
    throw error;
  }
}
