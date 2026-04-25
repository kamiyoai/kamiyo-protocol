import 'dotenv/config';
import path from 'node:path';
import { mkdirSync } from 'node:fs';
import Database from 'better-sqlite3';
import {
  applyAgentSchema,
  assessAgentLearningDbPath,
  assessAgentOutcome,
  buildAgentLearningRunPayload,
  createAgentLearningControlLoopRunId,
  createReconciliationPatch,
  deriveAgentLearningAlerts,
  emitOutcomeMetric,
  getReceiptFiles,
  getReceiptString,
  hoursFromNow,
  listPendingAgentRunReceipts,
  publishAgentLearningCanarySnapshot,
  publishAgentLearningControlLoopRun,
  publishAgentLearningRun,
  recordDelayedVariantScore,
  snapshotDelayedLearningCanary,
  updateAgentRunReceipt,
  type AgentRunReceipt,
  type DB,
} from '@kamiyo-org/agent';
import {
  applySchema as applySelfImproveSchema,
  createNoopLogger,
  createNoopMetrics,
  initSelfImprove,
  type DatabaseAdapter,
} from '@kamiyo-org/selfimprove';
import { assessMarketingDelayedOutcome } from './agent';
import { loadConfig, type Config } from './config';
import { PostizClient } from './postiz';

type MarketingDatabase = DB & { close(): void };

const RECONCILE_RETRY_HOURS = 2;

export type MarketingReconciliationState =
  | {
      kind: 'still_scheduled' | 'published' | 'missing_after_schedule' | 'awaiting_publish_window';
      publishedIds: string[];
      stillScheduledIds: string[];
      latestScheduledAt: string | null;
    }
  | {
      kind: 'no_scheduled_posts';
      publishedIds: [];
      stillScheduledIds: [];
      latestScheduledAt: null;
    };

function resolveMarketingDbPath(dbPath: string): string {
  const resolved = path.isAbsolute(dbPath) ? dbPath : path.resolve(process.cwd(), dbPath);
  mkdirSync(path.dirname(resolved), { recursive: true });
  return resolved;
}

function openMarketingDatabase(dbPath: string): MarketingDatabase {
  return new Database(resolveMarketingDbPath(dbPath));
}

export function classifyMarketingReconciliation(params: {
  scheduledIds: string[];
  scheduledFor: string[];
  scheduledSet: ReadonlySet<string>;
  publishedSet: ReadonlySet<string>;
  now?: number | Date;
}): MarketingReconciliationState {
  if (params.scheduledIds.length === 0) {
    return {
      kind: 'no_scheduled_posts',
      publishedIds: [],
      stillScheduledIds: [],
      latestScheduledAt: null,
    };
  }

  const publishedIds = params.scheduledIds.filter(id => params.publishedSet.has(id));
  const stillScheduledIds = params.scheduledIds.filter(id => params.scheduledSet.has(id));
  const latestScheduledAt = latestScheduledIso(params.scheduledFor);
  if (publishedIds.length > 0) {
    return {
      kind: 'published',
      publishedIds,
      stillScheduledIds,
      latestScheduledAt,
    };
  }
  if (stillScheduledIds.length > 0) {
    return {
      kind: 'still_scheduled',
      publishedIds,
      stillScheduledIds,
      latestScheduledAt,
    };
  }

  const nowMs = typeof params.now === 'number' ? params.now : (params.now?.getTime() ?? Date.now());
  const latestScheduledMs = latestScheduledAt ? Date.parse(latestScheduledAt) : NaN;
  if (Number.isFinite(latestScheduledMs) && latestScheduledMs > nowMs) {
    return {
      kind: 'awaiting_publish_window',
      publishedIds,
      stillScheduledIds,
      latestScheduledAt,
    };
  }

  return {
    kind: 'missing_after_schedule',
    publishedIds,
    stillScheduledIds,
    latestScheduledAt,
  };
}

