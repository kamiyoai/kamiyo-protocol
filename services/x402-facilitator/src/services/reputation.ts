import { TrustTier, VolumeTier, ReputationRecord } from '../types';

const VOLUME_TIERS: VolumeTier[] = [
  { name: 'starter', minMonthlyVolume: 0, discountPct: 0 },
  { name: 'growth', minMonthlyVolume: 1_000, discountPct: 25 },
  { name: 'scale', minMonthlyVolume: 10_000, discountPct: 50 },
  { name: 'enterprise', minMonthlyVolume: 100_000, discountPct: 75 },
];

const REPUTATION_DISCOUNT_THRESHOLD = 900;
const REPUTATION_DISCOUNT_PCT = 20;

export function calculateReputationScore(
  totalTransactions: number,
  disputesFiled: number,
  disputesWon: number,
  averageQuality: number
): number {
  if (totalTransactions === 0) return 500;

  const txScore = Math.min(totalTransactions, 100) * 5;

  let disputeScore = 150;
  if (disputesFiled > 0) {
    const winRate = (disputesWon / disputesFiled) * 100;
    disputeScore = Math.min(winRate * 3, 300);
  }

  const qualityScore = Math.min(averageQuality * 2, 200);

  return Math.min(txScore + disputeScore + qualityScore, 1000);
}

export function getTrustTier(score: number): TrustTier {
  if (score < 200) return 'untrusted';
  if (score < 350) return 'new';
  if (score < 500) return 'basic';
  if (score < 700) return 'good';
  if (score < 850) return 'excellent';
  return 'trusted';
}

export function getVolumeTier(monthlyVolume: number): VolumeTier {
  for (let i = VOLUME_TIERS.length - 1; i >= 0; i--) {
    if (monthlyVolume >= VOLUME_TIERS[i].minMonthlyVolume) return VOLUME_TIERS[i];
  }
  return VOLUME_TIERS[0];
}

export function calculateFeeDiscountPct(reputationScore: number, monthlyVolume: number): number {
  const volumeTier = getVolumeTier(monthlyVolume);
  let pct = volumeTier.discountPct;

  if (reputationScore >= REPUTATION_DISCOUNT_THRESHOLD) {
    pct += REPUTATION_DISCOUNT_PCT;
  }

  return Math.min(pct, 100);
}

export function applyDiscount(baseFeeBps: number, discountPct: number): number {
  const discountedBps = baseFeeBps - Math.floor((baseFeeBps * discountPct) / 100);
  return Math.max(discountedBps, 1);
}

export function buildReputationRecord(
  wallet: string,
  stats: {
    totalTransactions: number;
    disputesFiled: number;
    disputesWon: number;
    disputesLost: number;
    averageQuality: number;
    monthlyVolume: number;
  }
): ReputationRecord {
  const score = calculateReputationScore(
    stats.totalTransactions,
    stats.disputesFiled,
    stats.disputesWon,
    stats.averageQuality
  );
  const tier = getTrustTier(score);
  const volumeTier = getVolumeTier(stats.monthlyVolume);
  const discountPct = calculateFeeDiscountPct(score, stats.monthlyVolume);

  return {
    wallet,
    totalTransactions: stats.totalTransactions,
    disputesFiled: stats.disputesFiled,
    disputesWon: stats.disputesWon,
    disputesLost: stats.disputesLost,
    averageQuality: stats.averageQuality,
    reputationScore: score,
    trustTier: tier,
    monthlyVolume: stats.monthlyVolume,
    volumeTier: volumeTier.name,
    feeDiscountPct: discountPct,
    updatedAt: new Date(),
  };
}

export { VOLUME_TIERS };
