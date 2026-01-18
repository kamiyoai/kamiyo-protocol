import type {
  SimilarDispute,
  FraudIndicator,
  LegitimacySignal,
  DisputeRecord,
} from '../deliberation/types';
import type { EvaluationContext } from '../types';
import { createLogger } from '../lib/logger';

const log = createLogger('pattern-matcher');

export interface PatternAnalysis {
  similarDisputes: SimilarDispute[];
  fraudIndicators: FraudIndicator[];
  legitimacySignals: LegitimacySignal[];
  riskScore: number;
  recommendedAction: 'proceed' | 'caution' | 'abstain';
}

// Known fraud patterns
const FRAUD_PATTERNS = [
  {
    id: 'new_account_large_dispute',
    check: (ctx: EvaluationContext, history: DisputeRecord[]) =>
      ctx.agent.totalEscrows < 3 && ctx.escrow.amount > 5,
    severity: 'high' as const,
    description: 'New account disputing large escrow',
    confidence: 0.7,
  },
  {
    id: 'serial_disputer',
    check: (ctx: EvaluationContext) => ctx.agent.disputeRate > 50,
    severity: 'high' as const,
    description: 'Agent has extremely high dispute rate (>50%)',
    confidence: 0.85,
  },
  {
    id: 'targeting_provider',
    check: (ctx: EvaluationContext, history: DisputeRecord[]) => {
      const providerDisputes = history.filter((d) =>
        d.outcome === 'agent_won' && d.amount > 0
      );
      return providerDisputes.length > 3;
    },
    severity: 'medium' as const,
    description: 'Multiple agents have disputed this provider',
    confidence: 0.6,
  },
  {
    id: 'dispute_timing',
    check: (ctx: EvaluationContext) => {
      const hoursBeforeExpiry =
        (ctx.escrow.expiresAt - Date.now() / 1000) / 3600;
      return hoursBeforeExpiry < 1;
    },
    severity: 'low' as const,
    description: 'Dispute filed very close to expiry',
    confidence: 0.4,
  },
  {
    id: 'low_stake_high_volume',
    check: (ctx: EvaluationContext) =>
      ctx.escrow.amount < 0.1 && ctx.agent.totalEscrows > 50,
    severity: 'medium' as const,
    description: 'Low-value dispute from high-volume agent',
    confidence: 0.5,
  },
];

// Legitimacy indicators
const LEGITIMACY_PATTERNS = [
  {
    id: 'established_agent',
    check: (ctx: EvaluationContext) =>
      ctx.agent.totalEscrows > 20 && ctx.agent.disputeRate < 10,
    strength: 'strong' as const,
    description: 'Established agent with low dispute history',
  },
  {
    id: 'first_dispute',
    check: (ctx: EvaluationContext) =>
      ctx.agent.totalEscrows > 5 && ctx.agent.disputeRate === 0,
    strength: 'strong' as const,
    description: 'First dispute from otherwise clean agent',
  },
  {
    id: 'provider_pattern',
    check: (ctx: EvaluationContext) => ctx.provider.disputeRate > 20,
    strength: 'moderate' as const,
    description: 'Provider has pattern of disputed escrows',
  },
  {
    id: 'reasonable_amount',
    check: (ctx: EvaluationContext) =>
      ctx.escrow.amount >= 0.1 && ctx.escrow.amount <= 10,
    strength: 'weak' as const,
    description: 'Dispute amount in normal range',
  },
  {
    id: 'good_provider_history',
    check: (ctx: EvaluationContext) =>
      ctx.provider.reputation > 700 && ctx.provider.averageQualityScore > 80,
    strength: 'strong' as const,
    description: 'Provider has excellent track record',
  },
];

export class PatternMatcher {
  private historicalDisputes: DisputeRecord[] = [];

  constructor(historicalDisputes: DisputeRecord[] = []) {
    this.historicalDisputes = historicalDisputes;
  }

  addHistoricalDispute(dispute: DisputeRecord): void {
    this.historicalDisputes.push(dispute);
  }

  setHistoricalDisputes(disputes: DisputeRecord[]): void {
    this.historicalDisputes = disputes;
  }

  analyze(context: EvaluationContext): PatternAnalysis {
    log.debug('Analyzing patterns', {
      escrow: context.escrow.pda.slice(0, 8),
      historicalCount: this.historicalDisputes.length,
    });

    const fraudIndicators = this.detectFraudPatterns(context);
    const legitimacySignals = this.detectLegitimacyPatterns(context);
    const similarDisputes = this.findSimilarDisputes(context);

    const riskScore = this.calculateRiskScore(
      fraudIndicators,
      legitimacySignals,
      context
    );

    const recommendedAction = this.recommendAction(riskScore, fraudIndicators);

    log.info('Pattern analysis complete', {
      escrow: context.escrow.pda.slice(0, 8),
      fraudIndicators: fraudIndicators.length,
      legitimacySignals: legitimacySignals.length,
      similarDisputes: similarDisputes.length,
      riskScore,
      recommendation: recommendedAction,
    });

    return {
      similarDisputes,
      fraudIndicators,
      legitimacySignals,
      riskScore,
      recommendedAction,
    };
  }

