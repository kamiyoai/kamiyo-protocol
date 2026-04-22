// SPDX-License-Identifier: MIT
import { describe, it, expect, vi } from 'vitest';
import { assessAutopilotOutcome, pickModel, emitMetric, type MetricData } from './agent';
import { MODELS, type Config } from './config';

// Mock config with default CLAUDE_MODEL
const mockConfig: Config = {
  LLM_BASE_URL: 'http://localhost:11434/v1',
  LLM_API_KEY: 'ollama',
  GITHUB_TOKEN: 'test-token',
  GITHUB_REPO: 'test/repo',
  CLAUDE_MODEL: MODELS.sonnet,
  AUTOPILOT_DB_PATH: '.autopilot/test.db',
  MAX_TURNS: 30,
  DAILY_USD_MAX: 0,
  SELF_IMPROVE_ENABLED: true,
  SELF_IMPROVE_TASK_TYPE: 'autopilot_issue_resolution',
  SELF_IMPROVE_JUDGE_MODEL: MODELS.haiku,
  SELF_IMPROVE_MIN_SAMPLES: 5,
  SELF_IMPROVE_P_THRESHOLD: 0.1,
  AGENT_LABEL: 'agent',
  APPROVED_LABEL: 'agent-approved',
  HALT_LABEL: 'halt-autopilot',
  BOT_LOGIN: 'test-bot',
  DRY_RUN: false,
};

describe('pickModel', () => {
  it('returns default CLAUDE_MODEL when no labels are provided', () => {
    const result = pickModel(mockConfig, []);
    expect(result).toBe(MODELS.sonnet);
  });

  it('returns default CLAUDE_MODEL when labels do not contain agent: prefix', () => {
    const result = pickModel(mockConfig, ['bug', 'enhancement', 'documentation']);
    expect(result).toBe(MODELS.sonnet);
  });

  it('resolves agent:haiku label to hf.co/OBLITERATUS/gemma-4-E4B-it-OBLITERATED:Q5_K_M', () => {
    const result = pickModel(mockConfig, ['agent:haiku']);
    expect(result).toBe('hf.co/OBLITERATUS/gemma-4-E4B-it-OBLITERATED:Q5_K_M');
  });

  it('resolves agent:sonnet label to hf.co/OBLITERATUS/gemma-4-E4B-it-OBLITERATED:Q5_K_M', () => {
    const result = pickModel(mockConfig, ['agent:sonnet']);
    expect(result).toBe('hf.co/OBLITERATUS/gemma-4-E4B-it-OBLITERATED:Q5_K_M');
  });

  it('resolves agent:opus label to hf.co/NousResearch/Hermes-4.3-36B-GGUF:Q4_K_M', () => {
    const result = pickModel(mockConfig, ['agent:opus']);
    expect(result).toBe('hf.co/NousResearch/Hermes-4.3-36B-GGUF:Q4_K_M');
  });

  it('is case-insensitive for labels (AGENT:HAIKU works)', () => {
    const result = pickModel(mockConfig, ['AGENT:HAIKU']);
    expect(result).toBe('hf.co/OBLITERATUS/gemma-4-E4B-it-OBLITERATED:Q5_K_M');
  });

  it('is case-insensitive for labels (Agent:Sonnet works)', () => {
    const result = pickModel(mockConfig, ['Agent:Sonnet']);
    expect(result).toBe('hf.co/OBLITERATUS/gemma-4-E4B-it-OBLITERATED:Q5_K_M');
  });

  it('falls back to default when unknown agent: label is provided', () => {
    const result = pickModel(mockConfig, ['agent:unknown']);
    expect(result).toBe(MODELS.sonnet);
  });

  it('falls back to default when agent:foo (invalid tier) is provided', () => {
    const result = pickModel(mockConfig, ['agent:foo', 'bug']);
    expect(result).toBe(MODELS.sonnet);
  });

  it('uses first valid agent: label when multiple are provided', () => {
    const result = pickModel(mockConfig, ['bug', 'agent:haiku', 'agent:opus']);
    expect(result).toBe('hf.co/OBLITERATUS/gemma-4-E4B-it-OBLITERATED:Q5_K_M');
  });

  it('uses valid agent: label among mixed labels', () => {
    const result = pickModel(mockConfig, ['bug', 'agent:opus', 'enhancement']);
    expect(result).toBe('hf.co/NousResearch/Hermes-4.3-36B-GGUF:Q4_K_M');
  });

  it('respects custom CLAUDE_MODEL default', () => {
    const customConfig: Config = {
      ...mockConfig,
      CLAUDE_MODEL: 'claude-custom-model',
    };
    const result = pickModel(customConfig, ['unrelated-label']);
    expect(result).toBe('claude-custom-model');
  });

  it('picks agent label over custom CLAUDE_MODEL default', () => {
    const customConfig: Config = {
      ...mockConfig,
      CLAUDE_MODEL: 'claude-custom-model',
    };
    const result = pickModel(customConfig, ['agent:haiku']);
    expect(result).toBe('hf.co/OBLITERATUS/gemma-4-E4B-it-OBLITERATED:Q5_K_M');
  });
});

