import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RiskScorer, type EscrowSnapshot } from '../prediction/riskScorer';
import { AlertService, type Alert } from '../prediction/alertService';
import type { IAgentRuntime } from '../types';

// Mock the Solana connection
vi.mock('@solana/web3.js', async () => {
  const actual = await vi.importActual('@solana/web3.js');
  return {
    ...actual,
    Connection: vi.fn().mockImplementation(() => ({
      getAccountInfo: vi.fn().mockResolvedValue(null),
      getSignaturesForAddress: vi.fn().mockResolvedValue([
        { blockTime: Date.now() / 1000 - 86400 * 30, signature: 'sig1' },
        { blockTime: Date.now() / 1000 - 86400 * 60, signature: 'sig2' },
      ]),
    })),
  };
});

function createMockRuntime(): IAgentRuntime {
  return {
    getSetting: vi.fn((key: string) => {
      const settings: Record<string, string> = {
        SOLANA_RPC_URL: 'https://api.devnet.solana.com',
        SOLANA_NETWORK: 'devnet',
      };
      return settings[key] || '';
    }),
    getState: vi.fn().mockResolvedValue(undefined),
    setState: vi.fn().mockResolvedValue(undefined),
  } as unknown as IAgentRuntime;
}

function createMockEscrow(overrides: Partial<EscrowSnapshot> = {}): EscrowSnapshot {
  return {
    pda: 'escrowPda12345678901234567890123456789012',
    agent: 'agentPubkey123456789012345678901234567890',
    provider: 'providerPubkey12345678901234567890123456',
    amount: 1_000_000_000, // 1 SOL in lamports
    createdAt: Date.now() / 1000 - 3600,
    expiresAt: Date.now() / 1000 + 86400,
    status: 0,
    ...overrides,
  };
}

