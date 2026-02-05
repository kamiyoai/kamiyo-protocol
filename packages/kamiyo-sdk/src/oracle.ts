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

export const MIN_ORACLE_STAKE = LAMPORTS_PER_SOL / 2;
export const ORACLE_WITHDRAWAL_COOLDOWN = 7 * 24 * 60 * 60;

function webCrypto(): typeof globalThis.crypto {
  const c = globalThis.crypto;
  if (!c || !c.getRandomValues || !c.subtle) {
    throw new Error("WebCrypto API is not available in this runtime");
  }
  return c;
}

function medianOfSorted(values: number[]): number {
  const n = values.length;
  const mid = Math.floor(n / 2);
  if (n % 2 === 1) return values[mid];
  return (values[mid - 1] + values[mid]) / 2;
}

function lamportsToSolString(v: BN): string {
  const lamports = BigInt(v.toString());
  const whole = lamports / BigInt(LAMPORTS_PER_SOL);
  const frac = lamports % BigInt(LAMPORTS_PER_SOL);
  const fracStr = frac.toString().padStart(9, "0").replace(/0+$/, "");
  return fracStr.length ? `${whole}.${fracStr}` : `${whole}.0`;
}

export class OracleManager {
  constructor(private client: KamiyoClient) {}

  async getRegistry(): Promise<OracleRegistry | null> {
    return this.client.getOracleRegistry();
  }

  async getOracles(): Promise<OracleConfig[]> {
    const registry = await this.getRegistry();
    return registry?.oracles ?? [];
  }

  async isRegistered(oracle: PublicKey): Promise<boolean> {
    const oracles = await this.getOracles();
    return oracles.some((o) => o.pubkey.equals(oracle));
  }

  getRegistryPDA(): PublicKey {
    const [pda] = this.client.getOracleRegistryPDA();
    return pda;
  }

  calculateConsensus(
    scores: number[],
    maxDeviation: number = MAX_SCORE_DEVIATION
  ): { consensusScore: number; validScores: number[]; outliers: number[] } {
    if (scores.length < MIN_CONSENSUS_ORACLES) {
      throw new Error(`At least ${MIN_CONSENSUS_ORACLES} submissions required`);
    }

    const sorted = [...scores].sort((a, b) => a - b);
    const med = medianOfSorted(sorted);

    const valid: number[] = [];
    const outliers: number[] = [];
    for (const s of sorted) (Math.abs(s - med) <= maxDeviation ? valid : outliers).push(s);

    if (valid.length < MIN_CONSENSUS_ORACLES) {
      throw new Error("No consensus - insufficient in-range submissions");
    }

    const consensusScore = medianOfSorted(valid);
    return { consensusScore, validScores: valid, outliers };
  }

  calculateWeightedConsensus(
    submissions: Array<{ score: number; weight: number }>
  ): number {
    if (submissions.length === 0) throw new Error("No submissions provided");

    for (const s of submissions) {
      if (!Number.isFinite(s.weight) || s.weight <= 0) {
        throw new Error("Weights must be positive");
      }
      if (!Number.isFinite(s.score)) {
        throw new Error("Invalid score");
      }
    }

    const totalWeight = submissions.reduce((sum, s) => sum + s.weight, 0);
    if (totalWeight <= 0) throw new Error("Total weight must be > 0");

    const weightedSum = submissions.reduce((sum, s) => sum + s.score * s.weight, 0);
    return Math.round(weightedSum / totalWeight);
  }

  validateOracleCount(currentCount: number): void {
    if (currentCount >= MAX_ORACLES) {
      throw new Error(`Maximum of ${MAX_ORACLES} oracles allowed`);
    }
  }

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

  validateQualityScore(score: number): void {
    if (!Number.isFinite(score) || score < 0 || score > 100) {
      throw new Error("Quality score must be 0-100");
    }
  }

  formatConsensusResult(result: {
    consensusScore: number;
    validScores: number[];
    outliers: number[];
  }): string {
    const lines = [
      `Consensus Score: ${result.consensusScore}`,
      `Valid Scores: ${result.validScores.join(", ")}`,
    ];
    if (result.outliers.length > 0) lines.push(`Outliers (excluded): ${result.outliers.join(", ")}`);
    return lines.join("\n");
  }

  async isPublicRegistrationEnabled(): Promise<boolean> {
    const registry = await this.getRegistry();
    return registry?.publicRegistration ?? false;
  }

  async getTotalStake(): Promise<BN> {
    const registry = await this.getRegistry();
    return registry?.totalStake ?? new BN(0);
  }

