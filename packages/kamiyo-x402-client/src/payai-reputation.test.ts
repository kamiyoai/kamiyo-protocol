import {
  PayAIReputationTracker,
  calculateReputationDelta,
  createPayAIReputationPayload,
  verifyPayAIReputation,
  calculatePayAIPrice,
  buildPayAI402Response,
  aggregateReputation,
  EscrowOutcome,
  ReputationSource,
} from './payai-reputation';
import { DynamicCreditTracker, InMemoryCreditStoreV2 } from './reputation-extension';

describe('calculateReputationDelta', () => {
  describe('Released outcome', () => {
    it('returns +5 provider, +1 agent for clean release', () => {
      const delta = calculateReputationDelta(EscrowOutcome.Released);
      expect(delta.providerDelta).toBe(5);
      expect(delta.agentDelta).toBe(1);
      expect(delta.reason).toContain('Clean');
    });
  });

  describe('DisputeWonAgent outcome', () => {
    it('returns -10 provider for agent winning dispute', () => {
      const delta = calculateReputationDelta(EscrowOutcome.DisputeWonAgent, 30);
      expect(delta.providerDelta).toBe(-10);
      expect(delta.agentDelta).toBe(0);
      expect(delta.reason).toContain('quality');
    });
  });

  describe('DisputeWonProvider outcome', () => {
    it('returns -5 agent for frivolous dispute', () => {
      const delta = calculateReputationDelta(EscrowOutcome.DisputeWonProvider);
      expect(delta.providerDelta).toBe(2);
      expect(delta.agentDelta).toBe(-5);
      expect(delta.reason).toContain('Frivolous');
    });
  });

  describe('DisputePartial outcome', () => {
    it('returns -2 provider for partial resolution', () => {
      const delta = calculateReputationDelta(EscrowOutcome.DisputePartial, 60);
      expect(delta.providerDelta).toBe(-2);
      expect(delta.agentDelta).toBe(0);
      expect(delta.reason).toContain('Partial');
    });
  });

  describe('Expired outcome', () => {
    it('returns -3 provider for timelock expiration', () => {
      const delta = calculateReputationDelta(EscrowOutcome.Expired);
      expect(delta.providerDelta).toBe(-3);
      expect(delta.agentDelta).toBe(0);
      expect(delta.reason).toContain('expired');
    });
  });
});

