import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearConfigCache, validateConfig } from './config';

function setEnv(values: Record<string, string | undefined>): () => void {
  const previous: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(values)) {
    previous[key] = process.env[key];
    if (value === undefined) {
      delete process.env[key];
      continue;
    }
    process.env[key] = value;
  }

  return () => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  };
}

function setRequiredEnv(overrides: Record<string, string | undefined> = {}): () => void {
  return setEnv({
    ANTHROPIC_API_KEY: 'test',
    TWITTER_API_KEY: 'test',
    TWITTER_API_SECRET: 'test',
    TWITTER_ACCESS_TOKEN: 'test',
    TWITTER_ACCESS_SECRET: 'test',
    ...overrides,
  });
}

describe('config', () => {
  beforeEach(() => {
    clearConfigCache();
  });

  afterEach(() => {
    clearConfigCache();
  });

  it('requires AUTONOMY_API_TOKEN when autonomy is enabled', () => {
    const restore = setRequiredEnv({
      NODE_ENV: 'production',
      AUTONOMY_ENABLED: 'true',
      AUTONOMY_DRY_RUN: 'true',
      AUTONOMY_API_TOKEN: undefined,
      AUTONOMY_MEISHI_VERIFY_URL: 'https://example.com/api/meishi/agent/{agentIdentity}/verify',
      AUTONOMY_MEISHI_AGENT_ID: 'agent',
      AUTONOMY_OPENCLAW_BASE_URL: 'https://example.com',
    });

    const result = validateConfig();
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('AUTONOMY_API_TOKEN is required when AUTONOMY_ENABLED=true');
    restore();
  });

  it('requires an X allowlist when live and X autonomy commands are enabled', () => {
    const restore = setRequiredEnv({
      NODE_ENV: 'development',
      AUTONOMY_ENABLED: 'true',
      AUTONOMY_DRY_RUN: 'false',
      AUTONOMY_API_TOKEN: 'token',
      AUTONOMY_MEISHI_VERIFY_URL: 'https://example.com/api/meishi/agent/{agentIdentity}/verify',
      AUTONOMY_MEISHI_AGENT_ID: 'agent',
      AUTONOMY_OPENCLAW_BASE_URL: 'https://example.com',
      AUTONOMY_OPENCLAW_MODE: 'tools_invoke',
      AUTONOMY_OPENCLAW_GATEWAY_TOKEN: 'gateway',
      AUTONOMY_X_PUBLIC: 'false',
      AUTONOMY_X_ALLOWLIST: '',
    });

    const result = validateConfig();
    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      'AUTONOMY_X_ALLOWLIST is required when AUTONOMY_X_COMMANDS_ENABLED=true and AUTONOMY_X_PUBLIC=false in live mode'
    );
    restore();
  });

  it('passes validation when live with an X allowlist', () => {
    const restore = setRequiredEnv({
      NODE_ENV: 'development',
      AUTONOMY_ENABLED: 'true',
      AUTONOMY_DRY_RUN: 'false',
      AUTONOMY_API_TOKEN: 'token',
      AUTONOMY_MEISHI_VERIFY_URL: 'https://example.com/api/meishi/agent/{agentIdentity}/verify',
      AUTONOMY_MEISHI_AGENT_ID: 'agent',
      AUTONOMY_OPENCLAW_BASE_URL: 'https://example.com',
      AUTONOMY_OPENCLAW_MODE: 'tools_invoke',
      AUTONOMY_OPENCLAW_GATEWAY_TOKEN: 'gateway',
      AUTONOMY_X_PUBLIC: 'false',
      AUTONOMY_X_ALLOWLIST: 'someone',
    });

    const result = validateConfig();
    expect(result.valid).toBe(true);
    restore();
  });
});
