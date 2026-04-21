import {
  assessAgentOutcome,
  createAgent,
  genericProvider,
  type OutcomeAssessment as AgentOutcomeAssessment,
} from '@kamiyo-org/agent';
import { z } from 'zod';
import type { Config } from './config';

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

export async function draftPosts(cfg: Config, mergeContext: string) {
  const model = cfg.CLAUDE_MODEL;
  console.log(`[marketing-agent] model=${model}`);
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
  });

  const userPrompt = `Draft up to ${cfg.POSTS_PER_DAY} posts from these recent merges on ${cfg.GITHUB_REPO}:

${mergeContext}

Return JSON only.`;

  let output = '';
  let durationMs = 0;
  let turnCount = 0;
  try {
    await agent.start();

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
  } finally {
    await agent.stop();
  }

  return {
    posts: parseDraftPosts(output, cfg.POSTS_PER_DAY),
    costUsd: 0,
    durationMs,
    turnCount,
    variantId: agent.selfImprove.currentVariantId,
    variantStrategy: agent.selfImprove.currentStrategy,
  };
}
