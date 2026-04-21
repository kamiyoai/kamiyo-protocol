import assert from 'node:assert/strict';
import test from 'node:test';
import { assessDocsOutcome } from './agent';

test('assessDocsOutcome scores successful doc updates from real changed files', () => {
  const assessment = assessDocsOutcome({
    mergeSha: 'abc1234',
    model: 'local-model',
    durationMs: 1800,
    toolUses: 4,
    finalText: ['OUTCOME: updated_docs', 'SUMMARY: refreshed docs', 'FILES: README.md, CHANGELOG.md'].join(
      '\n'
    ),
    changedFiles: ['README.md', 'CHANGELOG.md'],
  });

  assert.equal(assessment.metric.status, 'success');
  assert.equal(assessment.metric.outcome, 'updated_docs');
  assert.match(String(assessment.metric.metadata.changed_files), /README\.md/);
});

test('assessDocsOutcome treats clean no-change runs as neutral', () => {
  const assessment = assessDocsOutcome({
    mergeSha: 'def5678',
    model: 'local-model',
    durationMs: 900,
    toolUses: 2,
    finalText: ['OUTCOME: no_changes', 'SUMMARY: nothing meaningful changed', 'FILES: none'].join(
      '\n'
    ),
    changedFiles: [],
  });

  assert.equal(assessment.metric.status, 'neutral');
  assert.equal(assessment.metric.outcome, 'no_changes');
  assert.equal(assessment.metric.signals.outcome_matches_files, 1);
});
