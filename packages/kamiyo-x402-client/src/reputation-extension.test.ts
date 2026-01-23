import {
  buildReputationPayload,
  reputationExtensionInfo,
  parseReputationRequirement,
  checkReputationRequirement,
  getTierForThreshold,
  calculateReputationPrice,
  tieredPricing402,
  CreditTracker,
  DEFAULT_TIERS,
  REPUTATION_EXTENSION_KEY,
  type ReputationProofData,
} from './reputation-extension';
import type { PaymentRequired402 } from './v2/types';

describe('buildReputationPayload', () => {
  const mockProof: ReputationProofData = {
    agentPk: 'AgentPubKey123',
    commitment: '0x' + 'a'.repeat(64),
    threshold: 70,
    proofBytes: new Uint8Array([1, 2, 3, 4]),
    publicSignals: ['signal1', 'signal2'],
  };

  it('encodes proof bytes as base64 nested under info', () => {
    const payload = buildReputationPayload(mockProof);
    const rep = payload[REPUTATION_EXTENSION_KEY].info as any;
    expect(rep.proof).toBe(Buffer.from(mockProof.proofBytes).toString('base64'));
  });

  it('includes commitment', () => {
    const payload = buildReputationPayload(mockProof);
    expect((payload[REPUTATION_EXTENSION_KEY].info as any).commitment).toBe(mockProof.commitment);
  });

  it('includes threshold as number', () => {
    const payload = buildReputationPayload(mockProof);
    expect((payload[REPUTATION_EXTENSION_KEY].info as any).threshold).toBe(70);
  });

  it('includes agentPk', () => {
    const payload = buildReputationPayload(mockProof);
    expect((payload[REPUTATION_EXTENSION_KEY].info as any).agentPk).toBe('AgentPubKey123');
  });

  it('includes publicSignals', () => {
    const payload = buildReputationPayload(mockProof);
    expect((payload[REPUTATION_EXTENSION_KEY].info as any).publicSignals).toEqual(['signal1', 'signal2']);
  });

  it('defaults publicSignals to empty array', () => {
    const proof = { ...mockProof, publicSignals: undefined };
    const payload = buildReputationPayload(proof);
    expect((payload[REPUTATION_EXTENSION_KEY].info as any).publicSignals).toEqual([]);
  });
});

describe('reputationExtensionInfo', () => {
  it('builds extension declaration with defaults', () => {
    const ext = reputationExtensionInfo(70);
    expect(ext[REPUTATION_EXTENSION_KEY]).toBeDefined();
    const info = ext[REPUTATION_EXTENSION_KEY].info as any;
    expect(info.minThreshold).toBe(70);
    expect(info.proofType).toBe('groth16-bn254');
    expect(info.creditEnabled).toBe(false);
  });

  it('accepts custom tiers', () => {
    const tiers = [{ name: 'custom', minThreshold: 60, discountPercent: 20 }];
    const ext = reputationExtensionInfo(60, { tiers, creditEnabled: true });
    const info = ext[REPUTATION_EXTENSION_KEY].info as any;
    expect(info.tiers).toEqual(tiers);
    expect(info.creditEnabled).toBe(true);
  });
});

describe('parseReputationRequirement', () => {
  it('parses from 402 response with reputation extension at top level', () => {
    const response: PaymentRequired402 = {
      x402Version: 2,
      accepts: [{
        x402Version: 2,
        scheme: 'exact',
        network: 'eip155:8453',
        amount: '10000',
        asset: 'USDC',
        payTo: '0x123',
        resource: '/api',
        description: 'test',
        maxTimeoutSeconds: 60,
      }],
      error: 'Payment Required',
      facilitator: 'https://f.test',
      extensions: {
        'kamiyo-reputation': {
          info: {
            minThreshold: 75,
            proofType: 'groth16-bn254',
            tiers: DEFAULT_TIERS,
            creditEnabled: false,
          },
        },
      },
    };

    const result = parseReputationRequirement(response);
    expect(result).not.toBeNull();
    expect(result!.minThreshold).toBe(75);
    expect(result!.required).toBe(true);
  });

  it('returns null when no extension', () => {
    const response: PaymentRequired402 = {
      x402Version: 2,
      accepts: [{
        x402Version: 2,
        scheme: 'exact',
        network: 'eip155:8453',
        amount: '10000',
        asset: 'USDC',
        payTo: '0x123',
        resource: '/api',
        description: 'test',
        maxTimeoutSeconds: 60,
      }],
      error: 'Payment Required',
      facilitator: 'https://f.test',
    };
    expect(parseReputationRequirement(response)).toBeNull();
  });
});

