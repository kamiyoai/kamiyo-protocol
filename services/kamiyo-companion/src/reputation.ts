import { getUserStats, rateSession, getActiveSession, releaseEscrow } from './db';

// Reputation tiers based on aggregate session ratings
export interface ReputationScore {
  totalSessions: number;
  avgRating: number;
  tier: 'unrated' | 'bronze' | 'silver' | 'gold' | 'platinum';
  zkProofEligible: boolean;
}

const REPUTATION_THRESHOLDS = {
  bronze: { minSessions: 5, minRating: 3.0 },
  silver: { minSessions: 20, minRating: 3.5 },
  gold: { minSessions: 50, minRating: 4.0 },
  platinum: { minSessions: 100, minRating: 4.5 },
};

export function calculateReputationTier(totalSessions: number, avgRating: number | null): ReputationScore['tier'] {
  if (!avgRating || totalSessions < REPUTATION_THRESHOLDS.bronze.minSessions) {
    return 'unrated';
  }

  if (totalSessions >= REPUTATION_THRESHOLDS.platinum.minSessions && avgRating >= REPUTATION_THRESHOLDS.platinum.minRating) {
    return 'platinum';
  }
  if (totalSessions >= REPUTATION_THRESHOLDS.gold.minSessions && avgRating >= REPUTATION_THRESHOLDS.gold.minRating) {
    return 'gold';
  }
  if (totalSessions >= REPUTATION_THRESHOLDS.silver.minSessions && avgRating >= REPUTATION_THRESHOLDS.silver.minRating) {
    return 'silver';
  }
  if (avgRating >= REPUTATION_THRESHOLDS.bronze.minRating) {
    return 'bronze';
  }

  return 'unrated';
}

export function getCompanionReputation(): ReputationScore {
  // Aggregate reputation across all users
  // In production, this would query on-chain data
  // For now, we calculate from local DB

  // This is a placeholder - real implementation would aggregate all sessions
  return {
    totalSessions: 0,
    avgRating: 0,
    tier: 'unrated',
    zkProofEligible: false,
  };
}

export function getUserReputation(userId: string): ReputationScore {
  const stats = getUserStats(userId);
  const tier = calculateReputationTier(stats.totalSessions, stats.avgRating);

  return {
    totalSessions: stats.totalSessions,
    avgRating: stats.avgRating || 0,
    tier,
    zkProofEligible: tier !== 'unrated',
  };
}

// Session rating (1-5 scale)
export function submitRating(userId: string, rating: number): { success: boolean; error?: string } {
  if (rating < 1 || rating > 5 || !Number.isInteger(rating)) {
    return { success: false, error: 'Rating must be 1-5' };
  }

  const session = getActiveSession(userId);
  if (!session) {
    return { success: false, error: 'No active session to rate' };
  }

  rateSession(session.id, rating);

  // If session had escrow and rating >= 3, release payment
  if (session.escrow_tx && rating >= 3) {
    releaseEscrow(session.id);
    // In production: trigger on-chain escrow release
  }

  return { success: true };
}

// ZK proof generation for reputation
// This integrates with the existing kamiyo-tetsuo package
export interface ReputationProof {
  proof: string;
  publicInputs: string[];
  threshold: number;
}

export async function generateReputationProof(
  _userId: string,
  _threshold: number
): Promise<ReputationProof | null> {
  // TODO: Integrate with @kamiyo/tetsuo for ZK proof generation
  // This would prove "avgRating >= threshold" without revealing actual rating

  // Placeholder - real implementation would use snarkjs/circom
  console.log('ZK reputation proofs not yet implemented');
  return null;
}

// Format reputation for display
export function formatReputation(rep: ReputationScore): string {
  if (rep.tier === 'unrated') {
    return 'Unrated (need more sessions)';
  }

  const tierEmoji: Record<string, string> = {
    bronze: '',
    silver: '',
    gold: '',
    platinum: '',
  };

  return `${tierEmoji[rep.tier] || ''} ${rep.tier.charAt(0).toUpperCase() + rep.tier.slice(1)} | ${rep.avgRating.toFixed(1)}/5 | ${rep.totalSessions} sessions`;
}
