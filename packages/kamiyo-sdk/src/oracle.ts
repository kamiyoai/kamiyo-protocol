/**
 * Oracle Management - Multi-Oracle Consensus
 */

import { PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import BN from "bn.js";
import { KamiyoClient } from "./client";
import {
  OracleRegistry,
  OracleConfig,
  OracleType,
  OracleStatus,
  MAX_ORACLES,
  MIN_CONSENSUS_ORACLES,
  MAX_SCORE_DEVIATION,
} from "./types";

// Constants
export const MIN_ORACLE_STAKE = LAMPORTS_PER_SOL; // 1 SOL
export const ORACLE_WITHDRAWAL_COOLDOWN = 7 * 24 * 60 * 60; // 7 days in seconds

/**
 * Oracle Manager - Manage oracle registry and consensus
 */
export class OracleManager {
  constructor(private client: KamiyoClient) {}

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

  /**
   * Check if public registration is enabled
   */
  async isPublicRegistrationEnabled(): Promise<boolean> {
    const registry = await this.getRegistry();
    return registry?.publicRegistration ?? false;
  }

  /**
   * Get total stake in the oracle network
   */
  async getTotalStake(): Promise<BN> {
    const registry = await this.getRegistry();
    return registry?.totalStake ?? new BN(0);
  }

  /**
   * Get active oracles (not pending withdrawal or suspended)
   */
  async getActiveOracles(): Promise<OracleConfig[]> {
    const oracles = await this.getOracles();
    return oracles.filter((o) => o.status === OracleStatus.Active);
  }

  /**
   * Get oracle by pubkey
   */
  async getOracle(pubkey: PublicKey): Promise<OracleConfig | undefined> {
    const oracles = await this.getOracles();
    return oracles.find((o) => o.pubkey.equals(pubkey));
  }

  /**
   * Get oracle status label
   */
  getOracleStatusLabel(status: number): string {
    switch (status) {
      case OracleStatus.Active:
        return "Active";
      case OracleStatus.PendingWithdrawal:
        return "Pending Withdrawal";
      case OracleStatus.Suspended:
        return "Suspended";
      default:
        return "Unknown";
    }
  }

  /**
   * Calculate oracle success rate (consensus votes / disputes participated)
   */
  calculateSuccessRate(oracle: OracleConfig): number {
    if (oracle.disputesParticipated === 0) return 0;
    return (oracle.consensusVotes / oracle.disputesParticipated) * 100;
  }

  /**
   * Check if withdrawal cooldown is complete
   */
  isWithdrawalReady(oracle: OracleConfig): boolean {
    if (oracle.status !== OracleStatus.PendingWithdrawal) return false;
    if (oracle.withdrawalRequestedAt.isZero()) return false;

    const now = Math.floor(Date.now() / 1000);
    const cooldownEnd =
      oracle.withdrawalRequestedAt.toNumber() + ORACLE_WITHDRAWAL_COOLDOWN;
    return now >= cooldownEnd;
  }

  /**
   * Get withdrawal available timestamp
   */
  getWithdrawalAvailableAt(oracle: OracleConfig): Date | null {
    if (oracle.withdrawalRequestedAt.isZero()) return null;
    const cooldownEnd =
      oracle.withdrawalRequestedAt.toNumber() + ORACLE_WITHDRAWAL_COOLDOWN;
    return new Date(cooldownEnd * 1000);
  }

  /**
   * Validate stake amount for registration
   */
  validateStakeAmount(lamports: number): void {
    if (lamports < MIN_ORACLE_STAKE) {
      throw new Error(
        `Minimum stake is ${MIN_ORACLE_STAKE / LAMPORTS_PER_SOL} SOL`
      );
    }
  }

  /**
   * Calculate weight from stake (1 weight per SOL)
   */
  calculateWeightFromStake(lamports: number): number {
    const weight = Math.floor(lamports / LAMPORTS_PER_SOL);
    return weight > 0 ? weight : 1;
  }

  /**
   * Format oracle info for display
   */
  formatOracleInfo(oracle: OracleConfig): string {
    const lines = [
      `Pubkey: ${oracle.pubkey.toBase58()}`,
      `Status: ${this.getOracleStatusLabel(oracle.status)}`,
      `Type: ${this.getOracleTypeLabel(oracle.oracleType)}`,
      `Weight: ${oracle.weight}`,
      `Stake: ${oracle.stakeAmount.toNumber() / LAMPORTS_PER_SOL} SOL`,
      `Violations: ${oracle.violationCount}`,
      `Success Rate: ${this.calculateSuccessRate(oracle).toFixed(1)}%`,
      `Disputes: ${oracle.disputesParticipated}`,
      `Total Rewards: ${oracle.totalRewards.toNumber() / LAMPORTS_PER_SOL} SOL`,
    ];

    if (oracle.status === OracleStatus.PendingWithdrawal) {
      const availableAt = this.getWithdrawalAvailableAt(oracle);
      if (availableAt) {
        lines.push(`Withdrawal Available: ${availableAt.toISOString()}`);
      }
    }

    return lines.join("\n");
  }
}