describe('checkReputationRequirement', () => {
  it('returns valid when not required', () => {
    const result = checkReputationRequirement(undefined, { minThreshold: 70, required: false });
    expect(result.valid).toBe(true);
  });

  it('returns invalid when required but no extensions', () => {
    const result = checkReputationRequirement(undefined, { minThreshold: 70, required: true });
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('Missing');
  });

  it('returns invalid when extensions empty', () => {
    const result = checkReputationRequirement({}, { minThreshold: 70, required: true });
    expect(result.valid).toBe(false);
  });

  it('returns invalid when threshold too low', () => {
    const extensions = {
      'kamiyo-reputation': {
        info: {
          proof: 'base64data',
          commitment: '0x' + 'a'.repeat(64),
          threshold: 50,
          agentPk: 'agent123',
          publicSignals: ['123'],
        },
      },
    };
    const result = checkReputationRequirement(extensions, { minThreshold: 70, required: true });
    expect(result.valid).toBe(false);
    expect(result.threshold).toBe(50);
    expect(result.reason).toContain('below');
  });

  it('returns valid when threshold meets requirement', () => {
    const extensions = {
      'kamiyo-reputation': {
        info: {
          proof: 'base64data',
          commitment: '0x' + 'a'.repeat(64),
          threshold: 70,
          agentPk: 'agent123',
          publicSignals: ['123'],
        },
      },
    };
    const result = checkReputationRequirement(extensions, { minThreshold: 70, required: true });
    expect(result.valid).toBe(true);
    expect(result.threshold).toBe(70);
    expect(result.commitment).toBe('0x' + 'a'.repeat(64));
  });

  it('returns valid when threshold exceeds requirement', () => {
    const extensions = {
      'kamiyo-reputation': {
        info: {
          proof: 'base64data',
          commitment: '0x' + 'a'.repeat(64),
          threshold: 90,
          agentPk: 'agent123',
          publicSignals: ['123'],
        },
      },
    };
    const result = checkReputationRequirement(extensions, { minThreshold: 70, required: true });
    expect(result.valid).toBe(true);
  });
});

describe('getTierForThreshold', () => {
  it('returns untrusted for threshold < 50', () => {
    expect(getTierForThreshold(0).name).toBe('untrusted');
    expect(getTierForThreshold(49).name).toBe('untrusted');
  });

  it('returns basic for threshold 50-69', () => {
    expect(getTierForThreshold(50).name).toBe('basic');
    expect(getTierForThreshold(69).name).toBe('basic');
  });

  it('returns trusted for threshold 70-84', () => {
    expect(getTierForThreshold(70).name).toBe('trusted');
    expect(getTierForThreshold(84).name).toBe('trusted');
  });

  it('returns premium for threshold 85-94', () => {
    expect(getTierForThreshold(85).name).toBe('premium');
    expect(getTierForThreshold(94).name).toBe('premium');
  });

  it('returns elite for threshold 95+', () => {
    expect(getTierForThreshold(95).name).toBe('elite');
    expect(getTierForThreshold(100).name).toBe('elite');
  });

  it('uses custom tiers', () => {
    const customTiers = [
      { name: 'bronze', minThreshold: 0, discountPercent: 0 },
      { name: 'gold', minThreshold: 80, discountPercent: 20 },
    ];
    expect(getTierForThreshold(50, customTiers).name).toBe('bronze');
    expect(getTierForThreshold(80, customTiers).name).toBe('gold');
  });
});