async function persistReceiptUpdate(
  db: MarketingDatabase,
  receipt: AgentRunReceipt,
  params: {
    assessment?: ReturnType<typeof assessAgentOutcome> | null;
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

export async function reconcilePendingMarketingReceipts(cfg: Config): Promise<{
  processed: number;
  finalized: number;
  requeued: number;
  skipped: number;
}> {
  const service = 'kamiyo-marketing-agent';
  const taskType = cfg.SELF_IMPROVE_TASK_TYPE;
  const loopRunId = createAgentLearningControlLoopRunId(service);
  const startedAt = Math.floor(Date.now() / 1000);
  const trigger =
    process.env.AGENT_LEARNING_CONTROL_LOOP_TRIGGER || process.env.GITHUB_EVENT_NAME || 'manual';
  const dbPathSafety = assessAgentLearningDbPath({
    dbPath: cfg.MARKETING_AGENT_DB_PATH,
    cwd: process.cwd(),
    githubWorkspace: process.env.GITHUB_WORKSPACE,
  });
  if (dbPathSafety.unsafe) {
    console.warn(`[marketing-agent] unsafe learning DB path: ${dbPathSafety.reason}`);
  }

  await publishAgentLearningControlLoopRun({
    id: loopRunId,
    service,
    taskType,
    trigger,
    status: 'started',
    processed: 0,
    finalized: 0,
    requeued: 0,
    skipped: 0,
    commandsApplied: 0,
    commandsFailed: 0,
    startedAt,
    result: {
      readOnlyPromotionControl: true,
      dbPath: dbPathSafety.resolvedPath,
      unsafeStateReason: dbPathSafety.reason,
    },
  });

  let db: MarketingDatabase | null = null;
  let processed = 0;
  let finalized = 0;
  let requeued = 0;
  let skipped = 0;

  try {
    db = openMarketingDatabase(cfg.MARKETING_AGENT_DB_PATH);
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

    const pending = listPendingAgentRunReceipts(db, {
      service,
      taskType,
    });
    processed = pending.length;

    const scheduledPosts =
      !cfg.DRY_RUN && pending.length > 0 ? await new PostizClient(cfg).listScheduled() : [];
    const publishedPosts =
      !cfg.DRY_RUN && pending.length > 0 ? await new PostizClient(cfg).listPublished() : [];
    const scheduledSet = new Set(scheduledPosts.map(post => post.id));
    const publishedSet = new Set(publishedPosts.map(post => post.id));

    for (const receipt of pending) {
      const scheduledIds = getReceiptFiles(receipt, 'scheduledIds');
      const scheduledFor = getReceiptFiles(receipt, 'scheduledFor');
      const model = getReceiptString(receipt, 'model') ?? cfg.CLAUDE_MODEL;
      const state = classifyMarketingReconciliation({
        scheduledIds,
        scheduledFor,
        scheduledSet,
        publishedSet,
      });

      if (state.kind === 'no_scheduled_posts') {
        await persistReceiptUpdate(db, receipt, {
          note: state.kind,
          snapshot: {
            scheduledIds,
            publishedPostIds: [],
            stillScheduledIds: [],
            latestScheduledAt: null,
          },
          reconcileAfter: null,
          reconciled: true,
        });
        skipped += 1;
        continue;
      }

      if (state.kind === 'still_scheduled' || state.kind === 'awaiting_publish_window') {
        await persistReceiptUpdate(db, receipt, {
          note: state.kind,
          snapshot: {
            scheduledIds,
            publishedPostIds: state.publishedIds,
            stillScheduledIds: state.stillScheduledIds,
            latestScheduledAt: state.latestScheduledAt,
          },
          reconcileAfter: hoursFromNow(RECONCILE_RETRY_HOURS),
        });
        console.log(
          `[marketing-agent] receipt ${receipt.runId.slice(0, 8)} still pending publication; requeueing reconciliation`
        );
        requeued += 1;
        continue;
      }

      const assessment = assessMarketingDelayedOutcome({
        model,
        scheduledIds,
        publishedIds: state.publishedIds,
        latestScheduledAt: state.latestScheduledAt,
        initialOutcome: getReceiptString(receipt, 'initialOutcome') ?? receipt.outcome,
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
        snapshot: {
          scheduledIds,
          publishedPostIds: state.publishedIds,
          stillScheduledIds: state.stillScheduledIds,
          latestScheduledAt: state.latestScheduledAt,
        },
        delayedRecorded,
        reconcileAfter: null,
        note: state.kind === 'published' ? null : 'missing_after_schedule',
      });
      console.log(
        `[marketing-agent] reconciled ${receipt.runId.slice(0, 8)} outcome=${assessment.metric.outcome} score=${assessment.qualityScore}`
      );
      finalized += 1;
    }

    const remainingPending = listPendingAgentRunReceipts(db, {
      service,
      taskType,
    });
    const snapshot = snapshotDelayedLearningCanary({
      service,
      taskType,
      pThreshold: cfg.SELF_IMPROVE_P_THRESHOLD,
    });
    await publishAgentLearningCanarySnapshot({
      ...snapshot,
      alerts: deriveAgentLearningAlerts({
        pendingReconciliations: remainingPending.length,
        canarySnapshot: snapshot.status === 'active' ? snapshot : null,
        unsafeStateReason: dbPathSafety.reason,
      }),
    });

    await publishAgentLearningControlLoopRun({
      id: loopRunId,
      service,
      taskType,
      trigger,
      status: 'succeeded',
      processed,
      finalized,
      requeued,
      skipped,
      commandsApplied: 0,
      commandsFailed: 0,
      startedAt,
      completedAt: Math.floor(Date.now() / 1000),
      result: {
        blockedAutoReason: 'marketing_agent_read_only_this_sprint',
        readOnlyPromotionControl: true,
        dbPath: dbPathSafety.resolvedPath,
        unsafeStateReason: dbPathSafety.reason,
      },
    });

    return {
      processed,
      finalized,
      requeued,
      skipped,
    };
  } catch (error) {
    await publishAgentLearningControlLoopRun({
      id: loopRunId,
      service,
      taskType,
      trigger,
      status: 'failed',
      processed,
      finalized,
      requeued,
      skipped,
      commandsApplied: 0,
      commandsFailed: 0,
      startedAt,
      completedAt: Math.floor(Date.now() / 1000),
      result: {
        error: error instanceof Error ? error.message : String(error),
        blockedAutoReason: 'marketing_agent_read_only_this_sprint',
        readOnlyPromotionControl: true,
        dbPath: dbPathSafety.resolvedPath,
        unsafeStateReason: dbPathSafety.reason,
      },
    });
    throw error;
  } finally {
    db?.close();
  }
}

function latestScheduledIso(values: string[]): string | null {
  let latest: string | null = null;
  let latestMs = -1;
  for (const value of values) {
    const ms = Date.parse(value);
    if (Number.isFinite(ms) && ms > latestMs) {
      latest = value;
      latestMs = ms;
    }
  }
  return latest;
}

async function main() {
  const cfg = loadConfig();
  const result = await reconcilePendingMarketingReceipts(cfg);
  console.log(
    `[marketing-agent] reconciliation complete: processed=${result.processed} finalized=${result.finalized} requeued=${result.requeued} skipped=${result.skipped}`
  );
}

if (require.main === module) {
  main().catch(error => {
    console.error('[marketing-agent] reconcile fatal:', error);
    process.exit(1);
  });
}
