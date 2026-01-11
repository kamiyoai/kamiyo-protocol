import { describe, it, expect, beforeEach } from 'vitest';
import {
  TetsuoProver,
  getTierThreshold,
  getQualifyingTier,
  qualifiesForTier,
  DEFAULT_TIERS,
  TIER_THRESHOLDS,
  TIER_NAMES,
} from '../src';
import type { TierLevel } from '../src';

describe('Tier Utility Functions', () => {
  describe('getTierThreshold', () => {
    it('returns correct threshold for each tier', () => {
      expect(getTierThreshold(0)).toBe(0);
      expect(getTierThreshold(1)).toBe(25);
      expect(getTierThreshold(2)).toBe(50);
      expect(getTierThreshold(3)).toBe(75);
      expect(getTierThreshold(4)).toBe(90);
    });
  });

  describe('getQualifyingTier', () => {
    it('returns tier 0 for scores below 25', () => {
      expect(getQualifyingTier(0)).toBe(0);
      expect(getQualifyingTier(24)).toBe(0);
    });

    it('returns tier 1 for scores 25-49', () => {
      expect(getQualifyingTier(25)).toBe(1);
      expect(getQualifyingTier(49)).toBe(1);
    });

    it('returns tier 2 for scores 50-74', () => {
      expect(getQualifyingTier(50)).toBe(2);
      expect(getQualifyingTier(74)).toBe(2);
    });

    it('returns tier 3 for scores 75-89', () => {
      expect(getQualifyingTier(75)).toBe(3);
      expect(getQualifyingTier(89)).toBe(3);
    });

    it('returns tier 4 for scores 90+', () => {
      expect(getQualifyingTier(90)).toBe(4);
      expect(getQualifyingTier(100)).toBe(4);
    });
  });

  describe('qualifiesForTier', () => {
    it('correctly evaluates tier 0 qualification', () => {
      expect(qualifiesForTier(0, 0)).toBe(true);
      expect(qualifiesForTier(100, 0)).toBe(true);
    });

    it('correctly evaluates tier 1 qualification', () => {
      expect(qualifiesForTier(24, 1)).toBe(false);
      expect(qualifiesForTier(25, 1)).toBe(true);
      expect(qualifiesForTier(50, 1)).toBe(true);
    });

    it('correctly evaluates tier 2 qualification', () => {
      expect(qualifiesForTier(49, 2)).toBe(false);
      expect(qualifiesForTier(50, 2)).toBe(true);
    });

    it('correctly evaluates tier 3 qualification', () => {
      expect(qualifiesForTier(74, 3)).toBe(false);
      expect(qualifiesForTier(75, 3)).toBe(true);
    });

    it('correctly evaluates tier 4 qualification', () => {
      expect(qualifiesForTier(89, 4)).toBe(false);
      expect(qualifiesForTier(90, 4)).toBe(true);
    });
  });
});

describe('Tier Constants', () => {
  it('DEFAULT_TIERS has correct structure', () => {
    expect(DEFAULT_TIERS).toHaveLength(5);
    DEFAULT_TIERS.forEach((tier, index) => {
      expect(tier.id).toBe(index);
      expect(typeof tier.name).toBe('string');
      expect(typeof tier.threshold).toBe('number');
      expect(typeof tier.maxCopyLimit).toBe('bigint');
      expect(typeof tier.maxCopiers).toBe('number');
    });
  });

  it('TIER_THRESHOLDS matches DEFAULT_TIERS', () => {
    expect(TIER_THRESHOLDS).toHaveLength(5);
    DEFAULT_TIERS.forEach((tier, index) => {
      expect(TIER_THRESHOLDS[index]).toBe(tier.threshold);
    });
  });

  it('TIER_NAMES matches DEFAULT_TIERS', () => {
    expect(TIER_NAMES).toHaveLength(5);
    DEFAULT_TIERS.forEach((tier, index) => {
      expect(TIER_NAMES[index]).toBe(tier.name);
    });
  });

  it('tier limits increase with tier level', () => {
    for (let i = 1; i < DEFAULT_TIERS.length; i++) {
      expect(DEFAULT_TIERS[i].maxCopyLimit).toBeGreaterThan(DEFAULT_TIERS[i - 1].maxCopyLimit);
      expect(DEFAULT_TIERS[i].maxCopiers).toBeGreaterThan(DEFAULT_TIERS[i - 1].maxCopiers);
      expect(DEFAULT_TIERS[i].threshold).toBeGreaterThan(DEFAULT_TIERS[i - 1].threshold);
    }
  });
});

