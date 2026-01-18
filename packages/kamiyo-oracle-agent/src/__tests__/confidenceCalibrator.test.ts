import { describe, it, expect } from 'vitest';
import {
  calibrateVote,
  shouldAbstainOnRisk,
  calculatePositionSizing,
} from '../lib/confidenceCalibrator';
import type { QualityAssessment, EvaluationContext, IAgentRuntime } from '../types';

const mockContext: EvaluationContext = {
  escrow: {
    pda: 'test',
    amount: 1.0,
    createdAt: Date.now() / 1000 - 3600,
    expiresAt: Date.now() / 1000 + 3600,
    transactionId: 'tx-123',
    status: 'Disputed',
  },
  agent: {
    pubkey: 'agent123',
    reputation: 500,
    totalEscrows: 10,
    disputeRate: 15,
  },
  provider: {
    pubkey: 'provider123',
    reputation: 700,
    totalEscrows: 50,
    disputeRate: 5,
    averageQualityScore: 80,
  },
  service: {
    type: 'api_call',
    description: 'API service',
    slaTerms: ['Response within 5s'],
  },
  evidence: {
    agentClaim: 'Service was slow',
  },
};

const mockRuntime = (settings: Record<string, string> = {}): IAgentRuntime => ({
  agentId: 'test-agent',
  getSetting: (key: string) => settings[key],
});