  private detectFraudPatterns(context: EvaluationContext): FraudIndicator[] {
    const indicators: FraudIndicator[] = [];

    for (const pattern of FRAUD_PATTERNS) {
      try {
        if (pattern.check(context, this.historicalDisputes)) {
          indicators.push({
            type: pattern.id,
            severity: pattern.severity,
            description: pattern.description,
            confidence: pattern.confidence,
          });
        }
      } catch {
        // Skip if pattern check fails
      }
    }

    return indicators;
  }

  private detectLegitimacyPatterns(context: EvaluationContext): LegitimacySignal[] {
    const signals: LegitimacySignal[] = [];

    for (const pattern of LEGITIMACY_PATTERNS) {
      try {
        if (pattern.check(context)) {
          signals.push({
            type: pattern.id,
            strength: pattern.strength,
            description: pattern.description,
          });
        }
      } catch {
        // Skip if pattern check fails
      }
    }

    return signals;
  }

  private findSimilarDisputes(context: EvaluationContext): SimilarDispute[] {
    if (this.historicalDisputes.length === 0) return [];

    const similar: SimilarDispute[] = [];

    for (const dispute of this.historicalDisputes) {
      const similarity = this.calculateSimilarity(context, dispute);

      if (similarity > 0.5) {
        similar.push({
          escrowPda: dispute.escrowPda,
          similarity,
          outcome: dispute.outcome,
          score: dispute.score ?? 72,
          keyFactors: this.identifySimilarityFactors(context, dispute),
        });
      }
    }

    // Sort by similarity descending
    return similar.sort((a, b) => b.similarity - a.similarity).slice(0, 5);
  }

  private calculateSimilarity(
    context: EvaluationContext,
    historical: DisputeRecord
  ): number {
    let similarity = 0;
    let factors = 0;

    // Amount similarity (within 50% range)
    const amountRatio = Math.min(
      context.escrow.amount / historical.amount,
      historical.amount / context.escrow.amount
    );
    if (amountRatio > 0.5) {
      similarity += amountRatio * 0.3;
      factors += 0.3;
    }

    // Time proximity (disputes within similar time ranges)
    // This is a simple heuristic
    similarity += 0.2;
    factors += 0.2;

    // Outcome prediction boost
    // If we have score data, weight more heavily
    if (historical.score !== undefined) {
      similarity += 0.5;
      factors += 0.5;
    }

    return factors > 0 ? similarity / factors : 0;
  }

  private identifySimilarityFactors(
    context: EvaluationContext,
    historical: DisputeRecord
  ): string[] {
    const factors: string[] = [];

    const amountRatio = context.escrow.amount / historical.amount;
    if (amountRatio > 0.5 && amountRatio < 2) {
      factors.push('Similar escrow amount');
    }

    if (historical.score !== undefined) {
      if (historical.score < 50) {
        factors.push('Historical dispute favored agent');
      } else if (historical.score >= 80) {
        factors.push('Historical dispute favored provider');
      } else {
        factors.push('Historical dispute resulted in split');
      }
    }

    return factors;
  }

  private calculateRiskScore(
    fraudIndicators: FraudIndicator[],
    legitimacySignals: LegitimacySignal[],
    context: EvaluationContext
  ): number {
    let score = 50; // Start neutral

    // Fraud indicators increase risk
    for (const indicator of fraudIndicators) {
      const weight = indicator.severity === 'high' ? 20 : indicator.severity === 'medium' ? 10 : 5;
      score += weight * indicator.confidence;
    }

    // Legitimacy signals decrease risk
    for (const signal of legitimacySignals) {
      const weight = signal.strength === 'strong' ? 15 : signal.strength === 'moderate' ? 8 : 3;
      score -= weight;
    }

    // Reputation adjustments
    if (context.agent.reputation > 700) score -= 10;
    if (context.agent.reputation < 300) score += 10;
    if (context.provider.reputation > 700) score += 5;

    return Math.max(0, Math.min(100, score));
  }

  private recommendAction(
    riskScore: number,
    fraudIndicators: FraudIndicator[]
  ): 'proceed' | 'caution' | 'abstain' {
    // High-severity fraud indicators = abstain
    if (fraudIndicators.some((f) => f.severity === 'high' && f.confidence > 0.8)) {
      return 'abstain';
    }

    if (riskScore > 70) return 'abstain';
    if (riskScore > 50) return 'caution';
    return 'proceed';
  }
}
