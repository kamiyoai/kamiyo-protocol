import {
  computeCreditScore,
  computeAgingPenalty,
  computeCollateralBoost,
  DEFAULT_SCORING_CONFIG,
  type CreditScoringInput,
} from './credit-scoring';

function baseInput(overrides: Partial<CreditScoringInput> = {}): CreditScoringInput {
  return {
    disputeWinRate: 1,
    onTimeRepaymentRate: 1,
    avgQualityScore: 100,
    tenureDays: 180,
    inactiveDays: 0,
    pledgedAmount: 0,
    tierBaseLimit: 100,
    escrowsCompleted: 5,
    ...overrides,
  };
}

describe('computeCreditScore', () => {
  it('returns max score 1000 for perfect inputs', () => {
    const result = computeCreditScore(baseInput());
    expect(result.rawScore).toBe(1000);
    expect(result.components.dispute).toBe(250);
    expect(result.components.repayment).toBe(250);
    expect(result.components.quality).toBe(250);
    expect(result.components.tenure).toBe(250);
  });

  it('returns zero effective limit for zero inputs', () => {
    const result = computeCreditScore(baseInput({
      disputeWinRate: 0,
      onTimeRepaymentRate: 0,
      avgQualityScore: 0,
      tenureDays: 0,
    }));
    expect(result.rawScore).toBe(0);
    expect(result.effectiveLimit).toBe(0);
  });

  it('uses default scores when no dispute/repayment history', () => {
    const result = computeCreditScore(baseInput({
      disputeWinRate: null,
      onTimeRepaymentRate: null,
    }));
    expect(result.components.dispute).toBe(200);
    expect(result.components.repayment).toBe(125);
  });

  it('computes multiplier as rawScore/200 when active', () => {
    const result = computeCreditScore(baseInput());
    expect(result.multiplier).toBe(5);
    expect(result.effectiveLimit).toBe(500);
  });

  it('computes 1x multiplier at score 200', () => {
    const result = computeCreditScore(baseInput({
      disputeWinRate: 0.8,
      onTimeRepaymentRate: 0,
      avgQualityScore: 0,
      tenureDays: 0,
    }));
    expect(result.rawScore).toBe(200);
    expect(result.multiplier).toBe(1);
    expect(result.effectiveLimit).toBe(100);
  });

  it('returns zero effective limit when escrowsCompleted < minEscrowsForCredit', () => {
    const result = computeCreditScore(baseInput({ escrowsCompleted: 2 }));
    expect(result.rawScore).toBe(1000);
    expect(result.effectiveLimit).toBe(0);
  });

  it('adds collateral boost to effective limit', () => {
    const result = computeCreditScore(baseInput({ pledgedAmount: 50 }));
    expect(result.collateralBoost).toBe(150);
    expect(result.effectiveLimit).toBe(650);
  });

  it('does not add collateral boost when below min history', () => {
    const result = computeCreditScore(baseInput({ pledgedAmount: 50, escrowsCompleted: 1 }));
    expect(result.effectiveLimit).toBe(0);
  });

  it('is deterministic across calls', () => {
    const input = baseInput({ tenureDays: 90, avgQualityScore: 75, inactiveDays: 10 });
    const a = computeCreditScore(input);
    const b = computeCreditScore(input);
    expect(a).toEqual(b);
  });

  it('applies tenure cap at maxTenureDays', () => {
    const at180 = computeCreditScore(baseInput({ tenureDays: 180 }));
    const at360 = computeCreditScore(baseInput({ tenureDays: 360 }));
    expect(at180.components.tenure).toBe(250);
    expect(at360.components.tenure).toBe(250);
  });

  it('scales tenure linearly below cap', () => {
    const result = computeCreditScore(baseInput({ tenureDays: 90 }));
    expect(result.components.tenure).toBe(125);
  });

  it('clamps disputeWinRate > 1 to 1', () => {
    const result = computeCreditScore(baseInput({ disputeWinRate: 2.5 }));
    expect(result.components.dispute).toBe(250);
    expect(result.rawScore).toBeLessThanOrEqual(1000);
  });

  it('clamps disputeWinRate < 0 to 0', () => {
    const result = computeCreditScore(baseInput({ disputeWinRate: -1 }));
    expect(result.components.dispute).toBe(0);
  });

  it('clamps avgQualityScore > 100 to 100', () => {
    const result = computeCreditScore(baseInput({ avgQualityScore: 200 }));
    expect(result.components.quality).toBe(250);
  });

  it('clamps avgQualityScore < 0 to 0', () => {
    const result = computeCreditScore(baseInput({ avgQualityScore: -50 }));
    expect(result.components.quality).toBe(0);
  });

  it('handles NaN disputeWinRate by clamping to 0', () => {
    const result = computeCreditScore(baseInput({ disputeWinRate: NaN }));
    expect(result.components.dispute).toBe(0);
  });

  it('handles Infinity pledgedAmount by clamping to 0', () => {
    const result = computeCreditScore(baseInput({ pledgedAmount: Infinity }));
    expect(result.collateralBoost).toBe(0);
  });

  it('handles NaN pledgedAmount by returning 0 boost', () => {
    const result = computeCreditScore(baseInput({ pledgedAmount: NaN }));
    expect(result.collateralBoost).toBe(0);
  });

  it('handles negative pledgedAmount by clamping to 0', () => {
    const result = computeCreditScore(baseInput({ pledgedAmount: -100 }));
    expect(result.collateralBoost).toBe(0);
  });

  it('handles NaN tierBaseLimit', () => {
    const result = computeCreditScore(baseInput({ tierBaseLimit: NaN }));
    expect(result.effectiveLimit).toBe(0);
  });

  it('handles negative tenureDays by clamping to 0', () => {
    const result = computeCreditScore(baseInput({ tenureDays: -30 }));
    expect(result.components.tenure).toBe(0);
  });

  it('handles fractional escrowsCompleted by flooring', () => {
    const result = computeCreditScore(baseInput({ escrowsCompleted: 2.9 }));
    expect(result.effectiveLimit).toBe(0);
  });

  it('rawScore never exceeds 1000', () => {
    const result = computeCreditScore(baseInput({
      disputeWinRate: 1,
      onTimeRepaymentRate: 1,
      avgQualityScore: 100,
      tenureDays: 999,
    }));
    expect(result.rawScore).toBe(1000);
  });

  it('applies custom scoring weights', () => {
    const result = computeCreditScore(baseInput({
      weights: { disputeHistory: 0.5, paymentHistory: 0.25, escrowOutcomes: 0.25, tenure: 0 },
    }));
    expect(result.components.dispute).toBe(500);
    expect(result.components.repayment).toBe(250);
    expect(result.components.quality).toBe(250);
    expect(result.components.tenure).toBe(0);
    expect(result.rawScore).toBe(1000);
  });

  it('normalizes weights that do not sum to 1', () => {
    const result = computeCreditScore(baseInput({
      weights: { disputeHistory: 1, paymentHistory: 1, escrowOutcomes: 1, tenure: 1 },
    }));
    expect(result.rawScore).toBe(1000);
  });
});

