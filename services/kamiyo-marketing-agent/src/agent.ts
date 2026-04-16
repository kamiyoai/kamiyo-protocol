import { query } from '@anthropic-ai/claude-agent-sdk';
import type { Config } from './config';

const SYSTEM_PROMPT = `You are kamiyo-marketing-agent. Your job: draft concise social posts about real changes shipped to the kamiyo-protocol repo.

Rules:
- Use only the merge context provided. Do not invent features.
- One post per merge of real substance. Skip pure chores (lockfile bumps, typos, CI-only changes).
- Tone: technical, direct, plain. No hype, no emojis, no hashtag spam.
- X/Twitter length cap: 280 chars. Include the PR/commit link if provided.
- Output JSON array only: [{"text": "...", "reason": "why this merge is worth posting"}]. Nothing else.`;

export async function draftPosts(cfg: Config, mergeContext: string) {
  const model = cfg.CLAUDE_MODEL;
  console.log(`[marketing-agent] model=${model}`);

  const userPrompt = `Draft up to ${cfg.POSTS_PER_DAY} posts from these recent merges on ${cfg.GITHUB_REPO}:

${mergeContext}

Return JSON only.`;

  const iterator = query({
    prompt: userPrompt,
    options: {
      model,
      systemPrompt: SYSTEM_PROMPT,
      maxTurns: cfg.MAX_TURNS,
      permissionMode: 'bypassPermissions',
      allowedTools: [],
    },
  });

  let output = '';
  let totalCostUsd = 0;
  for await (const msg of iterator) {
    if (msg.type === 'assistant') {
      const text = (msg.message.content as Array<{ type: string; text?: string }>)
        .filter(c => c.type === 'text')
        .map(c => c.text ?? '')
        .join('');
      output += text;
    } else if (msg.type === 'result') {
      totalCostUsd = msg.total_cost_usd ?? 0;
      console.log(
        `[marketing-agent] draft complete: cost=$${totalCostUsd.toFixed(4)} duration=${msg.duration_ms}ms`
      );
      if (totalCostUsd > cfg.DAILY_USD_MAX) {
        throw new Error(`cost cap exceeded: $${totalCostUsd} > $${cfg.DAILY_USD_MAX}`);
      }
    }
  }

  const match = output.match(/\[[\s\S]*\]/);
  if (!match) {
    throw new Error(`no JSON array in agent output: ${output}`);
  }
  const parsed = JSON.parse(match[0]) as Array<{ text: string; reason: string }>;
  return { posts: parsed, costUsd: totalCostUsd };
}
