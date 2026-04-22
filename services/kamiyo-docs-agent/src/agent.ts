import path from 'node:path';
import { execSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import {
  assessAgentOutcome,
  buildAgentLearningRunPayload,
  createAgent,
  type DB,
  emitOutcomeMetric,
  genericProvider,
  parseTaggedFields,
  publishAgentLearningRun,
  recordAgentRunReceipt,
  type OutcomeAssessment as AgentOutcomeAssessment,
} from '@kamiyo-org/agent';
import { createVariant, genericChatJudge } from '@kamiyo-org/selfimprove';
import type { Config } from './config';
import { createDocsAgentTools } from './tools';

type DocsDatabase = DB & { close(): void };

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

const SELF_IMPROVE_RUBRIC = `Score the final execution summary for a docs regeneration run.

Give high scores only when the summary reflects all of the following:
- The reported outcome matches the actual docs edits: updated docs when real README/CHANGELOG changes were needed, or no_changes when no docs update was justified.
- The README and CHANGELOG stay tightly aligned to the merge diff, with no invented features or speculative claims.
- The CHANGELOG entry is present when docs were updated and the touched files stay inside the docs-only scope.
- The summary and reported files are explicit and internally consistent.

Penalize:
- Claimed file edits that did not happen, or real edits not reflected in the response.
- README edits for internal-only or workflow-only changes.
- Missing or inaccurate CHANGELOG updates.
- Any drift outside README.md or CHANGELOG.md.`;

function toToolInput(input: unknown): Record<string, unknown> {
  return input && typeof input === 'object' && !Array.isArray(input)
    ? (input as Record<string, unknown>)
    : {};
}

function collectDocSnapshots(repoRoot: string): Map<string, string> {
  const output = execSync(
    `find '${repoRoot}' -type f \\( -name 'README.md' -o -name 'CHANGELOG.md' \\) | sort`,
    {
      encoding: 'utf-8',
    }
  );
  const snapshots = new Map<string, string>();
  for (const filePath of output
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)) {
    const relative = path.relative(repoRoot, filePath);
    snapshots.set(relative, readFileSync(filePath, 'utf-8'));
  }
  return snapshots;
}

function resolveDocsDbPath(dbPath: string): string {
  const resolved = path.isAbsolute(dbPath) ? dbPath : path.resolve(process.cwd(), dbPath);
  mkdirSync(path.dirname(resolved), { recursive: true });
  return resolved;
}

function openDocsDatabase(dbPath: string): DocsDatabase {
  // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
  const Database = require('better-sqlite3') as new (filename: string) => DocsDatabase;
  return new Database(resolveDocsDbPath(dbPath));
}

function createDocsJudge(cfg: Config) {
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

function seedDocsVariants(
  agentId: string,
  taskType: string,
  model: string,
  toolAllowlist: string[]
): void {
  const variants = [
    {
      promptTemplate: SYSTEM_PROMPT,
      temperature: 0.1,
      maxTokens: 3072,
      notes: 'baseline-docs-agent',
    },
    {
      promptTemplate: `${SYSTEM_PROMPT}\n\nExecution style: prefer no_changes over speculative edits. Update only when the merge clearly changes public behavior, setup, or release notes.`,
      temperature: 0.05,
      maxTokens: 2560,
      notes: 'conservative-docs-agent',
    },
    {
      promptTemplate: `${SYSTEM_PROMPT}\n\nExecution style: make the CHANGELOG exact and minimal first, then touch README only if the merge changes setup, public capabilities, or operator-facing behavior.`,
      temperature: 0.15,
      maxTokens: 3072,
      notes: 'changelog-first-docs-agent',
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
          'Only edit README.md and CHANGELOG.md files that live inside the repository. Never touch source code, workflows, or configs.',
      },
    });
  }
}

function detectChangedDocs(repoRoot: string, before: Map<string, string>): string[] {
  const after = collectDocSnapshots(repoRoot);
  const changed = new Set<string>();

  for (const [file, original] of before) {
    if ((after.get(file) ?? '') !== original) {
      changed.add(file);
    }
  }
  for (const [file, current] of after) {
    if (!before.has(file) && current !== '') {
      changed.add(file);
    }
  }

  return [...changed].sort();
}

