/**
 * Advanced Trading Bot with x402 Quality-Guaranteed Data Feeds
 *
 * Demonstrates complex multi-agent reasoning:
 * - Risk assessment across multiple data sources
 * - Quality-weighted decision making
 * - Adaptive strategy based on data reliability
 * - Cost-benefit analysis for data purchases
 */

import { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { AutonomousServiceAgent } from '@x402resolve/agent-client';

const ESCROW_PROGRAM_ID = new PublicKey('E5EiaJhbg6Bav1v3P211LNv1tAqa4fHVeuGgRBHsEu6n');
const connection = new Connection('https://api.devnet.solana.com');

interface PriceFeed {
  symbol: string;
  price: number;
  confidence: number;
  timestamp: string;
  source: string;
}

interface MarketSignal {
  action: 'BUY' | 'SELL' | 'HOLD';
  confidence: number;
  reasoning: string[];
  dataQuality: number;
  costBenefit: number;
}

interface TradeDecision {
  execute: boolean;
  amount: number;
  reasoning: string[];
  riskScore: number;
  dataInvestment: number;
}

class AdvancedTradingBot {
  private agent: AutonomousServiceAgent;
  private portfolioValue: number = 1.0; // SOL
  private minDataQuality: number = 80;
  private maxDataCost: number = 0.001; // Max SOL per data feed
  private decisionHistory: MarketSignal[] = [];

  constructor(keypair: Keypair) {
    this.agent = new AutonomousServiceAgent({
      keypair,
      connection,
      programId: ESCROW_PROGRAM_ID,
      qualityThreshold: this.minDataQuality,
      maxPrice: this.maxDataCost,
      autoDispute: true
    });
  }

  /**
   * Advanced multi-source reasoning with quality weighting
   */
  async analyzeMarket(symbol: string): Promise<TradeDecision> {
    console.log(`\n${'='.repeat(70)}`);
    console.log(`MARKET ANALYSIS FOR ${symbol}`);
    console.log('='.repeat(70));

    // Phase 1: Gather data from multiple sources with quality assessment
    const dataSources = await this.gatherMultiSourceData(symbol);

    // Phase 2: Quality-weighted consensus building
    const consensus = this.buildQualityWeightedConsensus(dataSources);

    // Phase 3: Risk-adjusted decision making
    const decision = this.makeRiskAdjustedDecision(consensus, dataSources);

    // Phase 4: Cost-benefit validation
    const validated = this.validateCostBenefit(decision, dataSources);

    return validated;
  }

  /**
   * Gather data from multiple sources, assess quality, file disputes
   */
  private async gatherMultiSourceData(symbol: string): Promise<any[]> {
    console.log('\n[Phase 1] Multi-Source Data Gathering');
    console.log('-'.repeat(70));

    const sources = [
      {
        name: 'High-Frequency Oracle',
        endpoint: 'https://api.example.com/hf-price',
        cost: 0.0005,
        expectedQuality: 95
      },
      {
        name: 'Aggregated DEX Data',
        endpoint: 'https://api.example.com/dex-aggregate',
        cost: 0.0003,
        expectedQuality: 85
      },
      {
        name: 'Community Sentiment',
        endpoint: 'https://api.example.com/sentiment',
        cost: 0.0002,
        expectedQuality: 70
      }
    ];

    const results = [];

    for (const source of sources) {
      console.log(`\n  → Querying: ${source.name}`);
      console.log(`    Expected Quality: ${source.expectedQuality}%`);
      console.log(`    Max Cost: ${source.cost} SOL`);

      try {
        // Simulate API call with quality assessment
        const result = await this.simulateDataFetch(source, symbol);

        console.log(`    ✓ Received data`);
        console.log(`    Quality Score: ${result.quality}/100`);
        console.log(`    Actual Cost: ${result.cost} SOL`);

        if (result.disputed) {
          console.log(`    ⚠ Quality below threshold - Dispute filed`);
          console.log(`    Refund: ${((1 - result.quality/100) * 100).toFixed(0)}%`);
        }

        results.push({
          ...result,
          source: source.name,
          expectedQuality: source.expectedQuality
        });

      } catch (error: any) {
        console.log(`    ✗ Failed: ${error.message}`);
        results.push({
          source: source.name,
          quality: 0,
          cost: 0,
          disputed: false,
          data: null,
          error: error.message
        });
      }
    }

    return results;
  }

  /**
   * Build consensus weighted by data quality scores
   */
  private buildQualityWeightedConsensus(sources: any[]): MarketSignal {
    console.log('\n[Phase 2] Quality-Weighted Consensus Building');
    console.log('-'.repeat(70));

    const validSources = sources.filter(s => s.quality >= this.minDataQuality);

    if (validSources.length === 0) {
      console.log('  ⚠ No high-quality data sources available');
      return {
        action: 'HOLD',
        confidence: 0,
        reasoning: ['Insufficient quality data'],
        dataQuality: 0,
        costBenefit: 0
      };
    }

    // Calculate quality-weighted price consensus
    let totalWeight = 0;
    let weightedPrice = 0;
    let weightedSentiment = 0;

    validSources.forEach(source => {
      const weight = source.quality / 100;
      totalWeight += weight;

      if (source.data?.price) {
        weightedPrice += source.data.price * weight;
      }
      if (source.data?.sentiment) {
        weightedSentiment += source.data.sentiment * weight;
      }
    });

    const consensusPrice = weightedPrice / totalWeight;
    const consensusSentiment = weightedSentiment / totalWeight;
    const avgQuality = validSources.reduce((sum, s) => sum + s.quality, 0) / validSources.length;

    console.log(`\n  Quality-Weighted Consensus:`);
    console.log(`    Price: $${consensusPrice.toFixed(2)}`);
    console.log(`    Sentiment: ${(consensusSentiment * 100).toFixed(0)}%`);
    console.log(`    Average Data Quality: ${avgQuality.toFixed(0)}%`);
    console.log(`    Sources Used: ${validSources.length}/${sources.length}`);

    // Reasoning logic
    const reasoning: string[] = [];
    let action: 'BUY' | 'SELL' | 'HOLD' = 'HOLD';
    let confidence = 0;

    if (consensusSentiment > 0.7 && avgQuality > 85) {
      action = 'BUY';
      confidence = Math.min(consensusSentiment * avgQuality / 100, 0.95);
      reasoning.push(`Strong bullish sentiment (${(consensusSentiment * 100).toFixed(0)}%)`);
      reasoning.push(`High data quality (${avgQuality.toFixed(0)}%)`);
      reasoning.push(`Consensus from ${validSources.length} sources`);
    } else if (consensusSentiment < 0.3 && avgQuality > 85) {
      action = 'SELL';
      confidence = Math.min((1 - consensusSentiment) * avgQuality / 100, 0.95);
      reasoning.push(`Strong bearish sentiment (${(consensusSentiment * 100).toFixed(0)}%)`);
      reasoning.push(`High data quality (${avgQuality.toFixed(0)}%)`);
      reasoning.push(`Consensus from ${validSources.length} sources`);
    } else {
      reasoning.push(`Mixed signals or insufficient quality`);
      reasoning.push(`Sentiment: ${(consensusSentiment * 100).toFixed(0)}%`);
      reasoning.push(`Quality: ${avgQuality.toFixed(0)}%`);
    }

    console.log(`\n  Signal: ${action} (${(confidence * 100).toFixed(0)}% confidence)`);
    reasoning.forEach(r => console.log(`    - ${r}`));

    return {
      action,
      confidence,
      reasoning,
      dataQuality: avgQuality,
      costBenefit: 0
    };
  }

  /**
   * Make risk-adjusted decision based on portfolio and market conditions
   */
  private makeRiskAdjustedDecision(signal: MarketSignal, sources: any[]): TradeDecision {
    console.log('\n[Phase 3] Risk-Adjusted Decision Making');
    console.log('-'.repeat(70));

    const riskFactors = {
      dataQuality: signal.dataQuality / 100,
      confidence: signal.confidence,
      portfolioExposure: 0.3, // 30% of portfolio at risk
      marketVolatility: 0.15 // 15% assumed volatility
    };

    // Calculate composite risk score (0-100, lower is better)
    const riskScore = 100 - (
      riskFactors.dataQuality * 40 +
      riskFactors.confidence * 40 +
      (1 - riskFactors.portfolioExposure) * 10 +
      (1 - riskFactors.marketVolatility) * 10
    );

    console.log(`\n  Risk Assessment:`);
    console.log(`    Data Quality Risk: ${((1 - riskFactors.dataQuality) * 100).toFixed(0)}%`);
    console.log(`    Confidence Risk: ${((1 - riskFactors.confidence) * 100).toFixed(0)}%`);
    console.log(`    Portfolio Exposure: ${(riskFactors.portfolioExposure * 100).toFixed(0)}%`);
    console.log(`    Market Volatility: ${(riskFactors.marketVolatility * 100).toFixed(0)}%`);
    console.log(`    Composite Risk Score: ${riskScore.toFixed(0)}/100`);

    // Position sizing based on risk
    const maxPositionSize = this.portfolioValue * riskFactors.portfolioExposure;
    const riskAdjustedSize = maxPositionSize * (1 - riskScore / 100);

    const reasoning = [...signal.reasoning];
    let execute = false;

    if (signal.action === 'BUY' || signal.action === 'SELL') {
      if (riskScore < 30) {
        execute = true;
        reasoning.push(`Low risk score (${riskScore.toFixed(0)}) - Execute`);
      } else if (riskScore < 50 && signal.confidence > 0.7) {
        execute = true;
        reasoning.push(`Moderate risk but high confidence - Execute with caution`);
      } else {
        reasoning.push(`Risk too high (${riskScore.toFixed(0)}) - Hold position`);
      }
    }

    console.log(`\n  Decision: ${execute ? 'EXECUTE' : 'HOLD'}`);
    console.log(`  Position Size: ${riskAdjustedSize.toFixed(4)} SOL`);

    return {
      execute,
      amount: riskAdjustedSize,
      reasoning,
      riskScore,
      dataInvestment: sources.reduce((sum, s) => sum + (s.cost || 0), 0)
    };
  }

  /**
   * Validate cost-benefit of data purchases vs expected profit
   */
  private validateCostBenefit(decision: TradeDecision, sources: any[]): TradeDecision {
    console.log('\n[Phase 4] Cost-Benefit Analysis');
    console.log('-'.repeat(70));

    const dataInvestment = decision.dataInvestment;
    const expectedProfit = decision.amount * 0.02; // Assume 2% profit target
    const netProfit = expectedProfit - dataInvestment;
    const roi = (netProfit / dataInvestment) * 100;

    console.log(`\n  Financial Analysis:`);
    console.log(`    Data Investment: ${dataInvestment.toFixed(6)} SOL`);
    console.log(`    Expected Profit: ${expectedProfit.toFixed(6)} SOL`);
    console.log(`    Net Profit: ${netProfit.toFixed(6)} SOL`);
    console.log(`    ROI: ${roi.toFixed(0)}%`);

    if (netProfit < 0) {
      console.log(`\n  ⚠ Data costs exceed expected profit - CANCEL TRADE`);
      decision.execute = false;
      decision.reasoning.push('Negative ROI - data costs too high');
    } else if (roi < 100) {
      console.log(`\n  ⚠ Low ROI - Consider cheaper data sources`);
      decision.reasoning.push(`Low ROI (${roi.toFixed(0)}%)`);
    } else {
      console.log(`\n  ✓ Positive cost-benefit ratio`);
      decision.reasoning.push(`Favorable ROI (${roi.toFixed(0)}%)`);
    }

    // Quality refund consideration
    const poorQualitySources = sources.filter(s => s.disputed);
    if (poorQualitySources.length > 0) {
      const refundAmount = poorQualitySources.reduce((sum, s) => {
        return sum + (s.cost * (1 - s.quality / 100));
      }, 0);

      console.log(`\n  Dispute Refunds:`);
      console.log(`    Disputed Sources: ${poorQualitySources.length}`);
      console.log(`    Refund Amount: ${refundAmount.toFixed(6)} SOL`);
      console.log(`    Effective Data Cost: ${(dataInvestment - refundAmount).toFixed(6)} SOL`);

      decision.reasoning.push(`x402 quality refunds: ${refundAmount.toFixed(6)} SOL`);
    }

    return decision;
  }

  /**
   * Simulate data fetch with quality assessment
   */
  private async simulateDataFetch(source: any, symbol: string): Promise<any> {
    // Simulate varying quality levels
    const qualityVariance = Math.random() * 20 - 10; // ±10%
    const actualQuality = Math.min(100, Math.max(0, source.expectedQuality + qualityVariance));

    const price = 100 + Math.random() * 10 - 5;
    const sentiment = Math.random();

    const cost = source.cost;
    const disputed = actualQuality < this.minDataQuality;
    const actualCost = disputed ? cost * (actualQuality / 100) : cost;

    return {
      quality: Math.round(actualQuality),
      cost: actualCost,
      disputed,
      data: {
        symbol,
        price,
        sentiment,
        timestamp: new Date().toISOString(),
        source: source.name
      }
    };
  }

  /**
   * Execute trading strategy with learned adaptations
   */
  async run(symbol: string) {
    console.log('\n');
    console.log('='.repeat(70));
    console.log('ADVANCED TRADING BOT - x402 Quality-Guaranteed Data Feeds');
    console.log('='.repeat(70));
    console.log(`\nSymbol: ${symbol}`);
    console.log(`Portfolio: ${this.portfolioValue} SOL`);
    console.log(`Min Data Quality: ${this.minDataQuality}%`);
    console.log(`Max Data Cost: ${this.maxDataCost} SOL/source`);

    const decision = await this.analyzeMarket(symbol);

    console.log('\n' + '='.repeat(70));
    console.log('FINAL DECISION');
    console.log('='.repeat(70));
    console.log(`\nAction: ${decision.execute ? 'EXECUTE TRADE' : 'HOLD POSITION'}`);
    console.log(`Amount: ${decision.amount.toFixed(4)} SOL`);
    console.log(`Risk Score: ${decision.riskScore.toFixed(0)}/100`);
    console.log(`Data Investment: ${decision.dataInvestment.toFixed(6)} SOL`);
    console.log(`\nReasoning:`);
    decision.reasoning.forEach((r, i) => console.log(`  ${i + 1}. ${r}`));

    console.log('\n' + '='.repeat(70));
    console.log('KEY INSIGHTS');
    console.log('='.repeat(70));
    console.log('\nx402 Quality Advantages:');
    console.log('  - Automatic refunds for low-quality data');
    console.log('  - Quality-weighted consensus building');
    console.log('  - Cost-benefit validation');
    console.log('  - Risk-adjusted position sizing');
    console.log('  - Multi-source verification');

    console.log('\nTraditional Trading Bot Issues Solved:');
    console.log('  ✓ No refunds for bad data → x402 sliding-scale refunds');
    console.log('  ✓ Trust single source → Multi-source quality weighting');
    console.log('  ✓ Fixed data costs → Cost-benefit optimization');
    console.log('  ✓ No quality assurance → Automatic dispute filing');
    console.log('  ✓ Blind execution → Risk-adjusted decision making');
  }
}

// Example usage
async function main() {
  const keypair = Keypair.generate();
  const bot = new AdvancedTradingBot(keypair);
  await bot.run('SOL/USDC');
}

if (require.main === module) {
  main().catch(console.error);
}

export { AdvancedTradingBot };
