// SPDX-License-Identifier: MIT
import { execFileSync } from 'node:child_process';
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

Operating mode: act, do not plan. You already have permission to edit files and run commands. Do not call ExitPlanMode. Do not ask for approval. Do not stop to present a plan. Make the change end-to-end in one run.

Required workflow:
1. Create a branch named autopilot/issue-<N>-<slug>.
2. Make the edits the issue asks for.
3. Run pnpm -w install and the relevant tests; fix until green.
4. git add, commit, git push -u origin <branch>.
5. gh pr create with title "autopilot: <concise summary> (closes #<N>)", label agent-approved, and body describing changes + test output.

If the issue is genuinely ambiguous or cannot be done safely:
- Post a comment on the issue via \`gh issue comment <N>\` that explains the blocker in one paragraph.
- Then exit.

Hard constraints:
- Never edit .github/workflows/*, services/kamiyo-autopilot/**, or files matching *secret*, *.env*, or vendor/**.
- Never force-push or delete branches.
- Prefer small diffs. Stay strictly in the issue's scope.`;

type ToolUse = { type: 'tool_use'; name: string; input: Record<string, unknown> };

export interface MetricData {
  ts: string;
  issue: number;
  model: string;
  labels: string[];
  cost_usd: number;
  duration_ms: number;
  tool_uses: number;
  opened_pr: boolean;
  commented: boolean;
}

export function emitMetric(data: MetricData): void {
  const json = JSON.stringify(data);
  console.log(`[autopilot-metric] ${json}`);
}

function didOpenPr(toolUses: ToolUse[]): boolean {
  return toolUses.some(t => {
    if (t.name !== 'Bash') return false;
    const cmd = String(t.input.command ?? '');
    return /gh\s+pr\s+create/.test(cmd);
  });
}

function didCommentOnIssue(toolUses: ToolUse[], issueNumber: number): boolean {
  return toolUses.some(t => {
    if (t.name !== 'Bash') return false;
    const cmd = String(t.input.command ?? '');
    return new RegExp(`gh\\s+issue\\s+comment\\s+${issueNumber}`).test(cmd);
  });
}

function postFallbackComment(cfg: Config, issueNumber: number, costUsd: number): void {
  const body = [
    `Autopilot run finished without opening a PR or posting a status comment.`,
    ``,
    `- Cost: $${costUsd.toFixed(4)}`,
    `- Likely cause: agent entered plan mode and exited before making edits.`,
    ``,
    `A human should either (a) re-trigger the \`autonomous-dev\` workflow for this issue via \`workflow_dispatch\`, or (b) refine the issue scope.`,
  ].join('\n');
  try {
    execFileSync(
      'gh',
      ['issue', 'comment', String(issueNumber), '-R', cfg.GITHUB_REPO, '--body', body],
      {
        stdio: 'inherit',
      }
    );
  } catch (err) {
    console.error('[autopilot] failed to post fallback comment:', err);
  }
}

export async function runAgentOnIssue(
  cfg: Config,
  issueNumber: number,
  title: string,
  body: string,
  labels: string[] = []
) {
  const model = pickModel(cfg, labels);
  console.log(`[autopilot] model=${model} labels=${labels.join(',') || '-'}`);

  const startTime = Date.now();
  const userPrompt = `Issue #${issueNumber}: ${title}

${body}

Repo: ${cfg.GITHUB_REPO}
Bot login: ${cfg.BOT_LOGIN}
Dry run: ${cfg.DRY_RUN ? 'YES — plan only, do not commit or push' : 'no'}

Start now. Make the edits, commit, push, and open the PR in this single run.`;

  const iterator = query({
    prompt: userPrompt,
    options: {
      model,
      systemPrompt: SYSTEM_PROMPT,
      maxTurns: cfg.MAX_TURNS,
      permissionMode: cfg.DRY_RUN ? 'plan' : 'acceptEdits',
      allowedTools: ['Bash', 'Read', 'Write', 'Edit', 'Grep', 'Glob'],
      disallowedTools: ['ExitPlanMode'],
    },
  });

  const toolUses: ToolUse[] = [];
  let totalCostUsd = 0;
  let lastDurationMs = 0;
  for await (const msg of iterator) {
    if (msg.type === 'assistant') {
      const content = msg.message.content as Array<{
        type: string;
        text?: string;
        name?: string;
        input?: Record<string, unknown>;
      }>;
      const text = content
        .filter(c => c.type === 'text')
        .map(c => c.text ?? '')
        .join('');
      if (text) console.log(`[agent] ${text}`);
      for (const c of content) {
        if (c.type === 'tool_use' && c.name) {
          toolUses.push({ type: 'tool_use', name: c.name, input: c.input ?? {} });
        }
      }
    } else if (msg.type === 'result') {
      totalCostUsd = msg.total_cost_usd ?? 0;
      lastDurationMs = msg.duration_ms ?? 0;
      console.log(
        `[autopilot] turn complete: cost=$${totalCostUsd.toFixed(4)} duration=${lastDurationMs}ms`
      );
      if (totalCostUsd > cfg.DAILY_USD_MAX) {
        throw new Error(`cost cap exceeded: $${totalCostUsd} > $${cfg.DAILY_USD_MAX}`);
      }
    }
  }

  const openedPr = didOpenPr(toolUses);
  const commented = didCommentOnIssue(toolUses, issueNumber);
  console.log(
    `[autopilot] openedPr=${openedPr} commented=${commented} toolUses=${toolUses.length}`
  );

  if (!cfg.DRY_RUN && !openedPr && !commented) {
    postFallbackComment(cfg, issueNumber, totalCostUsd);
  }

  // Emit structured metric
  const totalDurationMs = Date.now() - startTime;
  emitMetric({
    ts: new Date().toISOString(),
    issue: issueNumber,
    model,
    labels,
    cost_usd: totalCostUsd,
    duration_ms: totalDurationMs,
    tool_uses: toolUses.length,
    opened_pr: openedPr,
    commented,
  });

  return { costUsd: totalCostUsd, openedPr, commented };
}