function collectMergeChangedPaths(repoRoot: string, mergeSha?: string): string[] {
  const target = mergeSha ?? 'HEAD';
  try {
    const output = execSync(`git show --name-only --format= ${target}`, {
      cwd: repoRoot,
      encoding: 'utf-8',
    });
    return output
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean)
      .sort();
  } catch (error) {
    console.error('[docs-agent] failed to collect merge paths:', error);
    return [];
  }
}

function deriveExpectedDocTargets(mergeChangedPaths: string[]): string[] {
  if (mergeChangedPaths.length === 0) return [];

  const targets = new Set<string>(['CHANGELOG.md']);
  const scopedAreas = new Set<string>();

  for (const changedPath of mergeChangedPaths) {
    if (!changedPath) continue;
    if (!changedPath.includes('/')) {
      targets.add('README.md');
      targets.add('CHANGELOG.md');
      continue;
    }

    const parts = changedPath.split('/');
    const scope =
      (parts[0] === 'services' || parts[0] === 'packages') && parts.length >= 2
        ? `${parts[0]}/${parts[1]}`
        : parts[0];
    scopedAreas.add(scope);
    targets.add(`${scope}/README.md`);
    targets.add(`${scope}/CHANGELOG.md`);
  }

  if (scopedAreas.size > 1) {
    targets.add('README.md');
  }

  return [...targets].sort();
}

function parseReportedFiles(value: string | undefined): string[] {
  if (!value || value === 'none') return [];
  return value
    .split(',')
    .map(file => file.trim())
    .filter(Boolean)
    .sort();
}

function sameFileList(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((file, index) => file === right[index]);
}

export { deriveExpectedDocTargets, sameFileList };

export function assessDocsOutcome(params: {
  mergeSha?: string;
  model: string;
  durationMs: number;
  toolUses: number;
  finalText: string;
  changedFiles: string[];
  mergeChangedPaths?: string[];
  costUsd?: number;
  variantId?: string | null;
  variantStrategy?: string | null;
}): AgentOutcomeAssessment {
  const fields = parseTaggedFields(params.finalText);
  const reportedFiles = parseReportedFiles(fields.FILES);
  const hasError = params.finalText.trim().startsWith('Error:');
  const outcome =
    fields.OUTCOME ?? (params.changedFiles.length > 0 ? 'updated_docs' : 'no_changes');
  const status = hasError ? 'failure' : params.changedFiles.length > 0 ? 'success' : 'neutral';
  const expectedDocTargets = deriveExpectedDocTargets(params.mergeChangedPaths ?? []);
  const outcomeMatchesFiles =
    (outcome === 'updated_docs' && params.changedFiles.length > 0) ||
    (outcome === 'no_changes' && params.changedFiles.length === 0);
  const changelogSatisfied =
    params.changedFiles.length === 0 ||
    params.changedFiles.some(file => file.endsWith('CHANGELOG.md'));
  const docsScopedToChangedAreas =
    params.changedFiles.length === 0 ||
    expectedDocTargets.length === 0 ||
    params.changedFiles.every(file => expectedDocTargets.includes(file));
  const rootReadmeReasonable =
    !params.changedFiles.includes('README.md') || expectedDocTargets.includes('README.md');

  return assessAgentOutcome({
    service: 'kamiyo-docs-agent',
    taskType: 'docs_regeneration',
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
      { name: 'summary_present', value: Boolean(fields.SUMMARY), weight: 1 },
      { name: 'docs_updated', value: params.changedFiles.length > 0, weight: 3 },
      { name: 'outcome_matches_files', value: outcomeMatchesFiles, weight: 3 },
      {
        name: 'reported_files_match_actual',
        value: sameFileList(reportedFiles, params.changedFiles),
        weight: 2,
      },
      { name: 'docs_scoped_to_changed_areas', value: docsScopedToChangedAreas, weight: 2.5 },
      { name: 'root_readme_reasonable', value: rootReadmeReasonable, weight: 1.5 },
      { name: 'updated_changelog_when_needed', value: changelogSatisfied, weight: 1.5 },
      { name: 'clean_exit', value: !hasError, weight: 2 },
    ],
    metadata: {
      merge_sha: params.mergeSha ?? 'HEAD',
      changed_files: params.changedFiles,
      reported_files: reportedFiles,
      merge_changed_paths: params.mergeChangedPaths ?? [],
      expected_doc_targets: expectedDocTargets,
    },
  });
}

