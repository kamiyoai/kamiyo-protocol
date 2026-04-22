import 'dotenv/config';
import path from 'node:path';
import { mkdirSync } from 'node:fs';
import Database from 'better-sqlite3';
import {
  applyAgentSchema,
  assessAgentOutcome,
  emitOutcomeMetric,
  listPendingAgentRunReceipts,
  updateAgentRunReceipt,
  type AgentRunReceipt,
  type DB,
  type OutcomeAssessment,
} from '@kamiyo-org/agent';
import {
  applySchema as applySelfImproveSchema,
  createNoopLogger,
  createNoopMetrics,
  getOrCreateStandingTournament,
  initSelfImprove,
  recordTournamentEntry,
  type DatabaseAdapter,
} from '@kamiyo-org/selfimprove';
import { loadConfig, type Config } from './config';
import { deriveExpectedDocTargets, sameFileList } from './agent';
import { GitHubClient, type PullRequestSnapshot } from './github';

type DocsDatabase = DB & { close(): void };

const RECONCILE_RETRY_HOURS = 4;

function resolveDocsDbPath(dbPath: string): string {
  const resolved = path.isAbsolute(dbPath) ? dbPath : path.resolve(process.cwd(), dbPath);
  mkdirSync(path.dirname(resolved), { recursive: true });
  return resolved;
}

function openDocsDatabase(dbPath: string): DocsDatabase {
  return new Database(resolveDocsDbPath(dbPath));
}

