import type { CreditScoringWeights } from './v2/types';

export interface CreditScoringInput {
  disputeWinRate: number | null;
  onTimeRepaymentRate: number | null;
  avgQualityScore: number;
  tenureDays: number;
  inactiveDays: number;
  pledgedAmount: number;
  tierBaseLimit: number;
  escrowsCompleted: number;
  halfLifeDays?: number;
  weights?: CreditScoringWeights;
}

export interface CreditScoringOutput {
  rawScore: number;
  agingPenalty: number;
  multiplier: number;
  collateralBoost: number;
  effectiveLimit: number;
  components: {
    dispute: number;
    repayment: number;
    quality: number;
    tenure: number;
  };
}

export interface CreditScoringConfig {
  halfLifeDays: number;
  maxTenureDays: number;
  collateralMultiplier: number;
  minEscrowsForCredit: number;
}

export const DEFAULT_SCORING_CONFIG: CreditScoringConfig = {
  halfLifeDays: 30,
  maxTenureDays: 180,
  collateralMultiplier: 3,
  minEscrowsForCredit: 3,
};

const MAX_RAW_SCORE = 1000;

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

export function computeAgingPenalty(inactiveDays: number, halfLifeDays: number): number {
  if (!Number.isFinite(inactiveDays) || inactiveDays <= 0) return 1;
  if (!Number.isFinite(halfLifeDays) || halfLifeDays <= 0) return 0;
  const decay = Math.LN2 / halfLifeDays;
  return Math.exp(-inactiveDays * decay);
}

export function computeCollateralBoost(pledgedAmount: number, multiplier: number): number {
  if (!Number.isFinite(pledgedAmount) || pledgedAmount < 0) return 0;
  if (!Number.isFinite(multiplier) || multiplier < 0) return 0;
  return pledgedAmount * multiplier;
}

export function computeCreditScore(input: CreditScoringInput): CreditScoringOutput {
  const config: CreditScoringConfig = {
    ...DEFAULT_SCORING_CONFIG,
    halfLifeDays: input.halfLifeDays ?? DEFAULT_SCORING_CONFIG.halfLifeDays,
  };

  const w = input.weights;
  const sum = w ? w.disputeHistory + w.paymentHistory + w.escrowOutcomes + w.tenure : 1;
  const dw = w ? (w.disputeHistory / sum) * MAX_RAW_SCORE : 250;
  const pw = w ? (w.paymentHistory / sum) * MAX_RAW_SCORE : 250;
  const qw = w ? (w.escrowOutcomes / sum) * MAX_RAW_SCORE : 250;
  const tw = w ? (w.tenure / sum) * MAX_RAW_SCORE : 250;

  const disputeRate = input.disputeWinRate !== null ? clamp(input.disputeWinRate, 0, 1) : null;
  const repayRate = input.onTimeRepaymentRate !== null ? clamp(input.onTimeRepaymentRate, 0, 1) : null;
  const quality = clamp(input.avgQualityScore, 0, 100);
  const tenure = clamp(input.tenureDays, 0, Infinity);

  const disputeComponent = disputeRate !== null ? dw * disputeRate : dw * 0.8;
  const repaymentComponent = repayRate !== null ? pw * repayRate : pw * 0.5;

  const qualityComponent = qw * (quality / 100);

  const tenureComponent = tw * Math.min(1, tenure / config.maxTenureDays);

  const rawScore = clamp(
    disputeComponent + repaymentComponent + qualityComponent + tenureComponent,
    0,
    MAX_RAW_SCORE
  );

  const agingPenalty = computeAgingPenalty(input.inactiveDays, config.halfLifeDays);

  const multiplier = (rawScore / 200) * agingPenalty;

  const pledged = clamp(input.pledgedAmount, 0, Infinity);
  const collateralBoost = computeCollateralBoost(pledged, config.collateralMultiplier);

  const escrows = Math.max(0, Math.floor(input.escrowsCompleted || 0));
  let effectiveLimit: number;
  if (escrows < config.minEscrowsForCredit) {
    effectiveLimit = 0;
  } else {
    const baseLimit = clamp(input.tierBaseLimit, 0, Infinity);
    effectiveLimit = (baseLimit * multiplier) + collateralBoost;
  }

  return {
    rawScore,
    agingPenalty,
    multiplier,
    collateralBoost,
    effectiveLimit,
    components: {
      dispute: disputeComponent,
      repayment: repaymentComponent,
      quality: qualityComponent,
      tenure: tenureComponent,
    },
  };
}