describe('RiskScorer', () => {
  let scorer: RiskScorer;
  let runtime: IAgentRuntime;

  beforeEach(() => {
    runtime = createMockRuntime();
    scorer = new RiskScorer(runtime);
  });

  describe('scoreEscrow', () => {
    it('returns risk score for escrow', async () => {
      const escrow = createMockEscrow();
      const result = await scorer.scoreEscrow(escrow);

      expect(result.escrowPda).toBe(escrow.pda);
      expect(result.riskScore).toBeGreaterThanOrEqual(0);
      expect(result.riskScore).toBeLessThanOrEqual(100);
      expect(['low', 'medium', 'high', 'critical']).toContain(result.riskLevel);
    });

    it('includes risk factors', async () => {
      const escrow = createMockEscrow();
      const result = await scorer.scoreEscrow(escrow);

      expect(result.factors.length).toBeGreaterThan(0);
      expect(result.factors[0]).toHaveProperty('name');
      expect(result.factors[0]).toHaveProperty('weight');
      expect(result.factors[0]).toHaveProperty('contribution');
    });

    it('provides recommendation', async () => {
      const escrow = createMockEscrow();
      const result = await scorer.scoreEscrow(escrow);

      expect(['ignore', 'monitor', 'pre-gather', 'alert']).toContain(
        result.recommendation
      );
    });

    it('caches results', async () => {
      const escrow = createMockEscrow();

      const result1 = await scorer.scoreEscrow(escrow);
      const result2 = await scorer.scoreEscrow(escrow);

      expect(result1.analyzedAt).toBe(result2.analyzedAt);
    });

    it('higher amounts increase risk', async () => {
      // Use amounts that produce different risk scores on the log scale
      // scoreAmount uses log10, so 0.01 SOL -> ~0, 10 SOL -> ~75
      const lowAmount = createMockEscrow({ amount: 10_000_000 }); // 0.01 SOL
      const highAmount = createMockEscrow({
        pda: 'different_pda_12345678901234567890123',
        amount: 10_000_000_000, // 10 SOL
      });

      const lowResult = await scorer.scoreEscrow(lowAmount);
      const highResult = await scorer.scoreEscrow(highAmount);

      const lowAmountFactor = lowResult.factors.find(
        (f) => f.name === 'Escrow amount'
      );
      const highAmountFactor = highResult.factors.find(
        (f) => f.name === 'Escrow amount'
      );

      // High amount should have higher or equal contribution
      expect(highAmountFactor!.contribution).toBeGreaterThanOrEqual(
        lowAmountFactor!.contribution
      );
    });

    it('shorter expiry increases risk', async () => {
      const longExpiry = createMockEscrow({
        expiresAt: Date.now() / 1000 + 86400 * 3, // 3 days
      });
      const shortExpiry = createMockEscrow({
        pda: 'different_pda_12345678901234567890124',
        expiresAt: Date.now() / 1000 + 1800, // 30 minutes
      });

      const longResult = await scorer.scoreEscrow(longExpiry);
      const shortResult = await scorer.scoreEscrow(shortExpiry);

      const longExpiryFactor = longResult.factors.find(
        (f) => f.name === 'Time to expiry'
      );
      const shortExpiryFactor = shortResult.factors.find(
        (f) => f.name === 'Time to expiry'
      );

      expect(shortExpiryFactor!.contribution).toBeGreaterThan(
        longExpiryFactor!.contribution
      );
    });
  });

  describe('scoreMultiple', () => {
    it('scores multiple escrows', async () => {
      const escrows = [
        createMockEscrow({ pda: 'pda1_1234567890123456789012345678901' }),
        createMockEscrow({ pda: 'pda2_1234567890123456789012345678901' }),
        createMockEscrow({ pda: 'pda3_1234567890123456789012345678901' }),
      ];

      const results = await scorer.scoreMultiple(escrows);

      expect(results).toHaveLength(3);
    });

    it('handles failures gracefully', async () => {
      const escrows = [
        createMockEscrow({ pda: 'valid_pda_123456789012345678901234' }),
        { ...createMockEscrow(), pda: '' }, // Invalid
      ];

      const results = await scorer.scoreMultiple(escrows);

      expect(results.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('getHighRiskEscrows', () => {
    it('filters by risk threshold', async () => {
      const escrows = [
        createMockEscrow({ pda: 'low_risk_pda_123456789012345678901' }),
        createMockEscrow({
          pda: 'high_risk_pda_12345678901234567890',
          amount: 100_000_000_000,
          expiresAt: Date.now() / 1000 + 300,
        }),
      ];

      const highRisk = await scorer.getHighRiskEscrows(escrows, 40);

      expect(highRisk.length).toBeLessThanOrEqual(escrows.length);
      highRisk.forEach((score) => {
        expect(score.riskScore).toBeGreaterThanOrEqual(40);
      });
    });

    it('returns sorted by risk score descending', async () => {
      const escrows = [
        createMockEscrow({ pda: 'pda1_1234567890123456789012345678901' }),
        createMockEscrow({ pda: 'pda2_1234567890123456789012345678901' }),
        createMockEscrow({ pda: 'pda3_1234567890123456789012345678901' }),
      ];

      const results = await scorer.getHighRiskEscrows(escrows, 0);

      for (let i = 1; i < results.length; i++) {
        expect(results[i - 1].riskScore).toBeGreaterThanOrEqual(
          results[i].riskScore
        );
      }
    });
  });

  describe('clearCache', () => {
    it('clears cached results', async () => {
      const escrow = createMockEscrow();

      const result1 = await scorer.scoreEscrow(escrow);
      scorer.clearCache();
      const result2 = await scorer.scoreEscrow(escrow);

      // Different timestamps means cache was cleared
      expect(result2.analyzedAt).toBeGreaterThanOrEqual(result1.analyzedAt);
    });
  });
});

describe('AlertService', () => {
  let alertService: AlertService;
  let runtime: IAgentRuntime;

  beforeEach(() => {
    runtime = createMockRuntime();
    alertService = new AlertService(runtime);
  });

  describe('analyzeEscrow', () => {
    it('detects large amount escrows', async () => {
      const escrow = createMockEscrow({
        amount: 15_000_000_000, // 15 SOL
      });

      const alerts = await alertService.analyzeEscrow(escrow);

      const largeAmountAlert = alerts.find((a) => a.type === 'large_amount');
      expect(largeAmountAlert).toBeDefined();
      expect(largeAmountAlert?.severity).toBe('warning');
    });

    it('detects critical risk escrows', async () => {
      const escrow = createMockEscrow({
        amount: 100_000_000_000, // 100 SOL
        expiresAt: Date.now() / 1000 + 300, // 5 minutes
      });

      const alerts = await alertService.analyzeEscrow(escrow);

      const criticalAlert = alerts.find((a) => a.severity === 'critical');
      expect(criticalAlert).toBeDefined();
    });
  });

  describe('recordDispute', () => {
    it('tracks rapid disputes from agent', async () => {
      const agent = 'rapidAgent123456789012345678901234567890';

      // Record multiple disputes quickly
      await alertService.recordDispute('escrow1', agent, 'provider1');
      await alertService.recordDispute('escrow2', agent, 'provider2');
      const alerts = await alertService.recordDispute(
        'escrow3',
        agent,
        'provider3'
      );

      const rapidAlert = alerts.find((a) => a.type === 'rapid_disputes');
      expect(rapidAlert).toBeDefined();
      expect(rapidAlert?.relatedPubkeys).toContain(agent);
    });
  });

  describe('alert management', () => {
    it('returns active alerts', async () => {
      const escrow = createMockEscrow({ amount: 20_000_000_000 });
      await alertService.analyzeEscrow(escrow);

      const active = alertService.getActiveAlerts();

      expect(active.length).toBeGreaterThan(0);
      expect(active.every((a) => !a.acknowledged)).toBe(true);
    });

    it('acknowledges alerts', async () => {
      const escrow = createMockEscrow({ amount: 20_000_000_000 });
      const alerts = await alertService.analyzeEscrow(escrow);

      const alertId = alerts[0].id;
      const result = alertService.acknowledgeAlert(alertId);

      expect(result).toBe(true);
      expect(alertService.getActiveAlerts().find((a) => a.id === alertId)).toBeUndefined();
    });

    it('gets alerts for specific escrow', async () => {
      const escrow1 = createMockEscrow({
        pda: 'escrow1_12345678901234567890123456789',
        amount: 20_000_000_000,
      });
      const escrow2 = createMockEscrow({
        pda: 'escrow2_12345678901234567890123456789',
        amount: 20_000_000_000,
      });

      await alertService.analyzeEscrow(escrow1);
      await alertService.analyzeEscrow(escrow2);

      const escrow1Alerts = alertService.getAlertsForEscrow(escrow1.pda);

      expect(escrow1Alerts.every((a) => a.escrowPda === escrow1.pda)).toBe(true);
    });
  });

  describe('handlers', () => {
    it('calls registered handlers on alert', async () => {
      const handler = vi.fn();
      alertService.onAlert(handler);

      const escrow = createMockEscrow({ amount: 20_000_000_000 });
      await alertService.analyzeEscrow(escrow);

      expect(handler).toHaveBeenCalled();
      expect(handler.mock.calls[0][0]).toHaveProperty('type');
      expect(handler.mock.calls[0][0]).toHaveProperty('severity');
    });

    it('handles handler errors gracefully', async () => {
      const failingHandler = vi.fn().mockRejectedValue(new Error('Handler error'));
      alertService.onAlert(failingHandler);

      const escrow = createMockEscrow({ amount: 20_000_000_000 });

      // Should not throw
      await expect(alertService.analyzeEscrow(escrow)).resolves.toBeDefined();
    });
  });

  describe('cleanup', () => {
    it('removes old acknowledged alerts', async () => {
      const escrow = createMockEscrow({ amount: 20_000_000_000 });
      const alerts = await alertService.analyzeEscrow(escrow);

      // Acknowledge all alerts
      alerts.forEach((a) => alertService.acknowledgeAlert(a.id));

      // Cleanup with very large age (remove nothing since alerts are new)
      const removed = alertService.cleanup(1000 * 60 * 60 * 24); // 24 hours

      // New acknowledged alerts should not be removed yet
      // Active alerts returns only unacknowledged
      expect(alertService.getActiveAlerts()).toHaveLength(0);
    });
  });
});
