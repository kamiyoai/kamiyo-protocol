import { KnowledgeBase, type CalibrationParams, type OutcomeRecord } from './knowledgeBase';
import { createLogger } from '../lib/logger';

const log = createLogger('calibration-engine');

export interface CalibrationUpdate {
  params: CalibrationParams;
  changes: CalibrationChange[];
  confidence: number;
}

export interface CalibrationChange {
  parameter: string;
  oldValue: number;
  newValue: number;
  reason: string;
}

export class CalibrationEngine {
  private knowledgeBase: KnowledgeBase;
  private minSamplesForUpdate = 10;
  private learningRate = 0.1;

  constructor(knowledgeBase: KnowledgeBase) {
    this.knowledgeBase = knowledgeBase;
  }

  /**
   * Run calibration based on recent outcomes
   */
  calibrate(): CalibrationUpdate {
    const currentParams = this.knowledgeBase.getCalibration();
    const outcomes = this.knowledgeBase.getFinalizedOutcomes();

    if (outcomes.length < this.minSamplesForUpdate) {
      log.debug('Insufficient samples for calibration', {
        samples: outcomes.length,
        required: this.minSamplesForUpdate,
      });

      return {
        params: currentParams,
        changes: [],
        confidence: 0,
      };
    }

    const changes: CalibrationChange[] = [];
    const newParams = { ...currentParams };

    // Calculate metrics
    const metrics = this.calculateMetrics(outcomes);

    // Update confidence thresholds based on accuracy at each level
    const confidenceUpdates = this.updateConfidenceThresholds(
      currentParams,
      outcomes,
      metrics
    );
    changes.push(...confidenceUpdates.changes);
    Object.assign(newParams, confidenceUpdates.params);

    // Update risk weights based on fraud indicator accuracy
    const riskUpdates = this.updateRiskWeights(currentParams, outcomes);
    changes.push(...riskUpdates.changes);
    Object.assign(newParams, riskUpdates.params);

    // Update advocate aggressiveness based on deviation patterns
    const aggressivenessUpdate = this.updateAggressiveness(
      currentParams,
      outcomes,
      metrics
    );
    if (aggressivenessUpdate) {
      changes.push(aggressivenessUpdate.change);
      newParams.advocateAggressiveness = aggressivenessUpdate.value;
    }

    // Update statistics
    newParams.totalVotes = outcomes.length;
    newParams.accurateVotes = outcomes.filter(
      (o) => o.deviation !== null && o.deviation <= 15
    ).length;
    newParams.slashEvents = outcomes.filter((o) => o.wasSlashed).length;
    newParams.historicalAccuracy = metrics.accuracy;
    newParams.lastUpdated = Date.now();

    // Save updated params
    this.knowledgeBase.saveCalibration(newParams);

    const confidence = Math.min(1, outcomes.length / 100);

    log.info('Calibration complete', {
      changes: changes.length,
      accuracy: metrics.accuracy.toFixed(3),
      confidence: confidence.toFixed(2),
    });

    return {
      params: newParams,
      changes,
      confidence,
    };
  }

  private calculateMetrics(outcomes: OutcomeRecord[]): {
    accuracy: number;
    avgDeviation: number;
    slashRate: number;
    biasDirection: 'agent' | 'provider' | 'neutral';
    biasAmount: number;
  } {
    const finalized = outcomes.filter((o) => o.finalized && o.consensusScore !== null);

    if (finalized.length === 0) {
      return {
        accuracy: 1,
        avgDeviation: 0,
        slashRate: 0,
        biasDirection: 'neutral',
        biasAmount: 0,
      };
    }

    // Accuracy: within 15 points of consensus
    const accurate = finalized.filter(
      (o) => o.deviation !== null && o.deviation <= 15
    ).length;
    const accuracy = accurate / finalized.length;

    // Average deviation
    const totalDeviation = finalized.reduce(
      (sum, o) => sum + (o.deviation ?? 0),
      0
    );
    const avgDeviation = totalDeviation / finalized.length;

    // Slash rate
    const slashed = finalized.filter((o) => o.wasSlashed).length;
    const slashRate = slashed / finalized.length;

    // Bias detection
    const biasSum = finalized.reduce((sum, o) => {
      if (o.consensusScore === null) return sum;
      return sum + (o.ourScore - o.consensusScore);
    }, 0);
    const avgBias = biasSum / finalized.length;

    let biasDirection: 'agent' | 'provider' | 'neutral' = 'neutral';
    if (avgBias < -5) biasDirection = 'agent';  // We score lower than consensus
    else if (avgBias > 5) biasDirection = 'provider';  // We score higher

    return {
      accuracy,
      avgDeviation,
      slashRate,
      biasDirection,
      biasAmount: Math.abs(avgBias),
    };
  }

