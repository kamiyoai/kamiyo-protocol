import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import test, { afterEach } from 'node:test';
import {
  createReconciliationPatch,
  deriveAgentLearningAlerts,
  snapshotDelayedLearningCanary,
  type AgentRunReceipt,
} from '@kamiyo-org/agent';
import {
  applySchema,
  createVariant,
  initSelfImprove,
  resetContextForTests,
  startCanary,
} from '@kamiyo-org/selfimprove';
import { assessMarketingDelayedOutcome } from './agent';
import { classifyMarketingReconciliation } from './reconcile';

function freshDb() {
  const db = new Database(':memory:');
  applySchema(db);
  initSelfImprove({ db, judgeLLM: null });
  return db;
}

afterEach(() => resetContextForTests());

function freshReceipt() {
  return {
    id: 'receipt-1',
    runId: 'run-1',
    agentId: 'kamiyo-marketing-agent',
    service: 'kamiyo-marketing-agent',
    taskType: 'marketing_post_drafting',
    subjectType: 'repo',
    subjectId: 'kamiyoai/kamiyo-protocol',
    variantId: 'variant-a',
    variantStrategy: 'thompson',
    outcome: 'scheduled_posts',
    qualityScore: 0.84,
    costUsd: 0,
    durationMs: 1200,
    receipt: {
      model: 'local-model',
      initialOutcome: 'scheduled_posts',
      initialQualityScore: 0.84,
      scheduledIds: ['post-1'],
      scheduledFor: ['2026-04-22T12:00:00.000Z'],
    },
    reconcileAfter: null,
    reconciledAt: null,
    createdAt: 1_777_000_000,
    updatedAt: 1_777_000_000,
  } satisfies AgentRunReceipt;
}

test('classifyMarketingReconciliation returns still_scheduled while posts remain queued', () => {
  const state = classifyMarketingReconciliation({
    scheduledIds: ['post-1'],
    scheduledFor: ['2026-04-22T12:00:00.000Z'],
    scheduledSet: new Set(['post-1']),
    publishedSet: new Set(),
    now: new Date('2026-04-22T13:00:00.000Z'),
  });

  assert.equal(state.kind, 'still_scheduled');
  assert.deepEqual(state.stillScheduledIds, ['post-1']);
});

test('classifyMarketingReconciliation returns published when a scheduled post is published', () => {
  const state = classifyMarketingReconciliation({
    scheduledIds: ['post-1', 'post-2'],
    scheduledFor: ['2026-04-22T12:00:00.000Z', '2026-04-22T13:00:00.000Z'],
    scheduledSet: new Set(['post-2']),
    publishedSet: new Set(['post-1']),
    now: new Date('2026-04-22T14:00:00.000Z'),
  });

  assert.equal(state.kind, 'published');
  assert.deepEqual(state.publishedIds, ['post-1']);
});

test('classifyMarketingReconciliation returns missing_after_schedule once the publish window passes', () => {
  const state = classifyMarketingReconciliation({
    scheduledIds: ['post-1'],
    scheduledFor: ['2026-04-22T12:00:00.000Z'],
    scheduledSet: new Set(),
    publishedSet: new Set(),
    now: new Date('2026-04-22T15:00:00.000Z'),
  });

  assert.equal(state.kind, 'missing_after_schedule');
});

test('requeue reconciliation patch preserves initial fields and does not finalize the receipt', () => {
  const receipt = freshReceipt();
  const patch = createReconciliationPatch(receipt, {
    reconcileAfter: 1_777_300_000,
    note: 'still_scheduled',
    snapshot: {
      stillScheduledIds: ['post-1'],
      publishedPostIds: [],
    },
  });

  assert.equal(patch.reconcileAfter, 1_777_300_000);
  assert.equal(patch.reconciledAt, null);
  assert.equal(patch.receipt?.initialOutcome, 'scheduled_posts');
  assert.equal(patch.receipt?.reconciliationNote, 'still_scheduled');
});

test('finalized reconciliation patch records delayed marketing outcome', () => {
  const receipt = freshReceipt();
  const assessment = assessMarketingDelayedOutcome({
    model: 'local-model',
    scheduledIds: ['post-1'],
    publishedIds: ['post-1'],
    latestScheduledAt: '2026-04-22T12:00:00.000Z',
    initialOutcome: 'scheduled_posts',
  });
  const patch = createReconciliationPatch(receipt, {
    assessment,
    delayedRecorded: true,
    snapshot: {
      publishedPostIds: ['post-1'],
      stillScheduledIds: [],
    },
    note: 'published',
    now: new Date('2026-04-22T16:00:00.000Z'),
  });

  assert.equal(patch.outcome, 'published_posts');
  assert.equal(patch.receipt?.delayedOutcome, 'published_posts');
  assert.equal(patch.receipt?.delayedTournamentRecorded, true);
  assert.equal(patch.reconciledAt, Math.floor(Date.parse('2026-04-22T16:00:00.000Z') / 1000));
});

test('marketing read-only path still snapshots active canaries and backlog alerts', () => {
  freshDb();
  const baseline = createVariant({
    agentId: 'agent-a',
    taskType: 'marketing_post_drafting',
    genome: {
      promptTemplate: 'baseline',
      modelId: 'local-model',
      toolAllowlist: [],
      temperature: 0.2,
      maxTokens: 512,
      systemGuardrails: '',
    },
    notes: 'baseline',
  }).variant;
  const canary = createVariant({
    agentId: 'agent-a',
    taskType: 'marketing_post_drafting',
    genome: {
      promptTemplate: 'canary',
      modelId: 'local-model',
      toolAllowlist: [],
      temperature: 0.4,
      maxTokens: 512,
      systemGuardrails: '',
    },
    notes: 'canary',
  }).variant;
  startCanary({
    taskType: 'marketing_post_drafting',
    canaryVariantId: canary.id,
    baselineVariantId: baseline.id,
    trafficPct: 0.1,
    minSamples: 10,
  });

  const snapshot = snapshotDelayedLearningCanary({
    service: 'kamiyo-marketing-agent',
    taskType: 'marketing_post_drafting',
  });
  const alerts = deriveAgentLearningAlerts({
    pendingReconciliations: 7,
    canarySnapshot: snapshot.status === 'active' ? snapshot : null,
    now: new Date('2026-04-22T16:00:00.000Z'),
  });

  assert.equal(snapshot.status, 'active');
  assert.equal(snapshot.canaryVariantId, canary.id);
  assert.ok(alerts.some(alert => alert.code === 'pending_reconciliation_backlog'));
});
