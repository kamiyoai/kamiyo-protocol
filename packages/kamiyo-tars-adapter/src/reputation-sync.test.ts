import { describe, it, expect } from 'vitest';
import {
  tarsToKamiyoReputation,
  kamiyoToTarsRating,
  kamiyoReputationToDisplayRating,
  aggregateCombinedReputation,
} from './reputation-sync';

describe('tarsToKamiyoReputation', () => {
  it('converts 1 star to 0 reputation', () => {
    expect(tarsToKamiyoReputation(1)).toBe(0);
  });

  it('converts 2 stars to 25 reputation', () => {
    expect(tarsToKamiyoReputation(2)).toBe(25);
  });

  it('converts 3 stars to 50 reputation', () => {
    expect(tarsToKamiyoReputation(3)).toBe(50);
  });

  it('converts 4 stars to 75 reputation', () => {
    expect(tarsToKamiyoReputation(4)).toBe(75);
  });

  it('converts 5 stars to 100 reputation', () => {
    expect(tarsToKamiyoReputation(5)).toBe(100);
  });

  it('handles fractional ratings', () => {
    expect(tarsToKamiyoReputation(3.5)).toBe(63);
    expect(tarsToKamiyoReputation(4.2)).toBe(80);
  });

  it('clamps values below 1', () => {
    expect(tarsToKamiyoReputation(0)).toBe(0);
    expect(tarsToKamiyoReputation(-1)).toBe(0);
  });

  it('clamps values above 5', () => {
    expect(tarsToKamiyoReputation(6)).toBe(100);
    expect(tarsToKamiyoReputation(10)).toBe(100);
  });
});

describe('kamiyoToTarsRating', () => {
  it('converts quality >= 80 to 5 stars', () => {
    expect(kamiyoToTarsRating(80)).toBe(5);
    expect(kamiyoToTarsRating(90)).toBe(5);
    expect(kamiyoToTarsRating(100)).toBe(5);
  });

  it('converts quality 65-79 to 4 stars', () => {
    expect(kamiyoToTarsRating(65)).toBe(4);
    expect(kamiyoToTarsRating(70)).toBe(4);
    expect(kamiyoToTarsRating(79)).toBe(4);
  });

  it('converts quality 50-64 to 3 stars', () => {
    expect(kamiyoToTarsRating(50)).toBe(3);
    expect(kamiyoToTarsRating(55)).toBe(3);
    expect(kamiyoToTarsRating(64)).toBe(3);
  });

  it('converts quality 25-49 to 2 stars', () => {
    expect(kamiyoToTarsRating(25)).toBe(2);
    expect(kamiyoToTarsRating(35)).toBe(2);
    expect(kamiyoToTarsRating(49)).toBe(2);
  });

  it('converts quality < 25 to 1 star', () => {
    expect(kamiyoToTarsRating(0)).toBe(1);
    expect(kamiyoToTarsRating(10)).toBe(1);
    expect(kamiyoToTarsRating(24)).toBe(1);
  });
});

describe('kamiyoReputationToDisplayRating', () => {
  it('converts 0 reputation to 1 star', () => {
    expect(kamiyoReputationToDisplayRating(0)).toBe(1);
  });

  it('converts 100 reputation to 5 stars', () => {
    expect(kamiyoReputationToDisplayRating(100)).toBe(5);
  });

  it('converts 50 reputation to 3 stars', () => {
    expect(kamiyoReputationToDisplayRating(50)).toBe(3);
  });

  it('handles edge cases', () => {
    expect(kamiyoReputationToDisplayRating(-10)).toBe(1);
    expect(kamiyoReputationToDisplayRating(150)).toBe(5);
  });
});

describe('aggregateCombinedReputation', () => {
  it('uses default weights (70% KAMIYO, 30% TARS)', () => {
    const combined = aggregateCombinedReputation(100, 0);
    expect(combined).toBe(70);
  });

  it('calculates weighted average correctly', () => {
    const combined = aggregateCombinedReputation(80, 60);
    // (80 * 0.7 + 60 * 0.3) = 56 + 18 = 74
    expect(combined).toBe(74);
  });

  it('respects custom weights', () => {
    const combined = aggregateCombinedReputation(100, 50, { kamiyo: 0.5, tars: 0.5 });
    expect(combined).toBe(75);
  });

  it('handles equal weights', () => {
    const combined = aggregateCombinedReputation(60, 80, { kamiyo: 1, tars: 1 });
    expect(combined).toBe(70);
  });

  it('handles TARS-only weight', () => {
    const combined = aggregateCombinedReputation(100, 50, { kamiyo: 0, tars: 1 });
    expect(combined).toBe(50);
  });

  it('handles KAMIYO-only weight', () => {
    const combined = aggregateCombinedReputation(80, 100, { kamiyo: 1, tars: 0 });
    expect(combined).toBe(80);
  });

  it('normalizes out-of-range values', () => {
    const combined = aggregateCombinedReputation(150, -20);
    // Clamped to (100 * 0.7 + 0 * 0.3) = 70
    expect(combined).toBe(70);
  });

  it('returns 0 for zero total weight', () => {
    const combined = aggregateCombinedReputation(100, 100, { kamiyo: 0, tars: 0 });
    expect(combined).toBe(0);
  });
});

describe('round-trip conversion', () => {
  it('maintains consistency for TARS -> KAMIYO -> TARS', () => {
    // 5 stars -> 100 reputation -> 5 stars
    const tars5 = 5;
    const kamiyo = tarsToKamiyoReputation(tars5);
    const backToTars = kamiyoToTarsRating(kamiyo);
    expect(backToTars).toBe(5);

    // 3 stars -> 50 reputation -> 3 stars
    const tars3 = 3;
    const kamiyo3 = tarsToKamiyoReputation(tars3);
    const backToTars3 = kamiyoToTarsRating(kamiyo3);
    expect(backToTars3).toBe(3);
  });

  it('handles threshold boundaries correctly', () => {
    // Quality 80 (threshold for 5 stars) should round-trip
    expect(kamiyoToTarsRating(80)).toBe(5);

    // Quality 79 (just below 5-star threshold)
    expect(kamiyoToTarsRating(79)).toBe(4);

    // Quality 65 (threshold for 4 stars)
    expect(kamiyoToTarsRating(65)).toBe(4);

    // Quality 64 (just below 4-star threshold)
    expect(kamiyoToTarsRating(64)).toBe(3);
  });
});
