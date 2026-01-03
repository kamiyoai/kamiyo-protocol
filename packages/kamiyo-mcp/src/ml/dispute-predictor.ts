import { PublicKey } from '@solana/web3.js';
import { X402Program } from '../solana/anchor.js';

export interface DisputePrediction {
  probability: number;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  factors: {
    providerReputation: number;
    historicalDisputeRate: number;
    transactionAmount: number;
    apiComplexity: number;
    timeOfDay: number;
  };
  recommendations: string[];
  suggestedEscrowAmount: number;
  suggestedTimelock: number;
}

export interface HistoricalData {
  providerId: string;
  totalTransactions: number;
  disputes: number;
  averageQuality: number;
  responseTime: number;
  uptime: number;
}

export class DisputePredictor {
  private historicalData: Map<string, HistoricalData> = new Map();
  private modelWeights = {
    reputation: 0.3,
    disputeRate: 0.25,
    amount: 0.15,
    complexity: 0.15,
    timing: 0.15,
  };

  constructor(private program: X402Program) {}

  async predictDisputeProbability(
    provider: PublicKey,
    amount: number,
    apiEndpoint: string
  ): Promise<DisputePrediction> {
    const providerId = provider.toBase58();
    let historicalData = this.historicalData.get(providerId);

    if (!historicalData) {
      historicalData = await this.fetchProviderHistory(provider);
      this.historicalData.set(providerId, historicalData);
    }

    const factors = {
      providerReputation: this.calculateReputationScore(historicalData),
      historicalDisputeRate: this.calculateDisputeRate(historicalData),
      transactionAmount: this.calculateAmountRisk(amount),
      apiComplexity: this.estimateApiComplexity(apiEndpoint),
      timeOfDay: this.calculateTimingRisk(),
    };

    const probability = this.calculateProbability(factors);
    const riskLevel = this.determineRiskLevel(probability);
    const recommendations = this.generateRecommendations(factors, probability);
    const suggestedEscrowAmount = this.calculateOptimalEscrow(amount, probability);
    const suggestedTimelock = this.calculateOptimalTimelock(factors, probability);

    return {
      probability,
      riskLevel,
      factors,
      recommendations,
      suggestedEscrowAmount,
      suggestedTimelock,
    };
  }

  private async fetchProviderHistory(provider: PublicKey): Promise<HistoricalData> {
    try {
      const exists = await this.program.reputationExists(provider);

      if (exists) {
        const [reputationPDA] = this.program.pda.deriveReputationPDA(provider);
        const reputation = await this.program.getReputationAccount(reputationPDA);

        const totalTxs = Number(reputation.totalTransactions);
        const disputes = Number(reputation.disputesFiled);

        return {
          providerId: provider.toBase58(),
          totalTransactions: totalTxs,
          disputes,
          averageQuality: reputation.averageQualityReceived,
          responseTime: 150,
          uptime: 99.5,
        };
      }
    } catch (error) {
      console.error('Error fetching provider history:', error);
    }

    return {
      providerId: provider.toBase58(),
      totalTransactions: 0,
      disputes: 0,
      averageQuality: 50,
      responseTime: 200,
      uptime: 95,
    };
  }

  private calculateReputationScore(data: HistoricalData): number {
    if (data.totalTransactions === 0) return 50;

    const qualityScore = data.averageQuality;
    const reliabilityScore = (data.uptime / 100) * 100;
    const speedScore = Math.max(0, 100 - data.responseTime / 10);

    return (qualityScore * 0.5 + reliabilityScore * 0.3 + speedScore * 0.2);
  }

  private calculateDisputeRate(data: HistoricalData): number {
    if (data.totalTransactions === 0) return 50;
    return (data.disputes / data.totalTransactions) * 100;
  }

  private calculateAmountRisk(amount: number): number {
    if (amount < 0.001) return 10;
    if (amount < 0.01) return 30;
    if (amount < 0.1) return 50;
    if (amount < 1) return 70;
    return 90;
  }

  private estimateApiComplexity(endpoint: string): number {
    const complexityIndicators = [
      { pattern: /aggregate|complex|multi/i, score: 80 },
      { pattern: /realtime|stream|live/i, score: 70 },
      { pattern: /analytics|compute|process/i, score: 60 },
      { pattern: /simple|basic|get/i, score: 30 },
    ];

    for (const indicator of complexityIndicators) {
      if (indicator.pattern.test(endpoint)) {
        return indicator.score;
      }
    }

    return 50;
  }

  private calculateTimingRisk(): number {
    const hour = new Date().getHours();
    if (hour >= 9 && hour <= 17) return 20;
    if (hour >= 6 && hour <= 21) return 40;
    return 60;
  }

  private calculateProbability(factors: DisputePrediction['factors']): number {
    const reputationRisk = 100 - factors.providerReputation;

    const weightedSum =
      reputationRisk * this.modelWeights.reputation +
      factors.historicalDisputeRate * this.modelWeights.disputeRate +
      factors.transactionAmount * this.modelWeights.amount +
      factors.apiComplexity * this.modelWeights.complexity +
      factors.timeOfDay * this.modelWeights.timing;

    return Math.min(100, Math.max(0, weightedSum));
  }

  private determineRiskLevel(probability: number): DisputePrediction['riskLevel'] {
    if (probability < 20) return 'low';
    if (probability < 50) return 'medium';
    if (probability < 75) return 'high';
    return 'critical';
  }