describe('PayAIReputationTracker', () => {
  describe('getRecord', () => {
    it('creates new record with neutral score', () => {
      const tracker = new PayAIReputationTracker();
      const record = tracker.getRecord('agent-1');
      expect(record.publicKey).toBe('agent-1');
      expect(record.score).toBe(50);
      expect(record.totalEscrows).toBe(0);
      expect(record.successfulEscrows).toBe(0);
      expect(record.disputedEscrows).toBe(0);
    });

    it('returns existing record', async () => {
      const tracker = new PayAIReputationTracker();
      tracker.getRecord('agent-1');
      await tracker.updateReputation('agent-1', EscrowOutcome.Released, ReputationSource.Direct);
      const record = tracker.getRecord('agent-1');
      expect(record.totalEscrows).toBe(1);
    });
  });

  describe('updateReputation', () => {
    it('increases score on release', async () => {
      const tracker = new PayAIReputationTracker();
      const record = await tracker.updateReputation('agent-1', EscrowOutcome.Released, ReputationSource.Direct);
      expect(record.score).toBe(55);
      expect(record.totalEscrows).toBe(1);
      expect(record.successfulEscrows).toBe(1);
    });

    it('decreases score on dispute loss', async () => {
      const tracker = new PayAIReputationTracker();
      const record = await tracker.updateReputation('agent-1', EscrowOutcome.DisputeWonAgent, ReputationSource.FreelanceAI);
      expect(record.score).toBe(40);
      expect(record.disputedEscrows).toBe(1);
    });

    it('caps score at 100', async () => {
      const tracker = new PayAIReputationTracker();
      for (let i = 0; i < 20; i++) {
        await tracker.updateReputation('agent-1', EscrowOutcome.Released, ReputationSource.Direct);
      }
      const record = tracker.getRecord('agent-1');
      expect(record.score).toBeLessThanOrEqual(100);
    });

    it('floors score at 0', async () => {
      const tracker = new PayAIReputationTracker();
      for (let i = 0; i < 10; i++) {
        await tracker.updateReputation('agent-1', EscrowOutcome.DisputeWonAgent, ReputationSource.Direct);
      }
      const record = tracker.getRecord('agent-1');
      expect(record.score).toBeGreaterThanOrEqual(0);
    });

    it('tracks source contribution', async () => {
      const tracker = new PayAIReputationTracker();
      await tracker.updateReputation('agent-1', EscrowOutcome.Released, ReputationSource.FreelanceAI);
      await tracker.updateReputation('agent-1', EscrowOutcome.Released, ReputationSource.Bazaar);
      const record = tracker.getRecord('agent-1');
      expect(record.sources.get(ReputationSource.FreelanceAI)).toBe(5);
      expect(record.sources.get(ReputationSource.Bazaar)).toBe(5);
    });

    it('updates lastUpdated timestamp', async () => {
      const tracker = new PayAIReputationTracker();
      const before = Date.now();
      const record = await tracker.updateReputation('agent-1', EscrowOutcome.Released, ReputationSource.Direct);
      expect(record.lastUpdated).toBeGreaterThanOrEqual(before);
    });
  });

  describe('getSuccessRate', () => {
    it('returns 50 for new account', () => {
      const tracker = new PayAIReputationTracker();
      expect(tracker.getSuccessRate('agent-1')).toBe(50);
    });

    it('calculates correct success rate', async () => {
      const tracker = new PayAIReputationTracker();
      await tracker.updateReputation('agent-1', EscrowOutcome.Released, ReputationSource.Direct);
      await tracker.updateReputation('agent-1', EscrowOutcome.Released, ReputationSource.Direct);
      await tracker.updateReputation('agent-1', EscrowOutcome.DisputeWonAgent, ReputationSource.Direct);
      expect(tracker.getSuccessRate('agent-1')).toBe(67);
    });
  });

  describe('getCombinedScore', () => {
    it('returns current score', async () => {
      const tracker = new PayAIReputationTracker();
      await tracker.updateReputation('agent-1', EscrowOutcome.Released, ReputationSource.Direct);
      expect(tracker.getCombinedScore('agent-1')).toBe(55);
    });
  });

  describe('serialize/deserialize', () => {
    it('roundtrips tracker state', async () => {
      const tracker = new PayAIReputationTracker();
      await tracker.updateReputation('agent-1', EscrowOutcome.Released, ReputationSource.FreelanceAI);
      await tracker.updateReputation('agent-2', EscrowOutcome.DisputeWonAgent, ReputationSource.Bazaar);

      const json = tracker.serialize();
      const restored = PayAIReputationTracker.deserialize(json);

      expect(restored.getCombinedScore('agent-1')).toBe(55);
      expect(restored.getCombinedScore('agent-2')).toBe(40);
      expect(restored.getRecord('agent-1').sources.get(ReputationSource.FreelanceAI)).toBe(5);
    });

    it('handles empty tracker', () => {
      const tracker = new PayAIReputationTracker();
      const json = tracker.serialize();
      const restored = PayAIReputationTracker.deserialize(json);
      expect(restored.getCombinedScore('unknown')).toBe(50);
    });
  });
});

describe('createPayAIReputationPayload', () => {
  const mockProof = {
    agentPk: 'AgentPubKey123',
    commitment: '0x' + 'a'.repeat(64),
    threshold: 70,
    proofBytes: new Uint8Array([1, 2, 3]),
  };

  it('builds extension payload with proof nested under info', () => {
    const result = createPayAIReputationPayload(mockProof, ReputationSource.FreelanceAI);
    const rep = result.extensions['kamiyo-reputation'].info as any;
    expect(rep.proof).toBe(Buffer.from(mockProof.proofBytes).toString('base64'));
    expect(rep.commitment).toBe(mockProof.commitment);
    expect(rep.threshold).toBe(70);
    expect(rep.agentPk).toBe('AgentPubKey123');
  });

  it('includes source', () => {
    const result = createPayAIReputationPayload(mockProof, ReputationSource.FreelanceAI);
    expect(result.source).toBe('freelance_ai');
  });

  it('uses different source values', () => {
    expect(createPayAIReputationPayload(mockProof, ReputationSource.Bazaar).source).toBe('bazaar');
    expect(createPayAIReputationPayload(mockProof, ReputationSource.CTAgent).source).toBe('ct_agent');
    expect(createPayAIReputationPayload(mockProof, ReputationSource.Direct).source).toBe('direct');
  });
});

