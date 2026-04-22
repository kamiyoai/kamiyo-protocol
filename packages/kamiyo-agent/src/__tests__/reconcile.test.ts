import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import {
  applySchema as applySelfImproveSchema,
  createVariant,
  getVariantScores,
  initSelfImprove,
  resetContextForTests,
} from '@kamiyo-org/selfimprove';
import { assessAgentOutcome } from '../outcomes';
import { createReconciliationPatch, hoursFromNow, recordDelayedVariantScore } from '../reconcile';
import { applyAgentSchema } from '../schema';
import { recordAgentRunReceipt } from '../run-ledger';

function freshDb() {
  const db = new Database(':memory:');
  applyAgentSchema(db);
  applySelfImproveSchema(db);
  initSelfImprove({ db, judgeLLM: null });
  return db;
}

afterEach(() => resetContextForTests());

describe('reconcile helpers', () => {
  it('creates a finalized reconciliation patch with standardized delayed fields', () => {
    const db = freshDb();
    const receipt = recordAgentRunReceipt(db, {
      runId: 'run-1',
      agentId: 'agent-a',
      service: 'kamiyo-docs-agent',
      taskType: 'docs_regeneration',
      subjectType: 'merge',
      subjectId: 'abc123',
      outcome: 'updated_docs',
      qualityScore: 0.73,
      receipt: {
        model: 'local-model',
        initialOutcome: 'updated_docs',
        initialQualityScore: 0.73,
      },
    });

    const assessment = assessAgentOutcome({
      service: 'kamiyo-docs-agent',
      taskType: 'docs_regeneration_reconciliation',
      status: 'success',
      outcome: 'docs_pr_merged',
      model: 'local-model',
      durationMs: 1200,
      signals: [{ name: 'follow_up_pr_merged', value: true, weight: 5 }],
    });

    const patch = createReconciliationPatch(receipt, {
      assessment,
      delayedRecorded: true,
      note: 'merged',
      snapshot: { reconciledPrState: 'closed' },
      now: new Date('2026-04-22T10:00:00Z'),
    });

    expect(patch.outcome).toBe('docs_pr_merged');
    expect(patch.qualityScore).toBe(assessment.qualityScore);
    expect(patch.reconciledAt).toBe(Math.floor(Date.parse('2026-04-22T10:00:00Z') / 1000));
    expect(patch.receipt?.initialOutcome).toBe('updated_docs');
    expect(patch.receipt?.initialQualityScore).toBe(0.73);
    expect(patch.receipt?.delayedOutcome).toBe('docs_pr_merged');
    expect(patch.receipt?.delayedTournamentRecorded).toBe(true);
    expect(patch.receipt?.reconciledPrState).toBe('closed');
  });

  it('creates a requeue reconciliation patch without finalizing the receipt', () => {
    const db = freshDb();
    const receipt = recordAgentRunReceipt(db, {
      runId: 'run-2',
      agentId: 'agent-b',
      service: 'kamiyo-marketing-agent',
      taskType: 'marketing_post_drafting',
      receipt: {
        model: 'local-model',
        initialOutcome: 'scheduled_posts',
        initialQualityScore: 0.81,
      },
    });

    const patch = createReconciliationPatch(receipt, {
      reconcileAfter: 1_800_000_000,
      note: 'still_scheduled',
      snapshot: { publishedPostIds: [] },
    });

    expect(patch.reconcileAfter).toBe(1_800_000_000);
    expect(patch.reconciledAt).toBeNull();
    expect(patch.receipt?.initialOutcome).toBe('scheduled_posts');
    expect(patch.receipt?.delayedOutcome).toBeNull();
    expect(patch.receipt?.reconciliationNote).toBe('still_scheduled');
  });

  it('computes a future reconciliation timestamp in whole hours', () => {
    expect(hoursFromNow(3, new Date('2026-04-22T00:00:00Z'))).toBe(1_776_826_800);
  });

  it('records a delayed variant score into the standing tournament', () => {
    freshDb();
    const variant = createVariant({
      agentId: 'agent-c',
      taskType: 'autopilot_issue_resolution',
      genome: {
        promptTemplate: 'prompt',
        modelId: 'local-model',
        toolAllowlist: [],
        temperature: 0.2,
        maxTokens: 512,
        systemGuardrails: '',
      },
    }).variant;

    const assessment = assessAgentOutcome({
      service: 'kamiyo-autopilot',
      taskType: 'autopilot_issue_reconciliation',
      status: 'success',
      outcome: 'merged_pr',
      model: 'local-model',
      durationMs: 900,
      signals: [{ name: 'pr_merged', value: true, weight: 5 }],
    });

    const recorded = recordDelayedVariantScore(
      'autopilot_issue_resolution',
      variant.id,
      assessment
    );

    expect(recorded).toBe(true);
    expect(getVariantScores(variant.id)).toContain(assessment.qualityScore);
  });
});
