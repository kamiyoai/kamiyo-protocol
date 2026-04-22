// SPDX-License-Identifier: MIT
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import {
  assessAgentOutcome,
  createAgent,
  emitOutcomeMetric,
  genericProvider,
  parseTaggedFields,
  recordAgentRunReceipt,
  type OutcomeAssessment as AgentOutcomeAssessment,
} from '@kamiyo-org/agent';
import { createVariant, genericChatJudge } from '@kamiyo-org/selfimprove';
import { MODELS, type Config, type ModelTier } from './config';
import { GitHubClient } from './github';
import { createAutopilotTools } from './tools';

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

Before editing, inspect the relevant code, tests, and issue details closely. Prefer the smallest safe diff that fully addresses the issue.

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
- Prefer small diffs. Stay strictly in the issue's scope.

Final response format:
OUTCOME: <opened_pr|commented_blocker|no_action>
BRANCH: <branch-name-or-none>
SUMMARY: <2-4 concise sentences about what changed or why you stopped>
TESTS: <commands run and whether they passed>
PR: <url-or-none>
ISSUE_COMMENT: <yes|no>`;

const SELF_IMPROVE_RUBRIC = `Score the final execution summary for an autonomous coding run.

Give high scores only when the summary shows all of the following:
- The issue was understood and handled within scope.
- The agent changed code or left a blocker comment in a safe, reasonable way.
- The summary includes concrete verification steps or explains why verification was blocked.
- The workflow outcome is explicit: PR opened, blocker comment posted, or no action.

