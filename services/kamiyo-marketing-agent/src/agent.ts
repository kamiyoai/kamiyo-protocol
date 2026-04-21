import { createAgent, genericProvider } from '@kamiyo-org/agent';
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
  try {
    await agent.start();

    for await (const event of agent.stream(userPrompt)) {
      if (event.type === 'text' && event.text) {
        output += event.text;
        continue;
      }

      if (event.type === 'done') {
        durationMs = event.result.durationMs;
        console.log(`[marketing-agent] draft complete: duration=${durationMs}ms`);
      }
    }
  } finally {
    await agent.stop();
  }

  return { posts: parseDraftPosts(output, cfg.POSTS_PER_DAY), costUsd: 0 };
}
