import { query } from '@anthropic-ai/claude-agent-sdk';
import type { Config } from './config';

const SYSTEM_PROMPT = `You are kamiyo-docs-agent. Your job: keep README.md and CHANGELOG.md current after every merge to main.

Rules:
- Only edit README.md and CHANGELOG.md. Never touch source code, workflows, or configs.
- README should describe what the protocol is, current services, how to run it. Keep it concise.
- CHANGELOG: prepend a new entry for the latest merge under an "Unreleased" heading. Use Keep a Changelog format: Added/Changed/Fixed/Removed.
- Use git log to infer what changed. Do not invent features that are not in the diff.
- Write in plain, direct English. No marketing fluff. No emojis.
- If nothing meaningful changed for docs, exit without edits.
- Never commit; the outer workflow commits your edits.`;

export async function runDocsAgent(cfg: Config, mergeContext: string) {
  const model = cfg.CLAUDE_MODEL;
  console.log(`[docs-agent] model=${model}`);

  const userPrompt = `Regenerate docs for repo ${cfg.GITHUB_REPO}.

Recent merge context:
${mergeContext}

Steps:
1. Read current README.md and CHANGELOG.md.
2. Run git log and git diff against the previous commit to see what actually changed.
3. Update README.md if the change affects user-facing description or setup.
4. Prepend a CHANGELOG.md entry for this merge under Unreleased.
5. Stop. The workflow will commit.`;

  const iterator = query({
    prompt: userPrompt,
    options: {
      model,
      systemPrompt: SYSTEM_PROMPT,
      maxTurns: cfg.MAX_TURNS,
      permissionMode: cfg.DRY_RUN ? 'plan' : 'acceptEdits',
      allowedTools: ['Bash', 'Read', 'Write', 'Edit', 'Grep', 'Glob'],
    },
  });

  let totalCostUsd = 0;
  for await (const msg of iterator) {
    if (msg.type === 'assistant') {
      const text = (msg.message.content as Array<{ type: string; text?: string }>)
        .filter(c => c.type === 'text')
        .map(c => c.text ?? '')
        .join('');
      if (text) console.log(`[agent] ${text}`);
    } else if (msg.type === 'result') {
      totalCostUsd = msg.total_cost_usd ?? 0;
      console.log(
        `[docs-agent] complete: cost=$${totalCostUsd.toFixed(4)} duration=${msg.duration_ms}ms`
      );
      if (totalCostUsd > cfg.DAILY_USD_MAX) {
        throw new Error(`cost cap exceeded: $${totalCostUsd} > $${cfg.DAILY_USD_MAX}`);
      }
    }
  }

  return { costUsd: totalCostUsd };
}