describe('TetsuoProver', () => {
  describe('constructor', () => {
    it('accepts valid config', () => {
      const prover = new TetsuoProver({
        wasmPath: '/path/to/circuit.wasm',
        zkeyPath: '/path/to/circuit.zkey',
      });
      expect(prover).toBeInstanceOf(TetsuoProver);
    });
  });

  describe('generateCommitment', () => {
    let prover: TetsuoProver;

    beforeEach(() => {
      prover = new TetsuoProver({
        wasmPath: '/fake/path.wasm',
        zkeyPath: '/fake/path.zkey',
      });
    });

    it('throws on score below 0', async () => {
      await expect(prover.generateCommitment(-1)).rejects.toThrow(
        'Score must be between 0 and 100'
      );
    });

    it('throws on score above 100', async () => {
      await expect(prover.generateCommitment(101)).rejects.toThrow(
        'Score must be between 0 and 100'
      );
    });

    it('generates commitment for valid score', async () => {
      const commitment = await prover.generateCommitment(50);
      expect(commitment).toHaveProperty('value');
      expect(commitment).toHaveProperty('secret');
      expect(typeof commitment.value).toBe('bigint');
      expect(typeof commitment.secret).toBe('bigint');
    });

    it('uses provided secret if given', async () => {
      const secret = 12345678901234567890n;
      const commitment = await prover.generateCommitment(75, secret);
      expect(commitment.secret).toBe(secret);
    });

    it('generates different commitments for different scores', async () => {
      const secret = 99999999999999999999n;
      const c1 = await prover.generateCommitment(50, secret);
      const c2 = await prover.generateCommitment(75, secret);
      expect(c1.value).not.toBe(c2.value);
    });

    it('generates different commitments for different secrets', async () => {
      const s1 = 11111111111111111111n;
      const s2 = 22222222222222222222n;
      const c1 = await prover.generateCommitment(50, s1);
      const c2 = await prover.generateCommitment(50, s2);
      expect(c1.value).not.toBe(c2.value);
    });

    it('generates consistent commitment for same inputs', async () => {
      const secret = 33333333333333333333n;
      const c1 = await prover.generateCommitment(80, secret);
      const c2 = await prover.generateCommitment(80, secret);
      expect(c1.value).toBe(c2.value);
    });
  });

  describe('generateProof input validation', () => {
    let prover: TetsuoProver;

    beforeEach(() => {
      prover = new TetsuoProver({
        wasmPath: '/fake/path.wasm',
        zkeyPath: '/fake/path.zkey',
      });
    });

    it('throws on score below 0', async () => {
      await expect(
        prover.generateProof({ score: -1, secret: 1n, threshold: 50 })
      ).rejects.toThrow('Score must be between 0 and 100');
    });

    it('throws on score above 100', async () => {
      await expect(
        prover.generateProof({ score: 101, secret: 1n, threshold: 50 })
      ).rejects.toThrow('Score must be between 0 and 100');
    });

    it('throws on threshold below 0', async () => {
      await expect(
        prover.generateProof({ score: 50, secret: 1n, threshold: -1 })
      ).rejects.toThrow('Threshold must be between 0 and 100');
    });

    it('throws on threshold above 100', async () => {
      await expect(
        prover.generateProof({ score: 50, secret: 1n, threshold: 101 })
      ).rejects.toThrow('Threshold must be between 0 and 100');
    });

    it('throws when score is below threshold', async () => {
      await expect(
        prover.generateProof({ score: 40, secret: 1n, threshold: 50 })
      ).rejects.toThrow('Score must be >= threshold to generate valid proof');
    });
  });
});

describe('Type exports', () => {
  it('exports all expected types', () => {
    const tierLevel: TierLevel = 0;
    expect([0, 1, 2, 3, 4]).toContain(tierLevel);
  });
});