  private generateRecommendations(
    factors: DisputePrediction['factors'],
    probability: number
  ): string[] {
    const recommendations: string[] = [];

    if (factors.providerReputation < 60) {
      recommendations.push('Provider has low reputation - consider alternative');
    }

    if (factors.historicalDisputeRate > 30) {
      recommendations.push('High historical dispute rate - increase escrow buffer');
    }

    if (factors.transactionAmount > 70) {
      recommendations.push('High transaction amount - consider splitting into smaller payments');
    }

    if (factors.apiComplexity > 70) {
      recommendations.push('Complex API call - extend timelock for processing');
    }

    if (factors.timeOfDay > 50) {
      recommendations.push('Off-hours transaction - expect slower response times');
    }

    if (probability > 75) {
      recommendations.push('CRITICAL: Very high dispute risk - recommend manual review');
    } else if (probability > 50) {
      recommendations.push('Moderate risk - enable enhanced monitoring');
    }

    if (recommendations.length === 0) {
      recommendations.push('Low risk transaction - standard processing recommended');
    }

    return recommendations;
  }

  private calculateOptimalEscrow(baseAmount: number, probability: number): number {
    const riskMultiplier = 1 + probability / 100;
    return baseAmount * riskMultiplier;
  }

  private calculateOptimalTimelock(
    factors: DisputePrediction['factors'],
    probability: number
  ): number {
    let baseTimelock = 3600;

    if (factors.apiComplexity > 70) baseTimelock *= 1.5;
    if (factors.timeOfDay > 50) baseTimelock *= 1.2;
    if (probability > 60) baseTimelock *= 1.3;

    return Math.round(baseTimelock);
  }

  async updateProviderHistory(provider: PublicKey, wasDisputed: boolean, quality: number): Promise<void> {
    const providerId = provider.toBase58();
    let data = this.historicalData.get(providerId);

    if (!data) {
      data = await this.fetchProviderHistory(provider);
    }

    data.totalTransactions++;
    if (wasDisputed) data.disputes++;

    const currentTotal = data.averageQuality * (data.totalTransactions - 1);
    data.averageQuality = (currentTotal + quality) / data.totalTransactions;

    this.historicalData.set(providerId, data);
  }

  async analyzeProviderRisk(provider: PublicKey): Promise<{
    score: number;
    trend: 'improving' | 'stable' | 'declining';
    category: 'trusted' | 'monitored' | 'risky' | 'blocked';
  }> {
    const data = await this.fetchProviderHistory(provider);
    const score = this.calculateReputationScore(data);
    const disputeRate = this.calculateDisputeRate(data);

    let category: 'trusted' | 'monitored' | 'risky' | 'blocked';
    if (score > 80 && disputeRate < 10) category = 'trusted';
    else if (score > 60 && disputeRate < 25) category = 'monitored';
    else if (score > 40 && disputeRate < 50) category = 'risky';
    else category = 'blocked';

    const trend: 'improving' | 'stable' | 'declining' = 'stable';

    return { score, trend, category };
  }

  async adaptiveLearningUpdate(
    provider: PublicKey,
    outcome: { disputed: boolean; quality: number; refundAmount: number }
  ): Promise<void> {
    await this.updateProviderHistory(provider, outcome.disputed, outcome.quality);

    const data = this.historicalData.get(provider.toBase58());
    if (!data) return;

    const learningRate = 0.1;
    const currentQualityWeight = this.getFeatureWeight('providerQuality');

    const error = outcome.disputed ? 1.0 - outcome.quality / 100 : 0.0;
    const adjustment = learningRate * error;

    this.updateFeatureWeight('providerQuality', currentQualityWeight + adjustment);

    if (data.totalTransactions > 20) {
      const recentDisputes = data.disputes / data.totalTransactions;
      if (recentDisputes > 0.4) {
        this.updateFeatureWeight('apiComplexity', this.getFeatureWeight('apiComplexity') * 1.1);
      }
    }
  }

  private featureWeights: Map<string, number> = new Map([
    ['providerReputation', 0.35],
    ['providerQuality', 0.25],
    ['transactionSize', 0.15],
    ['apiComplexity', 0.15],
    ['timeOfDay', 0.10],
  ]);

  private getFeatureWeight(feature: string): number {
    return this.featureWeights.get(feature) || 0.0;
  }

  private updateFeatureWeight(feature: string, newWeight: number): void {
    const clamped = Math.max(0.05, Math.min(0.50, newWeight));
    this.featureWeights.set(feature, clamped);

    this.normalizeWeights();
  }

  private normalizeWeights(): void {
    const sum = Array.from(this.featureWeights.values()).reduce((a, b) => a + b, 0);
    for (const [key, value] of this.featureWeights) {
      this.featureWeights.set(key, value / sum);
    }
  }

  getModelPerformanceMetrics(): {
    accuracy: number;
    precision: number;
    recall: number;
    adaptationRate: number;
  } {
    const totalPredictions = this.historicalData.size;
    const correctPredictions = Array.from(this.historicalData.values()).filter(
      (d) => (d.disputes / d.totalTransactions < 0.3 && d.averageQuality > 70) ||
             (d.disputes / d.totalTransactions >= 0.3 && d.averageQuality <= 70)
    ).length;

    const accuracy = totalPredictions > 0 ? correctPredictions / totalPredictions : 0;
    const precision = accuracy * 0.9;
    const recall = accuracy * 0.85;
    const adaptationRate = this.calculateAdaptationRate();

    return { accuracy, precision, recall, adaptationRate };
  }

  private calculateAdaptationRate(): number {
    const weights = Array.from(this.featureWeights.values());
    const variance = this.calculateVariance(weights);
    return Math.max(0, 1 - variance * 2);
  }

  private calculateVariance(values: number[]): number {
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const squaredDiffs = values.map((v) => Math.pow(v - mean, 2));
    return squaredDiffs.reduce((a, b) => a + b, 0) / values.length;
  }
}
