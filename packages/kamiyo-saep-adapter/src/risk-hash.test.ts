import { describe, expect, it } from 'vitest';

import { computeRiskHash, RISK_HASH_FIELDS, risksMatch } from './risk-hash.js';
import type { SaepWorkRef } from './types.js';

const BASE: Omit<SaepWorkRef, 'riskHash'> = {
  venue: 'saep',
  cluster: 'mainnet-beta',
  taskPda: 'TaskPda1111111111111111111111111111111111111',
  taskId: 'a'.repeat(64),
  paymentMint: 'Mint11111111111111111111111111111111111111',
  amountMicro: '1000000',
  clientWallet: 'Client111111111111111111111111111111111111',
  agentRef: 'b'.repeat(64),
  status: 'funded',
};

describe('computeRiskHash', () => {
  it('produces a stable hash for the same input', () => {
    const a = computeRiskHash(BASE);
    const b = computeRiskHash(BASE);
    expect(a).toBe(b);
  });

  it('starts with sha256: and contains 64 lowercase hex chars', () => {
    const hash = computeRiskHash(BASE);
    expect(hash).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it('changes when any single risk-relevant field changes', () => {
    const baseline = computeRiskHash(BASE);

    const fields: Array<{ field: keyof SaepWorkRef; tweak: () => Omit<SaepWorkRef, 'riskHash'> }> =
      [
        { field: 'cluster', tweak: () => ({ ...BASE, cluster: 'devnet' }) },
        {
          field: 'taskPda',
          tweak: () => ({ ...BASE, taskPda: 'OtherTaskPda1111111111111111111111111111111' }),
        },
        { field: 'taskId', tweak: () => ({ ...BASE, taskId: 'c'.repeat(64) }) },
        {
          field: 'paymentMint',
          tweak: () => ({ ...BASE, paymentMint: 'OtherMint1111111111111111111111111111111111' }),
        },
        { field: 'amountMicro', tweak: () => ({ ...BASE, amountMicro: '2000000' }) },
        {
          field: 'clientWallet',
          tweak: () => ({ ...BASE, clientWallet: 'OtherClient11111111111111111111111111111111' }),
        },
        { field: 'agentRef', tweak: () => ({ ...BASE, agentRef: 'd'.repeat(64) }) },
        { field: 'status', tweak: () => ({ ...BASE, status: 'verified' }) },
      ];

    for (const { field, tweak } of fields) {
      const tweaked = computeRiskHash(tweak());
      expect(tweaked, `field ${String(field)} should change the hash`).not.toBe(baseline);
    }
  });

  it('throws on a missing field rather than producing a partial hash', () => {
    const broken = { ...BASE } as Omit<SaepWorkRef, 'riskHash'> & Partial<SaepWorkRef>;
    delete (broken as Partial<SaepWorkRef>).status;

    expect(() => computeRiskHash(broken)).toThrow(/required field "status"/);
  });

  it('exposes the hash field set as a frozen, ordered list', () => {
    expect(Object.isFrozen(RISK_HASH_FIELDS)).toBe(true);
    // First field must remain `venue` so the hash is venue-discriminated even
    // when SAEP shares fields with a future venue.
    expect(RISK_HASH_FIELDS[0]).toBe('venue');
  });
});

describe('risksMatch', () => {
  it('returns true for identical hashes', () => {
    const h = computeRiskHash(BASE);
    expect(risksMatch(h, h)).toBe(true);
  });

  it('returns false for different hashes', () => {
    const a = computeRiskHash(BASE);
    const b = computeRiskHash({ ...BASE, status: 'verified' });
    expect(risksMatch(a, b)).toBe(false);
  });

  it('returns false for hashes of different lengths', () => {
    expect(risksMatch('sha256:abc', 'sha256:abcd')).toBe(false);
  });
});
