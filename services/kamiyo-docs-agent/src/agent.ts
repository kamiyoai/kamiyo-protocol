import path from 'node:path';
import { createAgent, genericProvider } from '@kamiyo-org/agent';
import type { Config } from './config';
import { createDocsAgentTools } from './tools';

const SYSTEM_PROMPT = `You are kamiyo-docs-agent. Your job: keep README.md and CHANGELOG.md current after every merge to main.

You have these tools available: bash, read_file, write_file, edit_file, grep, glob.

Rules:
- Only edit files named README.md or CHANGELOG.md. Never touch source code, workflows, or configs.
- Treat bash as read-only inspection only. Use it for git history/diff and directory inspection, not for editing.
- README should describe what the protocol is, current services, how to run it. Keep it concise.
- CHANGELOG: prepend a new entry for the latest merge under an "Unreleased" heading. Use Keep a Changelog format: Added/Changed/Fixed/Removed.
- Use git log to infer what changed. Do not invent features that are not in the diff.
- Write in plain, direct English. No marketing fluff. No emojis.
- If nothing meaningful changed for docs, exit without edits.
- Never commit; the outer workflow commits your edits.

Final response format:
OUTCOME: <updated_docs|no_changes>
SUMMARY: <2-4 concise sentences about what changed or why no update was needed>
FILES: <comma-separated list of edited files or none>`;

function toToolInput(input: unknown): Record<string, unknown> {
  return input && typeof input === 'object' && !Array.isArray(input)
    ? (input as Record<string, unknown>)
    : {};
}

export async function runDocsAgent(cfg: Config, mergeContext: string) {
  const model = cfg.CLAUDE_MODEL;
  console.log(`[docs-agent] model=${model}`);
  const repoRoot = path.resolve(process.cwd(), '../..');
  const agent = createAgent({
    id: 'kamiyo-docs-agent',
    name: 'kamiyo-docs-agent',
    provider: genericProvider({
      name: 'docs-agent-local',
      baseUrl: cfg.LLM_BASE_URL,
      apiKey: cfg.LLM_API_KEY,
      defaultModel: model,
    }),
    model,
    systemPrompt: SYSTEM_PROMPT,
    temperature: 0.1,
    maxTokens: 3072,
    maxTurns: cfg.MAX_TURNS,
    toolTimeoutMs: 120_000,
    onError: 'return',
  });
  for (const tool of createDocsAgentTools(repoRoot)) {
    agent.useTool(tool);
  }

  const userPrompt = `Regenerate docs for repo ${cfg.GITHUB_REPO}.

Recent merge context:
${mergeContext}

Steps:
1. Read current README.md and CHANGELOG.md.
2. Run git log and git diff against the previous commit to see what actually changed.
3. Update README.md if the change affects user-facing description or setup.
4. Prepend a CHANGELOG.md entry for this merge under Unreleased.
5. Stop. The workflow will commit.`;

  let durationMs = 0;
  try {
    await agent.start();

    for await (const event of agent.stream(userPrompt)) {
      if (event.type === 'text' && event.text.trim()) {
        console.log(`[agent] ${event.text}`);
        continue;
      }

      if (event.type === 'tool_call') {
        const input = toToolInput(event.input);
        console.log(`[agent] tool=${event.name} args=${JSON.stringify(input).slice(0, 200)}`);
        continue;
      }

      if (event.type === 'tool_result') {
        const preview = event.output.slice(0, 200);
        console.log(`[agent] ${event.name} → ${event.isError ? 'ERROR: ' : ''}${preview}`);
        continue;
      }

      if (event.type === 'done') {
        durationMs = event.result.durationMs;
        console.log(`[docs-agent] complete: duration=${durationMs}ms`);
      }
    }
  } finally {
    await agent.stop();
  }

  return { costUsd: 0 };
}
