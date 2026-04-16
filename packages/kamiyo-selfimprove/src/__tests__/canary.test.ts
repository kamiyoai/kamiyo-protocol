import { describe, expect, it } from 'vitest';

function clampPct(p: number): number {
  if (!Number.isFinite(p)) return 0.1;
  return Math.max(0, Math.min(1, p));
}

function pickArm(trafficPct: number, rng: () => number): 'canary' | 'baseline' {
  return rng() < trafficPct ? 'canary' : 'baseline';
}

function sampleStats(xs: number[]): { n: number; mean: number; variance: number } {
  if (xs.length === 0) return { n: 0, mean: 0, variance: 0 };
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const variance =
    xs.length > 1 ? xs.reduce((a, b) => a + (b - mean) ** 2, 0) / (xs.length - 1) : 0;
  return { n: xs.length, mean, variance };
}

type DecisionKind = 'hold' | 'promote' | 'rollback';

function decide(
  canary: number[],
  baseline: number[],
  minSamples: number,
  rollbackThreshold: number,
  pThreshold: number
): { kind: DecisionKind; delta: number; p?: number } {
  if (canary.length < minSamples) return { kind: 'hold', delta: 0 };
  if (baseline.length < Math.max(10, Math.trunc(minSamples / 2))) {
    return { kind: 'hold', delta: 0 };
  }
  const c = sampleStats(canary);
  const b = sampleStats(baseline);
  const delta = c.mean - b.mean;
  if (delta < -rollbackThreshold) return { kind: 'rollback', delta };
  const semA = Math.sqrt(c.variance / c.n);
  const semB = Math.sqrt(b.variance / b.n);
  const se = Math.sqrt(semA ** 2 + semB ** 2);
  if (se === 0) return { kind: 'hold', delta };
  const t = delta / se;
  const p = approxPTwoSided(t);
  if (delta > 0 && p <= pThreshold) return { kind: 'promote', delta, p };
  return { kind: 'hold', delta, p };
}

function approxPTwoSided(t: number): number {
  const x = Math.abs(t);
  return 2 * (1 - stdNormalCdf(x));
}

function stdNormalCdf(x: number): number {
  return 0.5 * (1 + erf(x / Math.SQRT2));
}

function erf(x: number): number {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const sign = x < 0 ? -1 : 1;
  const abs = Math.abs(x);
  const t = 1 / (1 + p * abs);
  const y = 1 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-abs * abs);
  return sign * y;
}

describe('canary/clamp', () => {
  it('clamps above 1.0 to 1.0', () => {
    expect(clampPct(5)).toBe(1);
  });
  it('clamps below 0 to 0', () => {
    expect(clampPct(-0.5)).toBe(0);
  });
  it('defaults NaN to 0.1', () => {
    expect(clampPct(NaN)).toBe(0.1);
  });
  it('passes through in-range', () => {
    expect(clampPct(0.25)).toBe(0.25);
  });
});

describe('canary/traffic-split', () => {
  it('low traffic sends most to baseline', () => {
    let canary = 0;
    const rng = mulberry32(1);
    for (let i = 0; i < 10000; i++) {
      if (pickArm(0.1, rng) === 'canary') canary++;
    }
    expect(canary).toBeGreaterThan(800);
    expect(canary).toBeLessThan(1200);
  });

  it('50/50 splits evenly', () => {
    let canary = 0;
    const rng = mulberry32(42);
    for (let i = 0; i < 10000; i++) {
      if (pickArm(0.5, rng) === 'canary') canary++;
    }
    expect(canary).toBeGreaterThan(4700);
    expect(canary).toBeLessThan(5300);
  });

  it('full ramp routes all to canary', () => {
    const rng = mulberry32(7);
    for (let i = 0; i < 1000; i++) {
      expect(pickArm(1.0, rng)).toBe('canary');
    }
  });

  it('zero traffic routes all to baseline', () => {
    const rng = mulberry32(7);
    for (let i = 0; i < 1000; i++) {
      expect(pickArm(0.0, rng)).toBe('baseline');
    }
  });
});

describe('canary/decision', () => {
  it('holds when canary samples < minSamples', () => {
    const canary = Array.from({ length: 10 }, () => 0.9);
    const baseline = Array.from({ length: 100 }, () => 0.7);
    const d = decide(canary, baseline, 50, 0.05, 0.05);
    expect(d.kind).toBe('hold');
  });

  it('rolls back on score regression beyond threshold', () => {
    const canary = Array.from({ length: 60 }, () => 0.5);
    const baseline = Array.from({ length: 60 }, () => 0.8);
    const d = decide(canary, baseline, 50, 0.05, 0.05);
    expect(d.kind).toBe('rollback');
    expect(d.delta).toBeLessThan(-0.05);
  });

  it('promotes when canary beats baseline significantly', () => {
    const canary = Array.from({ length: 100 }, (_, i) => 0.85 + (i % 5) * 0.01);
    const baseline = Array.from({ length: 100 }, (_, i) => 0.7 + (i % 5) * 0.01);
    const d = decide(canary, baseline, 50, 0.05, 0.05);
    expect(d.kind).toBe('promote');
    expect(d.delta).toBeGreaterThan(0);
    expect(d.p).toBeLessThanOrEqual(0.05);
  });

  it('holds on tied means (no improvement)', () => {
    const canary = Array.from({ length: 100 }, (_, i) => 0.75 + (i % 5) * 0.01);
    const baseline = Array.from({ length: 100 }, (_, i) => 0.75 + (i % 5) * 0.01);
    const d = decide(canary, baseline, 50, 0.05, 0.05);
    expect(d.kind).toBe('hold');
  });

  it('holds when improvement is within noise', () => {
    const rng = mulberry32(99);
    const canary = Array.from({ length: 60 }, () => 0.8 + (rng() - 0.5) * 0.3);
    const baseline = Array.from({ length: 60 }, () => 0.79 + (rng() - 0.5) * 0.3);
    const d = decide(canary, baseline, 50, 0.05, 0.05);
    expect(d.kind).toBe('hold');
  });

  it('minor regression under threshold holds, does not rollback', () => {
    const canary = Array.from({ length: 60 }, () => 0.78);
    const baseline = Array.from({ length: 60 }, () => 0.8);
    const d = decide(canary, baseline, 50, 0.05, 0.05);
    expect(d.kind).not.toBe('rollback');
  });
});

describe('canary/ramp-progression', () => {
  const rampSteps = [0.1, 0.25, 0.5, 1.0];

  it('ramps to next step from current traffic', () => {
    for (const cur of [0.05, 0.1, 0.2]) {
      const next = rampSteps.find(s => s > cur) ?? 1.0;
      expect(next).toBeGreaterThan(cur);
    }
  });

  it('ramps from 0.1 → 0.25 → 0.5 → 1.0', () => {
    let cur = 0.1;
    const seen: number[] = [];
    for (let i = 0; i < 10; i++) {
      const next = rampSteps.find(s => s > cur);
      if (!next) break;
      seen.push(next);
      cur = next;
    }
    expect(seen).toEqual([0.25, 0.5, 1.0]);
  });

  it('stops at 1.0', () => {
    const cur = 1.0;
    const next = rampSteps.find(s => s > cur);
    expect(next).toBeUndefined();
  });
});

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
