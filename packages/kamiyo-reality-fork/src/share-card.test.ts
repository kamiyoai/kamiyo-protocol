import { describe, expect, it } from 'vitest';
import { buildRealityForkShareCard } from './share-card';
import type { RealityForkScenario } from './types';

const scenario: RealityForkScenario = {
  id: 'case-1',
  slug: 'case-1',
  title: 'Ship or delay',
  tagline: 'Fork reality',
  summary: 'summary',
  tags: ['ai'],
  sourceLabel: 'Observatory Session',
  mission: 'Ship or delay',
  createdAt: new Date().toISOString(),
  completedAt: new Date().toISOString(),
  snapshotHash: 'hash',
  status: 'ready',
  snapshot: {
    sourceType: 'observatory_session',
    sourceRef: 'session-1',
    capturedAt: new Date().toISOString(),
    teamId: 'team-1',
    teamMembers: [],
    artifactCount: 1,
    artifactRefs: ['evt-1'],
    escrows: [],
    events: [],
    highlights: [],
  },
  branches: [
    {
      branchId: 'winner',
      policyPackId: 'baseline',
      label: 'Baseline',
      status: 'completed',
      verdict: 'winner',
      summary: 'baseline',
      nodeCount: 2,
      completedNodes: 2,
      failedNodes: 0,
      latencyMs: 200,
      totalSpent: 0.1,
      evidenceRefs: ['evt-1'],
      riskFlags: [],
      highRiskFlags: [],
      score: 0.84,
      completionScore: 1,
      evidenceCoverage: 1,
      latencyScore: 1,
      costScore: 1,
      riskPenalty: 0,
      outputHighlights: [],
    },
    {
      branchId: 'runner-up',
      policyPackId: 'safe_exit',
      label: 'Safe Exit',
      status: 'completed',
      verdict: 'runner_up',
      summary: 'safe exit',
      nodeCount: 2,
      completedNodes: 2,
      failedNodes: 0,
      latencyMs: 300,
      totalSpent: 0.05,
      evidenceRefs: ['evt-1'],
      riskFlags: [],
      highRiskFlags: [],
      score: 0.61,
      completionScore: 1,
      evidenceCoverage: 1,
      latencyScore: 0.7,
      costScore: 1,
      riskPenalty: 0.1,
      outputHighlights: [],
    },
  ],
  decision: {
    winnerBranchId: 'winner',
    winnerLabel: 'Baseline',
    winnerReason: 'highest deterministic score',
    mode: 'score_then_truth_court',
    usedTruthCourt: false,
    committeeDisagreement: false,
    scoreDelta: 0.23,
    promotedRunId: null,
    topBranchIds: ['winner', 'runner-up'],
  },
  replay: { events: [] },
  shareCard: {
    headline: '',
    kicker: '',
    body: '',
    scoreline: '',
    bullets: [],
    xPost: '',
  },
};

describe('buildRealityForkShareCard', () => {
  it('builds a deterministic winner summary', () => {
    const shareCard = buildRealityForkShareCard(scenario);
    expect(shareCard.headline).toContain('Baseline');
    expect(shareCard.scoreline).toContain('Baseline');
    expect(shareCard.xPost).toContain('Reality Fork');
  });
});
