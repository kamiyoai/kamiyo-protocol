import { describe, it, expect } from 'vitest';
import {
  isValidGlobalId,
  scoreToTier,
  KamiyoTier,
  buildAgentURN,
  buildTaskURN,
  buildAttestationURN,
  buildTrustURN,
  SCORE_WEIGHTS,
  TIER_THRESHOLDS,
} from './types.js';

describe('isValidGlobalId', () => {
  it('accepts valid global IDs', () => {
    expect(isValidGlobalId('eip155:8453:0x935D2f0e59f5d5d5d5d5d5d5d5d5d5d5d5d5d5d5:123')).toBe(true);
    expect(isValidGlobalId('eip155:1:0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1:0')).toBe(true);
    expect(isValidGlobalId('eip155:100:0xBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBb:999999')).toBe(true);
  });

  it('rejects invalid global IDs', () => {
    expect(isValidGlobalId('')).toBe(false);
    expect(isValidGlobalId('not-a-global-id')).toBe(false);
    expect(isValidGlobalId('eip155:8453:0x123:1')).toBe(false); // address too short
    expect(isValidGlobalId('eip155:8453:0xGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG:1')).toBe(false); // invalid hex
    expect(isValidGlobalId(null)).toBe(false);
    expect(isValidGlobalId(undefined)).toBe(false);
    expect(isValidGlobalId(123)).toBe(false);
    expect(isValidGlobalId({})).toBe(false);
  });

  it('rejects overly long strings', () => {
    const longId = 'eip155:8453:0x935D2f0e59f5d5d5d5d5d5d5d5d5d5d5d5d5d5d5:' + '1'.repeat(100);
    expect(isValidGlobalId(longId)).toBe(false);
  });
});

describe('scoreToTier', () => {
  it('returns correct tiers for boundary values', () => {
    expect(scoreToTier(0)).toBe(KamiyoTier.Unverified);
    expect(scoreToTier(24)).toBe(KamiyoTier.Unverified);
    expect(scoreToTier(25)).toBe(KamiyoTier.Bronze);
    expect(scoreToTier(49)).toBe(KamiyoTier.Bronze);
    expect(scoreToTier(50)).toBe(KamiyoTier.Silver);
    expect(scoreToTier(74)).toBe(KamiyoTier.Silver);
    expect(scoreToTier(75)).toBe(KamiyoTier.Gold);
    expect(scoreToTier(89)).toBe(KamiyoTier.Gold);
    expect(scoreToTier(90)).toBe(KamiyoTier.Platinum);
    expect(scoreToTier(100)).toBe(KamiyoTier.Platinum);
  });

  it('clamps out-of-range scores', () => {
    expect(scoreToTier(-10)).toBe(KamiyoTier.Unverified);
    expect(scoreToTier(150)).toBe(KamiyoTier.Platinum);
  });

  it('handles non-finite numbers gracefully', () => {
    // Non-finite numbers are clamped to 0 for safety
    expect(scoreToTier(NaN)).toBe(KamiyoTier.Unverified);
    expect(scoreToTier(Infinity)).toBe(KamiyoTier.Unverified); // Infinity is not finite, treated as 0
    expect(scoreToTier(-Infinity)).toBe(KamiyoTier.Unverified);
  });
});

describe('URN builders', () => {
  const validId = 'eip155:8453:0x935D2f0e59f5d5d5d5d5d5d5d5d5d5d5d5d5d5d5:123';

  describe('buildAgentURN', () => {
    it('builds valid URN', () => {
      expect(buildAgentURN(validId)).toBe(`urn:erc8004:${validId}`);
    });

    it('throws on invalid global ID', () => {
      expect(() => buildAgentURN('invalid')).toThrow('Invalid global ID');
    });
  });

  describe('buildTaskURN', () => {
    it('builds valid URN', () => {
      expect(buildTaskURN(validId, 1704067200000)).toBe(`urn:kamiyo:task:${validId}:1704067200000`);
    });

    it('throws on invalid global ID', () => {
      expect(() => buildTaskURN('invalid', 123)).toThrow('Invalid global ID');
    });

    it('throws on invalid timestamp', () => {
      expect(() => buildTaskURN(validId, -1)).toThrow('Invalid timestamp');
      expect(() => buildTaskURN(validId, NaN)).toThrow('Invalid timestamp');
    });
  });

  describe('buildAttestationURN', () => {
    it('builds valid URN', () => {
      const urn = buildAttestationURN(validId, 'code_review', validId);
      expect(urn).toContain('urn:kamiyo:attestation:');
      expect(urn).toContain('code_review');
    });

    it('sanitizes capability name', () => {
      const urn = buildAttestationURN(validId, 'test/capability:special', validId);
      expect(urn).toContain('test_capability_special');
    });

    it('throws on invalid global ID', () => {
      expect(() => buildAttestationURN('invalid', 'cap', validId)).toThrow('Invalid global ID');
      expect(() => buildAttestationURN(validId, 'cap', 'invalid')).toThrow('Invalid global ID');
    });

    it('throws on invalid capability', () => {
      expect(() => buildAttestationURN(validId, '', validId)).toThrow('Invalid capability');
      expect(() => buildAttestationURN(validId, 'x'.repeat(200), validId)).toThrow('Invalid capability');
    });
  });

  describe('buildTrustURN', () => {
    it('builds valid URN', () => {
      expect(buildTrustURN(validId, validId)).toBe(`urn:kamiyo:trust:${validId}:${validId}`);
    });

    it('throws on invalid global ID', () => {
      expect(() => buildTrustURN('invalid', validId)).toThrow('Invalid global ID');
      expect(() => buildTrustURN(validId, 'invalid')).toThrow('Invalid global ID');
    });
  });
});

describe('constants', () => {
  it('SCORE_WEIGHTS sum to 1.0', () => {
    const sum = Object.values(SCORE_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1.0);
  });

  it('TIER_THRESHOLDS are in ascending order', () => {
    expect(TIER_THRESHOLDS[KamiyoTier.Bronze]).toBeLessThan(TIER_THRESHOLDS[KamiyoTier.Silver]);
    expect(TIER_THRESHOLDS[KamiyoTier.Silver]).toBeLessThan(TIER_THRESHOLDS[KamiyoTier.Gold]);
    expect(TIER_THRESHOLDS[KamiyoTier.Gold]).toBeLessThan(TIER_THRESHOLDS[KamiyoTier.Platinum]);
  });
});
