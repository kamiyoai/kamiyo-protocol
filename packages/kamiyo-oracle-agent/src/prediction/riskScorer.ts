import { Connection, PublicKey } from '@solana/web3.js';
import type { IAgentRuntime } from '../types';
import { getNetworkConfig, PROGRAM_IDS } from '../config';
import { createLogger } from '../lib/logger';

const log = createLogger('risk-scorer');

export interface EscrowRiskScore {
  escrowPda: string;
  riskScore: number; // 0-100, higher = more likely to dispute
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  factors: RiskFactor[];
  recommendation: 'ignore' | 'monitor' | 'pre-gather' | 'alert';
  analyzedAt: number;
}

export interface RiskFactor {
  name: string;
  weight: number;
  value: number;
  contribution: number;
  description: string;
}

export interface EscrowSnapshot {
  pda: string;
  agent: string;
  provider: string;
  amount: number;
  createdAt: number;
  expiresAt: number;
  status: number;
}

export interface PartyHistory {
  pubkey: string;
  totalEscrows: number;
  disputeCount: number;
  disputeRate: number;
  avgResolutionScore: number;
  accountAge: number;
  recentActivity: number;
}

const RISK_WEIGHTS = {
  providerDisputeRate: 25,
  agentDisputeRate: 20,
  escrowAmount: 15,
  timeToExpiry: 10,
  providerAccountAge: 10,
  agentAccountAge: 5,
  historicalSimilarity: 15,
};

export class RiskScorer {
  private connection: Connection;
  private programId: PublicKey;
  private cache: Map<string, { score: EscrowRiskScore; expiry: number }> = new Map();
  private readonly CACHE_TTL_MS = 60000; // 1 minute

  constructor(runtime: IAgentRuntime) {
    const { rpcUrl, network } = getNetworkConfig(runtime);
    this.connection = new Connection(rpcUrl, 'confirmed');
    this.programId = new PublicKey(PROGRAM_IDS[network as keyof typeof PROGRAM_IDS]);
  }

  async scoreEscrow(escrow: EscrowSnapshot): Promise<EscrowRiskScore> {
    // Check cache
    const cached = this.cache.get(escrow.pda);
    if (cached && Date.now() < cached.expiry) {
      return cached.score;
    }

    const factors: RiskFactor[] = [];
    let totalScore = 0;

    // Fetch party histories
    const [agentHistory, providerHistory] = await Promise.all([
      this.getPartyHistory(escrow.agent),
      this.getPartyHistory(escrow.provider),
    ]);

    // Factor 1: Provider dispute rate
    const providerDisputeFactor = this.scoreDisputeRate(
      providerHistory.disputeRate,
      'Provider dispute rate',
      RISK_WEIGHTS.providerDisputeRate
    );
    factors.push(providerDisputeFactor);
    totalScore += providerDisputeFactor.contribution;

    // Factor 2: Agent dispute rate
    const agentDisputeFactor = this.scoreDisputeRate(
      agentHistory.disputeRate,
      'Agent dispute rate',
      RISK_WEIGHTS.agentDisputeRate
    );
    factors.push(agentDisputeFactor);
    totalScore += agentDisputeFactor.contribution;

    // Factor 3: Escrow amount (higher amounts = higher stakes = more disputes)
    const amountFactor = this.scoreAmount(escrow.amount, RISK_WEIGHTS.escrowAmount);
    factors.push(amountFactor);
    totalScore += amountFactor.contribution;

    // Factor 4: Time to expiry (less time = more pressure = more disputes)
    const expiryFactor = this.scoreTimeToExpiry(
      escrow.expiresAt,
      RISK_WEIGHTS.timeToExpiry
    );
    factors.push(expiryFactor);
    totalScore += expiryFactor.contribution;

    // Factor 5: Provider account age (newer = riskier)
    const providerAgeFactor = this.scoreAccountAge(
      providerHistory.accountAge,
      'Provider account age',
      RISK_WEIGHTS.providerAccountAge
    );
    factors.push(providerAgeFactor);
    totalScore += providerAgeFactor.contribution;

    // Factor 6: Agent account age
    const agentAgeFactor = this.scoreAccountAge(
      agentHistory.accountAge,
      'Agent account age',
      RISK_WEIGHTS.agentAccountAge
    );
    factors.push(agentAgeFactor);
    totalScore += agentAgeFactor.contribution;

    // Factor 7: Historical similarity to disputed escrows
    const similarityFactor = await this.scoreSimilarity(
      escrow,
      agentHistory,
      providerHistory
    );
    factors.push(similarityFactor);
    totalScore += similarityFactor.contribution;

    // Normalize to 0-100
    const normalizedScore = Math.min(100, Math.max(0, totalScore));

    const riskLevel = this.categorizeRisk(normalizedScore);
    const recommendation = this.getRecommendation(riskLevel);

    const score: EscrowRiskScore = {
      escrowPda: escrow.pda,
      riskScore: Math.round(normalizedScore),
      riskLevel,
      factors,
      recommendation,
      analyzedAt: Date.now(),
    };

    // Cache result
    this.cache.set(escrow.pda, {
      score,
      expiry: Date.now() + this.CACHE_TTL_MS,
    });

    log.debug('Escrow scored', {
      escrow: escrow.pda.slice(0, 8),
      score: score.riskScore,
      level: score.riskLevel,
    });

    return score;
  }

