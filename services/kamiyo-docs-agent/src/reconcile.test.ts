import assert from 'node:assert/strict';
import test from 'node:test';
import { assessDocsDelayedOutcome, shouldFinalizeDocsReceipt } from './reconcile';

test('assessDocsDelayedOutcome scores merged docs PRs as success', () => {
  const assessment = assessDocsDelayedOutcome({
    mergeSha: 'abc1234',
    model: 'local-model',
    changedFiles: ['README.md', 'CHANGELOG.md'],
    mergeChangedPaths: ['packages/kamiyo-agent/src/run-ledger.ts'],
    mergedFiles: ['README.md', 'CHANGELOG.md'],
    prNumber: 42,
    prUrl: 'https://github.com/kamiyoai/kamiyo-protocol/pull/42',
    prState: 'closed',
    prMerged: true,
    followUpBranch: 'docs-agent/regen-abc1234',
    prHeadRef: 'docs-agent/regen-abc1234',
  });

  assert.equal(assessment.metric.status, 'success');
  assert.equal(assessment.metric.outcome, 'docs_pr_merged');
  assert.equal(assessment.metric.signals.follow_up_pr_merged, 1);
  assert.equal(assessment.metric.signals.merged_files_match_receipt, 1);
});

test('assessDocsDelayedOutcome scores closed-unmerged docs PRs as failure', () => {
  const assessment = assessDocsDelayedOutcome({
    mergeSha: 'def5678',
    model: 'local-model',
    changedFiles: ['services/kamiyo-autopilot/CHANGELOG.md'],
    mergeChangedPaths: ['services/kamiyo-autopilot/src/reconcile.ts'],
    mergedFiles: ['services/kamiyo-autopilot/CHANGELOG.md'],
    prNumber: 77,
    prUrl: 'https://github.com/kamiyoai/kamiyo-protocol/pull/77',
    prState: 'closed',
    prMerged: false,
    followUpBranch: 'docs-agent/regen-def5678',
    prHeadRef: 'docs-agent/regen-def5678',
  });

  assert.equal(assessment.metric.status, 'failure');
  assert.equal(assessment.metric.outcome, 'docs_pr_closed_unmerged');
  assert.equal(assessment.metric.signals.follow_up_pr_merged, 0);
  assert.equal(assessment.metric.signals.not_closed_unmerged, 0);
});

test('assessDocsDelayedOutcome treats missing follow-up PRs as failure', () => {
  const assessment = assessDocsDelayedOutcome({
    mergeSha: 'fff9999',
    model: 'local-model',
    changedFiles: ['README.md'],
    mergeChangedPaths: ['README.md'],
    mergedFiles: [],
    prMerged: false,
    followUpBranch: 'docs-agent/regen-fff9999',
  });

  assert.equal(assessment.metric.status, 'failure');
  assert.equal(assessment.metric.outcome, 'missing_follow_up_pr');
  assert.equal(assessment.metric.signals.follow_up_pr_opened, 0);
});

test('shouldFinalizeDocsReceipt returns true only for closed docs PRs', () => {
  assert.equal(
    shouldFinalizeDocsReceipt({
      number: 1,
      url: 'https://github.com/kamiyoai/kamiyo-protocol/pull/1',
      state: 'closed',
      headRef: 'docs-agent/regen-1',
      headSha: 'sha-1',
      merged: true,
      draft: false,
      mergedAt: '2026-04-22T08:00:00Z',
      closedAt: '2026-04-22T08:00:00Z',
    }),
    true
  );

  assert.equal(
    shouldFinalizeDocsReceipt({
      number: 2,
      url: 'https://github.com/kamiyoai/kamiyo-protocol/pull/2',
      state: 'open',
      headRef: 'docs-agent/regen-2',
      headSha: 'sha-2',
      merged: false,
      draft: false,
      mergedAt: null,
      closedAt: null,
    }),
    false
  );
});