  async getActiveOracles(): Promise<OracleConfig[]> {
    const oracles = await this.getOracles();
    return oracles.filter((o) => o.status === OracleStatus.Active);
  }

  async getOracle(pubkey: PublicKey): Promise<OracleConfig | undefined> {
    const oracles = await this.getOracles();
    return oracles.find((o) => o.pubkey.equals(pubkey));
  }

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

  calculateSuccessRate(oracle: OracleConfig): number {
    if (oracle.disputesParticipated === 0) return 0;
    return (oracle.consensusVotes / oracle.disputesParticipated) * 100;
    }

  isWithdrawalReady(oracle: OracleConfig): boolean {
    if (oracle.status !== OracleStatus.PendingWithdrawal) return false;
    if (oracle.withdrawalRequestedAt.isZero()) return false;
    const now = Math.floor(Date.now() / 1000);
    const cooldownEnd = oracle.withdrawalRequestedAt.toNumber() + ORACLE_WITHDRAWAL_COOLDOWN;
    return now >= cooldownEnd;
  }

  getWithdrawalAvailableAt(oracle: OracleConfig): Date | null {
    if (oracle.withdrawalRequestedAt.isZero()) return null;
    const cooldownEnd = oracle.withdrawalRequestedAt.toNumber() + ORACLE_WITHDRAWAL_COOLDOWN;
    return new Date(cooldownEnd * 1000);
  }

  validateStakeAmount(lamports: number): void {
    if (!Number.isFinite(lamports) || lamports < MIN_ORACLE_STAKE) {
      throw new Error(`Minimum stake is ${MIN_ORACLE_STAKE / LAMPORTS_PER_SOL} SOL`);
    }
  }

  calculateWeightFromStake(lamports: number): number {
    const weight = Math.floor(lamports / LAMPORTS_PER_SOL);
    return weight > 0 ? weight : 1;
  }

  formatOracleInfo(oracle: OracleConfig): string {
    const lines = [
      `Pubkey: ${oracle.pubkey.toBase58()}`,
      `Status: ${this.getOracleStatusLabel(oracle.status)}`,
      `Type: ${this.getOracleTypeLabel(oracle.oracleType)}`,
      `Weight: ${oracle.weight}`,
      `Stake: ${lamportsToSolString(oracle.stakeAmount)} SOL`,
      `Violations: ${oracle.violationCount}`,
      `Success Rate: ${this.calculateSuccessRate(oracle).toFixed(1)}%`,
      `Disputes: ${oracle.disputesParticipated}`,
      `Total Rewards: ${lamportsToSolString(oracle.totalRewards)} SOL`,
    ];

    if (oracle.status === OracleStatus.PendingWithdrawal) {
      const availableAt = this.getWithdrawalAvailableAt(oracle);
      if (availableAt) lines.push(`Withdrawal Available: ${availableAt.toISOString()}`);
    }

    return lines.join("\n");
  }

  generateSalt(): Uint8Array {
    const c = webCrypto();
    const buf = new Uint8Array(32);
    c.getRandomValues(buf);
    return buf;
  }

  async computeCommitmentHash(
    transactionId: string,
    score: number,
    salt: Uint8Array
  ): Promise<Uint8Array> {
    if (!Number.isInteger(score) || score < 0 || score > 255) throw new Error("score must be 0-255");
    const c = webCrypto();
    const encoder = new TextEncoder();
    const idBytes = encoder.encode(transactionId);

    const data = new Uint8Array(idBytes.length + 1 + salt.length);
    data.set(idBytes, 0);
    data.set([score], idBytes.length);
    data.set(salt, idBytes.length + 1);

    const hashBuffer = await c.subtle.digest("SHA-256", data);
    return new Uint8Array(hashBuffer);
  }

  isInCommitPhase(commitPhaseEndsAt: BN | null): boolean {
    if (!commitPhaseEndsAt) return false;
    const now = Math.floor(Date.now() / 1000);
    return now < commitPhaseEndsAt.toNumber();
  }

  isInRevealPhase(commitPhaseEndsAt: BN | null): boolean {
    if (!commitPhaseEndsAt) return false;
    const now = Math.floor(Date.now() / 1000);
    return now >= commitPhaseEndsAt.toNumber();
  }

  getCommitPhaseTimeRemaining(commitPhaseEndsAt: BN | null): number {
    if (!commitPhaseEndsAt) return 0;
    const now = Math.floor(Date.now() / 1000);
    const remaining = commitPhaseEndsAt.toNumber() - now;
    return remaining > 0 ? remaining : 0;
  }
}