Penalize:
- Invented work, invented tests, or invented links.
- Broad risky edits or clear scope drift.
- Missing verification details.
- Ambiguous outcomes or failure to follow the required workflow.`;

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

export function assessAutopilotOutcome(params: {
  issueNumber: number;
  labels: string[];
  model: string;
  durationMs: number;
  toolUses: number;
  openedPr: boolean;
  commented: boolean;
  finalText: string;
  resolvedOutcome?: string;
  costUsd?: number;
  variantId?: string | null;
  variantStrategy?: string | null;
  prMerged?: boolean;
  prDraft?: boolean;
  prMergeableState?: string | null;
  ciStatus?: 'success' | 'failure' | 'pending' | 'unknown';
}): AgentOutcomeAssessment {
  const fields = parseTaggedFields(params.finalText);
  const testsField = fields.TESTS?.trim() ?? '';
  const outcome =
    params.resolvedOutcome ?? fields.OUTCOME ?? inferAutopilotOutcome(params.openedPr, params.commented);
  const hasError = params.finalText.trim().startsWith('Error:');
  const status = hasError
    ? 'failure'
    : params.openedPr
      ? 'success'
      : params.commented
        ? 'partial'
        : 'neutral';
  const hasVerification = testsField !== '' && !/\b(none|not run|not_run|blocked)\b/i.test(testsField);
  const outcomeMatchesActions =
    (outcome === 'opened_pr' && params.openedPr) ||
    (outcome === 'commented_blocker' && params.commented) ||
    (outcome === 'no_action' && !params.openedPr && !params.commented);
  const branchNamed = Boolean(fields.BRANCH && fields.BRANCH !== 'none');
  const linkedPr = Boolean(fields.PR && fields.PR !== 'none');
  const issueCommentMatches =
    !fields.ISSUE_COMMENT ||
    (fields.ISSUE_COMMENT === 'yes' && params.commented) ||
    (fields.ISSUE_COMMENT === 'no' && !params.commented);
  const testsPassed =
    testsField !== '' &&
    /\b(pass|passed|green|success)\b/i.test(testsField) &&
    !/\b(fail|failed|error|blocked|not run|not_run)\b/i.test(testsField);
  const ciGreen = params.ciStatus === 'success';
  const prReady =
    params.openedPr &&
    params.prDraft !== true &&
    (params.prMergeableState === 'clean' ||
      params.prMergeableState === 'has_hooks' ||
      params.prMergeableState === 'unstable');

  return assessAgentOutcome({
    service: 'kamiyo-autopilot',
    taskType: 'autopilot_issue_resolution',
    status,
    outcome,
    model: params.model,
    durationMs: params.durationMs,
    costUsd: params.costUsd ?? 0,
    toolUses: params.toolUses,
    variantId: params.variantId,
    variantStrategy: params.variantStrategy,
    signals: [
      { name: 'explicit_outcome', value: Boolean(fields.OUTCOME), weight: 1 },
      { name: 'opened_pr', value: params.openedPr, weight: 4 },
      { name: 'left_blocker_comment', value: params.commented, weight: 2 },
      { name: 'reported_verification', value: hasVerification, weight: 2 },
      { name: 'tests_passed', value: testsPassed, weight: 2 },
      { name: 'branch_named', value: branchNamed, weight: 1 },
      { name: 'linked_pr', value: linkedPr, weight: 1.5 },
      { name: 'ci_green', value: ciGreen, weight: 1.5 },
      { name: 'pr_ready', value: prReady, weight: 1.5 },
      { name: 'pr_merged', value: params.prMerged === true, weight: 4 },
      { name: 'outcome_matches_actions', value: outcomeMatchesActions, weight: 3 },
      { name: 'issue_comment_matches_actions', value: issueCommentMatches, weight: 1 },
      { name: 'clean_exit', value: !hasError, weight: 2 },
    ],
    metadata: {
      issue: params.issueNumber,
      labels: params.labels,
      branch: fields.BRANCH ?? 'none',
      pr: fields.PR ?? 'none',
      tests: testsField || 'none',
      ci_status: params.ciStatus ?? 'unknown',
      pr_merged: params.prMerged ?? false,
      pr_draft: params.prDraft ?? false,
      pr_mergeable_state: params.prMergeableState ?? 'unknown',
    },
  });
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

function inferAutopilotOutcome(openedPr: boolean, commented: boolean): string {
  if (openedPr) return 'opened_pr';
  if (commented) return 'commented_blocker';
  return 'no_action';
}

function parsePrUrl(finalText: string): string | null {
  const fields = parseTaggedFields(finalText);
  const pr = fields.PR?.trim();
  if (!pr || pr === 'none') return null;
  return /^https?:\/\//i.test(pr) ? pr : null;
}

function parsePrNumber(prUrl: string | null): number | null {
  if (!prUrl) return null;
  const match = prUrl.match(/\/pull\/(\d+)(?:\/|$)/);
  if (!match) return null;
  const prNumber = Number(match[1]);
  return Number.isFinite(prNumber) && prNumber > 0 ? prNumber : null;
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

function resolveAutopilotDbPath(dbPath: string): string {
  const resolved = path.isAbsolute(dbPath) ? dbPath : path.resolve(process.cwd(), dbPath);
  mkdirSync(path.dirname(resolved), { recursive: true });
  return resolved;
}

function createAutopilotJudge(cfg: Config) {
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

function seedAutopilotVariants(
  agentId: string,
  taskType: string,
  model: string,
  toolAllowlist: string[]
): void {
  const variants = [
    {
      promptTemplate: SYSTEM_PROMPT,
      temperature: 0.2,
      maxTokens: 4096,
      notes: 'baseline-autopilot',
    },
    {
      promptTemplate: `${SYSTEM_PROMPT}\n\nExecution style: inspect the narrowest relevant set of files and tests before editing. Prefer the minimal patch that fully resolves the issue.`,
      temperature: 0.15,
      maxTokens: 3072,
      notes: 'minimal-diff-autopilot',
    },
    {
      promptTemplate: `${SYSTEM_PROMPT}\n\nExecution style: keep a strict verification checklist. Before stopping, make the outcome, branch, PR status, and test evidence explicit.`,
      temperature: 0.35,
      maxTokens: 4096,
      notes: 'verification-heavy-autopilot',
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
        toolAllowlist,
        temperature: variant.temperature,
        maxTokens: variant.maxTokens,
        systemGuardrails:
          'Never modify workflows, secrets, env files, or vendored code. Stay inside the issue scope.',
      },
    });
  }
}

function toToolInput(input: unknown): Record<string, unknown> {
  return input && typeof input === 'object' && !Array.isArray(input)
    ? (input as Record<string, unknown>)
    : {};
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
  const repoRoot = path.resolve(process.cwd(), '../..');
  const db = cfg.SELF_IMPROVE_ENABLED
    ? new Database(resolveAutopilotDbPath(cfg.AUTOPILOT_DB_PATH))
    : undefined;
  const github = cfg.DRY_RUN ? null : new GitHubClient(cfg);
  const agent = createAgent({
    id: 'kamiyo-autopilot',
    name: 'kamiyo-autopilot',
    provider: genericProvider({
      name: 'autopilot-local',
      baseUrl: cfg.LLM_BASE_URL,
      apiKey: cfg.LLM_API_KEY,
      defaultModel: model,
    }),
    model,
    systemPrompt: SYSTEM_PROMPT,
    temperature: 0.2,
    maxTokens: 4096,
    maxTurns: cfg.MAX_TURNS,
    toolTimeoutMs: 120_000,
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
    selfImproveInit: cfg.SELF_IMPROVE_ENABLED
      ? { judgeLLM: createAutopilotJudge(cfg) }
      : undefined,
  });
  for (const tool of createAutopilotTools(repoRoot)) {
    agent.useTool(tool);
  }

  const userPrompt = `Issue #${issueNumber}: ${title}

${body}

Repo: ${cfg.GITHUB_REPO}
Bot login: ${cfg.BOT_LOGIN}
Dry run: ${cfg.DRY_RUN ? 'YES — plan only, do not commit or push' : 'no'}

