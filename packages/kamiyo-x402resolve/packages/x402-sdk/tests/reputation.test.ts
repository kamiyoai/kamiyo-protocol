/**
 * Unit tests for Hyoban (reputation management)
 */

import { Connection, PublicKey, Keypair } from '@solana/web3.js';
import { Hyoban, EntityReputation } from '../src/reputation';

describe('Hyoban (Reputation Management)', () => {
  let hyoban: Hyoban;
  const mockProgramId = Keypair.generate().publicKey;
  const mockConnection = {} as Connection;
  const mockProgram = {} as any;

  beforeEach(() => {
    hyoban = new Hyoban(mockConnection, mockProgram, mockProgramId);
  });

  describe('PDA Derivation', () => {
    it('derives reputation PDA correctly', () => {
      const entity = Keypair.generate().publicKey;
      const [pda, bump] = hyoban.getReputationPDA(entity);

      expect(pda).toBeInstanceOf(PublicKey);
      expect(bump).toBeGreaterThanOrEqual(0);
      expect(bump).toBeLessThanOrEqual(255);
    });

    it('derives rate limiter PDA correctly', () => {
      const entity = Keypair.generate().publicKey;
      const [pda, bump] = hyoban.getRateLimiterPDA(entity);

      expect(pda).toBeInstanceOf(PublicKey);
      expect(bump).toBeGreaterThanOrEqual(0);
      expect(bump).toBeLessThanOrEqual(255);
    });

    it('derives different PDAs for different entities', () => {
      const entity1 = Keypair.generate().publicKey;
      const entity2 = Keypair.generate().publicKey;

      const [pda1] = hyoban.getReputationPDA(entity1);
      const [pda2] = hyoban.getReputationPDA(entity2);

      expect(pda1.toBase58()).not.toBe(pda2.toBase58());
    });
  });

  describe('Dispute Success Rate Calculation', () => {
    it('returns 0% for no disputes', () => {
      const reputation: EntityReputation = {
        entity: Keypair.generate().publicKey,
        entityType: 'Agent',
        totalTransactions: 100,
        disputesFiled: 0,
        disputesWon: 0,
        disputesPartial: 0,
        disputesLost: 0,
        averageQualityReceived: 85,
        reputationScore: 800,
        createdAt: Date.now(),
        lastUpdated: Date.now(),
      };

      expect(hyoban.getDisputeSuccessRate(reputation)).toBe(0);
    });

    it('returns 100% for all wins', () => {
      const reputation: EntityReputation = {
        entity: Keypair.generate().publicKey,
        entityType: 'Agent',
        totalTransactions: 100,
        disputesFiled: 10,
        disputesWon: 10,
        disputesPartial: 0,
        disputesLost: 0,
        averageQualityReceived: 85,
        reputationScore: 900,
        createdAt: Date.now(),
        lastUpdated: Date.now(),
      };

      expect(hyoban.getDisputeSuccessRate(reputation)).toBe(100);
    });

    it('returns 0% for all losses', () => {
      const reputation: EntityReputation = {
        entity: Keypair.generate().publicKey,
        entityType: 'Provider',
        totalTransactions: 100,
        disputesFiled: 0,
        disputesWon: 0,
        disputesPartial: 0,
        disputesLost: 10,
        averageQualityReceived: 50,
        reputationScore: 300,
        createdAt: Date.now(),
        lastUpdated: Date.now(),
      };

      expect(hyoban.getDisputeSuccessRate(reputation)).toBe(0);
    });

    it('calculates mixed outcomes correctly', () => {
      const reputation: EntityReputation = {
        entity: Keypair.generate().publicKey,
        entityType: 'Agent',
        totalTransactions: 100,
        disputesFiled: 10,
        disputesWon: 4,
        disputesPartial: 4,
        disputesLost: 2,
        averageQualityReceived: 70,
        reputationScore: 650,
        createdAt: Date.now(),
        lastUpdated: Date.now(),
      };

      // (4 + 4*0.5) / 10 = 6/10 = 60%
      expect(hyoban.getDisputeSuccessRate(reputation)).toBe(60);
    });

    it('handles partial wins as 50%', () => {
      const reputation: EntityReputation = {
        entity: Keypair.generate().publicKey,
        entityType: 'Agent',
        totalTransactions: 100,
        disputesFiled: 10,
        disputesWon: 0,
        disputesPartial: 10,
        disputesLost: 0,
        averageQualityReceived: 75,
        reputationScore: 700,
        createdAt: Date.now(),
        lastUpdated: Date.now(),
      };

      expect(hyoban.getDisputeSuccessRate(reputation)).toBe(50);
    });
  });

  describe('Verification Level Limits', () => {
    it('returns correct limits for Basic level', () => {
      const level = hyoban.getVerificationLevelLimits('Basic');

      expect(level.level).toBe('Basic');
      expect(level.hourlyLimit).toBe(1);
      expect(level.dailyLimit).toBe(10);
    });

    it('returns correct limits for Staked level', () => {
      const level = hyoban.getVerificationLevelLimits('Staked');

      expect(level.level).toBe('Staked');
      expect(level.hourlyLimit).toBe(10);
      expect(level.dailyLimit).toBe(100);
    });

    it('returns correct limits for Social level', () => {
      const level = hyoban.getVerificationLevelLimits('Social');

      expect(level.level).toBe('Social');
      expect(level.hourlyLimit).toBe(50);
      expect(level.dailyLimit).toBe(500);
    });

    it('returns correct limits for KYC level', () => {
      const level = hyoban.getVerificationLevelLimits('KYC');

      expect(level.level).toBe('KYC');
      expect(level.hourlyLimit).toBe(1000);
      expect(level.dailyLimit).toBe(10000);
    });
  });

  describe('Dispute Cost Calculation', () => {
    it('returns base cost for new entity', () => {
      const cost = hyoban.calculateDisputeCost(null);
      expect(cost).toBe(0.001);
    });

    it('returns base cost for low dispute rate (≤20%)', () => {
      const reputation: EntityReputation = {
        entity: Keypair.generate().publicKey,
        entityType: 'Agent',
        totalTransactions: 100,
        disputesFiled: 10,
        disputesWon: 5,
        disputesPartial: 3,
        disputesLost: 2,
        averageQualityReceived: 80,
        reputationScore: 750,
        createdAt: Date.now(),
        lastUpdated: Date.now(),
      };

      const cost = hyoban.calculateDisputeCost(reputation);
      expect(cost).toBe(0.001);
    });

    it('returns elevated cost for moderate dispute rate (21-40%)', () => {
      const reputation: EntityReputation = {
        entity: Keypair.generate().publicKey,
        entityType: 'Agent',
        totalTransactions: 100,
        disputesFiled: 30,
        disputesWon: 15,
        disputesPartial: 10,
        disputesLost: 5,
        averageQualityReceived: 70,
        reputationScore: 600,
        createdAt: Date.now(),
        lastUpdated: Date.now(),
      };

      const cost = hyoban.calculateDisputeCost(reputation);
      expect(cost).toBe(0.002);
    });

    it('returns higher cost for high dispute rate (41-60%)', () => {
      const reputation: EntityReputation = {
        entity: Keypair.generate().publicKey,
        entityType: 'Agent',
        totalTransactions: 100,
        disputesFiled: 50,
        disputesWon: 25,
        disputesPartial: 15,
        disputesLost: 10,
        averageQualityReceived: 65,
        reputationScore: 500,
        createdAt: Date.now(),
        lastUpdated: Date.now(),
      };

      const cost = hyoban.calculateDisputeCost(reputation);
      expect(cost).toBe(0.005);
    });

    it('returns maximum cost for very high dispute rate (>60%)', () => {
      const reputation: EntityReputation = {
        entity: Keypair.generate().publicKey,
        entityType: 'Agent',
        totalTransactions: 100,
        disputesFiled: 70,
        disputesWon: 30,
        disputesPartial: 20,
        disputesLost: 20,
        averageQualityReceived: 60,
        reputationScore: 400,
        createdAt: Date.now(),
        lastUpdated: Date.now(),
      };

      const cost = hyoban.calculateDisputeCost(reputation);
      expect(cost).toBe(0.01);
    });

    it('handles edge case of 100% dispute rate', () => {
      const reputation: EntityReputation = {
        entity: Keypair.generate().publicKey,
        entityType: 'Agent',
        totalTransactions: 100,
        disputesFiled: 100,
        disputesWon: 50,
        disputesPartial: 30,
        disputesLost: 20,
        averageQualityReceived: 55,
        reputationScore: 350,
        createdAt: Date.now(),
        lastUpdated: Date.now(),
      };

      const cost = hyoban.calculateDisputeCost(reputation);
      expect(cost).toBe(0.01);
    });
  });
});
