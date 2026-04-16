import { query } from '@anthropic-ai/claude-agent-sdk';
import { MODELS, type Config, type ModelTier } from './config';

export function pickModel(cfg: Config, labels: string[]): string {
  const tier = labels
    .map(l => l.toLowerCase())
    .map(l => (l.startsWith('agent:') ? (l.slice(6) as ModelTier) : null))
    .find((t): t is ModelTier => t !== null && t in MODELS);
  return tier ? MODELS[tier] : cfg.CLAUDE_MODEL;
}

const SYSTEM_PROMPT = `You are kamiyo-autopilot, an autonomous developer for the kamiyo-protocol monorepo.

Rules:
- Work on one issue at a time. Stay strictly within its scope.
- Create a branch named autopilot/issue-<N>-<slug>.
- Run pnpm -w install and the relevant tests before opening a PR.
- Open a PR titled "autopilot: <concise summary> (closes #<N>)" with body describing changes, risks, and test output.
- If you cannot complete safely, post a comment on the issue explaining what is blocked and exit without opening a PR.
- Never edit .github/workflows/*, packages/kamiyo-autopilot/**, or files matching *secret*, *.env*, or vendor/**.
- Never force-push or delete branches.
- Prefer small diffs. If the issue is ambiguous, ask in a comment and exit.`;

export async function runAgentOnIssue(
  cfg: Config,
  issueNumber: number,
  title: string,
  body: string,
  labels: string[] = []
) {
  const model = pickModel(cfg, labels);
  console.log(`[autopilot] model=${model} labels=${labels.join(',') || '-'}`);

  const userPrompt = `Issue #${issueNumber}: ${title}

${body}

Repo: ${cfg.GITHUB_REPO}
Bot login: ${cfg.BOT_LOGIN}
Dry run: ${cfg.DRY_RUN ? 'YES — plan only, do not commit or push' : 'no'}`;

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
        `[autopilot] turn complete: cost=$${totalCostUsd.toFixed(4)} duration=${msg.duration_ms}ms`
      );
      if (totalCostUsd > cfg.DAILY_USD_MAX) {
        throw new Error(`cost cap exceeded: $${totalCostUsd} > $${cfg.DAILY_USD_MAX}`);
      }
    }
  }

  return { costUsd: totalCostUsd };
}
