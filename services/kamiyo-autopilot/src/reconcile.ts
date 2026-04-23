// SPDX-License-Identifier: MIT
import 'dotenv/config';
import path from 'node:path';
import { mkdirSync } from 'node:fs';
import Database from 'better-sqlite3';
import {
  acknowledgeAgentLearningCommand,
  advanceDelayedLearningControl,
  applyAgentSchema,
  applyDelayedLearningCommands,
  assessAgentOutcome,
  buildAgentLearningRunPayload,
  createReconciliationPatch,
  deriveAgentLearningAlerts,
  emitOutcomeMetric,
  fetchAgentLearningControlState,
  fetchPendingAgentLearningCommands,
  getReceiptNumber,
  getReceiptString,
  hoursFromNow,
  listPendingAgentRunReceipts,
  publishAgentLearningCanarySnapshot,
  publishAgentLearningPromotion,
  publishAgentLearningRun,
  recordDelayedVariantScore,
  snapshotDelayedLearningCanary,
  updateAgentRunReceipt,
  type AgentLearningCommand,
  type AgentLearningControlState,
  type AgentRunReceipt,
  type DB,
  type OutcomeAssessment,
} from '@kamiyo-org/agent';
import {
  applySchema as applySelfImproveSchema,
  createNoopLogger,
  createNoopMetrics,
  initSelfImprove,
  type DatabaseAdapter,
} from '@kamiyo-org/selfimprove';
import { loadConfig, type Config } from './config';
import { GitHubClient } from './github';

type AutopilotDatabase = DB & { close(): void };
type PullRequestSnapshot = NonNullable<Awaited<ReturnType<GitHubClient['getPullRequestState']>>>;

const RECONCILE_RETRY_HOURS = 2;

export function shouldAdvanceAutopilotLearning(
  controlState: Pick<AgentLearningControlState, 'mode'> | null | undefined
): boolean {
  return controlState?.mode !== 'paused';
}

export async function syncAutopilotLearningCommands(params: {
  taskType: string;
  commands: Pick<AgentLearningCommand, 'id' | 'kind' | 'note'>[];
  acknowledge?: typeof acknowledgeAgentLearningCommand;
  publishPromotion?: typeof publishAgentLearningPromotion;
}): Promise<{ applied: number; failed: number }> {
  const acknowledge = params.acknowledge ?? acknowledgeAgentLearningCommand;
  const publishPromotion = params.publishPromotion ?? publishAgentLearningPromotion;
  const outcomes = applyDelayedLearningCommands({
    taskType: params.taskType,
    commands: params.commands,
  });

  let applied = 0;
  let failed = 0;
  for (const outcome of outcomes) {
    if (outcome.event) {
      await publishPromotion({
        service: 'kamiyo-autopilot',
        taskType: params.taskType,
        variantId: outcome.event.variantId,
        priorVariantId: outcome.event.priorVariantId ?? null,
        eventKind: outcome.event.eventKind,
        payload: outcome.event.payload,
      });
    }
    await acknowledge({
      id: outcome.commandId,
      status: outcome.status,
      result: outcome.result,
    });
    if (outcome.status === 'applied') applied += 1;
    else failed += 1;
  }

  return { applied, failed };
}

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
      {
        name: 'closed_without_merge',
        value: !(params.prState === 'closed' && !params.prMerged),
        weight: 3,
      },
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

