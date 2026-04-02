import { buildRealityForkShareCard } from './share-card';
import { replayScenarioEvents } from './replay';
import type {
  CompanionControlRoomBranch,
  CompanionControlRoomCaseDetail,
  CompanionControlRoomDecisionMode,
  CompanionControlRoomPolicyPackId,
  RealityForkBranch,
  RealityForkFixtureBundle,
  RealityForkScenario,
  RealityForkScenarioMetadata,
  RealityForkSnapshot,
} from './types';

function toSlug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function compactText(value: string, max = 180): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, max - 3)}...`;
}

function policyLabel(policyPackId: CompanionControlRoomPolicyPackId): string {
  switch (policyPackId) {
    case 'baseline':
      return 'Baseline';
    case 'aggressive':
      return 'Aggressive';
    case 'verify_first':
      return 'Verify First';
    case 'safe_exit':
      return 'Safe Exit';
  }
  return 'Branch';
}

function branchSummary(branch: CompanionControlRoomBranch): string {
  switch (branch.policyPackId) {
    case 'baseline':
      return 'Default branch with the original mission topology and standard budgets.';
    case 'aggressive':
      return 'Presses speed and budget harder to maximize decisive forward motion.';
    case 'verify_first':
      return 'Front-loads verification and risk enumeration before downstream work.';
    case 'safe_exit':
      return 'Biases toward reversible, lower-cost exits instead of reward chasing.';
  }
  return 'Counterfactual branch derived from the same immutable snapshot.';
}

function collectArtifactRefs(detail: CompanionControlRoomCaseDetail): string[] {
  const ids = new Set<string>();

  for (const escrow of detail.snapshot.observatory.escrows as Array<Record<string, unknown>>) {
    for (const key of ['escrowPda', 'sessionId', 'lastSignature']) {
      const value = escrow[key];
      if (typeof value === 'string' && value.trim()) ids.add(value.trim());
    }
  }

  for (const event of detail.snapshot.observatory.events) {
    for (const key of ['id', 'signature', 'escrow_pda', 'session_id', 'escrowPda', 'sessionId']) {
      const value = event[key];
      if (typeof value === 'string' && value.trim()) ids.add(value.trim());
    }
  }

  return Array.from(ids).sort();
}

function inferSourceLabel(
  detail: CompanionControlRoomCaseDetail,
  metadata?: RealityForkScenarioMetadata
): string {
  if (metadata?.sourceLabel?.trim()) return metadata.sourceLabel.trim();
  switch (detail.source.type) {
    case 'observatory_session':
      return 'Observatory Session';
    case 'observatory_escrow':
      return 'Observatory Escrow';
    case 'manual_evidence':
      return 'Manual Evidence';
  }
  return 'Control Room';
}

function buildSnapshot(detail: CompanionControlRoomCaseDetail): RealityForkSnapshot {
  const artifactRefs = collectArtifactRefs(detail);
  return {
    sourceType: detail.source.type,
    sourceRef: detail.source.ref,
    capturedAt: detail.snapshot.capturedAt,
    teamId: detail.snapshot.team.id,
    teamMembers: detail.snapshot.team.members.map(
      (member: CompanionControlRoomCaseDetail['snapshot']['team']['members'][number]) => ({
        id: member.id,
        role: member.role,
        drawLimit: member.drawLimit,
      })
    ),
    artifactCount: artifactRefs.length,
    artifactRefs,
    escrows: (detail.snapshot.observatory.escrows as Array<Record<string, unknown>>).map(
      escrow => ({
        escrowPda: typeof escrow.escrowPda === 'string' ? escrow.escrowPda : null,
        sessionId: typeof escrow.sessionId === 'string' ? escrow.sessionId : null,
        lastSignature: typeof escrow.lastSignature === 'string' ? escrow.lastSignature : null,
      })
    ),
    events: detail.snapshot.observatory.events.map((event: Record<string, unknown>) => ({
      id: typeof event.id === 'string' ? event.id : null,
      signature: typeof event.signature === 'string' ? event.signature : null,
      sessionId:
        typeof event.session_id === 'string'
          ? event.session_id
          : typeof event.sessionId === 'string'
            ? event.sessionId
            : null,
      escrowPda:
        typeof event.escrow_pda === 'string'
          ? event.escrow_pda
          : typeof event.escrowPda === 'string'
            ? event.escrowPda
            : null,
    })),
    highlights: [
      `${detail.snapshot.team.members.length} team members in the snapshot`,
      `${artifactRefs.length} snapshot artifacts available for citation`,
      `${detail.branches.length} counterfactual branches compared`,
    ],
  };
}

function extractOutputHighlights(branch: CompanionControlRoomBranch): string[] {
  const outputs = branch.run?.nodes
    .map(node => {
      if (node.status !== 'completed') return null;
      const output = node.output as Record<string, unknown> | null;
      const nested =
        output && typeof output === 'object'
          ? (output.output as Record<string, unknown> | undefined)
          : undefined;
      const result =
        nested && typeof nested.result === 'string'
          ? nested.result
          : output && typeof output === 'object' && typeof output.result === 'string'
            ? output.result
            : null;
      return result ? compactText(result, 110) : null;
    })
    .filter((value): value is string => Boolean(value));

  return outputs?.slice(0, 3) ?? [];
}

function verdictForBranch(
  branch: CompanionControlRoomBranch,
  winnerBranchId: string | null,
  runnerUpId: string | null
): RealityForkBranch['verdict'] {
  if (branch.branchId === winnerBranchId) return 'winner';
  if (branch.branchId === runnerUpId) return 'runner_up';
  return 'contender';
}

function decisionFromEvent(detail: CompanionControlRoomCaseDetail): {
  winnerReason: string;
  usedTruthCourt: boolean;
  committeeDisagreement: boolean;
  scoreDelta: number;
  topBranchIds: string[];
  mode: CompanionControlRoomDecisionMode;
} {
  const adjudication = detail.events
    .slice()
    .reverse()
    .find(
      (event: CompanionControlRoomCaseDetail['events'][number]) =>
        event.eventType === 'adjudication_completed'
    );
  return {
    winnerReason:
      typeof adjudication?.payload?.winnerReason === 'string'
        ? adjudication.payload.winnerReason
        : 'highest deterministic score',
    usedTruthCourt: Boolean(adjudication?.payload?.usedTruthCourt),
    committeeDisagreement: Boolean(adjudication?.payload?.committeeDisagreement),
    scoreDelta:
      typeof adjudication?.payload?.scoreDelta === 'number' ? adjudication.payload.scoreDelta : 0,
    topBranchIds: Array.isArray(adjudication?.payload?.topBranchIds)
      ? adjudication.payload.topBranchIds.filter(
          (value: unknown): value is string => typeof value === 'string'
        )
      : detail.winnerBranchId
        ? [detail.winnerBranchId]
        : [],
    mode:
      typeof adjudication?.payload?.mode === 'string'
        ? (adjudication.payload.mode as CompanionControlRoomDecisionMode)
        : detail.decisionMode,
  };
}

function buildBranches(detail: CompanionControlRoomCaseDetail): RealityForkBranch[] {
  const sortedByScore = detail.branches
    .slice()
    .sort(
      (left: CompanionControlRoomBranch, right: CompanionControlRoomBranch) =>
        (right.scorecard?.finalScore ?? 0) - (left.scorecard?.finalScore ?? 0)
    );
  const runnerUpId = sortedByScore[1]?.branchId ?? null;

  return detail.branches.map((branch: CompanionControlRoomBranch) => {
    const scorecard = branch.scorecard;
    return {
      branchId: branch.branchId,
      policyPackId: branch.policyPackId,
      label: policyLabel(branch.policyPackId),
      status: branch.status,
      verdict: verdictForBranch(branch, detail.winnerBranchId, runnerUpId),
      summary: branchSummary(branch),
      nodeCount: branch.plan.nodes.length,
      completedNodes: scorecard?.metrics.completedNodes ?? 0,
      failedNodes: scorecard?.metrics.failedNodes ?? 0,
      latencyMs: scorecard?.metrics.latencyMs ?? branch.run?.nodes.length ?? 0,
      totalSpent: scorecard?.metrics.totalSpent ?? branch.run?.totals.spent ?? 0,
      evidenceRefs: scorecard?.metrics.distinctEvidenceRefs ?? [],
      riskFlags: scorecard?.riskFlags ?? [],
      highRiskFlags: scorecard?.highRiskFlags ?? [],
      score: scorecard?.finalScore ?? 0,
      completionScore: scorecard?.completionScore ?? 0,
      evidenceCoverage: scorecard?.evidenceCoverage ?? 0,
      latencyScore: scorecard?.latencyScore ?? 0,
      costScore: scorecard?.costScore ?? 0,
      riskPenalty: scorecard?.riskPenalty ?? 0,
      outputHighlights: extractOutputHighlights(branch),
    };
  });
}

export function adaptCompanionCaseToScenario(
  detail: CompanionControlRoomCaseDetail,
  metadata: RealityForkScenarioMetadata = {}
): RealityForkScenario {
  const id = metadata.id?.trim() || detail.caseId;
  const slug = metadata.slug?.trim() || toSlug(metadata.title?.trim() || detail.mission);
  const title = metadata.title?.trim() || compactText(detail.mission, 64);
  const tagline =
    metadata.tagline?.trim() || 'Fork reality, let futures compete, promote the strongest path.';
  const summary =
    metadata.summary?.trim() ||
    `One immutable snapshot, ${detail.branches.length} readonly branches, and a promoted winner backed by evidence and risk scoring.`;
  const sourceLabel = inferSourceLabel(detail, metadata);
  const decisionMeta = decisionFromEvent(detail);
  const branches = buildBranches(detail);
  const branchLabelMap = Object.fromEntries(
    branches.map(branch => [branch.branchId, branch.label])
  );

  const scenario: RealityForkScenario = {
    id,
    slug,
    title,
    tagline,
    summary,
    tags: metadata.tags?.length ? metadata.tags : ['ai-agents', 'counterfactuals', 'control-room'],
    sourceLabel,
    mission: detail.mission,
    createdAt: new Date(detail.createdAt).toISOString(),
    completedAt: detail.completedAt ? new Date(detail.completedAt).toISOString() : null,
    snapshotHash: detail.snapshotHash,
    status: detail.status,
    snapshot: buildSnapshot(detail),
    branches,
    decision: {
      winnerBranchId: detail.winnerBranchId,
      winnerLabel: detail.winnerBranchId ? (branchLabelMap[detail.winnerBranchId] ?? null) : null,
      winnerReason: decisionMeta.winnerReason,
      mode: decisionMeta.mode,
      usedTruthCourt: decisionMeta.usedTruthCourt,
      committeeDisagreement: decisionMeta.committeeDisagreement,
      scoreDelta: decisionMeta.scoreDelta,
      promotedRunId: detail.promotedRunId,
      topBranchIds: decisionMeta.topBranchIds,
    },
    replay: {
      events: replayScenarioEvents(detail.events, branchLabelMap),
    },
    shareCard: {} as never,
  };

  scenario.shareCard = buildRealityForkShareCard(scenario);
  return scenario;
}

export function createRealityForkFixtureBundle(
  detail: CompanionControlRoomCaseDetail,
  metadata: RealityForkScenarioMetadata = {}
): RealityForkFixtureBundle {
  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    generator: {
      source: 'control-room-export',
      teamId: detail.teamId,
      caseId: detail.caseId,
    },
    scenario: adaptCompanionCaseToScenario(detail, metadata),
  };
}