describe('verifyPayAIReputation', () => {
  const config = {
    minThreshold: 70,
    source: ReputationSource.FreelanceAI,
    requireProof: true,
  };

  it('returns invalid when proof required but no extensions', () => {
    const result = verifyPayAIReputation(undefined, config);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('Missing');
  });

  it('returns valid when proof not required and missing', () => {
    const result = verifyPayAIReputation(undefined, { ...config, requireProof: false });
    expect(result.valid).toBe(true);
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
    const result = verifyPayAIReputation(extensions, config);
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
          threshold: 75,
          agentPk: 'agent123',
          publicSignals: ['123'],
        },
      },
    };
    const result = verifyPayAIReputation(extensions, config);
    expect(result.valid).toBe(true);
    expect(result.threshold).toBe(75);
    expect(result.source).toBe(ReputationSource.FreelanceAI);
  });
});

describe('calculatePayAIPrice', () => {
  const basePrice = 100;

  it('returns full price for null threshold', () => {
    const result = calculatePayAIPrice(basePrice, null);
    expect(result.price).toBe(100);
    expect(result.discount).toBe(0);
    expect(result.tier).toBe('untrusted');
    expect(result.creditLimit).toBe(0);
  });

  it('applies standard tier discount', () => {
    const result = calculatePayAIPrice(basePrice, 70);
    expect(result.price).toBe(90);
    expect(result.discount).toBe(10);
    expect(result.tier).toBe('trusted');
  });

  it('applies bonus discount for FreelanceAI veterans', () => {
    const result = calculatePayAIPrice(basePrice, 70, ReputationSource.FreelanceAI);
    expect(result.price).toBe(88);
    expect(result.discount).toBe(12);
  });

  it('no bonus for non-FreelanceAI source', () => {
    const result = calculatePayAIPrice(basePrice, 70, ReputationSource.Bazaar);
    expect(result.price).toBe(90);
  });

  it('no bonus for FreelanceAI below threshold', () => {
    const result = calculatePayAIPrice(basePrice, 50, ReputationSource.FreelanceAI);
    expect(result.price).toBe(95);
  });

  it('includes credit limit from tier', () => {
    const result = calculatePayAIPrice(basePrice, 95);
    expect(result.creditLimit).toBe(1000);
  });
});

describe('buildPayAI402Response', () => {
  const basePrice = 100;

  it('returns complete v2 response structure', () => {
    const response = buildPayAI402Response(basePrice, 70, ReputationSource.FreelanceAI);
    expect(response.x402Version).toBe(2);
    expect(response.basePrice).toBe(100);
    expect(response.yourPrice).toBe(88);
    expect(response.yourTier).toBe('trusted');
    expect(response.ecosystem).toBe('payai');
    expect(response.supportedSources).toContain('freelance_ai');
  });

  it('includes all tiers', () => {
    const response = buildPayAI402Response(basePrice, 70);
    expect(response.tiers.length).toBe(5);
    const tierNames = response.tiers.map(t => t.name);
    expect(tierNames).toContain('elite');
    expect(tierNames).toContain('premium');
  });

  it('handles null threshold', () => {
    const response = buildPayAI402Response(basePrice, null);
    expect(response.yourTier).toBe('untrusted');
    expect(response.yourPrice).toBe(100);
  });

  it('includes source when provided', () => {
    const response = buildPayAI402Response(basePrice, 70, ReputationSource.Bazaar);
    expect(response.source).toBe('bazaar');
  });
});