Start now. Make the edits, commit, push, and open the PR in this single run.`;

  const toolUses: ToolUse[] = [];
  let totalDurationMs = 0;
  let totalToolCalls = 0;
  let finalText = '';
  let outcomeAssessment: AgentOutcomeAssessment | null = null;
  let openedPr = false;
  let commented = false;
  let fallbackCommented = false;
  let runId = '';
  let ciStatus: 'success' | 'failure' | 'pending' | 'unknown' = 'unknown';
  let prMerged = false;
  let prDraft = false;
  let prMergeableState: string | null = null;
  let prHeadSha: string | null = null;

  try {
    await agent.start();
    if (cfg.SELF_IMPROVE_ENABLED) {
      seedAutopilotVariants(agent.id, agent.selfImprove.taskType, model, agent.tools);
    }

    for await (const event of agent.stream(userPrompt)) {
      if (event.type === 'text' && event.text.trim()) {
        console.log(`[agent] ${event.text}`);
        continue;
      }

      if (event.type === 'tool_call') {
        const input = toToolInput(event.input);
        toolUses.push({ type: 'tool_use', name: event.name, input });
        console.log(`[agent] tool=${event.name} args=${JSON.stringify(input).slice(0, 200)}`);
        continue;
      }

      if (event.type === 'tool_result') {
        const preview = event.output.slice(0, 200);
        console.log(`[agent] ${event.name} → ${event.isError ? 'ERROR: ' : ''}${preview}`);
        continue;
      }

      if (event.type === 'done') {
        runId = event.result.runId;
        totalDurationMs = event.result.durationMs;
        totalToolCalls = toolUses.length;
        finalText = event.result.text;
        console.log(
          `[autopilot] complete: duration=${totalDurationMs}ms tool_calls=${totalToolCalls}`
        );
      }
    }

    openedPr = didOpenPr(toolUses);
    commented = didCommentOnIssue(toolUses, issueNumber);
    const prUrl = parsePrUrl(finalText);
    if (openedPr && github && prUrl) {
      try {
        const prState = await github.getPullRequestState(prUrl);
        if (prState) {
          ciStatus = prState.checkState;
          prMerged = prState.merged;
          prDraft = prState.draft;
          prMergeableState = prState.mergeableState;
          prHeadSha = prState.headSha;
        }
      } catch (error) {
        console.error('[autopilot] failed to fetch PR state:', error);
      }
    }
    if (!cfg.DRY_RUN && !openedPr && !commented) {
      postFallbackComment(cfg, issueNumber);
      fallbackCommented = true;
    }

    outcomeAssessment = assessAutopilotOutcome({
      issueNumber,
      labels,
      model,
      durationMs: totalDurationMs || Date.now() - startTime,
      toolUses: toolUses.length,
      openedPr,
      commented: commented || fallbackCommented,
      finalText,
      resolvedOutcome: inferAutopilotOutcome(openedPr, commented || fallbackCommented),
      costUsd: 0,
      variantId: agent.selfImprove.currentVariantId,
      variantStrategy: agent.selfImprove.currentStrategy,
      prMerged,
      prDraft,
      prMergeableState,
      ciStatus,
    });
    agent.selfImprove.recordOutcomeScore({
      qualityScore: outcomeAssessment.qualityScore,
      latencyMs: outcomeAssessment.metric.duration_ms,
      costUsd: 0,
      outcome: outcomeAssessment.metric.outcome,
    });
    if (db && runId) {
      const fields = parseTaggedFields(finalText);
      recordAgentRunReceipt(db, {
        runId,
        agentId: agent.id,
        service: 'kamiyo-autopilot',
        taskType: agent.selfImprove.taskType,
        subjectType: 'issue',
        subjectId: String(issueNumber),
        variantId: agent.selfImprove.currentVariantId,
        variantStrategy: agent.selfImprove.currentStrategy,
        outcome: outcomeAssessment.metric.outcome,
        qualityScore: outcomeAssessment.qualityScore,
        costUsd: 0,
        durationMs: outcomeAssessment.metric.duration_ms,
        reconcileAfter: cfg.DRY_RUN ? null : Math.floor(Date.now() / 1000) + 6 * 60 * 60,
        receipt: {
          issueNumber,
          labels,
          branch: fields.BRANCH?.trim() || null,
          tests: fields.TESTS?.trim() || null,
          prUrl,
          prNumber: parsePrNumber(prUrl),
          prHeadSha,
          openedPr,
          commented: commented || fallbackCommented,
          ciStatus,
          prMerged,
          prDraft,
          prMergeableState,
        },
      });
    }
  } finally {
    await agent.stop();
    db?.close();
  }

  commented = commented || fallbackCommented;
  console.log(
    `[autopilot] openedPr=${openedPr} commented=${commented} toolUses=${toolUses.length}`
  );

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
  if (outcomeAssessment) {
    emitOutcomeMetric(outcomeAssessment.metric);
  }

  return { costUsd: 0, openedPr, commented };
}
