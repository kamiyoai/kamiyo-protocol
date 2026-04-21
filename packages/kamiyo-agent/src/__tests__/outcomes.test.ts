import { describe, expect, it, vi } from 'vitest';
import {
  assessAgentOutcome,
  DEFAULT_OUTCOME_METRIC_PREFIX,
  emitOutcomeMetric,
  parseTaggedFields,
} from '../outcomes';

describe('parseTaggedFields', () => {
  it('extracts uppercase tagged fields from text output', () => {
    expect(
      parseTaggedFields(
        ['OUTCOME: updated_docs', 'SUMMARY: refreshed readme', 'FILES: README.md, CHANGELOG.md'].join(
          '\n'
        )
      )
    ).toEqual({
      OUTCOME: 'updated_docs',
      SUMMARY: 'refreshed readme',
      FILES: 'README.md, CHANGELOG.md',
    });
  });

  it('ignores non-tagged lines', () => {
    expect(parseTaggedFields('hello\nOUTCOME: no_changes\nthanks')).toEqual({
      OUTCOME: 'no_changes',
    });
  });
});

describe('assessAgentOutcome', () => {
  it('scores successful outcomes higher than failures', () => {
    const success = assessAgentOutcome({
      service: 'kamiyo-docs-agent',
      taskType: 'docs_regeneration',
      status: 'success',
      outcome: 'updated_docs',
      model: 'local-model',
      durationMs: 1200,
      signals: [
        { name: 'docs_updated', value: true, weight: 3 },
        { name: 'summary_present', value: true, weight: 1 },
      ],
    });
    const failure = assessAgentOutcome({
      service: 'kamiyo-docs-agent',
      taskType: 'docs_regeneration',
      status: 'failure',
      outcome: 'error',
      model: 'local-model',
      durationMs: 1200,
      signals: [{ name: 'clean_exit', value: false, weight: 2 }],
    });

    expect(success.qualityScore).toBeGreaterThan(failure.qualityScore);
    expect(success.metric.status).toBe('success');
    expect(failure.metric.status).toBe('failure');
  });

  it('normalizes numeric signals and rounds the metric output', () => {
    const result = assessAgentOutcome({
      service: 'kamiyo-marketing-agent',
      taskType: 'marketing_post_drafting',
      status: 'partial',
      outcome: 'drafted_posts',
      model: 'local-model',
      durationMs: 2500.6,
      costUsd: 0.00123456,
      turnCount: 3,
      toolUses: 0,
      signals: [
        { name: 'draft_coverage', value: 1.5, weight: 2 },
        { name: 'schedule_coverage', value: 0.5, weight: 2 },
      ],
      metadata: { dry_run: true },
    });

    expect(result.signalScore).toBe(0.75);
    expect(result.metric.cost_usd).toBe(0.0012);
    expect(result.metric.duration_ms).toBe(2500);
    expect(result.metric.signals.draft_coverage).toBe(1);
    expect(result.metric.metadata).toEqual({ dry_run: true });
  });
});

describe('emitOutcomeMetric', () => {
  it('prints JSON with the shared prefix', () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const assessment = assessAgentOutcome({
      service: 'kamiyo-autopilot',
      taskType: 'autopilot_issue_resolution',
      status: 'success',
      outcome: 'opened_pr',
      model: 'local-model',
      durationMs: 4000,
      signals: [{ name: 'opened_pr', value: true, weight: 4 }],
    });

    emitOutcomeMetric(assessment.metric);

    expect(consoleSpy).toHaveBeenCalledOnce();
    const payload = consoleSpy.mock.calls[0][0];
    expect(payload).toMatch(new RegExp(`^\\[${DEFAULT_OUTCOME_METRIC_PREFIX}\\] `));
    expect(JSON.parse(String(payload).replace(/^\[[^\]]+\] /, ''))).toEqual(assessment.metric);

    consoleSpy.mockRestore();
  });
});
