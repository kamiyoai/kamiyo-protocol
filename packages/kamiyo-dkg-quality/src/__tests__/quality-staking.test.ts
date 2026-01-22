import { describe, it, expect, beforeEach } from 'vitest';
import { Keypair } from '@solana/web3.js';
import BN from 'bn.js';
import { QualityStakingManager, parseUAL, buildUAL } from '../quality-staking.js';

describe('QualityStakingManager', () => {
  let manager: QualityStakingManager;
  let publisher: Keypair;
  const validUal = 'did:dkg:otp/0x1234567890abcdef/12345';

  beforeEach(() => {
    manager = new QualityStakingManager();
    publisher = Keypair.generate();
  });

  describe('createQualityStake', () => {
    it('creates stake with valid inputs', async () => {
      const stake = await manager.createQualityStake({
        assetUal: validUal,
        publisher: publisher.publicKey,
        stakeAmount: new BN(500_000_000), // 0.5 SOL
      });

      expect(stake.assetUal).toBe(validUal);
      expect(stake.publisher.equals(publisher.publicKey)).toBe(true);
      expect(stake.stakeAmount.eq(new BN(500_000_000))).toBe(true);
      expect(stake.status).toBe('pending');
      expect(stake.escrowPda).toBeDefined();
    });

    it('rejects empty UAL', async () => {
      await expect(
        manager.createQualityStake({
          assetUal: '',
          publisher: publisher.publicKey,
          stakeAmount: new BN(500_000_000),
        })
      ).rejects.toThrow('Asset UAL is required');
    });

    it('rejects invalid UAL format', async () => {
      await expect(
        manager.createQualityStake({
          assetUal: 'invalid-ual',
          publisher: publisher.publicKey,
          stakeAmount: new BN(500_000_000),
        })
      ).rejects.toThrow('Invalid UAL format');
    });

    it('rejects UAL without did:dkg: prefix', async () => {
      await expect(
        manager.createQualityStake({
          assetUal: 'did:other:network/contract/token',
          publisher: publisher.publicKey,
          stakeAmount: new BN(500_000_000),
        })
      ).rejects.toThrow('must start with "did:dkg:"');
    });

    it('rejects stake below minimum', async () => {
      await expect(
        manager.createQualityStake({
          assetUal: validUal,
          publisher: publisher.publicKey,
          stakeAmount: new BN(1000), // way below 0.1 SOL minimum
        })
      ).rejects.toThrow('below minimum');
    });

    it('rejects negative stake amount', async () => {
      await expect(
        manager.createQualityStake({
          assetUal: validUal,
          publisher: publisher.publicKey,
          stakeAmount: new BN(-100),
        })
      ).rejects.toThrow('must be positive');
    });

    it('rejects duplicate stake for same asset', async () => {
      await manager.createQualityStake({
        assetUal: validUal,
        publisher: publisher.publicKey,
        stakeAmount: new BN(500_000_000),
      });

      await expect(
        manager.createQualityStake({
          assetUal: validUal,
          publisher: publisher.publicKey,
          stakeAmount: new BN(500_000_000),
        })
      ).rejects.toThrow('already exists');
    });

    it('rejects negative verification deadline', async () => {
      await expect(
        manager.createQualityStake({
          assetUal: validUal,
          publisher: publisher.publicKey,
          stakeAmount: new BN(500_000_000),
          verificationDeadlineHours: -1,
        })
      ).rejects.toThrow('must be positive');
    });
  });

  describe('resolveQualityAssessment', () => {
    beforeEach(async () => {
      await manager.createQualityStake({
        assetUal: validUal,
        publisher: publisher.publicKey,
        stakeAmount: new BN(500_000_000),
      });
    });

    it('resolves to verified status with high score', async () => {
      const result = await manager.resolveQualityAssessment({
        assetUal: validUal,
        medianScore: 85,
        oracleCount: 3,
      });

      expect(result.stake.status).toBe('verified');
      expect(result.metadata.qualityScore).toBe(85);
      expect(result.metadata.oracleConsensus).toBe(3);
    });

    it('resolves to disputed status with low score', async () => {
      const result = await manager.resolveQualityAssessment({
        assetUal: validUal,
        medianScore: 30,
        oracleCount: 3,
      });

      expect(result.stake.status).toBe('disputed');
    });

    it('resolves to contested status with mid score', async () => {
      const result = await manager.resolveQualityAssessment({
        assetUal: validUal,
        medianScore: 65,
        oracleCount: 3,
      });

      expect(result.stake.status).toBe('contested');
    });

    it('rejects invalid median score (negative)', async () => {
      await expect(
        manager.resolveQualityAssessment({
          assetUal: validUal,
          medianScore: -10,
          oracleCount: 3,
        })
      ).rejects.toThrow('must be between 0-100');
    });

    it('rejects invalid median score (over 100)', async () => {
      await expect(
        manager.resolveQualityAssessment({
          assetUal: validUal,
          medianScore: 150,
          oracleCount: 3,
        })
      ).rejects.toThrow('must be between 0-100');
    });

    it('rejects non-integer oracle count', async () => {
      await expect(
        manager.resolveQualityAssessment({
          assetUal: validUal,
          medianScore: 85,
          oracleCount: 2.5,
        })
      ).rejects.toThrow('positive integer');
    });

    it('rejects zero oracle count', async () => {
      await expect(
        manager.resolveQualityAssessment({
          assetUal: validUal,
          medianScore: 85,
          oracleCount: 0,
        })
      ).rejects.toThrow('positive integer');
    });

    it('rejects resolving non-existent stake', async () => {
      await expect(
        manager.resolveQualityAssessment({
          assetUal: 'did:dkg:otp/0x0000/99999',
          medianScore: 85,
          oracleCount: 3,
        })
      ).rejects.toThrow('No quality stake found');
    });

    it('rejects resolving already resolved stake', async () => {
      await manager.resolveQualityAssessment({
        assetUal: validUal,
        medianScore: 85,
        oracleCount: 3,
      });

      await expect(
        manager.resolveQualityAssessment({
          assetUal: validUal,
          medianScore: 90,
          oracleCount: 3,
        })
      ).rejects.toThrow('already resolved');
    });
  });

  describe('getStake', () => {
    it('returns undefined for non-existent stake', () => {
      expect(manager.getStake(validUal)).toBeUndefined();
    });

    it('returns stake after creation', async () => {
      await manager.createQualityStake({
        assetUal: validUal,
        publisher: publisher.publicKey,
        stakeAmount: new BN(500_000_000),
      });

      const stake = manager.getStake(validUal);
      expect(stake).toBeDefined();
      expect(stake!.assetUal).toBe(validUal);
    });
  });

  describe('calculateDistribution', () => {
    it('returns full stake minus fee for verified', async () => {
      const stake = await manager.createQualityStake({
        assetUal: validUal,
        publisher: publisher.publicKey,
        stakeAmount: new BN(1_000_000_000), // 1 SOL
      });

      const dist = manager.calculateDistribution(stake, 85);

      expect(dist.publisherReturn.gt(new BN(0))).toBe(true);
      expect(dist.slashed.eq(new BN(0))).toBe(true);
    });

    it('slashes full stake for disputed', async () => {
      const stake = await manager.createQualityStake({
        assetUal: validUal,
        publisher: publisher.publicKey,
        stakeAmount: new BN(1_000_000_000),
      });

      const dist = manager.calculateDistribution(stake, 30);

      expect(dist.publisherReturn.eq(new BN(0))).toBe(true);
      expect(dist.slashed.gt(new BN(0))).toBe(true);
    });
  });

  describe('getPendingStakes', () => {
    it('returns empty array initially', () => {
      expect(manager.getPendingStakes()).toHaveLength(0);
    });

    it('returns pending stakes', async () => {
      await manager.createQualityStake({
        assetUal: validUal,
        publisher: publisher.publicKey,
        stakeAmount: new BN(500_000_000),
      });

      expect(manager.getPendingStakes()).toHaveLength(1);
    });

    it('excludes resolved stakes', async () => {
      await manager.createQualityStake({
        assetUal: validUal,
        publisher: publisher.publicKey,
        stakeAmount: new BN(500_000_000),
      });

      await manager.resolveQualityAssessment({
        assetUal: validUal,
        medianScore: 85,
        oracleCount: 3,
      });

      expect(manager.getPendingStakes()).toHaveLength(0);
    });
  });
});

describe('UAL utilities', () => {
  describe('parseUAL', () => {
    it('parses valid UAL', () => {
      const result = parseUAL('did:dkg:otp/0x1234/5678');
      expect(result).toEqual({
        network: 'otp',
        contract: '0x1234',
        tokenId: '5678',
      });
    });

    it('returns null for invalid UAL', () => {
      expect(parseUAL('invalid')).toBeNull();
      expect(parseUAL('did:dkg:incomplete')).toBeNull();
      expect(parseUAL('')).toBeNull();
    });
  });

  describe('buildUAL', () => {
    it('builds valid UAL', () => {
      expect(buildUAL('otp', '0x1234', '5678')).toBe('did:dkg:otp/0x1234/5678');
    });
  });
});
