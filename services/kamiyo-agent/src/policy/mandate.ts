/**
 * Mandate Classification (Graduated Autonomy)
 *
 * Classifies each job into a permission tier based on cost ratio,
 * source reliability, and agent history. Replaces binary allow/deny
 * with semantic graduated autonomy.
 *
 * @module policy/mandate
 */

export type MandateTier = 'auto_approve' | 'verify_first' | 'require_approval' | 'deny';

export type MandateClassification = {
  tier: MandateTier;
  reason: string;
  costRelativeToCap: number;
  sourceReliability: number;
  agentHistoryScore: number;
};

export type MandateClassificationInput = {
  estimatedCostSol: number;
  dailyCapSol: number;
  sourceReliability: number;
  agentSuccessRate: number;
  sourceDisabledByRollback: boolean;
  agentPaused: boolean;
  thresholds?: MandateThresholds;
};

export type MandateThresholds = {
  autoApproveCostRatio: number;
  autoApproveMinReliability: number;
  autoApproveMinSuccessRate: number;
  verifyFirstCostRatio: number;
  verifyFirstMinReliability: number;
};

const DEFAULT_THRESHOLDS: MandateThresholds = {
  autoApproveCostRatio: 0.1,
  autoApproveMinReliability: 0.7,
  autoApproveMinSuccessRate: 0.6,
  verifyFirstCostRatio: 0.3,
  verifyFirstMinReliability: 0.5,
};

export type ApprovalRequest = {
  id: string;
  tickId: string;
  agentId: string;
  opportunityId: string;
  source: string;
  estimatedCostSol: number;
  classification: MandateClassification;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
  resolvedAt?: string;
};

export function classifyMandate(input: MandateClassificationInput): MandateClassification {
  const t = input.thresholds ?? DEFAULT_THRESHOLDS;
  const costRatio = input.dailyCapSol > 0 ? input.estimatedCostSol / input.dailyCapSol : 1;

  const base = {
    costRelativeToCap: costRatio,
    sourceReliability: input.sourceReliability,
    agentHistoryScore: input.agentSuccessRate,
  };

  // Hard deny: source disabled by rollback or agent paused
  if (input.sourceDisabledByRollback) {
    return { ...base, tier: 'deny', reason: 'source_disabled_by_rollback' };
  }
  if (input.agentPaused) {
    return { ...base, tier: 'deny', reason: 'agent_paused' };
  }

  // Auto approve: low cost, reliable source, good agent history
  if (
    costRatio < t.autoApproveCostRatio &&
    input.sourceReliability > t.autoApproveMinReliability &&
    input.agentSuccessRate > t.autoApproveMinSuccessRate
  ) {
    return { ...base, tier: 'auto_approve', reason: 'low_risk' };
  }

  // Verify first: moderate cost, reasonable source
  if (costRatio < t.verifyFirstCostRatio && input.sourceReliability > t.verifyFirstMinReliability) {
    return { ...base, tier: 'verify_first', reason: 'moderate_risk' };
  }

  // Require approval: high cost or low reliability
  return {
    ...base,
    tier: 'require_approval',
    reason: costRatio >= t.verifyFirstCostRatio ? 'high_cost_ratio' : 'low_source_reliability',
  };
}
