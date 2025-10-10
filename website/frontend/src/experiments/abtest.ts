/**
 * A/B Testing Framework
 *
 * Features:
 * - Variant assignment (consistent per user)
 * - Track experiment exposure
 * - Track conversion per variant
 * - Statistical significance calculator
 * - Easy experiment definition
 *
 * Usage:
 * const variant = abtest.getVariant('pricing_page_layout');
 * abtest.trackExposure('pricing_page_layout', variant);
 * abtest.trackConversion('pricing_page_layout', variant);
 */

import analytics from '../analytics/analytics';
import GA4 from '../analytics/ga4';
import Cookies from 'js-cookie';

// Experiment configuration
export interface Experiment {
  id: string;
  name: string;
  description: string;
  variants: ExperimentVariant[];
  status: 'draft' | 'running' | 'paused' | 'completed';
  startDate?: string;
  endDate?: string;
  targetingRules?: TargetingRule[];
}

// Experiment variant
export interface ExperimentVariant {
  id: string;
  name: string;
  weight: number; // 0-100 percentage
  config?: Record<string, any>;
}

// Targeting rules
export interface TargetingRule {
  type: 'user_tier' | 'new_user' | 'country' | 'custom';
  value: any;
}

// Experiment result
export interface ExperimentResult {
  experimentId: string;
  variant: string;
  exposures: number;
  conversions: number;
  conversionRate: number;
  averageValue: number;
}

class ABTestFramework {
  private experiments: Map<string, Experiment> = new Map();
  private userAssignments: Map<string, string> = new Map();
  private exposures: Map<string, Set<string>> = new Map();
  private conversions: Map<string, number> = new Map();

  constructor() {
    this.loadExperiments();
    this.loadUserAssignments();
  }

  /**
   * Initialize A/B testing framework
   */
  initialize(experiments: Experiment[]): void {
    experiments.forEach((experiment) => {
      this.experiments.set(experiment.id, experiment);
    });

    this.saveExperiments();
    console.log('ABTest: Initialized with experiments', experiments.length);
  }

  /**
   * Register a new experiment
   */
  registerExperiment(experiment: Experiment): void {
    this.experiments.set(experiment.id, experiment);
    this.saveExperiments();
    console.log('ABTest: Registered experiment', experiment.id);
  }

  /**
   * Get variant for user
   */
  getVariant(experimentId: string, userId?: string): string {
    const experiment = this.experiments.get(experimentId);

    if (!experiment) {
      console.warn(`ABTest: Experiment ${experimentId} not found`);
      return 'control';
    }

    if (experiment.status !== 'running') {
      return 'control';
    }

    // Check if user already has assignment
    const assignmentKey = `${experimentId}_${userId || 'anonymous'}`;
    const existingAssignment = this.userAssignments.get(assignmentKey);

    if (existingAssignment) {
      return existingAssignment;
    }

    // Check targeting rules
    if (!this.meetsTargeting(experiment)) {
      return 'control';
    }

    // Assign variant based on weights
    const variant = this.assignVariant(experiment, userId);
    this.userAssignments.set(assignmentKey, variant);
    this.saveUserAssignments();

    return variant;
  }

  /**
   * Assign variant based on weights
   */
  private assignVariant(experiment: Experiment, userId?: string): string {
    // Use consistent hash for same user
    const hash = this.hashUserId(experiment.id, userId || this.getAnonymousId());
    const totalWeight = experiment.variants.reduce((sum, v) => sum + v.weight, 0);
    const normalizedHash = (hash % 100) + 1;

    let cumulativeWeight = 0;
    for (const variant of experiment.variants) {
      cumulativeWeight += (variant.weight / totalWeight) * 100;
      if (normalizedHash <= cumulativeWeight) {
        return variant.id;
      }
    }

    // Default to first variant
    return experiment.variants[0].id;
  }

