import { PublicKey } from '@solana/web3.js';
import { X402Program } from '../solana/anchor.js';

export interface GetApiReputationParams {
  apiProvider: string; // API provider wallet address
}

export interface GetApiReputationResult {
  success: boolean;
  reputationScore?: number; // 0-1000
  totalTransactions?: number;
  disputesFiled?: number;
  disputesWon?: number;
  disputesPartial?: number;
  disputesLost?: number;
  averageQualityReceived?: number; // 0-100
  recommendation?: 'trusted' | 'caution' | 'avoid';
  lastUpdated?: number; // Unix timestamp
  error?: string;
}

/**
 * Get reputation score for an API provider
 *
 * Returns on-chain reputation data including transaction history,
 * dispute outcomes, and quality metrics.
 */
export async function getApiReputation(
  params: GetApiReputationParams,
  program: X402Program
): Promise<GetApiReputationResult> {
  try {
    // Parse API provider public key
    const apiProviderPubkey = new PublicKey(params.apiProvider);

    // Check if reputation account exists
    const exists = await program.reputationExists(apiProviderPubkey);

    if (!exists) {
      return {
        success: true,
        reputationScore: 500, // Default medium score for new providers
        totalTransactions: 0,
        disputesFiled: 0,
        disputesWon: 0,
        disputesPartial: 0,
        disputesLost: 0,
        averageQualityReceived: 0,
        recommendation: 'caution',
        lastUpdated: 0,
      };
    }

    // Fetch reputation account
    const [reputationPDA] = program.pda.deriveReputationPDA(apiProviderPubkey);
    const reputation = await program.getReputationAccount(reputationPDA);

    const reputationScore = Number(reputation.reputationScore);
    const totalTransactions = Number(reputation.totalTransactions);
    const disputesFiled = Number(reputation.disputesFiled);
    const disputesWon = Number(reputation.disputesWon);
    const disputesPartial = Number(reputation.disputesPartial);
    const disputesLost = Number(reputation.disputesLost);
    const averageQualityReceived = Number(reputation.averageQualityReceived);
    const lastUpdated = Number(reputation.lastUpdated);

    // Calculate recommendation based on reputation score and dispute history
    let recommendation: 'trusted' | 'caution' | 'avoid';

    if (totalTransactions < 5) {
      // New provider, recommend caution
      recommendation = 'caution';
    } else if (reputationScore >= 750 && averageQualityReceived >= 80) {
      // High reputation, high quality
      recommendation = 'trusted';
    } else if (reputationScore >= 500 && averageQualityReceived >= 60) {
      // Medium reputation, acceptable quality
      recommendation = 'caution';
    } else {
      // Low reputation or poor quality
      recommendation = 'avoid';
    }

    // Additional check: if dispute loss rate is high, recommend avoid
    if (totalTransactions > 0) {
      const disputeLossRate = (disputesLost * 100) / totalTransactions;
      if (disputeLossRate > 30) {
        recommendation = 'avoid';
      }
    }

    return {
      success: true,
      reputationScore,
      totalTransactions,
      disputesFiled,
      disputesWon,
      disputesPartial,
      disputesLost,
      averageQualityReceived,
      recommendation,
      lastUpdated,
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Failed to fetch API reputation',
    };
  }
}

/**
 * Get reputation for the current agent (wallet)
 */
export async function getAgentReputation(
  program: X402Program
): Promise<GetApiReputationResult> {
  const agentPubkey = program.program.provider.publicKey!;
  return getApiReputation({ apiProvider: agentPubkey.toBase58() }, program);
}

/**
 * Initialize reputation account if it doesn't exist
 */
export async function initializeReputation(
  entity: PublicKey,
  program: X402Program
): Promise<{ success: boolean; signature?: string; error?: string }> {
  try {
    const exists = await program.reputationExists(entity);

    if (exists) {
      return {
        success: true,
        signature: undefined,
      };
    }

    const result = await program.initReputation(entity);

    return {
      success: true,
      signature: result.signature,
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Failed to initialize reputation',
    };
  }
}
