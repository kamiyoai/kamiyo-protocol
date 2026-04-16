import { describe, expect, it } from 'vitest';

type Entry = {
  variantId: string;
  meanQuality: number;
  meanCost: number;
  meanLatencyMs: number;
};

function dominates(a: Entry, b: Entry): boolean {
  const qualityOK = a.meanQuality >= b.meanQuality;
  const costOK = a.meanCost <= b.meanCost;
  const latencyOK = a.meanLatencyMs <= b.meanLatencyMs;
  const strict =
    a.meanQuality > b.meanQuality || a.meanCost < b.meanCost || a.meanLatencyMs < b.meanLatencyMs;
  return qualityOK && costOK && latencyOK && strict;
}

function frontier(entries: Entry[]): Entry[] {
  return entries.filter(e => !entries.some(other => other !== e && dominates(other, e)));
}

describe('pareto/dominance', () => {
  it('strict winner dominates', () => {
    const a: Entry = { variantId: 'a', meanQuality: 0.9, meanCost: 0.01, meanLatencyMs: 100 };
    const b: Entry = { variantId: 'b', meanQuality: 0.8, meanCost: 0.02, meanLatencyMs: 200 };
    expect(dominates(a, b)).toBe(true);
    expect(dominates(b, a)).toBe(false);
  });

  it('equal on all is not dominance', () => {
    const a: Entry = { variantId: 'a', meanQuality: 0.8, meanCost: 0.02, meanLatencyMs: 200 };
    const b: Entry = { variantId: 'b', meanQuality: 0.8, meanCost: 0.02, meanLatencyMs: 200 };
    expect(dominates(a, b)).toBe(false);
    expect(dominates(b, a)).toBe(false);
  });

  it('tradeoff is non-dominated', () => {
    const high: Entry = { variantId: 'h', meanQuality: 0.9, meanCost: 0.05, meanLatencyMs: 500 };
    const fast: Entry = { variantId: 'f', meanQuality: 0.7, meanCost: 0.01, meanLatencyMs: 100 };
    expect(dominates(high, fast)).toBe(false);
    expect(dominates(fast, high)).toBe(false);
  });
});

describe('pareto/frontier', () => {
  it('returns non-dominated set', () => {
    const entries: Entry[] = [
      { variantId: 'dominated', meanQuality: 0.5, meanCost: 0.05, meanLatencyMs: 500 },
      { variantId: 'quality-king', meanQuality: 0.9, meanCost: 0.05, meanLatencyMs: 500 },
      { variantId: 'cheap', meanQuality: 0.6, meanCost: 0.001, meanLatencyMs: 400 },
      { variantId: 'fast', meanQuality: 0.5, meanCost: 0.05, meanLatencyMs: 50 },
    ];
    const f = frontier(entries);
    const ids = f.map(e => e.variantId).sort();
    expect(ids).toEqual(['cheap', 'fast', 'quality-king']);
    expect(ids).not.toContain('dominated');
  });

  it('single entry is on frontier', () => {
    const entries: Entry[] = [
      { variantId: 'only', meanQuality: 0.5, meanCost: 0.02, meanLatencyMs: 200 },
    ];
    expect(frontier(entries)).toHaveLength(1);
  });

  it('all equal are all on frontier', () => {
    const entries: Entry[] = [
      { variantId: 'a', meanQuality: 0.8, meanCost: 0.02, meanLatencyMs: 200 },
      { variantId: 'b', meanQuality: 0.8, meanCost: 0.02, meanLatencyMs: 200 },
    ];
    expect(frontier(entries)).toHaveLength(2);
  });
});
