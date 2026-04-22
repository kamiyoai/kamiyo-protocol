// SPDX-License-Identifier: MIT
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
import { GitHubClient } from './github';

type AutopilotDatabase = DB & { close(): void };
type PullRequestSnapshot = NonNullable<Awaited<ReturnType<GitHubClient['getPullRequestState']>>>;

const RECONCILE_RETRY_HOURS = 2;

export function assessAutopilotDelayedOutcome(params: {
  issueNumber: number;
  model: string;
  prNumber: number;
  prUrl: string;
  prState: 'open' | 'closed';
  prMerged: boolean;
  prDraft: boolean;
  prMergeableState: string | null;
  ciStatus: 'success' | 'failure' | 'pending' | 'unknown';
  initialHeadSha?: string | null;
  currentHeadSha: string;
  initialOutcome?: string | null;
  mergedAt?: string | null;
  closedAt?: string | null;
  costUsd?: number;
  durationMs?: number;
  variantId?: string | null;
  variantStrategy?: string | null;
}): OutcomeAssessment {
  const followUpPushesNeeded =
    Boolean(params.initialHeadSha) && params.initialHeadSha !== params.currentHeadSha;
  const mergeableReady =
    params.prMergeableState === 'clean' ||
    params.prMergeableState === 'has_hooks' ||
    params.prMergeableState === 'unstable';
  const status = params.prMerged ? 'success' : params.prState === 'closed' ? 'failure' : 'neutral';
  const outcome = params.prMerged ? 'merged_pr' : 'closed_unmerged_pr';

  return assessAgentOutcome({
    service: 'kamiyo-autopilot',
    taskType: 'autopilot_issue_reconciliation',
    status,
    outcome,
    model: params.model,
    durationMs: params.durationMs ?? 0,
    costUsd: params.costUsd ?? 0,
    variantId: params.variantId,
    variantStrategy: params.variantStrategy,
    signals: [
      { name: 'pr_merged', value: params.prMerged, weight: 5 },
      { name: 'ci_green', value: params.ciStatus === 'success', weight: 2.5 },
      {
        name: 'checks_resolved',
        value: params.ciStatus === 'success' || params.ciStatus === 'failure',
        weight: 1.5,
      },
      { name: 'pr_ready_for_merge', value: !params.prDraft && mergeableReady, weight: 1.5 },
      { name: 'no_follow_up_pushes_needed', value: !followUpPushesNeeded, weight: 1.5 },
      { name: 'closed_without_merge', value: !(params.prState === 'closed' && !params.prMerged), weight: 3 },
    ],
    metadata: {
      issue: params.issueNumber,
      pr_number: params.prNumber,
      pr_url: params.prUrl,
      pr_state: params.prState,
      ci_status: params.ciStatus,
      initial_head_sha: params.initialHeadSha ?? null,
      current_head_sha: params.currentHeadSha,
      follow_up_pushes_needed: followUpPushesNeeded,
      initial_outcome: params.initialOutcome ?? null,
      merged_at: params.mergedAt ?? null,
      closed_at: params.closedAt ?? null,
    },
  });
}

export function shouldFinalizeAutopilotReceipt(pr: PullRequestSnapshot): boolean {
  return pr.merged || pr.state === 'closed';
}

function resolveAutopilotDbPath(dbPath: string): string {
  const resolved = path.isAbsolute(dbPath) ? dbPath : path.resolve(process.cwd(), dbPath);
  mkdirSync(path.dirname(resolved), { recursive: true });
  return resolved;
}

function openAutopilotDatabase(dbPath: string): AutopilotDatabase {
  return new Database(resolveAutopilotDbPath(dbPath));
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

function retryAt(hours: number): number {
  return Math.floor(Date.now() / 1000) + Math.max(1, Math.floor(hours)) * 60 * 60;
}

function markAutopilotReceiptReconciled(
  db: AutopilotDatabase,
  receipt: AgentRunReceipt,
  params: {
    assessment?: OutcomeAssessment | null;
    snapshot: Record<string, unknown>;
    reconcileAfter?: number | null;
    delayedRecorded?: boolean;
    note?: string;
  }
): void {
  const existingOutcome = getReceiptString(receipt, 'initialOutcome') ?? receipt.outcome ?? null;
  const existingQuality =
    getReceiptNumber(receipt, 'initialQualityScore') ?? receipt.qualityScore ?? null;

  updateAgentRunReceipt(db, receipt.runId, {
    outcome: params.assessment?.metric.outcome ?? receipt.outcome,
    qualityScore: params.assessment?.qualityScore ?? receipt.qualityScore,
    reconcileAfter:
      params.reconcileAfter !== undefined ? params.reconcileAfter : receipt.reconcileAfter,
    reconciledAt:
      params.assessment || params.note === 'no_pr' || params.note === 'missing_pr'
        ? Math.floor(Date.now() / 1000)
        : null,
    receipt: {
      ...params.snapshot,
      initialOutcome: existingOutcome,
      initialQualityScore: existingQuality,
      delayedOutcome: params.assessment?.metric.outcome ?? null,
      delayedQualityScore: params.assessment?.qualityScore ?? null,
      delayedMetric: params.assessment?.metric ?? null,
      delayedTournamentRecorded: params.delayedRecorded ?? false,
      reconciliationNote: params.note ?? null,
      reconciledAtIso:
        params.assessment || params.note === 'no_pr' || params.note === 'missing_pr'
          ? new Date().toISOString()
          : null,
    },
  });
}

function recordDelayedVariantScore(
  receipt: AgentRunReceipt,
  assessment: OutcomeAssessment
): boolean {
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
    console.error('[autopilot] failed to record delayed variant score:', error);
    return false;
  }
}

