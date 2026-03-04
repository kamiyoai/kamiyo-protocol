import type { KizunaUnderwriteSnapshot } from '../db/queries';

const DAY_MS = 24 * 60 * 60 * 1000;

export type KizunaUnderwriteInput = {
  requestedMicro: bigint;
  outstandingMicro: bigint;
  maxSingleMicro: bigint;
  mandateSingleLimitMicro?: bigint | null;
  snapshot: KizunaUnderwriteSnapshot;
  nowMs?: number;
};

export type KizunaUnderwriteResult = {
  approved: boolean;
  approvedMicro: bigint;
  availableMicro: bigint;
  outstandingMicro: bigint;
  scoreRaw: number;
  reasonCodes: string[];
  tier: 'guarded' | 'standard' | 'trusted';
};

type CreditScoreInput = {
  disputeWinRate: number | null;
  onTimeRepaymentRate: number | null;
  avgQualityScore: number;
  tenureDays: number;
  inactiveDays: number;
  pledgedAmount: number;
  tierBaseLimit: number;
  escrowsCompleted: number;
};

type CreditScoreOutput = {
  rawScore: number;
  effectiveLimit: number;
};

const MAX_RAW_SCORE = 1000;
const MAX_TENURE_DAYS = 180;
const HALF_LIFE_DAYS = 30;
const MIN_ESCROWS_FOR_CREDIT = 3;
const COLLATERAL_MULTIPLIER = 3;

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function computeAgingPenalty(inactiveDays: number, halfLifeDays: number): number {
  if (!Number.isFinite(inactiveDays) || inactiveDays <= 0) return 1;
  if (!Number.isFinite(halfLifeDays) || halfLifeDays <= 0) return 0;
  const decay = Math.LN2 / halfLifeDays;
  return Math.exp(-inactiveDays * decay);
}

function computeCreditScore(input: CreditScoreInput): CreditScoreOutput {
  const disputeRate = input.disputeWinRate !== null ? clamp(input.disputeWinRate, 0, 1) : null;
  const repayRate = input.onTimeRepaymentRate !== null ? clamp(input.onTimeRepaymentRate, 0, 1) : null;
  const quality = clamp(input.avgQualityScore, 0, 100);
  const tenure = clamp(input.tenureDays, 0, Number.POSITIVE_INFINITY);

  const disputeComponent = disputeRate !== null ? 250 * disputeRate : 200;
  const repaymentComponent = repayRate !== null ? 250 * repayRate : 125;
  const qualityComponent = 250 * (quality / 100);
  const tenureComponent = 250 * Math.min(1, tenure / MAX_TENURE_DAYS);

  const rawScore = clamp(
    disputeComponent + repaymentComponent + qualityComponent + tenureComponent,
    0,
    MAX_RAW_SCORE
  );

  const agingPenalty = computeAgingPenalty(input.inactiveDays, HALF_LIFE_DAYS);
  const multiplier = (rawScore / 200) * agingPenalty;
  const collateralBoost = clamp(input.pledgedAmount, 0, Number.POSITIVE_INFINITY) * COLLATERAL_MULTIPLIER;
  const escrows = Math.max(0, Math.floor(input.escrowsCompleted || 0));
  const baseLimit = clamp(input.tierBaseLimit, 0, Number.POSITIVE_INFINITY);
  const effectiveLimit = escrows < MIN_ESCROWS_FOR_CREDIT ? 0 : baseLimit * multiplier + collateralBoost;

  return {
    rawScore,
    effectiveLimit,
  };
}

function clampNonNegative(value: bigint): bigint {
  return value >= 0n ? value : 0n;
}

function toSafeNumber(value: bigint): number {
  if (value <= 0n) return 0;
  const max = BigInt(Number.MAX_SAFE_INTEGER);
  return Number(value > max ? max : value);
}

function tierForScore(scoreRaw: number): 'guarded' | 'standard' | 'trusted' {
  if (scoreRaw >= 700) return 'trusted';
  if (scoreRaw >= 420) return 'standard';
  return 'guarded';
}

export function runKizunaUnderwrite(input: KizunaUnderwriteInput): KizunaUnderwriteResult {
  const now = input.nowMs ?? Date.now();
  const hardCap = input.mandateSingleLimitMicro && input.mandateSingleLimitMicro > 0n
    ? (input.mandateSingleLimitMicro < input.maxSingleMicro ? input.mandateSingleLimitMicro : input.maxSingleMicro)
    : input.maxSingleMicro;

  const disputeWinRate = input.snapshot.disputesFiled > 0
    ? input.snapshot.disputesWon / input.snapshot.disputesFiled
    : null;
  const repaymentRate = input.snapshot.debtsTotal > 0
    ? input.snapshot.debtsClosed / input.snapshot.debtsTotal
    : null;

  const tenureDays = Math.max(0, Math.floor((now - input.snapshot.accountCreatedAt.getTime()) / DAY_MS));
  const inactiveDays = Math.max(0, Math.floor((now - input.snapshot.latestActivityAt.getTime()) / DAY_MS));

  const scoring = computeCreditScore({
    disputeWinRate,
    onTimeRepaymentRate: repaymentRate,
    avgQualityScore: Number.isFinite(input.snapshot.avgQuality) && input.snapshot.avgQuality > 0
      ? input.snapshot.avgQuality
      : 75,
    tenureDays,
    inactiveDays,
    pledgedAmount: 0,
    tierBaseLimit: toSafeNumber(hardCap),
    escrowsCompleted: input.snapshot.settlementsConfirmed,
  });

  const modelLimit = BigInt(Math.floor(Math.max(0, scoring.effectiveLimit)));
  const effectiveLimit = modelLimit < hardCap ? modelLimit : hardCap;
  const outstanding = clampNonNegative(input.outstandingMicro);

  const available = effectiveLimit > outstanding
    ? effectiveLimit - outstanding
    : 0n;

  const requested = clampNonNegative(input.requestedMicro);
  const approvedMicro = requested < available ? requested : available;

  const reasonCodes: string[] = [];
  if (requested > hardCap) reasonCodes.push('hard_cap_exceeded');
  if (modelLimit <= 0n) reasonCodes.push('model_limit_zero');
  if (available <= 0n) reasonCodes.push('no_available_credit');
  if (approvedMicro > 0n && approvedMicro < requested) reasonCodes.push('partial_approval');
  if (reasonCodes.length === 0) reasonCodes.push('approved');

  const scoreRaw = Math.round(scoring.rawScore);

  return {
    approved: approvedMicro > 0n,
    approvedMicro,
    availableMicro: available,
    outstandingMicro: outstanding,
    scoreRaw,
    reasonCodes,
    tier: tierForScore(scoreRaw),
  };
}