describe('computeAgingPenalty', () => {
  it('returns 1 for zero inactive days', () => {
    expect(computeAgingPenalty(0, 30)).toBe(1);
  });

  it('returns 0.5 at half-life', () => {
    const penalty = computeAgingPenalty(30, 30);
    expect(penalty).toBeCloseTo(0.5, 10);
  });

  it('returns 0.25 at 2x half-life', () => {
    const penalty = computeAgingPenalty(60, 30);
    expect(penalty).toBeCloseTo(0.25, 10);
  });

  it('approaches zero for large inactive periods', () => {
    const penalty = computeAgingPenalty(300, 30);
    expect(penalty).toBeLessThan(0.001);
  });

  it('returns 1 for negative inactive days', () => {
    expect(computeAgingPenalty(-5, 30)).toBe(1);
  });

  it('returns 0 for zero halfLifeDays', () => {
    expect(computeAgingPenalty(10, 0)).toBe(0);
  });

  it('returns 0 for negative halfLifeDays', () => {
    expect(computeAgingPenalty(10, -5)).toBe(0);
  });

  it('returns 1 for NaN inactiveDays', () => {
    expect(computeAgingPenalty(NaN, 30)).toBe(1);
  });

  it('returns 0 for NaN halfLifeDays', () => {
    expect(computeAgingPenalty(10, NaN)).toBe(0);
  });

  it('returns 1 for Infinity inactiveDays', () => {
    expect(computeAgingPenalty(Infinity, 30)).toBe(1);
  });
});

describe('computeCollateralBoost', () => {
  it('returns zero for zero pledged', () => {
    expect(computeCollateralBoost(0, 3)).toBe(0);
  });

  it('multiplies pledged by multiplier', () => {
    expect(computeCollateralBoost(100, 3)).toBe(300);
  });

  it('works with fractional amounts', () => {
    expect(computeCollateralBoost(33.33, 3)).toBeCloseTo(99.99);
  });

  it('returns 0 for NaN pledged', () => {
    expect(computeCollateralBoost(NaN, 3)).toBe(0);
  });

  it('returns 0 for Infinity pledged', () => {
    expect(computeCollateralBoost(Infinity, 3)).toBe(0);
  });

  it('returns 0 for negative pledged', () => {
    expect(computeCollateralBoost(-50, 3)).toBe(0);
  });

  it('returns 0 for NaN multiplier', () => {
    expect(computeCollateralBoost(100, NaN)).toBe(0);
  });

  it('returns 0 for negative multiplier', () => {
    expect(computeCollateralBoost(100, -1)).toBe(0);
  });
});

describe('DEFAULT_SCORING_CONFIG', () => {
  it('has expected defaults', () => {
    expect(DEFAULT_SCORING_CONFIG.halfLifeDays).toBe(30);
    expect(DEFAULT_SCORING_CONFIG.maxTenureDays).toBe(180);
    expect(DEFAULT_SCORING_CONFIG.collateralMultiplier).toBe(3);
    expect(DEFAULT_SCORING_CONFIG.minEscrowsForCredit).toBe(3);
  });
});
