import { getUserStats, rateSession, getActiveSession, releaseEscrow } from './db';
import { getProtocol, GeneratedProof, TierLevel } from './protocol';
import { getQualifyingTier, getTierThreshold } from '@kamiyo/dark-forest';
import { logger } from './logger';

export interface ReputationScore {
  totalSessions: number;
  avgRating: number;
  tier: 'unrated' | 'bronze' | 'silver' | 'gold' | 'platinum';
  zkProofEligible: boolean;
}

// Re-export for convenience
export { TierLevel, getQualifyingTier, getTierThreshold };

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

export async function getCompanionReputation(): Promise<ReputationScore> {
  const protocol = getProtocol();

  // Try to get on-chain reputation if available
  if (protocol.isInitialized()) {
    const onChainScore = await protocol.getReputation();
    if (onChainScore !== null) {
      // Convert 0-1000 to 0-5 rating
      const avgRating = (onChainScore / 1000) * 5;
      const tier = calculateReputationTier(100, avgRating); // Assume many sessions if on-chain
      return {
        totalSessions: 100, // Placeholder - would need separate tracking
        avgRating,
        tier,
        zkProofEligible: protocol.hasProver() && tier !== 'unrated',
      };
    }
  }

  // Fallback to local stats
  return {
    totalSessions: 0,
    avgRating: 0,
    tier: 'unrated',
    zkProofEligible: protocol.hasProver(),
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

export interface ReputationProofResult {
  commitment: string;
  threshold: number;
  proof: GeneratedProof;
  tier: TierLevel;
}

export async function generateReputationProof(
  userId: string,
  threshold: number
): Promise<ReputationProofResult | null> {
  const protocol = getProtocol();

  if (!protocol.hasProver()) {
    logger.warn('ZK prover not available');
    return null;
  }

  // Get user's reputation score (0-100 scale)
  const rep = getUserReputation(userId);
  const score = Math.round(rep.avgRating * 20); // Convert 5-scale to 100-scale

  if (score < threshold) {
    logger.debug('Score below threshold', { score, threshold });
    return null;
  }

  const proof = await protocol.generateReputationProof(score, threshold);
  if (!proof) return null;

  return {
    commitment: proof.commitment,
    threshold,
    proof,
    tier: getQualifyingTier(score),
  };
}

export async function generateTierProof(
  userId: string,
  tier: TierLevel
): Promise<ReputationProofResult | null> {
  const threshold = getTierThreshold(tier);
  return generateReputationProof(userId, threshold);
}

export function formatReputation(rep: ReputationScore): string {
  if (rep.tier === 'unrated') {
    return 'Unrated (need more sessions)';
  }
  return `${rep.tier.charAt(0).toUpperCase() + rep.tier.slice(1)} | ${rep.avgRating.toFixed(1)}/5 | ${rep.totalSessions} sessions`;
}
