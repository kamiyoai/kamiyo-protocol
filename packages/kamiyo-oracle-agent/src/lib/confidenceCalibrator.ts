import type { IAgentRuntime, QualityAssessment, VotingStrategy, EvaluationContext } from '../types';
import { ORACLE_CONSTANTS } from '../config';

const HISTORICAL_MEDIAN_SCORE = 72;

export function calibrateVote(
  assessment: QualityAssessment,
  context: EvaluationContext,
  oracleStake: number = ORACLE_CONSTANTS.MIN_STAKE_LAMPORTS / 1e9,
  otherOracleCount: number = 2
): VotingStrategy {
  const escrowAmountSol = context.escrow.amount;

  // Calculate expected reward (1% of escrow split among oracles)
  const totalOracleReward = escrowAmountSol * (ORACLE_CONSTANTS.REWARD_PERCENTAGE / 100);
  const expectedReward = totalOracleReward / (otherOracleCount + 1);

  // Calculate max potential loss (10% of stake if slashed)
  const maxLoss = oracleStake * (ORACLE_CONSTANTS.SLASH_PERCENTAGE / 100);

  // Risk/reward ratio
  const riskRewardRatio = maxLoss / (expectedReward || 0.0001);

  // Determine if we should vote based on confidence and risk
  const minConfidence = getMinConfidenceForRisk(riskRewardRatio);

  if (!meetsConfidenceThreshold(assessment.confidence, minConfidence)) {
    return {
      shouldVote: false,
      adjustedScore: assessment.score,
      riskLevel: 'high',
      expectedReward,
      maxLoss,
      reasoning: `Confidence (${assessment.confidence}) below required threshold (${minConfidence}) for risk/reward ratio ${riskRewardRatio.toFixed(1)}. Abstaining.`,
    };
  }

  // Adjust score based on confidence level
  const adjustedScore = adjustScoreForConfidence(assessment);

  // Determine risk level
  const riskLevel = determineRiskLevel(assessment, riskRewardRatio);

  return {
    shouldVote: true,
    adjustedScore,
    riskLevel,
    expectedReward,
    maxLoss,
    reasoning: buildReasoning(assessment, adjustedScore, riskLevel),
  };
}

function getMinConfidenceForRisk(riskRewardRatio: number): 'low' | 'medium' | 'high' {
  // Higher risk requires higher confidence
  if (riskRewardRatio > 50) return 'high';
  if (riskRewardRatio > 10) return 'medium';
  return 'low';
}

function meetsConfidenceThreshold(
  actual: 'low' | 'medium' | 'high',
  required: 'low' | 'medium' | 'high'
): boolean {
  const levels = { low: 1, medium: 2, high: 3 };
  return levels[actual] >= levels[required];
}

function adjustScoreForConfidence(assessment: QualityAssessment): number {
  const { score, confidence } = assessment;

  switch (confidence) {
    case 'high':
      // Trust the assessment fully
      return score;

    case 'medium':
      // Slight regression toward historical median
      return Math.round(score * 0.85 + HISTORICAL_MEDIAN_SCORE * 0.15);

    case 'low':
      // Strong regression toward historical median
      return Math.round(score * 0.6 + HISTORICAL_MEDIAN_SCORE * 0.4);

    default:
      return score;
  }
}

function determineRiskLevel(
  assessment: QualityAssessment,
  riskRewardRatio: number
): 'low' | 'medium' | 'high' {
  // High confidence + favorable ratio = low risk
  if (assessment.confidence === 'high' && riskRewardRatio < 10) {
    return 'low';
  }

  // Strong evidence + good provider history = lower risk
  if (
    assessment.factors.evidenceStrength === 'strong' &&
    assessment.factors.providerHistory === 'good'
  ) {
    return 'low';
  }

  // Low confidence or weak evidence = higher risk
  if (assessment.confidence === 'low' || assessment.factors.evidenceStrength === 'weak') {
    return 'high';
  }

  // Edge cases (very high or very low scores) are riskier
  if (assessment.score > 95 || assessment.score < 20) {
    return 'medium';
  }

  return 'medium';
}

function buildReasoning(
  assessment: QualityAssessment,
  adjustedScore: number,
  riskLevel: 'low' | 'medium' | 'high'
): string {
  const scoreChange = adjustedScore - assessment.score;
  const adjustment = scoreChange !== 0
    ? ` (adjusted ${scoreChange > 0 ? '+' : ''}${scoreChange} for confidence)`
    : '';

  return `Voting ${adjustedScore}${adjustment}. ${assessment.confidence} confidence, ${riskLevel} risk. ${assessment.reasoning}`;
}

export function shouldAbstainOnRisk(
  runtime: IAgentRuntime,
  strategy: VotingStrategy
): boolean {
  const riskTolerance = runtime.getSetting('RISK_TOLERANCE') || 'medium';

  switch (riskTolerance) {
    case 'low':
      // Only vote on low-risk opportunities
      return strategy.riskLevel !== 'low';

    case 'medium':
      // Avoid high-risk votes
      return strategy.riskLevel === 'high';

    case 'high':
      // Vote on anything the calibrator approves
      return false;

    default:
      return strategy.riskLevel === 'high';
  }
}

export function calculatePositionSizing(
  performance: { violationCount: number; accuracyRate: number },
  maxPendingDisputes: number
): number {
  // Reduce exposure as violations accumulate
  const violationPenalty = Math.max(0, 1 - performance.violationCount * 0.3);

  // Increase exposure with good accuracy
  const accuracyBonus = performance.accuracyRate > 90 ? 1.2 : 1.0;

  // Base position size
  const baseSize = maxPendingDisputes;

  return Math.floor(baseSize * violationPenalty * accuracyBonus);
}