async function persistReceiptUpdate(
  db: AutopilotDatabase,
  receipt: AgentRunReceipt,
  params: {
    assessment?: OutcomeAssessment | null;
    snapshot: Record<string, unknown>;
    reconcileAfter?: number | null;
    delayedRecorded?: boolean;
    note?: string | null;
    reconciled?: boolean;
  }
): Promise<AgentRunReceipt | null> {
  const updated = updateAgentRunReceipt(
    db,
    receipt.runId,
    createReconciliationPatch(receipt, {
      assessment: params.assessment,
      snapshot: params.snapshot,
      reconcileAfter: params.reconcileAfter,
      delayedRecorded: params.delayedRecorded,
      note: params.note,
      reconciled: params.reconciled,
    })
  );
  if (updated) {
    await publishAgentLearningRun(buildAgentLearningRunPayload(updated));
  }
  return updated;
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
  const controlState = await fetchAgentLearningControlState({
    service: 'kamiyo-autopilot',
    taskType: cfg.SELF_IMPROVE_TASK_TYPE,
  });
  const pendingCommands = await fetchPendingAgentLearningCommands({
    service: 'kamiyo-autopilot',
    taskType: cfg.SELF_IMPROVE_TASK_TYPE,
  });
  await syncAutopilotLearningCommands({
    taskType: cfg.SELF_IMPROVE_TASK_TYPE,
    commands: pendingCommands,
  });
  const pending = listPendingAgentRunReceipts(db, {
    service: 'kamiyo-autopilot',
    taskType: cfg.SELF_IMPROVE_TASK_TYPE,
  });
  const autoLearningEnabled = shouldAdvanceAutopilotLearning(controlState);

  let finalized = 0;
  let requeued = 0;
  let skipped = 0;

  try {
    for (const receipt of pending) {
      const issueNumber = Number(
        receipt.subjectId ?? getReceiptNumber(receipt, 'issueNumber') ?? 0
      );
      const prUrl = getReceiptString(receipt, 'prUrl');
      const initialHeadSha = getReceiptString(receipt, 'prHeadSha');
      const model = getReceiptString(receipt, 'model') ?? cfg.CLAUDE_MODEL;

      if (!prUrl) {
        await persistReceiptUpdate(db, receipt, {
          note: 'no_pr',
          snapshot: {
            reconciledPrState: null,
            followUpPushesNeeded: false,
          },
          reconcileAfter: null,
          reconciled: true,
        });
        skipped += 1;
        continue;
      }

      const prState = await github.getPullRequestState(prUrl);
      if (!prState) {
        await persistReceiptUpdate(db, receipt, {
          note: 'missing_pr',
          snapshot: {
            reconciledPrState: 'missing',
            followUpPushesNeeded: false,
          },
          reconcileAfter: null,
          reconciled: true,
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
        await persistReceiptUpdate(db, receipt, {
          snapshot,
          reconcileAfter: hoursFromNow(RECONCILE_RETRY_HOURS),
          note: 'pr_still_open',
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
        ? recordDelayedVariantScore(receipt.taskType, receipt.variantId, assessment)
        : false;
      await persistReceiptUpdate(db, receipt, {
        assessment,
        snapshot,
        delayedRecorded,
        reconcileAfter: null,
      });
      if (cfg.SELF_IMPROVE_ENABLED && autoLearningEnabled) {
        const events = advanceDelayedLearningControl({
          taskType: receipt.taskType,
          minSamples: cfg.SELF_IMPROVE_MIN_SAMPLES,
          pThreshold: cfg.SELF_IMPROVE_P_THRESHOLD,
        });
        for (const event of events) {
          await publishAgentLearningPromotion({
            service: 'kamiyo-autopilot',
            taskType: receipt.taskType,
            variantId: event.variantId,
            priorVariantId: event.priorVariantId ?? null,
            eventKind: event.eventKind,
            payload: event.payload,
          });
        }
      }

      console.log(
        `[autopilot] reconciled #${issueNumber} pr=${prState.number} outcome=${assessment.metric.outcome} score=${assessment.qualityScore}`
      );
      finalized += 1;
    }

    const remainingPending = listPendingAgentRunReceipts(db, {
      service: 'kamiyo-autopilot',
      taskType: cfg.SELF_IMPROVE_TASK_TYPE,
    });
    const snapshot = snapshotDelayedLearningCanary({
      service: 'kamiyo-autopilot',
      taskType: cfg.SELF_IMPROVE_TASK_TYPE,
      pThreshold: cfg.SELF_IMPROVE_P_THRESHOLD,
    });
    await publishAgentLearningCanarySnapshot({
      ...snapshot,
      alerts: deriveAgentLearningAlerts({
        pendingReconciliations: remainingPending.length,
        canarySnapshot: snapshot.status === 'active' ? snapshot : null,
      }),
    });

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