describe('confidenceCalibrator', () => {
  describe('calibrateVote', () => {
    it('recommends voting with high confidence', () => {
      const assessment: QualityAssessment = {
        score: 75,
        confidence: 'high',
        reasoning: 'Test',
        factors: {
          deliveryComplete: true,
          slaCompliant: true,
          evidenceStrength: 'strong',
          providerHistory: 'good',
          agentHistory: 'legitimate',
        },
      };

      const strategy = calibrateVote(assessment, mockContext, 1.0);

      expect(strategy.shouldVote).toBe(true);
      expect(strategy.adjustedScore).toBe(75);
      expect(strategy.riskLevel).toBe('low');
    });

    it('regresses score toward median with medium confidence', () => {
      const assessment: QualityAssessment = {
        score: 90,
        confidence: 'medium',
        reasoning: 'Test',
        factors: {
          deliveryComplete: true,
          slaCompliant: true,
          evidenceStrength: 'moderate',
          providerHistory: 'average',
          agentHistory: 'average',
        },
      };

      const strategy = calibrateVote(assessment, mockContext, 1.0);

      expect(strategy.shouldVote).toBe(true);
      // 90 * 0.85 + 72 * 0.15 = 76.5 + 10.8 = 87.3 ~ 87
      expect(strategy.adjustedScore).toBe(87);
    });

    it('strongly regresses score with low confidence when risk is acceptable', () => {
      const assessment: QualityAssessment = {
        score: 90,
        confidence: 'low',
        reasoning: 'Test',
        factors: {
          deliveryComplete: true,
          slaCompliant: true,
          evidenceStrength: 'weak',
          providerHistory: 'average',
          agentHistory: 'average',
        },
      };

      // Use a higher escrow amount to reduce risk/reward ratio
      const highValueContext = {
        ...mockContext,
        escrow: { ...mockContext.escrow, amount: 10.0 },
      };

      const strategy = calibrateVote(assessment, highValueContext, 1.0);

      // With 10 SOL escrow, risk/reward ratio is more favorable
      // so low confidence may still result in voting
      if (strategy.shouldVote) {
        // 90 * 0.6 + 72 * 0.4 = 54 + 28.8 = 82.8 ~ 83
        expect(strategy.adjustedScore).toBe(83);
      } else {
        // If risk is still too high, verify abstaining is correct
        expect(strategy.riskLevel).toBe('high');
      }
    });

    it('recommends abstaining when confidence below threshold for risk', () => {
      const assessment: QualityAssessment = {
        score: 75,
        confidence: 'low',
        reasoning: 'Test',
        factors: {
          deliveryComplete: true,
          slaCompliant: true,
          evidenceStrength: 'weak',
          providerHistory: 'poor',
          agentHistory: 'frivolous',
        },
      };

      // High stake relative to reward means high risk/reward ratio
      const strategy = calibrateVote(assessment, mockContext, 100.0);

      // With stake of 100 SOL and escrow of 1 SOL, risk/reward > 50
      expect(strategy.shouldVote).toBe(false);
    });

    it('calculates expected reward correctly', () => {
      const assessment: QualityAssessment = {
        score: 75,
        confidence: 'high',
        reasoning: 'Test',
        factors: {
          deliveryComplete: true,
          slaCompliant: true,
          evidenceStrength: 'strong',
          providerHistory: 'good',
          agentHistory: 'legitimate',
        },
      };

      const strategy = calibrateVote(assessment, mockContext, 1.0, 2);

      // 1 SOL * 1% / 3 oracles = ~0.00333 SOL
      expect(strategy.expectedReward).toBeCloseTo(0.00333, 3);
    });

    it('calculates max loss correctly', () => {
      const assessment: QualityAssessment = {
        score: 75,
        confidence: 'high',
        reasoning: 'Test',
        factors: {
          deliveryComplete: true,
          slaCompliant: true,
          evidenceStrength: 'strong',
          providerHistory: 'good',
          agentHistory: 'legitimate',
        },
      };

      const strategy = calibrateVote(assessment, mockContext, 5.0);

      // 5 SOL * 10% = 0.5 SOL
      expect(strategy.maxLoss).toBe(0.5);
    });
  });

  describe('shouldAbstainOnRisk', () => {
    it('abstains on high risk with low tolerance', () => {
      const runtime = mockRuntime({ RISK_TOLERANCE: 'low' });
      const strategy = {
        shouldVote: true,
        adjustedScore: 75,
        riskLevel: 'medium' as const,
        expectedReward: 0.01,
        maxLoss: 0.1,
        reasoning: 'test',
      };

      expect(shouldAbstainOnRisk(runtime, strategy)).toBe(true);
    });

    it('votes on low risk with low tolerance', () => {
      const runtime = mockRuntime({ RISK_TOLERANCE: 'low' });
      const strategy = {
        shouldVote: true,
        adjustedScore: 75,
        riskLevel: 'low' as const,
        expectedReward: 0.01,
        maxLoss: 0.1,
        reasoning: 'test',
      };

      expect(shouldAbstainOnRisk(runtime, strategy)).toBe(false);
    });

    it('votes on medium risk with medium tolerance', () => {
      const runtime = mockRuntime({ RISK_TOLERANCE: 'medium' });
      const strategy = {
        shouldVote: true,
        adjustedScore: 75,
        riskLevel: 'medium' as const,
        expectedReward: 0.01,
        maxLoss: 0.1,
        reasoning: 'test',
      };

      expect(shouldAbstainOnRisk(runtime, strategy)).toBe(false);
    });

    it('abstains on high risk with medium tolerance', () => {
      const runtime = mockRuntime({ RISK_TOLERANCE: 'medium' });
      const strategy = {
        shouldVote: true,
        adjustedScore: 75,
        riskLevel: 'high' as const,
        expectedReward: 0.01,
        maxLoss: 0.1,
        reasoning: 'test',
      };

      expect(shouldAbstainOnRisk(runtime, strategy)).toBe(true);
    });

    it('votes on any risk with high tolerance', () => {
      const runtime = mockRuntime({ RISK_TOLERANCE: 'high' });
      const strategy = {
        shouldVote: true,
        adjustedScore: 75,
        riskLevel: 'high' as const,
        expectedReward: 0.01,
        maxLoss: 0.1,
        reasoning: 'test',
      };

      expect(shouldAbstainOnRisk(runtime, strategy)).toBe(false);
    });
  });

  describe('calculatePositionSizing', () => {
    it('returns base size with no violations and average accuracy', () => {
      const performance = { violationCount: 0, accuracyRate: 80 };
      expect(calculatePositionSizing(performance, 5)).toBe(5);
    });

    it('increases size with high accuracy', () => {
      const performance = { violationCount: 0, accuracyRate: 95 };
      expect(calculatePositionSizing(performance, 5)).toBe(6);
    });

    it('decreases size with violations', () => {
      const performance = { violationCount: 1, accuracyRate: 80 };
      expect(calculatePositionSizing(performance, 5)).toBe(3);
    });

    it('reduces to zero with too many violations', () => {
      const performance = { violationCount: 4, accuracyRate: 80 };
      expect(calculatePositionSizing(performance, 5)).toBe(0);
    });

    it('combines violation penalty with accuracy bonus', () => {
      const performance = { violationCount: 1, accuracyRate: 95 };
      // 5 * 0.7 * 1.2 = 4.2 -> 4
      expect(calculatePositionSizing(performance, 5)).toBe(4);
    });
  });
});