describe('calculateReputationPrice', () => {
  const basePrice = 100;

  it('returns full price for untrusted tier', () => {
    const result = calculateReputationPrice(basePrice, 30);
    expect(result.price).toBe(100);
    expect(result.discount).toBe(0);
    expect(result.tier.name).toBe('untrusted');
  });

  it('returns 5% discount for basic tier', () => {
    const result = calculateReputationPrice(basePrice, 50);
    expect(result.price).toBe(95);
    expect(result.discount).toBe(5);
    expect(result.tier.name).toBe('basic');
  });

  it('returns 10% discount for trusted tier', () => {
    const result = calculateReputationPrice(basePrice, 70);
    expect(result.price).toBe(90);
    expect(result.discount).toBe(10);
    expect(result.tier.name).toBe('trusted');
  });

  it('returns 15% discount for premium tier', () => {
    const result = calculateReputationPrice(basePrice, 85);
    expect(result.price).toBe(85);
    expect(result.discount).toBe(15);
    expect(result.tier.name).toBe('premium');
  });

  it('returns 25% discount for elite tier', () => {
    const result = calculateReputationPrice(basePrice, 95);
    expect(result.price).toBe(75);
    expect(result.discount).toBe(25);
    expect(result.tier.name).toBe('elite');
  });
});

describe('tieredPricing402', () => {
  const basePrice = 100;

  it('returns full pricing breakdown', () => {
    const response = tieredPricing402(basePrice, 70);
    expect(response.x402Version).toBe(2);
    expect(response.basePrice).toBe(100);
    expect(response.yourPrice).toBe(90);
    expect(response.yourTier).toBe('trusted');
    expect(response.yourDiscount).toBe(10);
    expect(response.tiers.length).toBe(DEFAULT_TIERS.length);
  });

  it('uses untrusted tier for null threshold', () => {
    const response = tieredPricing402(basePrice, null);
    expect(response.yourPrice).toBe(100);
    expect(response.yourTier).toBe('untrusted');
    expect(response.yourDiscount).toBe(0);
  });

  it('includes all tier prices', () => {
    const response = tieredPricing402(basePrice, 70);
    const eliteTier = response.tiers.find(t => t.name === 'elite');
    expect(eliteTier).toBeDefined();
    expect(eliteTier!.price).toBe(75);
    expect(eliteTier!.discountPercent).toBe(25);
  });

  it('includes credit limit', () => {
    const response = tieredPricing402(basePrice, 95);
    expect(response.creditLimit).toBe(1000);
  });

  it('uses custom min threshold', () => {
    const response = tieredPricing402(basePrice, 70, { minThreshold: 50 });
    expect(response.minThreshold).toBe(50);
  });
});

