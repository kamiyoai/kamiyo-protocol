import { getUserStats, rateSession, getActiveSession, releaseEscrow } from './db';

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
  // TODO: aggregate from on-chain data
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
  proofBytes: string;
  groth16Proof?: {
    pi_a: [string, string, string];
    pi_b: [[string, string], [string, string], [string, string]];
    pi_c: [string, string, string];
  };
  publicSignals?: string[];
}

export async function generateReputationProof(
  userId: string,
  threshold: number
): Promise<ReputationProofResult | null> {
  try {
    // Dynamic import to avoid bundling issues
    const { PrivateInference } = await import('@kamiyo/solana-privacy');
    const { Keypair } = await import('@solana/web3.js');

    // Get user's reputation score (0-100 scale)
    const rep = getUserReputation(userId);
    const score = Math.round(rep.avgRating * 20); // Convert 5-scale to 100-scale

    if (score < threshold) {
      console.log(`Score ${score} below threshold ${threshold}`);
      return null;
    }

    // Create a dummy wallet for proof generation (user doesn't need to sign)
    const dummyWallet = {
      publicKey: Keypair.generate().publicKey,
      signTransaction: async (tx: any) => tx,
      signAllTransactions: async (txs: any) => txs,
    };

    const prover = new PrivateInference(dummyWallet as any);
    const proof = await prover.proveReputation({ score, threshold });

    return {
      commitment: proof.commitment,
      threshold: proof.threshold,
      proofBytes: Buffer.from(proof.proofBytes).toString('base64'),
      groth16Proof: proof.groth16Proof,
      publicSignals: proof.publicSignals,
    };
  } catch (err) {
    console.error('ZK proof generation failed:', err);
    return null;
  }
}

export function formatReputation(rep: ReputationScore): string {
  if (rep.tier === 'unrated') {
    return 'Unrated (need more sessions)';
  }
  return `${rep.tier.charAt(0).toUpperCase() + rep.tier.slice(1)} | ${rep.avgRating.toFixed(1)}/5 | ${rep.totalSessions} sessions`;
}