export async function reconcilePendingAutopilotReceipts(cfg: Config): Promise<{
  processed: number;
  finalized: number;
  requeued: number;
  skipped: number;
}> {
  const db = openAutopilotDatabase(cfg.AUTOPILOT_DB_PATH);
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
    service: 'kamiyo-autopilot',
    taskType: cfg.SELF_IMPROVE_TASK_TYPE,
  });

  let finalized = 0;
  let requeued = 0;
  let skipped = 0;

  try {
    for (const receipt of pending) {
      const issueNumber = Number(receipt.subjectId ?? getReceiptNumber(receipt, 'issueNumber') ?? 0);
      const prUrl = getReceiptString(receipt, 'prUrl');
      const initialHeadSha = getReceiptString(receipt, 'prHeadSha');
      const model = getReceiptString(receipt, 'model') ?? cfg.CLAUDE_MODEL;

      if (!prUrl) {
        markAutopilotReceiptReconciled(db, receipt, {
          note: 'no_pr',
          snapshot: {
            reconciledPrState: null,
            followUpPushesNeeded: false,
          },
          reconcileAfter: null,
        });
        skipped += 1;
        continue;
      }

      const prState = await github.getPullRequestState(prUrl);
      if (!prState) {
        markAutopilotReceiptReconciled(db, receipt, {
          note: 'missing_pr',
          snapshot: {
            reconciledPrState: 'missing',
            followUpPushesNeeded: false,
          },
          reconcileAfter: null,
        });
        skipped += 1;
        continue;
      }

      const snapshot = {
        reconciledPrState: prState.state,
        reconciledCiStatus: prState.checkState,
        reconciledHeadSha: prState.headSha,
        mergedAt: prState.mergedAt,
        closedAt: prState.closedAt,
        followUpPushesNeeded: Boolean(initialHeadSha) && initialHeadSha !== prState.headSha,
      };

      if (!shouldFinalizeAutopilotReceipt(prState)) {
        markAutopilotReceiptReconciled(db, receipt, {
          snapshot,
          reconcileAfter: retryAt(RECONCILE_RETRY_HOURS),
        });
        console.log(
          `[autopilot] receipt ${receipt.runId.slice(0, 8)} still open; requeueing reconciliation`
        );
        requeued += 1;
        continue;
      }

      const assessment = assessAutopilotDelayedOutcome({
        issueNumber,
        model,
        prNumber: prState.number,
        prUrl: prState.url,
        prState: prState.state,
        prMerged: prState.merged,
        prDraft: prState.draft,
        prMergeableState: prState.mergeableState,
        ciStatus: prState.checkState,
        initialHeadSha,
        currentHeadSha: prState.headSha,
        initialOutcome: getReceiptString(receipt, 'initialOutcome') ?? receipt.outcome,
        mergedAt: prState.mergedAt,
        closedAt: prState.closedAt,
        costUsd: receipt.costUsd,
        durationMs: receipt.durationMs,
        variantId: receipt.variantId,
        variantStrategy: receipt.variantStrategy,
      });

      emitOutcomeMetric(assessment.metric);
      const delayedRecorded = cfg.SELF_IMPROVE_ENABLED
        ? recordDelayedVariantScore(receipt, assessment)
        : false;
      markAutopilotReceiptReconciled(db, receipt, {
        assessment,
        snapshot,
        delayedRecorded,
        reconcileAfter: null,
      });

      console.log(
        `[autopilot] reconciled #${issueNumber} pr=${prState.number} outcome=${assessment.metric.outcome} score=${assessment.qualityScore}`
      );
      finalized += 1;
    }

    return {
      processed: pending.length,
      finalized,
      requeued,
      skipped,
    };
  } finally {
    db.close();
  }
}

async function main() {
  const cfg = loadConfig();
  const result = await reconcilePendingAutopilotReceipts(cfg);
  console.log(
    `[autopilot] reconciliation complete: processed=${result.processed} finalized=${result.finalized} requeued=${result.requeued} skipped=${result.skipped}`
  );
}

if (require.main === module) {
  main().catch(error => {
    console.error('[autopilot] reconcile fatal:', error);
    process.exit(1);
  });
}
