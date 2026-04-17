import { runAgent } from '@kamiyo/local-agent';
import type { Config } from './config';

const SYSTEM_PROMPT = `You are kamiyo-docs-agent. Your job: keep README.md and CHANGELOG.md current after every merge to main.

You have these tools available: bash, read_file, write_file, edit_file, grep, glob.

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

  const iterator = runAgent(userPrompt, {
    model,
    systemPrompt: SYSTEM_PROMPT,
    maxTurns: cfg.MAX_TURNS,
    baseUrl: cfg.LLM_BASE_URL,
    apiKey: cfg.LLM_API_KEY,
    cwd: process.cwd(),
    onText: text => console.log(`[agent] ${text}`),
    onToolCall: (name, args) =>
      console.log(`[agent] tool=${name} args=${JSON.stringify(args).slice(0, 200)}`),
  });

  let durationMs = 0;
  for await (const msg of iterator) {
    if (msg.type === 'result') {
      durationMs = msg.durationMs;
      console.log(`[docs-agent] complete: duration=${durationMs}ms`);
    }
  }

  return { costUsd: 0 };
}
