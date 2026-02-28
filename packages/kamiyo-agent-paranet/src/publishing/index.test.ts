import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ParanetConfig } from '../types';
import { createDKGClient } from './index';

const ctorCalls: Array<Record<string, unknown>> = [];

vi.mock('dkg.js', () => ({
  default: class MockDKG {
    asset = {
      create: vi.fn(),
      get: vi.fn(),
      update: vi.fn(),
    };

    graph = {
      query: vi.fn(),
    };

    constructor(config: Record<string, unknown>) {
      ctorCalls.push(config);
    }
  },
}));

describe('createDKGClient', () => {
  beforeEach(() => {
    ctorCalls.length = 0;
  });

  it('normalizes raw host endpoints to http', async () => {
    const config: ParanetConfig = {
      dkgEndpoint: '46.101.155.45',
      dkgPort: 8900,
      blockchain: 'base:8453',
    };

    await createDKGClient(config);

    expect(ctorCalls).toHaveLength(1);
    const call = ctorCalls[0] as { endpoint?: string };
    expect(call.endpoint).toBe('http://46.101.155.45');
  });

  it('keeps fully-qualified endpoints unchanged', async () => {
    const config: ParanetConfig = {
      dkgEndpoint: 'https://dkg.origintrail.io',
      dkgPort: 8900,
      blockchain: 'base:8453',
    };

    await createDKGClient(config);

    expect(ctorCalls).toHaveLength(1);
    const call = ctorCalls[0] as { endpoint?: string };
    expect(call.endpoint).toBe('https://dkg.origintrail.io');
  });
});