describe('emitMetric', () => {
  it('emits valid JSON metric with correct format and prefix', () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const metricData: MetricData = {
      ts: '2026-04-16T21:50:00.000Z',
      issue: 212,
      model: 'hf.co/OBLITERATUS/gemma-4-E4B-it-OBLITERATED:Q5_K_M',
      labels: ['agent', 'feature'],
      cost_usd: 0.0234,
      duration_ms: 5000,
      tool_uses: 15,
      opened_pr: true,
      commented: false,
    };

    emitMetric(metricData);

    expect(consoleSpy).toHaveBeenCalledOnce();
    const call = consoleSpy.mock.calls[0][0];
    expect(call).toMatch(/^\[autopilot-metric\] /);

    // Extract JSON part after prefix
    const jsonPart = call.replace(/^\[autopilot-metric\] /, '');
    const parsed = JSON.parse(jsonPart);

    expect(parsed).toEqual(metricData);
    expect(parsed.ts).toBe('2026-04-16T21:50:00.000Z');
    expect(parsed.issue).toBe(212);
    expect(parsed.model).toBe('hf.co/OBLITERATUS/gemma-4-E4B-it-OBLITERATED:Q5_K_M');
    expect(parsed.labels).toEqual(['agent', 'feature']);
    expect(parsed.cost_usd).toBe(0.0234);
    expect(parsed.duration_ms).toBe(5000);
    expect(parsed.tool_uses).toBe(15);
    expect(parsed.opened_pr).toBe(true);
    expect(parsed.commented).toBe(false);

    consoleSpy.mockRestore();
  });

  it('emits metric with empty labels', () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const metricData: MetricData = {
      ts: '2026-04-16T22:00:00.000Z',
      issue: 100,
      model: 'hf.co/OBLITERATUS/gemma-4-E4B-it-OBLITERATED:Q5_K_M',
      labels: [],
      cost_usd: 0.005,
      duration_ms: 1000,
      tool_uses: 2,
      opened_pr: false,
      commented: true,
    };

    emitMetric(metricData);

    const call = consoleSpy.mock.calls[0][0];
    const jsonPart = call.replace(/^\[autopilot-metric\] /, '');
    const parsed = JSON.parse(jsonPart);

    expect(parsed.labels).toEqual([]);
    expect(parsed.commented).toBe(true);

    consoleSpy.mockRestore();
  });
});

describe('assessAutopilotOutcome', () => {
  it('scores PR-opening runs as successful outcomes', () => {
    const assessment = assessAutopilotOutcome({
      issueNumber: 212,
      labels: ['agent', 'feature'],
      model: MODELS.haiku,
      durationMs: 5000,
      toolUses: 12,
      openedPr: true,
      commented: false,
      finalText: [
        'OUTCOME: opened_pr',
        'BRANCH: autopilot/issue-212-shared-outcomes',
        'SUMMARY: Landed the fix and opened the PR.',
        'TESTS: pnpm test (passed)',
        'PR: https://github.com/kamiyoai/kamiyo-protocol/pull/999',
        'ISSUE_COMMENT: no',
      ].join('\n'),
      ciStatus: 'success',
      prMergeableState: 'clean',
    });

    expect(assessment.metric.status).toBe('success');
    expect(assessment.metric.outcome).toBe('opened_pr');
    expect(assessment.metric.signals.opened_pr).toBe(1);
    expect(assessment.metric.signals.tests_passed).toBe(1);
    expect(assessment.metric.signals.ci_green).toBe(1);
    expect(assessment.metric.signals.pr_ready).toBe(1);
    expect(assessment.metric.signals.outcome_matches_actions).toBe(1);
  });

  it('treats clean no-action runs as neutral', () => {
    const assessment = assessAutopilotOutcome({
      issueNumber: 213,
      labels: ['agent'],
      model: MODELS.haiku,
      durationMs: 1500,
      toolUses: 3,
      openedPr: false,
      commented: false,
      finalText: [
        'OUTCOME: no_action',
        'BRANCH: none',
        'SUMMARY: Nothing actionable was found.',
        'TESTS: none',
        'PR: none',
        'ISSUE_COMMENT: no',
      ].join('\n'),
    });

    expect(assessment.metric.status).toBe('neutral');
    expect(assessment.metric.outcome).toBe('no_action');
    expect(assessment.metric.signals.opened_pr).toBe(0);
  });

  it('captures failed downstream validation when verification or CI fail', () => {
    const assessment = assessAutopilotOutcome({
      issueNumber: 214,
      labels: ['agent'],
      model: MODELS.haiku,
      durationMs: 2200,
      toolUses: 6,
      openedPr: true,
      commented: false,
      finalText: [
        'OUTCOME: opened_pr',
        'BRANCH: autopilot/issue-214-fix',
        'SUMMARY: Opened a PR but tests failed.',
        'TESTS: pnpm test (failed)',
        'PR: https://github.com/kamiyoai/kamiyo-protocol/pull/1001',
        'ISSUE_COMMENT: no',
      ].join('\n'),
      ciStatus: 'failure',
      prDraft: true,
      prMergeableState: 'dirty',
    });

    expect(assessment.metric.signals.tests_passed).toBe(0);
    expect(assessment.metric.signals.ci_green).toBe(0);
    expect(assessment.metric.signals.pr_ready).toBe(0);
    expect(assessment.metric.metadata.ci_status).toBe('failure');
  });
});