describe('aggregateReputation', () => {
  it('returns 50 for empty records', () => {
    expect(aggregateReputation([])).toBe(50);
  });

  it('returns single record score', () => {
    const records = [
      { source: ReputationSource.FreelanceAI, score: 80, weight: 1 },
    ];
    expect(aggregateReputation(records)).toBe(80);
  });

  it('calculates weighted average', () => {
    const records = [
      { source: ReputationSource.FreelanceAI, score: 80, weight: 2 },
      { source: ReputationSource.Bazaar, score: 60, weight: 1 },
    ];
    expect(aggregateReputation(records)).toBe(73);
  });

  it('handles zero total weight', () => {
    const records = [
      { source: ReputationSource.FreelanceAI, score: 80, weight: 0 },
    ];
    expect(aggregateReputation(records)).toBe(50);
  });

  it('rounds to nearest integer', () => {
    const records = [
      { source: ReputationSource.FreelanceAI, score: 75, weight: 1 },
      { source: ReputationSource.Bazaar, score: 76, weight: 1 },
    ];
    expect(aggregateReputation(records)).toBe(76);
  });
});

describe('EscrowOutcome enum', () => {
  it('has expected values', () => {
    expect(EscrowOutcome.Released).toBe('released');
    expect(EscrowOutcome.DisputeWonAgent).toBe('dispute_won_agent');
    expect(EscrowOutcome.DisputeWonProvider).toBe('dispute_won_provider');
    expect(EscrowOutcome.DisputePartial).toBe('dispute_partial');
    expect(EscrowOutcome.Expired).toBe('expired');
  });
});

describe('ReputationSource enum', () => {
  it('has expected values', () => {
    expect(ReputationSource.FreelanceAI).toBe('freelance_ai');
    expect(ReputationSource.Bazaar).toBe('bazaar');
    expect(ReputationSource.CTAgent).toBe('ct_agent');
    expect(ReputationSource.Direct).toBe('direct');
  });
});

describe('linkCreditTracker integration', () => {
  const commitment = '0x' + 'd'.repeat(64);

  it('forwards escrow outcomes to credit tracker', async () => {
    const store = new InMemoryCreditStoreV2();
    const creditTracker = new DynamicCreditTracker(store, { tierBaseLimit: 100 });
    await creditTracker.registerAccount(commitment, 'agent-1', 80);

    const repTracker = new PayAIReputationTracker();
    repTracker.linkCreditTracker(creditTracker);

    const record = repTracker.getRecord('agent-1');
    record.commitment = commitment;

    await repTracker.updateReputation('agent-1', EscrowOutcome.Released, ReputationSource.Direct, 85);

    const account = await creditTracker.getAccount(commitment);
    expect(account).not.toBeNull();
    expect(account!.escrowsCompleted).toBe(1);
    expect(account!.averageQualityScore).toBeCloseTo(85);
  });

  it('maps dispute outcomes correctly', async () => {
    const store = new InMemoryCreditStoreV2();
    const creditTracker = new DynamicCreditTracker(store, { tierBaseLimit: 100 });
    await creditTracker.registerAccount(commitment, 'agent-1', 80);

    const repTracker = new PayAIReputationTracker();
    repTracker.linkCreditTracker(creditTracker);
    repTracker.getRecord('agent-1').commitment = commitment;

    await repTracker.updateReputation('agent-1', EscrowOutcome.DisputeWonAgent, ReputationSource.Direct, 30);

    const account = await creditTracker.getAccount(commitment);
    expect(account!.disputesWon).toBe(1);
    expect(account!.disputesLost).toBe(0);
  });

  it('maps provider-won disputes as losses', async () => {
    const store = new InMemoryCreditStoreV2();
    const creditTracker = new DynamicCreditTracker(store, { tierBaseLimit: 100 });
    await creditTracker.registerAccount(commitment, 'agent-1', 80);

    const repTracker = new PayAIReputationTracker();
    repTracker.linkCreditTracker(creditTracker);
    repTracker.getRecord('agent-1').commitment = commitment;

    await repTracker.updateReputation('agent-1', EscrowOutcome.DisputeWonProvider, ReputationSource.Direct);

    const account = await creditTracker.getAccount(commitment);
    expect(account!.disputesLost).toBe(1);
  });

  it('does nothing when no commitment on record', async () => {
    const store = new InMemoryCreditStoreV2();
    const creditTracker = new DynamicCreditTracker(store, { tierBaseLimit: 100 });

    const repTracker = new PayAIReputationTracker();
    repTracker.linkCreditTracker(creditTracker);

    await repTracker.updateReputation('agent-1', EscrowOutcome.Released, ReputationSource.Direct);
    expect(repTracker.getRecord('agent-1').successfulEscrows).toBe(1);
  });
});
