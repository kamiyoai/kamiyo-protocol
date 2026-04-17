// SPDX-License-Identifier: MIT
import { execFileSync } from 'node:child_process';
import { runAgent } from '@kamiyo/local-agent';
import { MODELS, type Config, type ModelTier } from './config';

export function pickModel(cfg: Config, labels: string[]): string {
  const tier = labels
    .map(l => l.toLowerCase())
    .map(l => (l.startsWith('agent:') ? (l.slice(6) as ModelTier) : null))
    .find((t): t is ModelTier => t !== null && t in MODELS);
  return tier ? MODELS[tier] : cfg.CLAUDE_MODEL;
}

const SYSTEM_PROMPT = `You are kamiyo-autopilot, an autonomous developer for the kamiyo-protocol monorepo.

Operating mode: act, do not plan. You already have permission to edit files and run commands. Do not ask for approval. Do not stop to present a plan. Make the change end-to-end in one run.

You have these tools available: bash, read_file, write_file, edit_file, grep, glob.

Required workflow:
1. Create a branch named autopilot/issue-<N>-<slug>.
2. Make the edits the issue asks for.
3. Run pnpm -w install and the relevant tests; fix until green.
4. git add, commit, git push -u origin <branch>.
5. gh pr create with title "autopilot: <concise summary> (closes #<N>)", label agent-approved, and body describing changes + test output.

If the issue is genuinely ambiguous or cannot be done safely:
- Post a comment on the issue via \`gh issue comment <N>\` that explains the blocker in one paragraph.
- Then stop.

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
    if (t.name !== 'bash') return false;
    const cmd = String(t.input.command ?? '');
    return /gh\s+pr\s+create/.test(cmd);
  });
}

function didCommentOnIssue(toolUses: ToolUse[], issueNumber: number): boolean {
  return toolUses.some(t => {
    if (t.name !== 'bash') return false;
    const cmd = String(t.input.command ?? '');
    return new RegExp(`gh\\s+issue\\s+comment\\s+${issueNumber}`).test(cmd);
  });
}

function postFallbackComment(cfg: Config, issueNumber: number): void {
  const body = [
    `Autopilot run finished without opening a PR or posting a status comment.`,
    ``,
    `- Model: local LLM`,
    `- Likely cause: agent did not produce actionable edits.`,
    ``,
    `A human should either (a) re-trigger the \`autonomous-dev\` workflow for this issue via \`workflow_dispatch\`, or (b) refine the issue scope.`,
  ].join('\n');
  try {
    execFileSync(
      'gh',
      ['issue', 'comment', String(issueNumber), '-R', cfg.GITHUB_REPO, '--body', body],
      { stdio: 'inherit' }
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

  const toolUses: ToolUse[] = [];

  const iterator = runAgent(userPrompt, {
    model,
    systemPrompt: SYSTEM_PROMPT,
    maxTurns: cfg.MAX_TURNS,
    baseUrl: cfg.LLM_BASE_URL,
    apiKey: cfg.LLM_API_KEY,
    cwd: process.cwd(),
    onText: text => console.log(`[agent] ${text}`),
    onToolCall: (name, args) => {
      toolUses.push({ type: 'tool_use', name, input: args });
      console.log(`[agent] tool=${name} args=${JSON.stringify(args).slice(0, 200)}`);
    },
    onToolResult: (name, result) => {
      const preview = result.output.slice(0, 200);
      console.log(`[agent] ${name} → ${result.error ? 'ERROR: ' : ''}${preview}`);
    },
  });

  let totalDurationMs = 0;
  let totalToolCalls = 0;
  for await (const msg of iterator) {
    if (msg.type === 'result') {
      totalDurationMs = msg.durationMs;
      totalToolCalls = msg.totalToolCalls;
      console.log(
        `[autopilot] complete: duration=${totalDurationMs}ms tool_calls=${totalToolCalls}`
      );
    }
  }

  const openedPr = didOpenPr(toolUses);
  const commented = didCommentOnIssue(toolUses, issueNumber);
  console.log(
    `[autopilot] openedPr=${openedPr} commented=${commented} toolUses=${toolUses.length}`
  );

  if (!cfg.DRY_RUN && !openedPr && !commented) {
    postFallbackComment(cfg, issueNumber);
  }

  const elapsed = Date.now() - startTime;
  emitMetric({
    ts: new Date().toISOString(),
    issue: issueNumber,
    model,
    labels,
    cost_usd: 0,
    duration_ms: elapsed,
    tool_uses: toolUses.length,
    opened_pr: openedPr,
    commented,
  });

  return { costUsd: 0, openedPr, commented };
}
