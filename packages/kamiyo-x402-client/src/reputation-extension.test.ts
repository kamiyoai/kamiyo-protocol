import {
  encodeReputationHeaders,
  parseReputationHeaders,
  decodeReputationProof,
  reputationRequirementHeaders,
  checkReputationRequirement,
  parseReputationRequirement,
  withReputationProof,
  getTierForThreshold,
  calculateReputationPrice,
  tieredPricing402,
  CreditTracker,
  DEFAULT_TIERS,
  X402_REPUTATION_PROOF,
  X402_REPUTATION_COMMITMENT,
  X402_REPUTATION_THRESHOLD,
  type ReputationProofData,
} from './reputation-extension';

describe('encodeReputationHeaders', () => {
  const mockProof: ReputationProofData = {
    agentPk: 'AgentPubKey123',
    commitment: 'commitment-hash-abc',
    threshold: 70,
    proofBytes: new Uint8Array([1, 2, 3, 4]),
    groth16Proof: {
      pi_a: ['a1', 'a2'],
      pi_b: [['b1', 'b2'], ['b3', 'b4']],
      pi_c: ['c1', 'c2'],
      protocol: 'groth16',
      curve: 'bn254',
    },
    publicSignals: ['signal1', 'signal2'],
  };

  it('encodes proof to base64 header', () => {
    const headers = encodeReputationHeaders(mockProof);
    expect(headers[X402_REPUTATION_PROOF]).toBeTruthy();
    expect(typeof headers[X402_REPUTATION_PROOF]).toBe('string');
  });

  it('includes commitment header', () => {
    const headers = encodeReputationHeaders(mockProof);
    expect(headers[X402_REPUTATION_COMMITMENT]).toBe('commitment-hash-abc');
  });

  it('includes threshold header as string', () => {
    const headers = encodeReputationHeaders(mockProof);
    expect(headers[X402_REPUTATION_THRESHOLD]).toBe('70');
  });
});

describe('parseReputationHeaders', () => {
  it('parses valid headers', () => {
    const headers = {
      [X402_REPUTATION_PROOF]: 'proof-data',
      [X402_REPUTATION_COMMITMENT]: 'commitment-abc',
      [X402_REPUTATION_THRESHOLD]: '75',
    };
    const parsed = parseReputationHeaders(headers);
    expect(parsed).not.toBeNull();
    expect(parsed!.proof).toBe('proof-data');
    expect(parsed!.commitment).toBe('commitment-abc');
    expect(parsed!.threshold).toBe(75);
  });

  it('returns null for missing proof', () => {
    const headers = {
      [X402_REPUTATION_COMMITMENT]: 'commitment-abc',
      [X402_REPUTATION_THRESHOLD]: '75',
    };
    expect(parseReputationHeaders(headers)).toBeNull();
  });

  it('returns null for missing commitment', () => {
    const headers = {
      [X402_REPUTATION_PROOF]: 'proof-data',
      [X402_REPUTATION_THRESHOLD]: '75',
    };
    expect(parseReputationHeaders(headers)).toBeNull();
  });

  it('returns null for missing threshold', () => {
    const headers = {
      [X402_REPUTATION_PROOF]: 'proof-data',
      [X402_REPUTATION_COMMITMENT]: 'commitment-abc',
    };
    expect(parseReputationHeaders(headers)).toBeNull();
  });

  it('handles lowercase header names', () => {
    const headers = {
      'x-402-reputation-proof': 'proof-data',
      'x-402-reputation-commitment': 'commitment-abc',
      'x-402-reputation-threshold': '75',
    };
    const parsed = parseReputationHeaders(headers);
    expect(parsed).not.toBeNull();
    expect(parsed!.threshold).toBe(75);
  });

  it('handles array values', () => {
    const headers = {
      [X402_REPUTATION_PROOF]: ['proof-data', 'ignored'],
      [X402_REPUTATION_COMMITMENT]: ['commitment-abc'],
      [X402_REPUTATION_THRESHOLD]: ['75'],
    };
    const parsed = parseReputationHeaders(headers);
    expect(parsed).not.toBeNull();
    expect(parsed!.proof).toBe('proof-data');
  });

  it('returns null for invalid threshold (negative)', () => {
    const headers = {
      [X402_REPUTATION_PROOF]: 'proof-data',
      [X402_REPUTATION_COMMITMENT]: 'commitment-abc',
      [X402_REPUTATION_THRESHOLD]: '-1',
    };
    expect(parseReputationHeaders(headers)).toBeNull();
  });

  it('returns null for invalid threshold (> 100)', () => {
    const headers = {
      [X402_REPUTATION_PROOF]: 'proof-data',
      [X402_REPUTATION_COMMITMENT]: 'commitment-abc',
      [X402_REPUTATION_THRESHOLD]: '101',
    };
    expect(parseReputationHeaders(headers)).toBeNull();
  });

  it('returns null for non-numeric threshold', () => {
    const headers = {
      [X402_REPUTATION_PROOF]: 'proof-data',
      [X402_REPUTATION_COMMITMENT]: 'commitment-abc',
      [X402_REPUTATION_THRESHOLD]: 'high',
    };
    expect(parseReputationHeaders(headers)).toBeNull();
  });
});