describe('CreditTracker', () => {
  describe('getAccount', () => {
    it('returns null for unknown account', async () => {
      const tracker = new CreditTracker();
      expect(await tracker.getAccount('unknown')).toBeNull();
    });
  });

  describe('registerAccount', () => {
    it('creates account with tier-based credit limit', async () => {
      const tracker = new CreditTracker();
      const account = await tracker.registerAccount('commitment-1', 'agent-1', 95);
      expect(account.commitment).toBe('commitment-1');
      expect(account.agentPk).toBe('agent-1');
      expect(account.tier).toBe('elite');
      expect(account.creditLimit).toBe(1000);
      expect(account.usedCredit).toBe(0);
    });

    it('uses correct tier for different thresholds', async () => {
      const tracker = new CreditTracker();
      expect((await tracker.registerAccount('c1', 'a1', 30)).tier).toBe('untrusted');
      expect((await tracker.registerAccount('c2', 'a2', 50)).tier).toBe('basic');
      expect((await tracker.registerAccount('c3', 'a3', 70)).tier).toBe('trusted');
    });
  });

  describe('checkCredit', () => {
    it('returns false for unknown account', async () => {
      const tracker = new CreditTracker();
      const result = await tracker.checkCredit('unknown', 10);
      expect(result.approved).toBe(false);
      expect(result.availableCredit).toBe(0);
    });

    it('approves when credit available', async () => {
      const tracker = new CreditTracker();
      await tracker.registerAccount('c1', 'a1', 95);
      const result = await tracker.checkCredit('c1', 100);
      expect(result.approved).toBe(true);
      expect(result.availableCredit).toBe(1000);
    });

    it('rejects when insufficient credit', async () => {
      const tracker = new CreditTracker();
      await tracker.registerAccount('c1', 'a1', 95);
      const result = await tracker.checkCredit('c1', 1500);
      expect(result.approved).toBe(false);
      expect(result.reason).toContain('Insufficient');
    });
  });

  describe('useCredit', () => {
    it('returns false for unknown account', async () => {
      const tracker = new CreditTracker();
      expect(await tracker.useCredit('unknown', 10)).toBe(false);
    });

    it('deducts credit on success', async () => {
      const tracker = new CreditTracker();
      await tracker.registerAccount('c1', 'a1', 95);
      expect(await tracker.useCredit('c1', 100)).toBe(true);
      const account = await tracker.getAccount('c1');
      expect(account!.usedCredit).toBe(100);
    });

    it('returns false when insufficient credit', async () => {
      const tracker = new CreditTracker();
      await tracker.registerAccount('c1', 'a1', 95);
      expect(await tracker.useCredit('c1', 1500)).toBe(false);
    });
  });

  describe('repayCredit', () => {
    it('reduces used credit', async () => {
      const tracker = new CreditTracker();
      await tracker.registerAccount('c1', 'a1', 95);
      await tracker.useCredit('c1', 500);
      await tracker.repayCredit('c1', 200);
      const account = await tracker.getAccount('c1');
      expect(account!.usedCredit).toBe(300);
    });

    it('does not go negative', async () => {
      const tracker = new CreditTracker();
      await tracker.registerAccount('c1', 'a1', 95);
      await tracker.useCredit('c1', 100);
      await tracker.repayCredit('c1', 500);
      const account = await tracker.getAccount('c1');
      expect(account!.usedCredit).toBe(0);
    });

    it('updates last payment timestamp', async () => {
      const tracker = new CreditTracker();
      await tracker.registerAccount('c1', 'a1', 95);
      const before = Date.now();
      await tracker.repayCredit('c1', 100);
      const account = await tracker.getAccount('c1');
      expect(account!.lastPaymentAt).toBeGreaterThanOrEqual(before);
    });
  });

  describe('getStats', () => {
    it('returns aggregate stats', async () => {
      const tracker = new CreditTracker();
      await tracker.registerAccount('c1', 'a1', 95);
      await tracker.registerAccount('c2', 'a2', 85);
      await tracker.useCredit('c1', 200);

      const stats = await tracker.getStats();
      expect(stats.totalAccounts).toBe(2);
      expect(stats.totalCredit).toBe(1200);
      expect(stats.usedCredit).toBe(200);
    });

    it('returns zeros for empty tracker', async () => {
      const tracker = new CreditTracker();
      const stats = await tracker.getStats();
      expect(stats.totalAccounts).toBe(0);
      expect(stats.totalCredit).toBe(0);
      expect(stats.usedCredit).toBe(0);
    });
  });
});

describe('DEFAULT_TIERS', () => {
  it('has 5 tiers', () => {
    expect(DEFAULT_TIERS.length).toBe(5);
  });

  it('has correct tier names', () => {
    const names = DEFAULT_TIERS.map(t => t.name);
    expect(names).toContain('untrusted');
    expect(names).toContain('basic');
    expect(names).toContain('trusted');
    expect(names).toContain('premium');
    expect(names).toContain('elite');
  });

  it('has increasing discounts', () => {
    const discounts = DEFAULT_TIERS.map(t => t.discountPercent);
    for (let i = 1; i < discounts.length; i++) {
      expect(discounts[i]).toBeGreaterThanOrEqual(discounts[i - 1]);
    }
  });

  it('has increasing credit limits', () => {
    const limits = DEFAULT_TIERS.map(t => t.creditLimit || 0);
    for (let i = 1; i < limits.length; i++) {
      expect(limits[i]).toBeGreaterThanOrEqual(limits[i - 1]);
    }
  });
});