  async scoreMultiple(escrows: EscrowSnapshot[]): Promise<EscrowRiskScore[]> {
    const results = await Promise.all(
      escrows.map((e) => this.scoreEscrow(e).catch(() => null))
    );
    return results.filter((r): r is EscrowRiskScore => r !== null);
  }

  async getHighRiskEscrows(
    escrows: EscrowSnapshot[],
    threshold: number = 60
  ): Promise<EscrowRiskScore[]> {
    const scores = await this.scoreMultiple(escrows);
    return scores
      .filter((s) => s.riskScore >= threshold)
      .sort((a, b) => b.riskScore - a.riskScore);
  }

  private async getPartyHistory(pubkey: string): Promise<PartyHistory> {
    try {
      const pubkeyObj = new PublicKey(pubkey);

      // Fetch account info for age
      const accountInfo = await this.connection.getAccountInfo(pubkeyObj);
      const signatures = await this.connection.getSignaturesForAddress(pubkeyObj, {
        limit: 100,
      });

      const now = Date.now() / 1000;
      const oldestSig = signatures[signatures.length - 1];
      const accountAge = oldestSig ? now - (oldestSig.blockTime || now) : 0;
      const recentActivity = signatures.filter(
        (s) => s.blockTime && now - s.blockTime < 7 * 24 * 3600
      ).length;

      // Estimate dispute metrics from transaction patterns
      // In production, this would query actual escrow/dispute history
      const totalEscrows = Math.floor(signatures.length / 10);
      const disputeCount = Math.floor(totalEscrows * 0.1); // Estimate 10% dispute rate
      const disputeRate = totalEscrows > 0 ? (disputeCount / totalEscrows) * 100 : 0;

      return {
        pubkey,
        totalEscrows,
        disputeCount,
        disputeRate,
        avgResolutionScore: 50,
        accountAge,
        recentActivity,
      };
    } catch {
      return {
        pubkey,
        totalEscrows: 0,
        disputeCount: 0,
        disputeRate: 0,
        avgResolutionScore: 50,
        accountAge: 0,
        recentActivity: 0,
      };
    }
  }

  private scoreDisputeRate(rate: number, name: string, weight: number): RiskFactor {
    // Higher dispute rate = higher risk
    // 0% = 0 risk, 50%+ = max risk
    const value = Math.min(100, rate * 2);
    const contribution = (value / 100) * weight;

    return {
      name,
      weight,
      value: Math.round(value),
      contribution: Math.round(contribution * 10) / 10,
      description: `${rate.toFixed(1)}% historical dispute rate`,
    };
  }

