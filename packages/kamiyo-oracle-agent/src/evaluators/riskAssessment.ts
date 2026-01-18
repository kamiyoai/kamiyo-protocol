import type { Evaluator, IAgentRuntime, Memory, State, OraclePerformance } from '../types';
import { ORACLE_CONSTANTS } from '../config';

export const riskAssessmentEvaluator: Evaluator = {
  name: 'ORACLE_RISK_ASSESSMENT',
  description: 'Continuously monitors oracle risk exposure and warns about potential issues',

  async validate(_runtime: IAgentRuntime, _message: Memory): Promise<boolean> {
    // Run periodically on any message to check risk status
    return true;
  },

  async handler(
    runtime: IAgentRuntime,
    _message: Memory,
    _state?: State
  ): Promise<{
    riskLevel: 'low' | 'medium' | 'high' | 'critical';
    warnings: string[];
    recommendations: string[];
  }> {
    const oracleState = await runtime.getState?.('oracle_state') as {
      performance?: OraclePerformance;
      pendingDisputes?: Array<{ amount: number }>;
    } | undefined;

    const performance = oracleState?.performance;
    const pendingDisputes = oracleState?.pendingDisputes || [];

    const warnings: string[] = [];
    const recommendations: string[] = [];
    let riskLevel: 'low' | 'medium' | 'high' | 'critical' = 'low';

    // Check violation count
    if (performance) {
      const violationsRemaining = ORACLE_CONSTANTS.VIOLATION_LIMIT - performance.violationCount;

      if (violationsRemaining === 0) {
        riskLevel = 'critical';
        warnings.push('Oracle has been removed from registry due to violations');
        recommendations.push('Re-register oracle with new stake');
      } else if (violationsRemaining === 1) {
        riskLevel = 'high';
        warnings.push('One violation away from removal');
        recommendations.push('Only vote on high-confidence disputes');
        recommendations.push('Consider abstaining on uncertain cases');
      } else if (violationsRemaining === 2) {
        riskLevel = 'medium';
        warnings.push('Two violations recorded');
        recommendations.push('Exercise caution on edge cases');
      }

      // Check accuracy rate
      if (performance.totalVotes >= 10 && performance.accuracyRate < 80) {
        if (riskLevel === 'low') riskLevel = 'medium';
        warnings.push(`Low accuracy rate: ${performance.accuracyRate.toFixed(1)}%`);
        recommendations.push('Review evaluation strategy');
        recommendations.push('Consider more conservative score adjustments');
      }

      // Check P&L
      if (performance.profitLoss < -0.1) {
        if (riskLevel === 'low') riskLevel = 'medium';
        warnings.push(`Negative P&L: ${performance.profitLoss.toFixed(6)} SOL`);
        recommendations.push('Reduce voting frequency until accuracy improves');
      }

      // Check stake erosion
      const stakeErosion = 1.0 - performance.currentStake;
      if (stakeErosion > 0.2) {
        if (riskLevel !== 'critical') riskLevel = 'high';
        warnings.push(`Significant stake erosion: ${(stakeErosion * 100).toFixed(1)}%`);
        recommendations.push('Consider adding more stake');
      }
    }

    // Check pending dispute exposure
    const pendingExposure = pendingDisputes.length * (performance?.currentStake || 1.0) * 0.1;
    const maxPendingAllowed = parseInt(runtime.getSetting('MAX_PENDING_DISPUTES') || '5');

    if (pendingDisputes.length > maxPendingAllowed) {
      if (riskLevel === 'low') riskLevel = 'medium';
      warnings.push(`Too many pending disputes: ${pendingDisputes.length}/${maxPendingAllowed}`);
      recommendations.push('Wait for some disputes to resolve before taking more');
    }

    return {
      riskLevel,
      warnings,
      recommendations,
    };
  },
};
