import { describe, expect, it } from 'vitest';

import { allocateLamportsByWeight, calculateMultiplierMilli } from '../staking-referrals';

describe('staking referral payout math', () => {
  it('scales multiplier linearly and clamps at cap', () => {
    expect(calculateMultiplierMilli(0)).toBe(1000);
    expect(calculateMultiplierMilli(90)).toBe(1500);
    expect(calculateMultiplierMilli(180)).toBe(2000);
    expect(calculateMultiplierMilli(999)).toBe(2000);
  });

  it('allocates budget deterministically with remainder tie-breakers', () => {
    const allocations = allocateLamportsByWeight({
      budgetLamports: 20,
      rows: [
        { refereeWallet: 'wallet_a', weight: 1n },
        { refereeWallet: 'wallet_b', weight: 1n },
        { refereeWallet: 'wallet_c', weight: 1n },
      ],
    });

    const total = Array.from(allocations.values()).reduce((sum, value) => sum + value, 0);
    expect(total).toBe(20);

    expect(allocations.get('wallet_a')).toBe(7);
    expect(allocations.get('wallet_b')).toBe(7);
    expect(allocations.get('wallet_c')).toBe(6);
  });

  it('never allocates when all weights are zero', () => {
    const allocations = allocateLamportsByWeight({
      budgetLamports: 1_000,
      rows: [
        { refereeWallet: 'wallet_a', weight: 0n },
        { refereeWallet: 'wallet_b', weight: 0n },
      ],
    });

    expect(allocations.get('wallet_a')).toBe(0);
    expect(allocations.get('wallet_b')).toBe(0);
  });
});
