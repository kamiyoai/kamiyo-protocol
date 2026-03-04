import { computeCreditScore } from '@kamiyo-org/x402-client';
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