  /**
   * Simple hash function for consistent assignment
   */
  private hashUserId(experimentId: string, userId: string): number {
    const str = `${experimentId}_${userId}`;
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash);
  }

  /**
   * Get or create anonymous ID
   */
  private getAnonymousId(): string {
    let anonymousId = Cookies.get('ab_anonymous_id');

    if (!anonymousId) {
      anonymousId = this.generateId();
      Cookies.set('ab_anonymous_id', anonymousId, { expires: 365 });
    }

    return anonymousId;
  }

  /**
   * Generate unique ID
   */
  private generateId(): string {
    return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Track experiment exposure
   */
  trackExposure(experimentId: string, variant: string, userId?: string): void {
    const experiment = this.experiments.get(experimentId);
    if (!experiment) return;

    const key = `${experimentId}_${variant}`;
    if (!this.exposures.has(key)) {
      this.exposures.set(key, new Set());
    }

    const userKey = userId || this.getAnonymousId();
    this.exposures.get(key)!.add(userKey);

    // Track in analytics
    analytics.trackEvent('experiment_exposure', {
      category: 'A/B Test',
      label: experimentId,
      customParams: {
        experiment_id: experimentId,
        experiment_name: experiment.name,
        variant,
      },
    });

    GA4.trackEvent('experiment_impression', {
      experiment_id: experimentId,
      variant_id: variant,
    });

    console.log('ABTest: Tracked exposure', { experimentId, variant });
  }

  /**
   * Track conversion
   */
  trackConversion(
    experimentId: string,
    variant: string,
    value?: number,
    userId?: string
  ): void {
    const experiment = this.experiments.get(experimentId);
    if (!experiment) return;

    const key = `${experimentId}_${variant}_${userId || this.getAnonymousId()}`;
    const currentCount = this.conversions.get(key) || 0;
    this.conversions.set(key, currentCount + 1);

    // Track in analytics
    analytics.trackEvent('experiment_conversion', {
      category: 'A/B Test',
      label: experimentId,
      value,
      customParams: {
        experiment_id: experimentId,
        experiment_name: experiment.name,
        variant,
        conversion_value: value,
      },
    });

    console.log('ABTest: Tracked conversion', { experimentId, variant, value });
  }

  /**
   * Get experiment results
   */
  getResults(experimentId: string): ExperimentResult[] {
    const experiment = this.experiments.get(experimentId);
    if (!experiment) return [];

    return experiment.variants.map((variant) => {
      const exposureKey = `${experimentId}_${variant.id}`;
      const exposures = this.exposures.get(exposureKey)?.size || 0;

      // Count conversions for this variant
      let conversions = 0;
      let totalValue = 0;

      this.conversions.forEach((count, key) => {
        if (key.startsWith(`${experimentId}_${variant.id}_`)) {
          conversions += count;
          totalValue += count; // Simplified - should track actual values
        }
      });

      const conversionRate = exposures > 0 ? conversions / exposures : 0;
      const averageValue = conversions > 0 ? totalValue / conversions : 0;

      return {
        experimentId,
        variant: variant.id,
        exposures,
        conversions,
        conversionRate,
        averageValue,
      };
    });
  }

  /**
   * Calculate statistical significance
   */
  calculateSignificance(
    controlResults: ExperimentResult,
    variantResults: ExperimentResult
  ): {
    significant: boolean;
    pValue: number;
    confidenceLevel: number;
  } {
    // Simplified z-test for proportions
    const p1 = controlResults.conversionRate;
    const n1 = controlResults.exposures;
    const p2 = variantResults.conversionRate;
    const n2 = variantResults.exposures;

    if (n1 === 0 || n2 === 0) {
      return { significant: false, pValue: 1, confidenceLevel: 0 };
    }

    const pPool = (p1 * n1 + p2 * n2) / (n1 + n2);
    const se = Math.sqrt(pPool * (1 - pPool) * (1 / n1 + 1 / n2));
    const zScore = (p2 - p1) / se;
    const pValue = 2 * (1 - this.normalCDF(Math.abs(zScore)));

    const significant = pValue < 0.05;
    const confidenceLevel = (1 - pValue) * 100;

    return { significant, pValue, confidenceLevel };
  }

  /**
   * Normal cumulative distribution function (simplified)
   */
  private normalCDF(z: number): number {
    const t = 1 / (1 + 0.2316419 * Math.abs(z));
    const d = 0.3989423 * Math.exp(-z * z / 2);
    const p =
      d *
      t *
      (0.3193815 +
        t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
    return z > 0 ? 1 - p : p;
  }

  /**
   * Check if user meets targeting rules
   */
  private meetsTargeting(experiment: Experiment): boolean {
    if (!experiment.targetingRules || experiment.targetingRules.length === 0) {
      return true;
    }

    // TODO: Implement targeting logic based on user properties
    return true;
  }

  /**
   * Get variant configuration
   */
  getVariantConfig(experimentId: string, variant: string): Record<string, any> {
    const experiment = this.experiments.get(experimentId);
    if (!experiment) return {};

    const variantObj = experiment.variants.find((v) => v.id === variant);
    return variantObj?.config || {};
  }

  /**
   * Load experiments from storage
   */
  private loadExperiments(): void {
    const stored = localStorage.getItem('ab_experiments');
    if (stored) {
      try {
        const experiments = JSON.parse(stored);
        experiments.forEach((exp: Experiment) => {
          this.experiments.set(exp.id, exp);
        });
      } catch (error) {
        console.error('ABTest: Failed to load experiments', error);
      }
    }
  }

  /**
   * Save experiments to storage
   */
  private saveExperiments(): void {
    const experiments = Array.from(this.experiments.values());
    localStorage.setItem('ab_experiments', JSON.stringify(experiments));
  }

  /**
   * Load user assignments from storage
   */
  private loadUserAssignments(): void {
    const stored = localStorage.getItem('ab_assignments');
    if (stored) {
      try {
        const assignments = JSON.parse(stored);
        Object.entries(assignments).forEach(([key, value]) => {
          this.userAssignments.set(key, value as string);
        });
      } catch (error) {
        console.error('ABTest: Failed to load user assignments', error);
      }
    }
  }

  /**
   * Save user assignments to storage
   */
  private saveUserAssignments(): void {
    const assignments = Object.fromEntries(this.userAssignments);
    localStorage.setItem('ab_assignments', JSON.stringify(assignments));
  }

  /**
   * Reset all experiments (for testing)
   */
  reset(): void {
    this.experiments.clear();
    this.userAssignments.clear();
    this.exposures.clear();
    this.conversions.clear();
    localStorage.removeItem('ab_experiments');
    localStorage.removeItem('ab_assignments');
  }
}

// Create singleton instance
const abtest = new ABTestFramework();

// Export singleton
export default abtest;

// Export for testing
export { ABTestFramework };
