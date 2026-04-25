// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { afterEach, vi } from 'vitest';
import {
  applySchema,
  createVariant,
  initSelfImprove,
  resetContextForTests,
  startCanary,
} from '@kamiyo-org/selfimprove';
import {
  assessAutopilotDelayedOutcome,
  shouldAdvanceAutopilotLearning,
  shouldFinalizeAutopilotReceipt,
  syncAutopilotLearningCommands,
} from './reconcile';

function freshDb() {
  const db = new Database(':memory:');
  applySchema(db);
  initSelfImprove({ db, judgeLLM: null });
  return db;
}

afterEach(() => resetContextForTests());

describe('assessAutopilotDelayedOutcome', () => {
  it('scores merged PRs as successful delayed outcomes', () => {
    const assessment = assessAutopilotDelayedOutcome({
      issueNumber: 321,
      model: 'local-model',
      prNumber: 99,
      prUrl: 'https://github.com/kamiyoai/kamiyo-protocol/pull/99',
      prState: 'closed',
      prMerged: true,
      prDraft: false,
      prMergeableState: 'clean',
      ciStatus: 'success',
      initialHeadSha: 'abc123',
      currentHeadSha: 'abc123',
      initialOutcome: 'opened_pr',
      mergedAt: '2026-04-22T08:00:00Z',
      closedAt: '2026-04-22T08:00:00Z',
      durationMs: 4200,
    });

    expect(assessment.metric.status).toBe('success');
    expect(assessment.metric.outcome).toBe('merged_pr');
    expect(assessment.metric.signals.pr_merged).toBe(1);
    expect(assessment.metric.signals.ci_green).toBe(1);
    expect(assessment.metric.signals.no_follow_up_pushes_needed).toBe(1);
  });

  it('penalizes PRs closed without merge and follow-up pushes', () => {
    const assessment = assessAutopilotDelayedOutcome({
      issueNumber: 322,
      model: 'local-model',
      prNumber: 100,
      prUrl: 'https://github.com/kamiyoai/kamiyo-protocol/pull/100',
      prState: 'closed',
      prMerged: false,
      prDraft: true,
      prMergeableState: 'dirty',
      ciStatus: 'failure',
      initialHeadSha: 'abc123',
      currentHeadSha: 'def456',
      initialOutcome: 'opened_pr',
      closedAt: '2026-04-22T09:00:00Z',
      durationMs: 5100,
    });

    expect(assessment.metric.status).toBe('failure');
    expect(assessment.metric.outcome).toBe('closed_unmerged_pr');
    expect(assessment.metric.signals.pr_merged).toBe(0);
    expect(assessment.metric.signals.ci_green).toBe(0);
    expect(assessment.metric.signals.no_follow_up_pushes_needed).toBe(0);
    expect(assessment.metric.signals.closed_without_merge).toBe(0);
  });
});

describe('shouldFinalizeAutopilotReceipt', () => {
  it('treats merged PRs as final', () => {
    expect(
      shouldFinalizeAutopilotReceipt({
        number: 1,
        url: 'https://github.com/kamiyoai/kamiyo-protocol/pull/1',
        state: 'closed',
        headSha: 'abc123',
        merged: true,
        draft: false,
        mergeableState: 'clean',
        mergedAt: '2026-04-22T08:00:00Z',
        closedAt: '2026-04-22T08:00:00Z',
        checkState: 'success',
      })
    ).toBe(true);
  });

  it('treats still-open PRs as not final', () => {
    expect(
      shouldFinalizeAutopilotReceipt({
        number: 2,
        url: 'https://github.com/kamiyoai/kamiyo-protocol/pull/2',
        state: 'open',
        headSha: 'def456',
        merged: false,
        draft: false,
        mergeableState: 'clean',
        mergedAt: null,
        closedAt: null,
        checkState: 'pending',
      })
    ).toBe(false);
  });
});

describe('learning controls', () => {
  it('skips auto advancement when the mirrored control mode is paused', () => {
    expect(shouldAdvanceAutopilotLearning({ mode: 'paused' })).toBe(false);
    expect(shouldAdvanceAutopilotLearning({ mode: 'auto' })).toBe(true);
    expect(shouldAdvanceAutopilotLearning(null)).toBe(true);
    expect(shouldAdvanceAutopilotLearning({ mode: 'auto' }, { commandsFailed: 1 })).toBe(false);
    expect(shouldAdvanceAutopilotLearning({ mode: 'auto' }, { rollbackApplied: true })).toBe(false);
    expect(
      shouldAdvanceAutopilotLearning(
        { mode: 'auto' },
        { unsafeStateReason: 'agent_db_inside_github_workspace' }
      )
    ).toBe(false);
  });

  it('rolls back active canaries and mirrors the rollback event', async () => {
    freshDb();
    const baseline = createVariant({
      agentId: 'agent-a',
      taskType: 'autopilot_issue_resolution',
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
      taskType: 'autopilot_issue_resolution',
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
      taskType: 'autopilot_issue_resolution',
      canaryVariantId: canary.id,
      baselineVariantId: baseline.id,
      trafficPct: 0.1,
      minSamples: 10,
    });

    const acknowledge = vi.fn(async () => true);
    const publishPromotion = vi.fn(async () => true);

    const result = await syncAutopilotLearningCommands({
      taskType: 'autopilot_issue_resolution',
      commands: [{ id: 'cmd-1', kind: 'rollback_active_canary', note: 'manual rollback' }],
      acknowledge,
      publishPromotion,
    });

    expect(result.applied).toBe(1);
    expect(result.failed).toBe(0);
    expect(result.rollbackApplied).toBe(true);
    expect(acknowledge).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'cmd-1',
        status: 'applied',
      })
    );
    expect(publishPromotion).toHaveBeenCalledWith(
      expect.objectContaining({
        service: 'kamiyo-autopilot',
        eventKind: 'canary_rolled_back',
      })
    );
  });
});
