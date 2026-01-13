import { describe, it, expect } from 'vitest';

// Test tier configuration logic
const TIERS = {
  free: {
    name: 'Free',
    minTokens: 0,
    pricePerMonth: 0,
    maxMessagesPerDay: 10,
    contextMemory: false,
  },
  companion: {
    name: 'Companion',
    minTokens: 100_000,
    pricePerMonth: 0.5,
    maxMessagesPerDay: 100,
    contextMemory: true,
  },
  pro: {
    name: 'Companion Pro',
    minTokens: 1_000_000,
    pricePerMonth: 1.0,
    maxMessagesPerDay: -1,
    contextMemory: true,
  },
};

function getTierConfig(tier: string) {
  return TIERS[tier as keyof typeof TIERS] || TIERS.free;
}

function calculateTierFromBalance(balance: number): string {
  if (balance >= TIERS.pro.minTokens) return 'pro';
  if (balance >= TIERS.companion.minTokens) return 'companion';
  return 'free';
}

function getRequiredPayment(tier: string): { sol: number; lamports: number } {
  const config = getTierConfig(tier);
  const sol = config.pricePerMonth;
  return { sol, lamports: Math.floor(sol * 1_000_000_000) };
}

describe('Tier Configuration', () => {
  it('should return free tier config by default', () => {
    const config = getTierConfig('free');
    expect(config.name).toBe('Free');
    expect(config.maxMessagesPerDay).toBe(10);
    expect(config.contextMemory).toBe(false);
  });

  it('should return companion tier config', () => {
    const config = getTierConfig('companion');
    expect(config.name).toBe('Companion');
    expect(config.maxMessagesPerDay).toBe(100);
    expect(config.contextMemory).toBe(true);
  });

  it('should return pro tier config with unlimited messages', () => {
    const config = getTierConfig('pro');
    expect(config.name).toBe('Companion Pro');
    expect(config.maxMessagesPerDay).toBe(-1);
  });

  it('should return free config for unknown tier', () => {
    const config = getTierConfig('unknown');
    expect(config.name).toBe('Free');
  });
});

describe('Tier Calculation', () => {
  it('should return free for zero balance', () => {
    expect(calculateTierFromBalance(0)).toBe('free');
  });

  it('should return free for balance below companion threshold', () => {
    expect(calculateTierFromBalance(50_000)).toBe('free');
  });

  it('should return companion for 100K tokens', () => {
    expect(calculateTierFromBalance(100_000)).toBe('companion');
  });

  it('should return companion for balance between companion and pro', () => {
    expect(calculateTierFromBalance(500_000)).toBe('companion');
  });

  it('should return pro for 1M tokens', () => {
    expect(calculateTierFromBalance(1_000_000)).toBe('pro');
  });

  it('should return pro for balance above pro threshold', () => {
    expect(calculateTierFromBalance(5_000_000)).toBe('pro');
  });
});

describe('Payment Calculation', () => {
  it('should return 0 SOL for free tier', () => {
    const payment = getRequiredPayment('free');
    expect(payment.sol).toBe(0);
    expect(payment.lamports).toBe(0);
  });

  it('should return 0.5 SOL for companion tier', () => {
    const payment = getRequiredPayment('companion');
    expect(payment.sol).toBe(0.5);
    expect(payment.lamports).toBe(500_000_000);
  });

  it('should return 1 SOL for pro tier', () => {
    const payment = getRequiredPayment('pro');
    expect(payment.sol).toBe(1.0);
    expect(payment.lamports).toBe(1_000_000_000);
  });
});
