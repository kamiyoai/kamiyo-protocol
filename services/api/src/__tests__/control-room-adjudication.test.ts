import { describe, expect, it } from 'vitest';
import { adjudicateBranches } from '../control-room/adjudication';
import type { BranchExecutionSummary } from '../control-room/types';

function branch(params: {
  branchId: string;
  finalScore: number;
  riskFlags?: string[];
}): BranchExecutionSummary {
  return {
    branchId: params.branchId,
    policyPackId: 'baseline',
    branchKind: 'baseline',
    swarmRunId: `run-${params.branchId}`,
    status: 'completed',
    resultHash: `hash-${params.branchId}`,
    result: {
      runId: `run-${params.branchId}`,
      status: 'completed',
      executionMode: 'readonly',
      mission: 'mission',
      plan: { mode: 'dag', nodes: [] },
      timingMs: { startedAt: 1, completedAt: 2, duration: 1 },
      totals: { reserved: 0, spent: 0 },
      hashes: { planSha256: 'plan', resultsSha256: `results-${params.branchId}` },
      kiroku: { skipped: true },
      nodes: {},
      seeded: 0,
      snapshotHash: 'snap',
      counterfactualCaseId: 'case-1',
      counterfactualBranchId: params.branchId,
    },
    scorecard: {
      branchId: params.branchId,
      policyPackId: 'baseline',
      completionScore: 1,
      evidenceCoverage: 1,
      riskPenalty: 0,
      latencyScore: 1,
      costScore: 1,
      finalScore: params.finalScore,
      metrics: {
        completedNodes: 1,
        failedNodes: 0,
        totalNodes: 1,
        latencyMs: 1,
        totalSpent: 0,
        distinctEvidenceRefs: [],
        totalSnapshotArtifacts: 0,
      },
      riskFlags: params.riskFlags ?? [],
      highRiskFlags: [],
    },
  };
}

describe('control-room adjudication', () => {
  it('falls back to deterministic scoring when truth-court is not required', async () => {
    const result = await adjudicateBranches({
      caseId: 'case-1',
      snapshotHash: 'snap',
      decisionMode: 'score_only',
      branches: [branch({ branchId: 'a', finalScore: 0.9 }), branch({ branchId: 'b', finalScore: 0.6 })],
    });

    expect(result.usedTruthCourt).toBe(false);
    expect(result.winnerBranchId).toBe('a');
  });

  it('uses truth-court when the top branches are too close', async () => {
    const result = await adjudicateBranches({
      caseId: 'case-1',
      snapshotHash: 'snap',
      decisionMode: 'score_then_truth_court',
      branches: [branch({ branchId: 'a', finalScore: 0.61 }), branch({ branchId: 'b', finalScore: 0.58 })],
    });

    expect(result.usedTruthCourt).toBe(true);
    expect(result.topBranchIds).toEqual(['a', 'b']);
    expect(result.committee).not.toBeNull();
  });
});
