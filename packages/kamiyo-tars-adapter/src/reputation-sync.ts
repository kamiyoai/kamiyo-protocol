import { PublicKey, Connection } from '@solana/web3.js';
import {
  TarsRating,
  CombinedReputation,
  TarsAdapterConfig,
  DEFAULT_CONFIG,
  isValidTarsRating,
  TARS_PROGRAM_ID,
} from './types';
import { JobEscrowLinker, deriveAgentPda } from './job-linker';

/**
 * Convert TARS 1-5 star rating to KAMIYO 0-100 reputation scale
 * Formula: (avg_rating - 1) * 25
 * 1 star -> 0, 2 stars -> 25, 3 stars -> 50, 4 stars -> 75, 5 stars -> 100
 */
export function tarsToKamiyoReputation(tarsAvgRating: number): number {
  if (tarsAvgRating < 1) return 0;
  if (tarsAvgRating > 5) return 100;
  return Math.round((tarsAvgRating - 1) * 25);
}

/**
 * Convert KAMIYO quality score (0-100) to TARS rating (1-5)
 * Quality >= 80: 5 stars (excellent work)
 * Quality 65-79: 4 stars (good work)
 * Quality 50-64: 3 stars (acceptable)
 * Quality 25-49: 2 stars (below expectations)
 * Quality < 25: 1 star (unacceptable)
 */
export function kamiyoToTarsRating(qualityScore: number): TarsRating {
  if (qualityScore >= 80) return 5;
  if (qualityScore >= 65) return 4;
  if (qualityScore >= 50) return 3;
  if (qualityScore >= 25) return 2;
  return 1;
}

/**
 * Convert KAMIYO reputation (0-100) to TARS-equivalent rating (1-5)
 * Used for consistent display across both systems
 */
export function kamiyoReputationToDisplayRating(reputation: number): number {
  if (reputation <= 0) return 1;
  if (reputation >= 100) return 5;
  return 1 + (reputation / 25);
}

/**
 * Aggregate reputation from both KAMIYO and TARS sources
 * Uses configurable weights (default: 70% KAMIYO, 30% TARS)
 */
export function aggregateCombinedReputation(
  kamiyoReputation: number,
  tarsReputation: number,
  weights: { kamiyo: number; tars: number } = DEFAULT_CONFIG.reputationWeight
): number {
  const normalizedKamiyo = Math.max(0, Math.min(100, kamiyoReputation));
  const normalizedTars = Math.max(0, Math.min(100, tarsReputation));

  const totalWeight = weights.kamiyo + weights.tars;
  if (totalWeight === 0) return 0;

  return Math.round(
    (normalizedKamiyo * weights.kamiyo + normalizedTars * weights.tars) / totalWeight
  );
}

export interface ReputationSyncConfig {
  connection: Connection;
  tarsProgramId?: PublicKey;
  kamiyoProgramId?: PublicKey;
  weights?: { kamiyo: number; tars: number };
  onReputationUpdate?: (combined: CombinedReputation) => void;
}

export class ReputationSyncService {
  private connection: Connection;
  private tarsProgramId: PublicKey;
  private kamiyoProgramId: PublicKey;
  private weights: { kamiyo: number; tars: number };
  private onReputationUpdate?: (combined: CombinedReputation) => void;
  private linker: JobEscrowLinker;
  private subscriptionIds: Map<string, number> = new Map();

  constructor(config: ReputationSyncConfig) {
    this.connection = config.connection;
    this.tarsProgramId = config.tarsProgramId || TARS_PROGRAM_ID;
    this.kamiyoProgramId = config.kamiyoProgramId || new PublicKey('8sUnNU6WBD2SYapCE12S7LwH1b8zWoniytze7ifWwXCM');
    this.weights = config.weights || DEFAULT_CONFIG.reputationWeight;
    this.onReputationUpdate = config.onReputationUpdate;
    this.linker = new JobEscrowLinker({
      connection: config.connection,
      tarsProgramId: this.tarsProgramId,
    });
  }

  async getCombinedReputation(agentWallet: PublicKey): Promise<CombinedReputation> {
    const tarsAgent = await this.linker.fetchTarsAgent(agentWallet);

    const tarsRating = tarsAgent?.avgRating ?? 0;
    const tarsReputation = tarsToKamiyoReputation(tarsRating);

    const kamiyoReputation = await this.fetchKamiyoReputation(agentWallet);

    const combinedScore = aggregateCombinedReputation(
      kamiyoReputation,
      tarsReputation,
      this.weights
    );

    return {
      agentWallet,
      kamiyoReputation,
      tarsReputation,
      combinedScore,
      tarsRating,
      tarsJobCount: tarsAgent?.jobCount ?? 0,
      tarsFeedbackCount: tarsAgent?.feedbackCount ?? 0,
    };
  }

  private async fetchKamiyoReputation(agentWallet: PublicKey): Promise<number> {
    // Fetch KAMIYO agent PDA and parse reputation
    // This is a simplified version - actual implementation would use the KAMIYO SDK
    try {
      const [agentPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('agent'), agentWallet.toBuffer()],
        this.kamiyoProgramId
      );

      const accountInfo = await this.connection.getAccountInfo(agentPda);
      if (!accountInfo) return 0;

      // Parse reputation from KAMIYO agent account
      // Reputation is stored as u64 at offset after name and type fields
      // This is simplified - actual parsing depends on account structure
      const data = accountInfo.data;
      if (data.length < 100) return 0;

      // Skip discriminator (8) + owner (32) + name length (4) + name (32 max) + type (1) + stake (8) = ~85
      // Reputation is u64 at variable offset
      // For now, return a default value - real implementation uses KAMIYO SDK
      return 50;
    } catch {
      return 0;
    }
  }

  async watchAgent(agentWallet: PublicKey): Promise<void> {
    const key = agentWallet.toBase58();
    if (this.subscriptionIds.has(key)) return;

    const [tarsAgentPda] = deriveAgentPda(agentWallet, this.tarsProgramId);

    const subscriptionId = this.connection.onAccountChange(
      tarsAgentPda,
      async () => {
        const combined = await this.getCombinedReputation(agentWallet);
        this.onReputationUpdate?.(combined);
      }
    );

    this.subscriptionIds.set(key, subscriptionId);
  }

  async unwatchAgent(agentWallet: PublicKey): Promise<void> {
    const key = agentWallet.toBase58();
    const subscriptionId = this.subscriptionIds.get(key);
    if (subscriptionId !== undefined) {
      await this.connection.removeAccountChangeListener(subscriptionId);
      this.subscriptionIds.delete(key);
    }
  }

  async unwatchAll(): Promise<void> {
    for (const [key, subscriptionId] of this.subscriptionIds) {
      await this.connection.removeAccountChangeListener(subscriptionId);
    }
    this.subscriptionIds.clear();
  }

  setWeights(weights: { kamiyo: number; tars: number }): void {
    this.weights = weights;
  }

  getWeights(): { kamiyo: number; tars: number } {
    return { ...this.weights };
  }
}

export function createReputationSyncService(config: ReputationSyncConfig): ReputationSyncService {
  return new ReputationSyncService(config);
}