export async function runDocsAgent(cfg: Config, mergeContext: string) {
  const model = cfg.CLAUDE_MODEL;
  console.log(`[docs-agent] model=${model}`);
  const startTime = Date.now();
  const repoRoot = path.resolve(process.cwd(), '../..');
  const beforeDocs = collectDocSnapshots(repoRoot);
  const mergeChangedPaths = collectMergeChangedPaths(repoRoot, cfg.MERGE_SHA);
  const db = cfg.SELF_IMPROVE_ENABLED ? openDocsDatabase(cfg.DOCS_AGENT_DB_PATH) : undefined;
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
    db,
    selfImprove: cfg.SELF_IMPROVE_ENABLED
      ? {
          enabled: true,
          taskType: cfg.SELF_IMPROVE_TASK_TYPE,
          autoScore: false,
          recordInteractions: false,
          rubric: SELF_IMPROVE_RUBRIC,
          rubricModel: cfg.SELF_IMPROVE_JUDGE_MODEL,
          rubricBudgetUsd: cfg.DAILY_USD_MAX,
          minSamples: cfg.SELF_IMPROVE_MIN_SAMPLES,
          pThreshold: cfg.SELF_IMPROVE_P_THRESHOLD,
          sweepIntervalMs: 12 * 60 * 60 * 1000,
        }
      : { enabled: false },
    selfImproveInit: cfg.SELF_IMPROVE_ENABLED ? { judgeLLM: createDocsJudge(cfg) } : undefined,
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
  let toolUses = 0;
  let finalText = '';
  let runId = '';
  let outcomeAssessment: AgentOutcomeAssessment | null = null;
  try {
    await agent.start();
    if (cfg.SELF_IMPROVE_ENABLED) {
      seedDocsVariants(agent.id, agent.selfImprove.taskType, model, agent.tools);
    }

    for await (const event of agent.stream(userPrompt)) {
      if (event.type === 'text' && event.text.trim()) {
        console.log(`[agent] ${event.text}`);
        continue;
      }

      if (event.type === 'tool_call') {
        toolUses += 1;
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
        runId = event.result.runId;
        durationMs = event.result.durationMs;
        finalText = event.result.text;
        console.log(`[docs-agent] complete: duration=${durationMs}ms`);
      }
    }

    const changedFiles = detectChangedDocs(repoRoot, beforeDocs);
    outcomeAssessment = assessDocsOutcome({
      mergeSha: cfg.MERGE_SHA,
      model,
      durationMs: durationMs || Date.now() - startTime,
      toolUses,
      finalText,
      changedFiles,
      mergeChangedPaths,
      costUsd: 0,
      variantId: agent.selfImprove.currentVariantId,
      variantStrategy: agent.selfImprove.currentStrategy,
    });
    emitOutcomeMetric(outcomeAssessment.metric);
    if (db && runId) {
      const fields = parseTaggedFields(finalText);
      const receipt = recordAgentRunReceipt(db, {
        runId,
        agentId: agent.id,
        service: 'kamiyo-docs-agent',
        taskType: agent.selfImprove.taskType,
        subjectType: 'merge',
        subjectId: cfg.MERGE_SHA ?? 'HEAD',
        variantId: agent.selfImprove.currentVariantId,
        variantStrategy: agent.selfImprove.currentStrategy,
        outcome: outcomeAssessment.metric.outcome,
        qualityScore: outcomeAssessment.qualityScore,
        costUsd: 0,
        durationMs: outcomeAssessment.metric.duration_ms,
        reconcileAfter:
          changedFiles.length > 0
            ? Math.floor(Date.now() / 1000) + cfg.RECONCILE_DELAY_HOURS * 60 * 60
            : null,
        receipt: {
          mergeSha: cfg.MERGE_SHA ?? 'HEAD',
          model,
          changedFiles,
          mergeChangedPaths,
          summary: fields.SUMMARY?.trim() || null,
          initialOutcome: outcomeAssessment.metric.outcome,
          initialQualityScore: outcomeAssessment.qualityScore,
          followUpBranch: null,
          followUpPrUrl: null,
          followUpPrNumber: null,
        },
      });
      await publishAgentLearningRun(buildAgentLearningRunPayload(receipt));
    }
  } finally {
    await agent.stop();
    db?.close();
  }

  return { costUsd: 0, assessment: outcomeAssessment };
}
