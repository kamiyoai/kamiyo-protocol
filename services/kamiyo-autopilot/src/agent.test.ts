// SPDX-License-Identifier: MIT
import { describe, it, expect } from 'vitest';
import { pickModel } from './agent';
import { MODELS } from './config';

describe('pickModel', () => {
  const defaultConfig = {
    ANTHROPIC_API_KEY: 'test-key',
    GITHUB_TOKEN: 'test-token',
    GITHUB_REPO: 'test/repo',
    CLAUDE_MODEL: 'claude-sonnet-4-6',
    MAX_TURNS: 30,
    DAILY_USD_MAX: 50,
    AGENT_LABEL: 'agent',
    APPROVED_LABEL: 'agent-approved',
    HALT_LABEL: 'halt-autopilot',
    BOT_LOGIN: 'kamiyo-bot',
    DRY_RUN: false,
  };

  it('returns default CLAUDE_MODEL when no labels provided', () => {
    const result = pickModel(defaultConfig, []);
    expect(result).toBe(defaultConfig.CLAUDE_MODEL);
  });

  it('returns default CLAUDE_MODEL when no agent labels provided', () => {
    const result = pickModel(defaultConfig, ['bug', 'enhancement']);
    expect(result).toBe(defaultConfig.CLAUDE_MODEL);
  });

  it('resolves agent:haiku label to claude-haiku-4-5-20251001', () => {
    const result = pickModel(defaultConfig, ['agent:haiku']);
    expect(result).toBe(MODELS.haiku);
    expect(result).toBe('claude-haiku-4-5-20251001');
  });

  it('resolves agent:sonnet label to claude-sonnet-4-6', () => {
    const result = pickModel(defaultConfig, ['agent:sonnet']);
    expect(result).toBe(MODELS.sonnet);
    expect(result).toBe('claude-sonnet-4-6');
  });

  it('resolves agent:opus label to claude-opus-4-6', () => {
    const result = pickModel(defaultConfig, ['agent:opus']);
    expect(result).toBe(MODELS.opus);
    expect(result).toBe('claude-opus-4-6');
  });

  it('handles case-insensitive agent labels (AGENT:HAIKU)', () => {
    const result = pickModel(defaultConfig, ['AGENT:HAIKU']);
    expect(result).toBe(MODELS.haiku);
  });

  it('handles case-insensitive agent labels (Agent:Sonnet)', () => {
    const result = pickModel(defaultConfig, ['Agent:Sonnet']);
    expect(result).toBe(MODELS.sonnet);
  });

  it('handles case-insensitive agent labels (AGENT:OPUS)', () => {
    const result = pickModel(defaultConfig, ['AGENT:OPUS']);
    expect(result).toBe(MODELS.opus);
  });

  it('falls back to default for unknown agent:foo label', () => {
    const result = pickModel(defaultConfig, ['agent:foo']);
    expect(result).toBe(defaultConfig.CLAUDE_MODEL);
  });

  it('falls back to default for unknown agent:invalid label', () => {
    const result = pickModel(defaultConfig, ['agent:invalid']);
    expect(result).toBe(defaultConfig.CLAUDE_MODEL);
  });

  it('picks first valid agent label when multiple are present', () => {
    const result = pickModel(defaultConfig, ['agent:haiku', 'agent:sonnet']);
    expect(result).toBe(MODELS.haiku);
  });

  it('ignores non-agent labels and uses first valid agent label', () => {
    const result = pickModel(defaultConfig, ['bug', 'agent:opus', 'enhancement']);
    expect(result).toBe(MODELS.opus);
  });

  it('uses custom default model when specified in config', () => {
    const customConfig = {
      ...defaultConfig,
      CLAUDE_MODEL: 'claude-opus-4-6',
    };
    const result = pickModel(customConfig, []);
    expect(result).toBe('claude-opus-4-6');
  });

  it('respects agent label even when custom default model is set', () => {
    const customConfig = {
      ...defaultConfig,
      CLAUDE_MODEL: 'claude-opus-4-6',
    };
    const result = pickModel(customConfig, ['agent:haiku']);
    expect(result).toBe(MODELS.haiku);
  });
});
