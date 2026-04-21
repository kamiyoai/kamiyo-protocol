import path from 'node:path';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import {
  assessAgentOutcome,
  createAgent,
  emitOutcomeMetric,
  genericProvider,
  parseTaggedFields,
  type OutcomeAssessment as AgentOutcomeAssessment,
} from '@kamiyo-org/agent';
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

function collectDocSnapshots(repoRoot: string): Map<string, string> {
  const output = execSync(`find '${repoRoot}' -type f \\( -name 'README.md' -o -name 'CHANGELOG.md' \\) | sort`, {
    encoding: 'utf-8',
  });
  const snapshots = new Map<string, string>();
  for (const filePath of output.split('\n').map(line => line.trim()).filter(Boolean)) {
    const relative = path.relative(repoRoot, filePath);
    snapshots.set(relative, readFileSync(filePath, 'utf-8'));
  }
  return snapshots;
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

export function assessDocsOutcome(params: {
  mergeSha?: string;
  model: string;
  durationMs: number;
  toolUses: number;
  finalText: string;
  changedFiles: string[];
  costUsd?: number;
  variantId?: string | null;
  variantStrategy?: string | null;
}): AgentOutcomeAssessment {
  const fields = parseTaggedFields(params.finalText);
  const reportedFiles = parseReportedFiles(fields.FILES);
  const hasError = params.finalText.trim().startsWith('Error:');
  const outcome = fields.OUTCOME ?? (params.changedFiles.length > 0 ? 'updated_docs' : 'no_changes');
  const status = hasError ? 'failure' : params.changedFiles.length > 0 ? 'success' : 'neutral';
  const outcomeMatchesFiles =
    (outcome === 'updated_docs' && params.changedFiles.length > 0) ||
    (outcome === 'no_changes' && params.changedFiles.length === 0);
  const changelogSatisfied =
    params.changedFiles.length === 0 || params.changedFiles.some(file => file.endsWith('CHANGELOG.md'));

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
      { name: 'reported_files_match_actual', value: sameFileList(reportedFiles, params.changedFiles), weight: 2 },
      { name: 'updated_changelog_when_needed', value: changelogSatisfied, weight: 1.5 },
      { name: 'clean_exit', value: !hasError, weight: 2 },
    ],
    metadata: {
      merge_sha: params.mergeSha ?? 'HEAD',
      changed_files: params.changedFiles,
      reported_files: reportedFiles,
    },
  });
}

export async function runDocsAgent(cfg: Config, mergeContext: string) {
  const model = cfg.CLAUDE_MODEL;
  console.log(`[docs-agent] model=${model}`);
  const repoRoot = path.resolve(process.cwd(), '../..');
  const beforeDocs = collectDocSnapshots(repoRoot);
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
  let toolUses = 0;
  let finalText = '';
  let outcomeAssessment: AgentOutcomeAssessment | null = null;
  try {
    await agent.start();

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
        durationMs = event.result.durationMs;
        finalText = event.result.text;
        console.log(`[docs-agent] complete: duration=${durationMs}ms`);
      }
    }

    const changedFiles = detectChangedDocs(repoRoot, beforeDocs);
    outcomeAssessment = assessDocsOutcome({
      mergeSha: cfg.MERGE_SHA,
      model,
      durationMs,
      toolUses,
      finalText,
      changedFiles,
      costUsd: 0,
      variantId: agent.selfImprove.currentVariantId,
      variantStrategy: agent.selfImprove.currentStrategy,
    });
    emitOutcomeMetric(outcomeAssessment.metric);
    agent.selfImprove.recordOutcomeScore({
      qualityScore: outcomeAssessment.qualityScore,
      latencyMs: outcomeAssessment.metric.duration_ms,
      costUsd: 0,
      outcome: outcomeAssessment.metric.outcome,
    });
  } finally {
    await agent.stop();
  }

  return { costUsd: 0, assessment: outcomeAssessment };
}
