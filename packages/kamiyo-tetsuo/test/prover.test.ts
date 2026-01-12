import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import {
  TetsuoProver,
  getTierThreshold,
  getQualifyingTier,
  qualifiesForTier,
  DEFAULT_TIERS,
  TIER_THRESHOLDS,
  TIER_NAMES,
} from '../src';
import type { TierLevel, GeneratedProof } from '../src';
import * as path from 'path';

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

describe('TetsuoProver with real artifacts', () => {
  let prover: TetsuoProver;

  beforeAll(() => {
    if (!TetsuoProver.isAvailable()) {
      console.warn('Skipping proof tests - artifacts not available');
      return;
    }
    prover = new TetsuoProver();
  });

  describe('generateProof', () => {
    it('generates valid proof for Gold tier', async () => {
      if (!TetsuoProver.isAvailable()) return;

      const score = 85;
      const commitment = await prover.generateCommitment(score);
      const proof = await prover.generateProof({
        score,
        secret: commitment.secret,
        threshold: 75,
      });

      expect(proof).toHaveProperty('a');
      expect(proof).toHaveProperty('b');
      expect(proof).toHaveProperty('c');
      expect(proof).toHaveProperty('commitment');
      expect(proof).toHaveProperty('publicInputs');
      expect(proof.a).toHaveLength(2);
      expect(proof.b).toHaveLength(2);
      expect(proof.c).toHaveLength(2);
      expect(proof.publicInputs).toHaveLength(2);
    }, 30000);

    it('generates valid proof for Bronze tier', async () => {
      if (!TetsuoProver.isAvailable()) return;

      const score = 30;
      const commitment = await prover.generateCommitment(score);
      const proof = await prover.generateProof({
        score,
        secret: commitment.secret,
        threshold: 25,
      });

      expect(proof.publicInputs[0]).toBe(25n);
    }, 30000);

    it('generates valid proof for Platinum tier', async () => {
      if (!TetsuoProver.isAvailable()) return;

      const score = 95;
      const commitment = await prover.generateCommitment(score);
      const proof = await prover.generateProof({
        score,
        secret: commitment.secret,
        threshold: 90,
      });

      expect(proof.publicInputs[0]).toBe(90n);
    }, 30000);

    it('fails when score below threshold', async () => {
      if (!TetsuoProver.isAvailable()) return;

      const score = 50;
      const commitment = await prover.generateCommitment(score);

      await expect(
        prover.generateProof({
          score,
          secret: commitment.secret,
          threshold: 75,
        })
      ).rejects.toThrow('Score must be >= threshold');
    });

    it('proof at boundary (score equals threshold)', async () => {
      if (!TetsuoProver.isAvailable()) return;

      const score = 50;
      const commitment = await prover.generateCommitment(score);
      const proof = await prover.generateProof({
        score,
        secret: commitment.secret,
        threshold: 50,
      });

      expect(proof).toBeDefined();
      expect(proof.publicInputs[0]).toBe(50n);
    }, 30000);
  });

  describe('verifyProof', () => {
    it('verifies valid proof', async () => {
      if (!TetsuoProver.isAvailable()) return;

      const score = 80;
      const commitment = await prover.generateCommitment(score);
      const proof = await prover.generateProof({
        score,
        secret: commitment.secret,
        threshold: 75,
      });

      const result = await prover.verifyProof(proof);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    }, 30000);

    it('rejects tampered proof', async () => {
      if (!TetsuoProver.isAvailable()) return;

      const score = 80;
      const commitment = await prover.generateCommitment(score);
      const proof = await prover.generateProof({
        score,
        secret: commitment.secret,
        threshold: 75,
      });

      // Tamper with proof point
      const tamperedProof: GeneratedProof = {
        ...proof,
        a: [proof.a[0] + 1n, proof.a[1]],
      };

      const result = await prover.verifyProof(tamperedProof);
      expect(result.valid).toBe(false);
    }, 30000);

    it('rejects proof with wrong public inputs', async () => {
      if (!TetsuoProver.isAvailable()) return;

      const score = 80;
      const commitment = await prover.generateCommitment(score);
      const proof = await prover.generateProof({
        score,
        secret: commitment.secret,
        threshold: 75,
      });

      // Tamper with public inputs
      const tamperedProof: GeneratedProof = {
        ...proof,
        publicInputs: [90n, proof.publicInputs[1]],
      };

      const result = await prover.verifyProof(tamperedProof);
      expect(result.valid).toBe(false);
    }, 30000);
  });

  describe('commitment consistency', () => {
    it('proof commitment matches generated commitment', async () => {
      if (!TetsuoProver.isAvailable()) return;

      const score = 75;
      const commitment = await prover.generateCommitment(score);
      const proof = await prover.generateProof({
        score,
        secret: commitment.secret,
        threshold: 50,
      });

      const expectedHex = '0x' + commitment.value.toString(16).padStart(64, '0');
      expect(proof.commitment).toBe(expectedHex);
    }, 30000);
  });
});