function getReceiptString(receipt: AgentRunReceipt, key: string): string | null {
  const value = receipt.receipt[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function getReceiptNumber(receipt: AgentRunReceipt, key: string): number | null {
  const value = receipt.receipt[key];
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function getReceiptFiles(receipt: AgentRunReceipt, key: string): string[] {
  const value = receipt.receipt[key];
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).sort();
}

function isDocsFile(file: string): boolean {
  return file.endsWith('README.md') || file.endsWith('CHANGELOG.md');
}

function retryAt(hours: number): number {
  return Math.floor(Date.now() / 1000) + Math.max(1, Math.floor(hours)) * 60 * 60;
}

export function assessDocsDelayedOutcome(params: {
  mergeSha: string;
  model: string;
  changedFiles: string[];
  mergeChangedPaths: string[];
  mergedFiles: string[];
  prNumber?: number | null;
  prUrl?: string | null;
  prState?: 'open' | 'closed' | 'missing';
  prMerged: boolean;
  followUpBranch?: string | null;
  prHeadRef?: string | null;
  initialOutcome?: string | null;
  mergedAt?: string | null;
  closedAt?: string | null;
  costUsd?: number;
  durationMs?: number;
  variantId?: string | null;
  variantStrategy?: string | null;
}): OutcomeAssessment {
  const expectedDocTargets = deriveExpectedDocTargets(params.mergeChangedPaths);
  const changedFiles = [...params.changedFiles].sort();
  const mergedFiles = [...params.mergedFiles].sort();
  const prOpened = Boolean(params.prNumber || params.prUrl);
  const branchMatchesPr =
    Boolean(params.followUpBranch) &&
    Boolean(params.prHeadRef) &&
    params.followUpBranch === params.prHeadRef;
  const mergedDocsOnly = mergedFiles.length > 0 && mergedFiles.every(isDocsFile);
  const mergedFilesMatchReceipt = mergedFiles.length > 0 && sameFileList(mergedFiles, changedFiles);
  const mergedTargetsMatchExpected =
    mergedFiles.length > 0 &&
    (expectedDocTargets.length === 0 || mergedFiles.every(file => expectedDocTargets.includes(file)));

  const outcome = !prOpened
    ? 'missing_follow_up_pr'
    : params.prMerged
      ? 'docs_pr_merged'
      : 'docs_pr_closed_unmerged';

  return assessAgentOutcome({
    service: 'kamiyo-docs-agent',
    taskType: 'docs_regeneration_reconciliation',
    status: params.prMerged ? 'success' : 'failure',
    outcome,
    model: params.model,
    durationMs: params.durationMs ?? 0,
    costUsd: params.costUsd ?? 0,
    variantId: params.variantId,
    variantStrategy: params.variantStrategy,
    signals: [
      { name: 'follow_up_pr_opened', value: prOpened, weight: 2.5 },
      { name: 'follow_up_pr_merged', value: params.prMerged, weight: 5 },
      { name: 'branch_matches_pr_head', value: branchMatchesPr, weight: 1.5 },
      { name: 'merged_docs_only', value: mergedDocsOnly, weight: 2 },
      { name: 'merged_files_match_receipt', value: mergedFilesMatchReceipt, weight: 3 },
      { name: 'merged_targets_match_expected', value: mergedTargetsMatchExpected, weight: 2.5 },
      { name: 'not_closed_unmerged', value: outcome === 'docs_pr_merged', weight: 3 },
    ],
    metadata: {
      merge_sha: params.mergeSha,
      changed_files: changedFiles,
      merged_files: mergedFiles,
      merge_changed_paths: params.mergeChangedPaths,
      expected_doc_targets: expectedDocTargets,
      pr_number: params.prNumber ?? null,
      pr_url: params.prUrl ?? null,
      pr_state: params.prState ?? 'missing',
      follow_up_branch: params.followUpBranch ?? null,
      pr_head_ref: params.prHeadRef ?? null,
      initial_outcome: params.initialOutcome ?? null,
      merged_at: params.mergedAt ?? null,
      closed_at: params.closedAt ?? null,
    },
  });
}

export function shouldFinalizeDocsReceipt(pr: PullRequestSnapshot): boolean {
  return pr.merged || pr.state === 'closed';
}

function markDocsReceiptReconciled(
  db: DocsDatabase,
  receipt: AgentRunReceipt,
  params: {
    assessment?: OutcomeAssessment | null;
    snapshot: Record<string, unknown>;
    reconcileAfter?: number | null;
    delayedRecorded?: boolean;
    note?: string | null;
  }
): void {
  const existingOutcome = getReceiptString(receipt, 'initialOutcome') ?? receipt.outcome ?? null;
  const existingQuality =
    getReceiptNumber(receipt, 'initialQualityScore') ?? receipt.qualityScore ?? null;
  const reconciledNow = Boolean(params.assessment);

  updateAgentRunReceipt(db, receipt.runId, {
    outcome: params.assessment?.metric.outcome ?? receipt.outcome,
    qualityScore: params.assessment?.qualityScore ?? receipt.qualityScore,
    reconcileAfter:
      params.reconcileAfter !== undefined ? params.reconcileAfter : receipt.reconcileAfter,
    reconciledAt: reconciledNow ? Math.floor(Date.now() / 1000) : null,
    receipt: {
      ...params.snapshot,
      initialOutcome: existingOutcome,
      initialQualityScore: existingQuality,
      delayedOutcome: params.assessment?.metric.outcome ?? null,
      delayedQualityScore: params.assessment?.qualityScore ?? null,
      delayedMetric: params.assessment?.metric ?? null,
      delayedTournamentRecorded: params.delayedRecorded ?? false,
      reconciliationNote: params.note ?? null,
      reconciledAtIso: reconciledNow ? new Date().toISOString() : null,
    },
  });
}

function recordDelayedVariantScore(receipt: AgentRunReceipt, assessment: OutcomeAssessment): boolean {
  if (!receipt.variantId) return false;
  try {
    const tournament = getOrCreateStandingTournament(receipt.taskType);
    const result = recordTournamentEntry({
      tournamentId: tournament.id,
      variantId: receipt.variantId,
      qualityScore: assessment.qualityScore,
      cost: assessment.metric.cost_usd,
      latencyMs: assessment.metric.duration_ms,
      outcome: assessment.metric.outcome,
    });
    return result.ok;
  } catch (error) {
    console.error('[docs-agent] failed to record delayed variant score:', error);
    return false;
  }
}

export async function reconcilePendingDocsReceipts(cfg: Config): Promise<{
  processed: number;
  finalized: number;
  requeued: number;
}> {
  const db = openDocsDatabase(cfg.DOCS_AGENT_DB_PATH);
  applyAgentSchema(db);

  if (cfg.SELF_IMPROVE_ENABLED) {
    const selfImproveDb = db as unknown as DatabaseAdapter;
    initSelfImprove({
      db: selfImproveDb,
      logger: createNoopLogger(),
      metrics: createNoopMetrics(),
    });
    applySelfImproveSchema(selfImproveDb);
  }

  const github = new GitHubClient(cfg);
  const pending = listPendingAgentRunReceipts(db, {
    service: 'kamiyo-docs-agent',
    taskType: cfg.SELF_IMPROVE_TASK_TYPE,
  });

  let finalized = 0;
  let requeued = 0;

  try {
    for (const receipt of pending) {
      const mergeSha = getReceiptString(receipt, 'mergeSha') ?? receipt.subjectId ?? 'HEAD';
      const followUpBranch = getReceiptString(receipt, 'followUpBranch');
      const changedFiles = getReceiptFiles(receipt, 'changedFiles');
      const mergeChangedPaths = getReceiptFiles(receipt, 'mergeChangedPaths');
      const model = getReceiptString(receipt, 'model') ?? cfg.CLAUDE_MODEL;

      let prUrl = getReceiptString(receipt, 'followUpPrUrl');
      let prNumber = getReceiptNumber(receipt, 'followUpPrNumber');
      let prState = prUrl ? await github.getPullRequestState(prUrl) : null;

      if (!prState && followUpBranch) {
        prState = await github.findPullRequestByBranch(followUpBranch);
        if (prState) {
          prUrl = prState.url;
          prNumber = prState.number;
        }
      }

      if (prState && !shouldFinalizeDocsReceipt(prState)) {
        markDocsReceiptReconciled(db, receipt, {
          snapshot: {
            followUpBranch,
            followUpPrUrl: prState.url,
            followUpPrNumber: prState.number,
            reconciledPrState: prState.state,
            reconciledHeadRef: prState.headRef,
            reconciledHeadSha: prState.headSha,
            mergedAt: prState.mergedAt,
            closedAt: prState.closedAt,
          },
          reconcileAfter: retryAt(RECONCILE_RETRY_HOURS),
          note: 'pr_still_open',
        });
        console.log(
          `[docs-agent] receipt ${receipt.runId.slice(0, 8)} still open; requeueing reconciliation`
        );
        requeued += 1;
        continue;
      }

      const mergedFiles = prNumber ? await github.listPullRequestFiles(prNumber) : [];
      const assessment = assessDocsDelayedOutcome({
        mergeSha,
        model,
        changedFiles,
        mergeChangedPaths,
        mergedFiles,
        prNumber,
        prUrl,
        prState: prState?.state ?? 'missing',
        prMerged: prState?.merged ?? false,
        followUpBranch,
        prHeadRef: prState?.headRef ?? null,
        initialOutcome: getReceiptString(receipt, 'initialOutcome') ?? receipt.outcome,
        mergedAt: prState?.mergedAt ?? null,
        closedAt: prState?.closedAt ?? null,
        costUsd: receipt.costUsd,
        durationMs: receipt.durationMs,
        variantId: receipt.variantId,
        variantStrategy: receipt.variantStrategy,
      });

      emitOutcomeMetric(assessment.metric);
      const delayedRecorded = cfg.SELF_IMPROVE_ENABLED
        ? recordDelayedVariantScore(receipt, assessment)
        : false;

      markDocsReceiptReconciled(db, receipt, {
        assessment,
        snapshot: {
          followUpBranch,
          followUpPrUrl: prState?.url ?? prUrl ?? null,
          followUpPrNumber: prState?.number ?? prNumber ?? null,
          reconciledPrState: prState?.state ?? 'missing',
          reconciledHeadRef: prState?.headRef ?? null,
          reconciledHeadSha: prState?.headSha ?? null,
          mergedFiles,
          mergedAt: prState?.mergedAt ?? null,
          closedAt: prState?.closedAt ?? null,
        },
        delayedRecorded,
        reconcileAfter: null,
        note: prState ? null : 'missing_pr',
      });

      console.log(
        `[docs-agent] reconciled merge ${mergeSha.slice(0, 8)} outcome=${assessment.metric.outcome} score=${assessment.qualityScore}`
      );
      finalized += 1;
    }

    return {
      processed: pending.length,
      finalized,
      requeued,
    };
  } finally {
    db.close();
  }
}

async function main() {
  const cfg = loadConfig();
  const result = await reconcilePendingDocsReceipts(cfg);
  console.log(
    `[docs-agent] reconciliation complete: processed=${result.processed} finalized=${result.finalized} requeued=${result.requeued}`
  );
}

if (require.main === module) {
  main().catch(error => {
    console.error('[docs-agent] reconcile fatal:', error);
    process.exit(1);
  });
}
