import type { ExecuteSwarmRunResult } from '../swarm/service';
import type {
  BranchExecutionSummary,
  BranchRiskSummary,
  CounterfactualScorecard,
  CounterfactualSnapshot,
} from './types';

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round(value: number): number {
  return Number(value.toFixed(6));
}

function collectArtifactIds(snapshot: CounterfactualSnapshot): string[] {
  const ids = new Set<string>();

  for (const escrow of snapshot.observatory.escrows as Array<Record<string, unknown>>) {
    for (const key of ['escrowPda', 'sessionId', 'lastSignature']) {
      const value = escrow?.[key];
      if (typeof value === 'string' && value.trim()) ids.add(value.trim());
    }
  }

  for (const event of snapshot.observatory.events) {
    for (const key of ['id', 'signature', 'escrow_pda', 'session_id', 'escrowPda', 'sessionId']) {
      const value = event?.[key];
      if (typeof value === 'string' && value.trim()) ids.add(value.trim());
    }
  }

  return Array.from(ids).sort();
}

function scanEvidenceRefs(value: unknown, artifactIds: Set<string>, out: Set<string>): void {
  if (Array.isArray(value)) {
    for (const item of value) scanEvidenceRefs(item, artifactIds, out);
    return;
  }

  if (!value || typeof value !== 'object') {
    if (typeof value === 'string' && artifactIds.has(value)) out.add(value);
    return;
  }

  const record = value as Record<string, unknown>;
  const evidenceRefs = record.evidenceRefs;
  if (Array.isArray(evidenceRefs)) {
    for (const ref of evidenceRefs) {
      if (typeof ref === 'string' && artifactIds.has(ref)) out.add(ref);
    }
  }

  for (const entry of Object.values(record)) {
    scanEvidenceRefs(entry, artifactIds, out);
  }
}

export function summarizeBranchRisk(result: ExecuteSwarmRunResult): BranchRiskSummary {
  const flags = new Set<string>();

  for (const node of Object.values(result.nodes) as Array<any>) {
    if (node?.status !== 'completed') continue;
    const riskFlags = Array.isArray(node?.output?.riskFlags) ? node.output.riskFlags : [];
    for (const riskFlag of riskFlags) {
      if (typeof riskFlag === 'string' && riskFlag.trim()) flags.add(riskFlag.trim());
    }
  }

  const sortedFlags = Array.from(flags).sort();
  return {
    flags: sortedFlags,
    highRiskFlags: sortedFlags.filter((flag) => flag !== 'mutating_tool_attempt'),
  };
}

function inverseNormalize(values: number[]): number[] {
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) {
    return values.map(() => 1);
  }

  return values.map((value) => round(1 - (value - min) / (max - min)));
}

export function scoreBranches(params: {
  snapshot: CounterfactualSnapshot;
  branches: BranchExecutionSummary[];
}): CounterfactualScorecard[] {
  const artifactIds = collectArtifactIds(params.snapshot);
  const artifactIdSet = new Set(artifactIds);

  const latencyScores = inverseNormalize(params.branches.map((branch) => branch.result.timingMs.duration));
  const costScores = inverseNormalize(params.branches.map((branch) => branch.result.totals.spent));

  return params.branches.map((branch, index) => {
    const nodes = Object.values(branch.result.nodes) as Array<any>;
    const totalNodes = nodes.length;
    const completedNodes = nodes.filter((node) => node?.status === 'completed').length;
    const failedNodes = nodes.filter((node) => node?.status === 'failed').length;
    const completionScore = totalNodes === 0 ? 0 : round(completedNodes / totalNodes);

    const evidenceRefs = new Set<string>();
    for (const node of nodes) {
      if (node?.status !== 'completed') continue;
      scanEvidenceRefs(node?.output?.output ?? null, artifactIdSet, evidenceRefs);
    }

    const evidenceCoverage = artifactIds.length === 0
      ? 0
      : round(evidenceRefs.size / artifactIds.length);

    const risk = summarizeBranchRisk(branch.result);
    const failedNodeRate = totalNodes === 0 ? 0 : failedNodes / totalNodes;
    const riskPenalty = round(
      clamp(
        (risk.flags.includes('mutating_tool_attempt') ? 1 : 0) +
          0.5 * failedNodeRate +
          0.25 * risk.highRiskFlags.length,
        0,
        1
      )
    );

    const finalScore = round(
      clamp(
        0.35 * completionScore +
          0.30 * evidenceCoverage +
          0.20 * latencyScores[index] +
          0.15 * costScores[index] -
          0.40 * riskPenalty,
        0,
        1
      )
    );

    return {
      branchId: branch.branchId,
      policyPackId: branch.policyPackId,
      completionScore,
      evidenceCoverage,
      riskPenalty,
      latencyScore: latencyScores[index],
      costScore: costScores[index],
      finalScore,
      metrics: {
        completedNodes,
        failedNodes,
        totalNodes,
        latencyMs: branch.result.timingMs.duration,
        totalSpent: branch.result.totals.spent,
        distinctEvidenceRefs: Array.from(evidenceRefs).sort(),
        totalSnapshotArtifacts: artifactIds.length,
      },
      riskFlags: risk.flags,
      highRiskFlags: risk.highRiskFlags,
    };
  });
}
