import { describe, it, expect, beforeEach } from 'vitest';
import { Keypair } from '@solana/web3.js';
import BN from 'bn.js';
import { OracleProtocolManager } from '../oracle-protocol.js';
import type { QualityScores } from '../types.js';

describe('OracleProtocolManager', () => {
  let manager: OracleProtocolManager;
  let oracle1: Keypair;
  let oracle2: Keypair;
  let oracle3: Keypair;
  const validUal = 'did:dkg:otp/0x1234567890abcdef/12345';
  const minStake = new BN(1_000_000_000_000); // 1000 SOL

  beforeEach(() => {
    manager = new OracleProtocolManager();
    oracle1 = Keypair.generate();
    oracle2 = Keypair.generate();
    oracle3 = Keypair.generate();
  });

  describe('registerOracle', () => {
    it('registers oracle with valid stake', async () => {
      const info = await manager.registerOracle({
        oracleId: oracle1.publicKey,
        stake: minStake,
      });

      expect(info.oracleId.equals(oracle1.publicKey)).toBe(true);
      expect(info.stake.eq(minStake)).toBe(true);
      expect(info.active).toBe(true);
      expect(info.totalAssessments).toBe(0);
    });

    it('rejects null oracle ID', async () => {
      await expect(
        manager.registerOracle({
          oracleId: null as any,
          stake: minStake,
        })
      ).rejects.toThrow('required');
    });

    it('rejects zero stake', async () => {
      await expect(
        manager.registerOracle({
          oracleId: oracle1.publicKey,
          stake: new BN(0),
        })
      ).rejects.toThrow('must be positive');
    });

    it('rejects stake below minimum', async () => {
      await expect(
        manager.registerOracle({
          oracleId: oracle1.publicKey,
          stake: new BN(1000), // way below minimum
        })
      ).rejects.toThrow('below minimum');
    });

    it('rejects duplicate registration', async () => {
      await manager.registerOracle({
        oracleId: oracle1.publicKey,
        stake: minStake,
      });

      await expect(
        manager.registerOracle({
          oracleId: oracle1.publicKey,
          stake: minStake,
        })
      ).rejects.toThrow('already registered');
    });
  });

  describe('submitCommitment', () => {
    beforeEach(async () => {
      await manager.registerOracle({
        oracleId: oracle1.publicKey,
        stake: minStake,
      });
    });

    it('submits valid commitment', async () => {
      const commitment = manager.computeCommitment(85, 'salt123456789012345678', validUal, oracle1.publicKey);

      const result = await manager.submitCommitment({
        assetUal: validUal,
        oracleId: oracle1.publicKey,
        commitment,
      });

      expect(result.assetUal).toBe(validUal);
      expect(result.commitment).toBe(commitment);
    });

    it('rejects empty UAL', async () => {
      await expect(
        manager.submitCommitment({
          assetUal: '',
          oracleId: oracle1.publicKey,
          commitment: 'a'.repeat(64),
        })
      ).rejects.toThrow('required');
    });

    it('rejects invalid UAL format', async () => {
      await expect(
        manager.submitCommitment({
          assetUal: 'invalid-ual',
          oracleId: oracle1.publicKey,
          commitment: 'a'.repeat(64),
        })
      ).rejects.toThrow('Invalid UAL format');
    });

    it('rejects short commitment', async () => {
      await expect(
        manager.submitCommitment({
          assetUal: validUal,
          oracleId: oracle1.publicKey,
          commitment: 'short',
        })
      ).rejects.toThrow('min 32 characters');
    });

    it('rejects unregistered oracle', async () => {
      const unregistered = Keypair.generate();

      await expect(
        manager.submitCommitment({
          assetUal: validUal,
          oracleId: unregistered.publicKey,
          commitment: 'a'.repeat(64),
        })
      ).rejects.toThrow('not registered');
    });

    it('rejects duplicate commitment', async () => {
      const commitment = 'a'.repeat(64);

      await manager.submitCommitment({
        assetUal: validUal,
        oracleId: oracle1.publicKey,
        commitment,
      });

      await expect(
        manager.submitCommitment({
          assetUal: validUal,
          oracleId: oracle1.publicKey,
          commitment,
        })
      ).rejects.toThrow('already committed');
    });
  });

  describe('revealAssessment', () => {
    const scores: QualityScores = {
      factualAccuracy: 85,
      sourceQuality: 80,
      completeness: 75,
      consistency: 90,
    };

    let salt: string;
    let commitment: string;

    beforeEach(async () => {
      await manager.registerOracle({
        oracleId: oracle1.publicKey,
        stake: minStake,
      });

      salt = manager.generateSalt();
      const overallScore = manager.calculateOverallScore(scores);
      commitment = manager.computeCommitment(overallScore, salt, validUal, oracle1.publicKey);

      await manager.submitCommitment({
        assetUal: validUal,
        oracleId: oracle1.publicKey,
        commitment,
      });
    });

    it('reveals valid assessment', async () => {
      const result = await manager.revealAssessment({
        assetUal: validUal,
        oracleId: oracle1.publicKey,
        scores,
        salt,
      });

      expect(result.assetUal).toBe(validUal);
      expect(result.scores).toEqual(scores);
      expect(result.overallScore).toBe(manager.calculateOverallScore(scores));
    });

    it('rejects invalid scores (out of range)', async () => {
      await expect(
        manager.revealAssessment({
          assetUal: validUal,
          oracleId: oracle1.publicKey,
          scores: { ...scores, factualAccuracy: 150 },
          salt,
        })
      ).rejects.toThrow('between 0-100');
    });

    it('rejects invalid scores (negative)', async () => {
      await expect(
        manager.revealAssessment({
          assetUal: validUal,
          oracleId: oracle1.publicKey,
          scores: { ...scores, factualAccuracy: -10 },
          salt,
        })
      ).rejects.toThrow('between 0-100');
    });

    it('rejects short salt', async () => {
      await expect(
        manager.revealAssessment({
          assetUal: validUal,
          oracleId: oracle1.publicKey,
          scores,
          salt: 'short',
        })
      ).rejects.toThrow('min 16 characters');
    });

    it('rejects without prior commitment', async () => {
      const newOracle = Keypair.generate();
      await manager.registerOracle({
        oracleId: newOracle.publicKey,
        stake: minStake,
      });

      await expect(
        manager.revealAssessment({
          assetUal: validUal,
          oracleId: newOracle.publicKey,
          scores,
          salt,
        })
      ).rejects.toThrow('No commitment found');
    });

    it('rejects mismatched commitment', async () => {
      await expect(
        manager.revealAssessment({
          assetUal: validUal,
          oracleId: oracle1.publicKey,
          scores: { ...scores, factualAccuracy: 50 }, // different score
          salt,
        })
      ).rejects.toThrow('does not match');
    });
  });

  describe('finalizeAssessment', () => {
    const scores1: QualityScores = { factualAccuracy: 85, sourceQuality: 80, completeness: 75, consistency: 90 };
    const scores2: QualityScores = { factualAccuracy: 88, sourceQuality: 82, completeness: 78, consistency: 88 };
    const scores3: QualityScores = { factualAccuracy: 82, sourceQuality: 78, completeness: 72, consistency: 85 };

    beforeEach(async () => {
      // Register 3 oracles
      await manager.registerOracle({ oracleId: oracle1.publicKey, stake: minStake });
      await manager.registerOracle({ oracleId: oracle2.publicKey, stake: minStake });
      await manager.registerOracle({ oracleId: oracle3.publicKey, stake: minStake });

      // Submit and reveal for each oracle
      for (const [oracle, scores] of [
        [oracle1, scores1],
        [oracle2, scores2],
        [oracle3, scores3],
      ] as const) {
        const salt = manager.generateSalt();
        const overallScore = manager.calculateOverallScore(scores);
        const commitment = manager.computeCommitment(overallScore, salt, validUal, oracle.publicKey);

        await manager.submitCommitment({
          assetUal: validUal,
          oracleId: oracle.publicKey,
          commitment,
        });

        await manager.revealAssessment({
          assetUal: validUal,
          oracleId: oracle.publicKey,
          scores,
          salt,
        });
      }
    });

    it('finalizes with median score', async () => {
      const result = await manager.finalizeAssessment(validUal);

      expect(result.oracleCount).toBe(3);
      expect(result.medianScore).toBeGreaterThanOrEqual(0);
      expect(result.medianScore).toBeLessThanOrEqual(100);
      expect(result.rewards).toHaveLength(3);
    });

    it('rejects with insufficient oracles', async () => {
      const newUal = 'did:dkg:otp/0xnew/99999';

      await expect(manager.finalizeAssessment(newUal)).rejects.toThrow('Insufficient reveals');
    });
  });

  describe('utility methods', () => {
    it('generateSalt produces unique values', () => {
      const salt1 = manager.generateSalt();
      const salt2 = manager.generateSalt();

      expect(salt1).not.toBe(salt2);
      expect(salt1.length).toBeGreaterThanOrEqual(32);
    });

    it('calculateOverallScore uses correct weights', () => {
      const scores: QualityScores = {
        factualAccuracy: 100,
        sourceQuality: 100,
        completeness: 100,
        consistency: 100,
      };

      expect(manager.calculateOverallScore(scores)).toBe(100);

      const lowScores: QualityScores = {
        factualAccuracy: 0,
        sourceQuality: 0,
        completeness: 0,
        consistency: 0,
      };

      expect(manager.calculateOverallScore(lowScores)).toBe(0);
    });

    it('validateScores returns true for valid scores', () => {
      expect(
        manager.validateScores({
          factualAccuracy: 85,
          sourceQuality: 80,
          completeness: 75,
          consistency: 90,
        })
      ).toBe(true);
    });

    it('validateScores returns false for out-of-range scores', () => {
      expect(
        manager.validateScores({
          factualAccuracy: 150,
          sourceQuality: 80,
          completeness: 75,
          consistency: 90,
        })
      ).toBe(false);
    });

    it('validateScores returns false for non-integer scores', () => {
      expect(
        manager.validateScores({
          factualAccuracy: 85.5,
          sourceQuality: 80,
          completeness: 75,
          consistency: 90,
        })
      ).toBe(false);
    });
  });

  describe('getOracle', () => {
    it('returns undefined for unregistered oracle', () => {
      expect(manager.getOracle(oracle1.publicKey)).toBeUndefined();
    });

    it('returns oracle info after registration', async () => {
      await manager.registerOracle({
        oracleId: oracle1.publicKey,
        stake: minStake,
      });

      const info = manager.getOracle(oracle1.publicKey);
      expect(info).toBeDefined();
      expect(info!.active).toBe(true);
    });
  });

  describe('getActiveOracles', () => {
    it('returns empty array initially', () => {
      expect(manager.getActiveOracles()).toHaveLength(0);
    });

    it('returns active oracles', async () => {
      await manager.registerOracle({ oracleId: oracle1.publicKey, stake: minStake });
      await manager.registerOracle({ oracleId: oracle2.publicKey, stake: minStake });

      expect(manager.getActiveOracles()).toHaveLength(2);
    });
  });
});
