import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { inspectCdpEnv, readCdpEnv } from './env.js';

const ENV_KEYS = [
  'CDP_API_KEY_ID',
  'CDP_API_KEY_SECRET',
  'CDP_WALLET_SECRET',
  'COINBASE_CDP_API_KEY_ID',
  'COINBASE_API_KEY_ID',
  'COINBASE_CDP_API_KEY_SECRET',
  'COINBASE_API_KEY_SECRET',
  'COINBASE_CDP_WALLET_SECRET',
  'COINBASE_WALLET_SECRET',
] as const;

let snapshot: Record<string, string | undefined> = {};

beforeEach(() => {
  snapshot = {};
  for (const key of ENV_KEYS) {
    snapshot[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    const value = snapshot[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe('CDP env resolution', () => {
  it('resolves canonical env keys', () => {
    process.env.CDP_API_KEY_ID = 'id-1';
    process.env.CDP_API_KEY_SECRET = 'secret-1';
    process.env.CDP_WALLET_SECRET = 'wallet-1';

    const env = readCdpEnv();
    expect(env.apiKeyId).toBe('id-1');
    expect(env.apiKeySecret).toBe('secret-1');
    expect(env.walletSecret).toBe('wallet-1');
  });

  it('resolves Coinbase alias env keys', () => {
    process.env.COINBASE_CDP_API_KEY_ID = 'id-2';
    process.env.COINBASE_API_KEY_SECRET = 'secret-2';
    process.env.COINBASE_WALLET_SECRET = 'wallet-2';

    const env = readCdpEnv();
    expect(env.apiKeyId).toBe('id-2');
    expect(env.apiKeySecret).toBe('secret-2');
    expect(env.walletSecret).toBe('wallet-2');
  });

  it('reports missing fields with aliases', () => {
    const status = inspectCdpEnv();
    expect(status.ok).toBe(false);
    expect(status.fields.apiKeyId.configured).toBe(false);
    expect(status.missing.some((entry) => entry.includes('CDP_API_KEY_ID'))).toBe(true);
  });
});
