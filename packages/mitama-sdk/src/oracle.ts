/**
 * Oracle Management - Multi-Oracle Consensus
 */

import { PublicKey } from "@solana/web3.js";
import { MitamaClient } from "./client";
import {
  OracleRegistry,
  OracleConfig,
  OracleType,
  MAX_ORACLES,
  MIN_CONSENSUS_ORACLES,
  MAX_SCORE_DEVIATION,
} from "./types";

/**
 * Oracle Manager - Manage oracle registry and consensus
 */
export class OracleManager {
  constructor(private client: MitamaClient) {}

  /**
   * Get the oracle registry
   */
  async getRegistry(): Promise<OracleRegistry | null> {
    return this.client.getOracleRegistry();
  }

  /**
   * Get all registered oracles
   */
  async getOracles(): Promise<OracleConfig[]> {
    const registry = await this.getRegistry();
    return registry?.oracles ?? [];
  }

  /**
   * Check if an oracle is registered
   */
  async isRegistered(oracle: PublicKey): Promise<boolean> {
    const oracles = await this.getOracles();
    return oracles.some((o) => o.pubkey.equals(oracle));
  }

  /**
   * Get oracle registry PDA
   */
  getRegistryPDA(): PublicKey {
    const [pda] = this.client.getOracleRegistryPDA();
    return pda;
  }

  /**
   * Calculate consensus score from multiple oracle submissions
   */
  calculateConsensus(
    scores: number[],
    maxDeviation: number = MAX_SCORE_DEVIATION
  ): { consensusScore: number; validScores: number[]; outliers: number[] } {
    if (scores.length < MIN_CONSENSUS_ORACLES) {
      throw new Error(
        `At least ${MIN_CONSENSUS_ORACLES} oracle submissions required for consensus`
      );
    }

    // Sort scores for median calculation
    const sorted = [...scores].sort((a, b) => a - b);

    // Calculate median
    const midIndex = Math.floor(sorted.length / 2);
    const median =
      sorted.length % 2 === 0
        ? (sorted[midIndex - 1] + sorted[midIndex]) / 2
        : sorted[midIndex];

    // Filter scores within deviation of median
    const validScores: number[] = [];
    const outliers: number[] = [];

    for (const score of sorted) {
      if (Math.abs(score - median) <= maxDeviation) {
        validScores.push(score);
      } else {
        outliers.push(score);
      }
    }

    if (validScores.length < MIN_CONSENSUS_ORACLES) {
      throw new Error("No consensus reached - too many outlier scores");
    }

    // Consensus score is median of valid scores
    const validMidIndex = Math.floor(validScores.length / 2);
    const consensusScore = validScores[validMidIndex];

    return {
      consensusScore,
      validScores,
      outliers,
    };
  }

  /**
   * Calculate weighted consensus score
   */
  calculateWeightedConsensus(
    submissions: Array<{ score: number; weight: number }>
  ): number {
    if (submissions.length === 0) {
      throw new Error("No submissions provided");
    }

    const totalWeight = submissions.reduce((sum, s) => sum + s.weight, 0);
    const weightedSum = submissions.reduce(
      (sum, s) => sum + s.score * s.weight,
      0
    );

    return Math.round(weightedSum / totalWeight);
  }

  /**
   * Validate oracle count
   */
  validateOracleCount(currentCount: number): void {
    if (currentCount >= MAX_ORACLES) {
      throw new Error(`Maximum of ${MAX_ORACLES} oracles allowed`);
    }
  }

  /**
   * Get oracle type label
   */
  getOracleTypeLabel(type: OracleType): string {
    switch (type) {
      case OracleType.Ed25519:
        return "Ed25519 Signature";
      case OracleType.Switchboard:
        return "Switchboard";
      case OracleType.Custom:
        return "Custom";
      default:
        return "Unknown";
    }
  }

  /**
   * Validate quality score
   */
  validateQualityScore(score: number): void {
    if (score < 0 || score > 100) {
      throw new Error("Quality score must be between 0 and 100");
    }
  }

  /**
   * Format consensus result for display
   */
  formatConsensusResult(result: {
    consensusScore: number;
    validScores: number[];
    outliers: number[];
  }): string {
    const lines = [
      `Consensus Score: ${result.consensusScore}`,
      `Valid Scores: ${result.validScores.join(", ")}`,
    ];

    if (result.outliers.length > 0) {
      lines.push(`Outliers (excluded): ${result.outliers.join(", ")}`);
    }

    return lines.join("\n");
  }
}
