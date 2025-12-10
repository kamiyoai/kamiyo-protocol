import { PublicKey } from '@solana/web3.js';

export interface EconomicMetrics {
  totalEscrowVolume: number;
  totalDisputes: number;
  averageDisputeResolutionTime: number;
  averageRefundPercentage: number;
  providerReputationDistribution: Map<string, number>;
  qualityScoreDistribution: { bucket: string; count: number }[];
  timeSeriesData: {
    timestamp: number;
    escrows: number;
    disputes: number;
    volume: number;
  }[];
}

export interface AttackSimulation {
  attackType: 'sybil' | 'collusion' | 'frontrunning' | 'reputation_manipulation';
  attackerStrategy: string;
  defenseStrength: number;
  expectedLoss: number;
  recommendation: string;
}

export class EconomicDashboard {
  private metrics: EconomicMetrics = {
    totalEscrowVolume: 0,
    totalDisputes: 0,
    averageDisputeResolutionTime: 0,
    averageRefundPercentage: 0,
    providerReputationDistribution: new Map(),
    qualityScoreDistribution: [],
    timeSeriesData: [],
  };

  updateMetrics(escrow: any, dispute: any, resolution: any): void {
    this.metrics.totalEscrowVolume += escrow?.amount || 0;
    if (dispute) this.metrics.totalDisputes++;

    if (resolution) {
      const currentTotal =
        this.metrics.averageDisputeResolutionTime * (this.metrics.totalDisputes - 1);
      this.metrics.averageDisputeResolutionTime =
        (currentTotal + resolution.durationMs) / this.metrics.totalDisputes;

      const refundTotal =
        this.metrics.averageRefundPercentage * (this.metrics.totalDisputes - 1);
      this.metrics.averageRefundPercentage =
        (refundTotal + resolution.refundPercentage) / this.metrics.totalDisputes;
    }

    this.updateTimeSeries(escrow, dispute);
  }

  private updateTimeSeries(escrow: any, dispute: any): void {
    const now = Date.now();
    const hourBucket = Math.floor(now / (1000 * 60 * 60)) * (1000 * 60 * 60);

    let bucket = this.metrics.timeSeriesData.find((d) => d.timestamp === hourBucket);

    if (!bucket) {
      bucket = { timestamp: hourBucket, escrows: 0, disputes: 0, volume: 0 };
      this.metrics.timeSeriesData.push(bucket);

      if (this.metrics.timeSeriesData.length > 168) {
        this.metrics.timeSeriesData.shift();
      }
    }

    if (escrow) {
      bucket.escrows++;
      bucket.volume += escrow.amount || 0;
    }
    if (dispute) {
      bucket.disputes++;
    }
  }

  getMetrics(): EconomicMetrics {
    return { ...this.metrics };
  }

  simulateAttack(attackType: AttackSimulation['attackType']): AttackSimulation {
    switch (attackType) {
      case 'sybil':
        return this.simulateSybilAttack();
      case 'collusion':
        return this.simulateCollusionAttack();
      case 'frontrunning':
        return this.simulateFrontrunningAttack();
      case 'reputation_manipulation':
        return this.simulateReputationManipulation();
      default:
        throw new Error(`Unknown attack type: ${attackType}`);
    }
  }

  private simulateSybilAttack(): AttackSimulation {
    const baseCost = 0.001;
    const reputationCost = 0.1;
    const attackerNodes = 100;

    const totalCost = attackerNodes * (baseCost + reputationCost);
    const expectedGain = attackerNodes * 0.05;

    const defenseStrength = reputationCost > expectedGain ? 85 : 45;

    return {
      attackType: 'sybil',
      attackerStrategy: `Create ${attackerNodes} fake identities to manipulate reputation`,
      defenseStrength,
      expectedLoss: Math.max(0, expectedGain - totalCost),
      recommendation:
        defenseStrength > 70
          ? 'Current reputation staking provides strong Sybil resistance'
          : 'Increase reputation stake requirements',
    };
  }

  private simulateCollusionAttack(): AttackSimulation {
    const collusionSize = 10;
    const fakeTransactions = 50;
    const costPerTx = 0.001;

    const totalCost = collusionSize * fakeTransactions * costPerTx;
    const reputationGain = fakeTransactions * 0.5;
    const exploitValue = reputationGain * 0.1;

    const defenseStrength = totalCost > exploitValue ? 75 : 40;

    return {
      attackType: 'collusion',
      attackerStrategy: 'Collude with ${collusionSize} agents to inflate reputation',
      defenseStrength,
      expectedLoss: Math.max(0, exploitValue - totalCost),
      recommendation:
        defenseStrength > 60
          ? 'Oracle verification provides collusion resistance'
          : 'Implement multi-oracle consensus',
    };
  }

