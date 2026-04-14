import { describe, expect, it } from 'vitest';
import { sampleStats, welchPTwoSided, welchT } from '../variants/stats';

describe('variants/stats', () => {
  it('computes mean and variance', () => {
    const s = sampleStats([0.5, 0.6, 0.7]);
    expect(s.n).toBe(3);
    expect(s.mean).toBeCloseTo(0.6, 6);
    expect(s.variance).toBeCloseTo(0.01, 6);
  });

  it('welch returns null for n<2', () => {
    const a = sampleStats([0.5]);
    const b = sampleStats([0.5, 0.6]);
    expect(welchT(a, b)).toBeNull();
  });

  it('welch detects significant uplift', () => {
    const high = sampleStats([0.85, 0.9, 0.88, 0.92, 0.87, 0.89, 0.91, 0.86, 0.88, 0.9]);
    const low = sampleStats([0.4, 0.45, 0.42, 0.38, 0.41, 0.43, 0.39, 0.44, 0.4, 0.42]);
    const tw = welchT(high, low);
    expect(tw).not.toBeNull();
    const p = welchPTwoSided(tw!.t, tw!.df);
    expect(p).toBeLessThan(0.001);
  });

  it('welch returns high p for no difference', () => {
    const a = sampleStats([0.5, 0.5, 0.5, 0.5, 0.5]);
    const b = sampleStats([0.5, 0.5, 0.5, 0.5, 0.5]);
    expect(welchT(a, b)).toBeNull();
  });
});
