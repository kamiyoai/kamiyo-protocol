/**
 * Reputation Management
 */

import { PublicKey } from "@solana/web3.js";
import { MitamaClient } from "./client";
import { EntityReputation, EntityType } from "./types";

/**
 * Reputation Manager - Track and query entity reputation
 */
export class ReputationManager {
  constructor(private client: MitamaClient) {}

  /**
   * Get reputation for an entity
   */
  async get(entity: PublicKey): Promise<EntityReputation | null> {
    return this.client.getReputation(entity);
  }

  /**
   * Get reputation PDA for an entity
   */
  getPDA(entity: PublicKey): PublicKey {
    const [pda] = this.client.getReputationPDA(entity);
    return pda;
  }

  /**
   * Calculate reputation score from metrics
   */
  calculateScore(reputation: EntityReputation): number {
    const total = reputation.totalTransactions.toNumber();
    if (total === 0) return 500; // Default score

    // Transaction volume score (max 500 points)
    const txScore = Math.min(total, 100) * 5;

    // Dispute resolution score (max 300 points)
    const disputesFiled = reputation.disputesFiled.toNumber();
    let disputeScore = 150; // Base score for no disputes

    if (disputesFiled > 0) {
      const disputesWon = reputation.disputesWon.toNumber();
      const winRate = (disputesWon / disputesFiled) * 100;
      disputeScore = Math.min(winRate * 3, 300);
    }

    // Quality score (max 200 points)
    const qualityScore = Math.min(reputation.averageQualityReceived * 2, 200);

    return Math.min(txScore + disputeScore + qualityScore, 1000);
  }

  /**
   * Get trust tier based on reputation score
   */
  getTrustTier(
    score: number
  ): "untrusted" | "new" | "basic" | "good" | "excellent" | "trusted" {
    if (score < 200) return "untrusted";
    if (score < 350) return "new";
    if (score < 500) return "basic";
    if (score < 700) return "good";
    if (score < 850) return "excellent";
    return "trusted";
  }

  /**
   * Get dispute rate percentage
   */
  getDisputeRate(reputation: EntityReputation): number {
    const total = reputation.totalTransactions.toNumber();
    if (total === 0) return 0;

    const disputed = reputation.disputesFiled.toNumber();
    return (disputed / total) * 100;
  }

  /**
   * Get dispute win rate percentage
   */
  getDisputeWinRate(reputation: EntityReputation): number {
    const filed = reputation.disputesFiled.toNumber();
    if (filed === 0) return 0;

    const won = reputation.disputesWon.toNumber();
    return (won / filed) * 100;
  }

  /**
   * Get reputation summary
   */
  getSummary(reputation: EntityReputation): {
    score: number;
    trustTier: string;
    totalTransactions: number;
    disputeRate: number;
    disputeWinRate: number;
    averageQuality: number;
    isReliable: boolean;
  } {
    const score = this.calculateScore(reputation);
    const trustTier = this.getTrustTier(score);
    const disputeRate = this.getDisputeRate(reputation);
    const disputeWinRate = this.getDisputeWinRate(reputation);

    return {
      score,
      trustTier,
      totalTransactions: reputation.totalTransactions.toNumber(),
      disputeRate,
      disputeWinRate,
      averageQuality: reputation.averageQualityReceived,
      isReliable: score >= 500 && disputeRate < 30,
    };
  }

  /**
   * Compare two entities' reputations
   */
  compare(
    a: EntityReputation,
    b: EntityReputation
  ): {
    aScore: number;
    bScore: number;
    winner: "a" | "b" | "tie";
    scoreDifference: number;
  } {
    const aScore = this.calculateScore(a);
    const bScore = this.calculateScore(b);
    const scoreDifference = Math.abs(aScore - bScore);

    let winner: "a" | "b" | "tie";
    if (aScore > bScore) {
      winner = "a";
    } else if (bScore > aScore) {
      winner = "b";
    } else {
      winner = "tie";
    }

    return {
      aScore,
      bScore,
      winner,
      scoreDifference,
    };
  }

  /**
   * Get entity type label
   */
  getEntityTypeLabel(type: EntityType): string {
    switch (type) {
      case EntityType.Agent:
        return "Agent";
      case EntityType.Provider:
        return "Provider";
      default:
        return "Unknown";
    }
  }

  /**
   * Format reputation for display
   */
  formatReputation(reputation: EntityReputation): string {
    const summary = this.getSummary(reputation);
    return [
      `Score: ${summary.score}/1000 (${summary.trustTier})`,
      `Transactions: ${summary.totalTransactions}`,
      `Dispute Rate: ${summary.disputeRate.toFixed(1)}%`,
      `Quality: ${summary.averageQuality}%`,
      `Reliable: ${summary.isReliable ? "Yes" : "No"}`,
    ].join("\n");
  }
}