  private simulateFrontrunningAttack(): AttackSimulation {
    const avgEscrowValue = 0.01;
    const frontrunCost = 0.001;
    const successRate = 0.3;

    const expectedGain = avgEscrowValue * successRate - frontrunCost;
    const defenseStrength = 65;

    return {
      attackType: 'frontrunning',
      attackerStrategy: 'Monitor mempool and frontrun high-value escrows',
      defenseStrength,
      expectedLoss: expectedGain,
      recommendation: 'Use Jito bundles for MEV protection',
    };
  }

  private simulateReputationManipulation(): AttackSimulation {
    const startupCost = 1.0;
    const washTradingCost = 5.0;
    const timeInvestment = 30;

    const reputationValue = 8.0;
    const exploitWindow = 60;

    const totalCost = startupCost + washTradingCost;
    const expectedGain = reputationValue;

    const defenseStrength = totalCost > expectedGain * 0.5 ? 70 : 50;

    return {
      attackType: 'reputation_manipulation',
      attackerStrategy: `Build reputation over ${timeInvestment} days then exploit`,
      defenseStrength,
      expectedLoss: Math.max(0, expectedGain - totalCost),
      recommendation:
        defenseStrength > 60
          ? 'Time-weighted reputation and slashing provide adequate protection'
          : 'Increase slashing penalties for reputation abuse',
    };
  }

  calculateROI(
    escrowAmount: number,
    qualityScore: number,
    timeSaved: number,
    traditionalCost: number
  ): {
    roi: number;
    breakdown: {
      costSavings: number;
      timeSavings: number;
      qualityPremium: number;
    };
  } {
    const NaoriCost = escrowAmount * 0.01;
    const refundAmount = escrowAmount * ((100 - qualityScore) / 100);

    const costSavings = traditionalCost - NaoriCost + refundAmount;
    const timeSavingsValue = (timeSaved / 3600) * 50;
    const qualityPremium = qualityScore > 80 ? escrowAmount * 0.1 : 0;

    const totalValue = costSavings + timeSavingsValue + qualityPremium;
    const roi = (totalValue / escrowAmount) * 100;

    return {
      roi,
      breakdown: {
        costSavings,
        timeSavings: timeSavingsValue,
        qualityPremium,
      },
    };
  }

  generateReport(): string {
    const metrics = this.getMetrics();

    return `
ECONOMIC DASHBOARD REPORT
========================

Volume Metrics:
- Total Escrow Volume: ${(metrics.totalEscrowVolume / 1e9).toFixed(4)} SOL
- Total Disputes: ${metrics.totalDisputes}
- Dispute Rate: ${((metrics.totalDisputes / (metrics.totalEscrowVolume || 1)) * 100).toFixed(2)}%

Performance Metrics:
- Avg Resolution Time: ${(metrics.averageDisputeResolutionTime / 1000 / 60).toFixed(1)} minutes
- Avg Refund: ${metrics.averageRefundPercentage.toFixed(1)}%

Network Health:
- Active Providers: ${metrics.providerReputationDistribution.size}
- 24h Escrows: ${metrics.timeSeriesData.slice(-24).reduce((sum, d) => sum + d.escrows, 0)}
- 24h Volume: ${(metrics.timeSeriesData.slice(-24).reduce((sum, d) => sum + d.volume, 0) / 1e9).toFixed(4)} SOL

Attack Simulations:
${this.runAllAttackSimulations()}
    `.trim();
  }

  private runAllAttackSimulations(): string {
    const attacks: AttackSimulation['attackType'][] = [
      'sybil',
      'collusion',
      'frontrunning',
      'reputation_manipulation',
    ];

    return attacks
      .map((type) => {
        const sim = this.simulateAttack(type);
        return `- ${type.toUpperCase()}: Defense Strength ${sim.defenseStrength}% - ${sim.recommendation}`;
      })
      .join('\n');
  }
}

export function visualizeMetrics(metrics: EconomicMetrics): string {
  const timeSeries = metrics.timeSeriesData.slice(-24);

  const maxEscrows = Math.max(...timeSeries.map((d) => d.escrows), 1);
  const maxDisputes = Math.max(...timeSeries.map((d) => d.disputes), 1);

  let chart = 'Escrow Activity (Last 24 Hours)\n';
  chart += '━'.repeat(50) + '\n';

  for (let i = 0; i < timeSeries.length; i++) {
    const data = timeSeries[i];
    const hour = new Date(data.timestamp).getHours();
    const escrowBar = '█'.repeat(Math.ceil((data.escrows / maxEscrows) * 20));
    const disputeBar = '░'.repeat(Math.ceil((data.disputes / maxDisputes) * 10));

    chart += `${hour.toString().padStart(2, '0')}:00 |${escrowBar}${disputeBar}\n`;
  }

  chart += '━'.repeat(50) + '\n';
  chart += `Total: ${timeSeries.reduce((sum, d) => sum + d.escrows, 0)} escrows, `;
  chart += `${timeSeries.reduce((sum, d) => sum + d.disputes, 0)} disputes\n`;

  return chart;
}
