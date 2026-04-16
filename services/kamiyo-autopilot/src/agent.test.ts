// SPDX-License-Identifier: MIT
import { describe, it, expect } from 'vitest';
import { pickModel } from './agent';
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