  private updateConfidenceThresholds(
    current: CalibrationParams,
    outcomes: OutcomeRecord[],
    metrics: { accuracy: number; slashRate: number }
  ): { params: Partial<CalibrationParams>; changes: CalibrationChange[] } {
    const changes: CalibrationChange[] = [];
    const params: Partial<CalibrationParams> = {};

    // If accuracy is low, increase confidence thresholds (be more conservative)
    if (metrics.accuracy < 0.7) {
      const adjustment = this.learningRate * (0.8 - metrics.accuracy);

      if (current.confidenceThresholdLow < 0.5) {
        const newValue = Math.min(0.5, current.confidenceThresholdLow + adjustment);
        if (Math.abs(newValue - current.confidenceThresholdLow) > 0.01) {
          changes.push({
            parameter: 'confidenceThresholdLow',
            oldValue: current.confidenceThresholdLow,
            newValue,
            reason: 'Increasing due to low accuracy',
          });
          params.confidenceThresholdLow = newValue;
        }
      }

      if (current.confidenceThresholdMedium < 0.7) {
        const newValue = Math.min(0.7, current.confidenceThresholdMedium + adjustment);
        if (Math.abs(newValue - current.confidenceThresholdMedium) > 0.01) {
          changes.push({
            parameter: 'confidenceThresholdMedium',
            oldValue: current.confidenceThresholdMedium,
            newValue,
            reason: 'Increasing due to low accuracy',
          });
          params.confidenceThresholdMedium = newValue;
        }
      }
    }

    // If slash rate is high, significantly increase thresholds
    if (metrics.slashRate > 0.1) {
      const adjustment = this.learningRate * metrics.slashRate * 2;

      const newHigh = Math.min(0.9, current.confidenceThresholdHigh + adjustment);
      if (Math.abs(newHigh - current.confidenceThresholdHigh) > 0.01) {
        changes.push({
          parameter: 'confidenceThresholdHigh',
          oldValue: current.confidenceThresholdHigh,
          newValue: newHigh,
          reason: 'Increasing due to high slash rate',
        });
        params.confidenceThresholdHigh = newHigh;
      }
    }

    // If accuracy is high, slightly decrease thresholds (be more aggressive)
    if (metrics.accuracy > 0.9 && metrics.slashRate < 0.05) {
      const adjustment = this.learningRate * 0.5;

      if (current.confidenceThresholdLow > 0.2) {
        const newValue = Math.max(0.2, current.confidenceThresholdLow - adjustment);
        if (Math.abs(newValue - current.confidenceThresholdLow) > 0.01) {
          changes.push({
            parameter: 'confidenceThresholdLow',
            oldValue: current.confidenceThresholdLow,
            newValue,
            reason: 'Decreasing due to high accuracy',
          });
          params.confidenceThresholdLow = newValue;
        }
      }
    }

    return { params, changes };
  }

  private updateRiskWeights(
    current: CalibrationParams,
    outcomes: OutcomeRecord[]
  ): { params: Partial<CalibrationParams>; changes: CalibrationChange[] } {
    // This would require storing fraud indicator presence per outcome
    // For now, return no changes
    return { params: {}, changes: [] };
  }

  private updateAggressiveness(
    current: CalibrationParams,
    outcomes: OutcomeRecord[],
    metrics: { biasDirection: string; biasAmount: number }
  ): { value: number; change: CalibrationChange } | null {
    // If we have a significant bias, adjust aggressiveness
    if (metrics.biasAmount < 3) return null;

    let newValue = current.advocateAggressiveness;
    let reason = '';

    if (metrics.biasDirection === 'agent') {
      // We're voting lower than consensus - provider advocate needs to be stronger
      newValue = Math.min(0.9, current.advocateAggressiveness + this.learningRate * 0.5);
      reason = 'Increasing to counter agent-favoring bias';
    } else if (metrics.biasDirection === 'provider') {
      // We're voting higher than consensus - agent advocate needs to be stronger
      newValue = Math.max(0.5, current.advocateAggressiveness - this.learningRate * 0.5);
      reason = 'Decreasing to counter provider-favoring bias';
    }

    if (Math.abs(newValue - current.advocateAggressiveness) < 0.01) {
      return null;
    }

    return {
      value: newValue,
      change: {
        parameter: 'advocateAggressiveness',
        oldValue: current.advocateAggressiveness,
        newValue,
        reason,
      },
    };
  }

  /**
   * Get current calibration parameters
   */
  getCalibration(): CalibrationParams {
    return this.knowledgeBase.getCalibration();
  }

  /**
   * Reset calibration to defaults
   */
  resetCalibration(): void {
    this.knowledgeBase.saveCalibration({
      confidenceThresholdLow: 0.3,
      confidenceThresholdMedium: 0.5,
      confidenceThresholdHigh: 0.7,
      riskWeightFraudHigh: 0.9,
      riskWeightFraudMedium: 0.6,
      riskWeightFraudLow: 0.3,
      advocateAggressiveness: 0.7,
      historicalAccuracy: 1.0,
      totalVotes: 0,
      accurateVotes: 0,
      slashEvents: 0,
      lastUpdated: Date.now(),
    });

    log.info('Calibration reset to defaults');
  }
}