describe('decodeReputationProof', () => {
  it('decodes valid proof payload', () => {
    const payload = {
      agentPk: 'AgentPubKey123',
      commitment: 'commitment-hash',
      threshold: 70,
      proof: Buffer.from([1, 2, 3, 4]).toString('base64'),
    };
    const encoded = Buffer.from(JSON.stringify(payload)).toString('base64');

    const decoded = decodeReputationProof(encoded);
    expect(decoded).not.toBeNull();
    expect(decoded!.agentPk).toBe('AgentPubKey123');
    expect(decoded!.commitment).toBe('commitment-hash');
    expect(decoded!.threshold).toBe(70);
  });

  it('returns null for invalid base64', () => {
    expect(decodeReputationProof('not-valid-base64!!!')).toBeNull();
  });

  it('returns null for non-JSON content', () => {
    const encoded = Buffer.from('not json').toString('base64');
    expect(decodeReputationProof(encoded)).toBeNull();
  });
});

describe('reputationRequirementHeaders', () => {
  it('returns required header as true', () => {
    const headers = reputationRequirementHeaders(70);
    expect(headers['X-402-Reputation-Required']).toBe('true');
  });

  it('returns minimum threshold', () => {
    const headers = reputationRequirementHeaders(85);
    expect(headers['X-402-Reputation-Min-Threshold']).toBe('85');
  });
});

describe('checkReputationRequirement', () => {
  it('returns valid when not required', () => {
    const result = checkReputationRequirement({}, { minThreshold: 70, required: false });
    expect(result.valid).toBe(true);
  });

  it('returns invalid when required but no headers', () => {
    const result = checkReputationRequirement({}, { minThreshold: 70, required: true });
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('Missing');
  });

  it('returns invalid when threshold too low', () => {
    const headers = {
      [X402_REPUTATION_PROOF]: 'proof',
      [X402_REPUTATION_COMMITMENT]: 'commitment',
      [X402_REPUTATION_THRESHOLD]: '50',
    };
    const result = checkReputationRequirement(headers, { minThreshold: 70, required: true });
    expect(result.valid).toBe(false);
    expect(result.threshold).toBe(50);
    expect(result.reason).toContain('below');
  });

  it('returns valid when threshold meets requirement', () => {
    const headers = {
      [X402_REPUTATION_PROOF]: 'proof',
      [X402_REPUTATION_COMMITMENT]: 'commitment',
      [X402_REPUTATION_THRESHOLD]: '70',
    };
    const result = checkReputationRequirement(headers, { minThreshold: 70, required: true });
    expect(result.valid).toBe(true);
    expect(result.threshold).toBe(70);
    expect(result.commitment).toBe('commitment');
  });

  it('returns valid when threshold exceeds requirement', () => {
    const headers = {
      [X402_REPUTATION_PROOF]: 'proof',
      [X402_REPUTATION_COMMITMENT]: 'commitment',
      [X402_REPUTATION_THRESHOLD]: '90',
    };
    const result = checkReputationRequirement(headers, { minThreshold: 70, required: true });
    expect(result.valid).toBe(true);
  });
});

describe('parseReputationRequirement', () => {
  it('returns null when not required', () => {
    const headers = { 'X-402-Reputation-Required': 'false' };
    expect(parseReputationRequirement(headers)).toBeNull();
  });

  it('returns null when required header missing', () => {
    expect(parseReputationRequirement({})).toBeNull();
  });

  it('returns null when threshold missing', () => {
    const headers = { 'X-402-Reputation-Required': 'true' };
    expect(parseReputationRequirement(headers)).toBeNull();
  });

  it('parses requirement from headers', () => {
    const headers = {
      'X-402-Reputation-Required': 'true',
      'X-402-Reputation-Min-Threshold': '75',
    };
    const result = parseReputationRequirement(headers);
    expect(result).not.toBeNull();
    expect(result!.minThreshold).toBe(75);
    expect(result!.required).toBe(true);
  });

  it('handles Headers object', () => {
    const headers = new Headers();
    headers.set('X-402-Reputation-Required', 'true');
    headers.set('X-402-Reputation-Min-Threshold', '80');

    const result = parseReputationRequirement(headers);
    expect(result).not.toBeNull();
    expect(result!.minThreshold).toBe(80);
  });
});

describe('withReputationProof', () => {
  const mockProof: ReputationProofData = {
    agentPk: 'AgentPubKey123',
    commitment: 'commitment-hash',
    threshold: 70,
    proofBytes: new Uint8Array([1, 2, 3]),
  };

  it('adds reputation headers to RequestInit', () => {
    const init = withReputationProof(mockProof);
    expect(init.headers).toBeDefined();
    expect((init.headers as Record<string, string>)[X402_REPUTATION_THRESHOLD]).toBe('70');
  });

  it('merges with existing headers', () => {
    const init = withReputationProof(mockProof, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
    expect((init.headers as Record<string, string>)[X402_REPUTATION_THRESHOLD]).toBe('70');
  });

  it('preserves other RequestInit properties', () => {
    const init = withReputationProof(mockProof, {
      method: 'POST',
      body: 'test',
    });
    expect(init.method).toBe('POST');
    expect(init.body).toBe('test');
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
    expect(response.x402Version).toBe(1);
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