  private scoreAmount(amount: number, weight: number): RiskFactor {
    // Higher amounts = higher risk (more at stake)
    // <0.1 SOL = low, >10 SOL = high
    const logAmount = Math.log10(Math.max(0.01, amount));
    const value = Math.min(100, Math.max(0, (logAmount + 2) * 25));
    const contribution = (value / 100) * weight;

    return {
      name: 'Escrow amount',
      weight,
      value: Math.round(value),
      contribution: Math.round(contribution * 10) / 10,
      description: `${amount.toFixed(2)} SOL at stake`,
    };
  }

  private scoreTimeToExpiry(expiresAt: number, weight: number): RiskFactor {
    const now = Date.now() / 1000;
    const hoursRemaining = Math.max(0, (expiresAt - now) / 3600);

    // Less time = more risk
    // <1 hour = max risk, >48 hours = low risk
    let value: number;
    if (hoursRemaining < 1) {
      value = 100;
    } else if (hoursRemaining < 6) {
      value = 80;
    } else if (hoursRemaining < 24) {
      value = 50;
    } else if (hoursRemaining < 48) {
      value = 25;
    } else {
      value = 10;
    }

    const contribution = (value / 100) * weight;

    return {
      name: 'Time to expiry',
      weight,
      value,
      contribution: Math.round(contribution * 10) / 10,
      description: `${hoursRemaining.toFixed(1)} hours remaining`,
    };
  }

  private scoreAccountAge(ageSeconds: number, name: string, weight: number): RiskFactor {
    const ageDays = ageSeconds / 86400;

    // Newer accounts = higher risk
    // <7 days = high risk, >90 days = low risk
    let value: number;
    if (ageDays < 7) {
      value = 90;
    } else if (ageDays < 30) {
      value = 60;
    } else if (ageDays < 90) {
      value = 30;
    } else {
      value = 10;
    }

    const contribution = (value / 100) * weight;

    return {
      name,
      weight,
      value,
      contribution: Math.round(contribution * 10) / 10,
      description: `${Math.floor(ageDays)} days old`,
    };
  }

  private async scoreSimilarity(
    escrow: EscrowSnapshot,
    agentHistory: PartyHistory,
    providerHistory: PartyHistory
  ): Promise<RiskFactor> {
    // Compare characteristics to historically disputed escrows
    let similarityScore = 0;

    // New accounts with high-value escrows are suspicious
    if (providerHistory.accountAge < 30 * 86400 && escrow.amount > 1) {
      similarityScore += 30;
    }

    // Agents with high dispute rates on new providers
    if (agentHistory.disputeRate > 20 && providerHistory.totalEscrows < 5) {
      similarityScore += 25;
    }

    // Short expiry with high amount
    const hoursToExpiry = (escrow.expiresAt - Date.now() / 1000) / 3600;
    if (hoursToExpiry < 6 && escrow.amount > 2) {
      similarityScore += 20;
    }

    // Both parties have dispute history
    if (agentHistory.disputeCount > 0 && providerHistory.disputeCount > 0) {
      similarityScore += 15;
    }

    const value = Math.min(100, similarityScore);
    const contribution = (value / 100) * RISK_WEIGHTS.historicalSimilarity;

    return {
      name: 'Historical similarity',
      weight: RISK_WEIGHTS.historicalSimilarity,
      value,
      contribution: Math.round(contribution * 10) / 10,
      description: `Similarity to past disputed escrows`,
    };
  }

  private categorizeRisk(score: number): 'low' | 'medium' | 'high' | 'critical' {
    if (score >= 80) return 'critical';
    if (score >= 60) return 'high';
    if (score >= 40) return 'medium';
    return 'low';
  }

  private getRecommendation(
    level: 'low' | 'medium' | 'high' | 'critical'
  ): 'ignore' | 'monitor' | 'pre-gather' | 'alert' {
    switch (level) {
      case 'critical':
        return 'alert';
      case 'high':
        return 'pre-gather';
      case 'medium':
        return 'monitor';
      default:
        return 'ignore';
    }
  }

  clearCache(): void {
    this.cache.clear();
  }
}
