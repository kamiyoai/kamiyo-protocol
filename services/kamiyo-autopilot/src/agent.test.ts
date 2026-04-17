// SPDX-License-Identifier: MIT
import { describe, it, expect, vi } from 'vitest';
import { pickModel, emitMetric, type MetricPayload } from './agent';
import { MODELS, type Config } from './config';

// Mock config with default CLAUDE_MODEL
const mockConfig: Config = {
  ANTHROPIC_API_KEY: 'test-key',
  GITHUB_TOKEN: 'test-token',
  GITHUB_REPO: 'test/repo',
  CLAUDE_MODEL: MODELS.sonnet,
  MAX_TURNS: 30,
  DAILY_USD_MAX: 50,
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

  it('resolves agent:haiku label to claude-haiku-4-5-20251001', () => {
    const result = pickModel(mockConfig, ['agent:haiku']);
    expect(result).toBe('claude-haiku-4-5-20251001');
  });

  it('resolves agent:sonnet label to claude-sonnet-4-6', () => {
    const result = pickModel(mockConfig, ['agent:sonnet']);
    expect(result).toBe('claude-sonnet-4-6');
  });

  it('resolves agent:opus label to claude-opus-4-6', () => {
    const result = pickModel(mockConfig, ['agent:opus']);
    expect(result).toBe('claude-opus-4-6');
  });

  it('is case-insensitive for labels (AGENT:HAIKU works)', () => {
    const result = pickModel(mockConfig, ['AGENT:HAIKU']);
    expect(result).toBe('claude-haiku-4-5-20251001');
  });

  it('is case-insensitive for labels (Agent:Sonnet works)', () => {
    const result = pickModel(mockConfig, ['Agent:Sonnet']);
    expect(result).toBe('claude-sonnet-4-6');
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
    expect(result).toBe('claude-haiku-4-5-20251001');
  });

  it('uses valid agent: label among mixed labels', () => {
    const result = pickModel(mockConfig, ['bug', 'agent:opus', 'enhancement']);
    expect(result).toBe('claude-opus-4-6');
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
    expect(result).toBe('claude-haiku-4-5-20251001');
  });
});

describe('emitMetric', () => {
  it('emits correct JSON shape with [autopilot-metric] prefix', () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const payload: MetricPayload = {
      ts: '2025-04-17T10:30:00.000Z',
      issue: 212,
      model: 'claude-sonnet-4-6',
      labels: ['agent', 'feature'],
      cost_usd: 0.1234,
      duration_ms: 5000,
      tool_uses: 3,
      opened_pr: true,
      commented: false,
    };
    emitMetric(payload);
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('[autopilot-metric]'));
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('"issue":212'));
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('"model":"claude-sonnet-4-6"'));
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('"cost_usd":0.1234'));
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('"duration_ms":5000'));
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('"tool_uses":3'));
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('"opened_pr":true'));
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('"commented":false'));
    consoleSpy.mockRestore();
  });

  it('emits valid JSON that can be parsed', () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const payload: MetricPayload = {
      ts: '2025-04-17T10:30:00.000Z',
      issue: 100,
      model: 'claude-haiku-4-5-20251001',
      labels: ['urgent'],
      cost_usd: 0.05,
      duration_ms: 2000,
      tool_uses: 1,
      opened_pr: false,
      commented: true,
    };
    emitMetric(payload);
    const call = consoleSpy.mock.calls[0][0] as string;
    const jsonPart = call.replace(/^\[autopilot-metric\]\s/, '');
    const parsed = JSON.parse(jsonPart);
    expect(parsed).toEqual(payload);
    consoleSpy.mockRestore();
  });
});
