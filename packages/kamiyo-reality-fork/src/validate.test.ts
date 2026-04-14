import { describe, expect, it } from 'vitest';
import { assertRealityForkFixtureBundle } from './validate';

describe('assertRealityForkFixtureBundle', () => {
  it('accepts a minimal valid fixture bundle', () => {
    expect(() =>
      assertRealityForkFixtureBundle({
        version: 1,
        generatedAt: new Date().toISOString(),
        generator: {
          source: 'control-room-export',
          teamId: 'team-1',
          caseId: 'case-1',
        },
        scenario: {
          id: 'case-1',
          slug: 'case-1',
          title: 'Title',
          tagline: 'Tagline',
          summary: 'Summary',
          tags: ['ai'],
          sourceLabel: 'Observatory Session',
          mission: 'Mission',
          createdAt: new Date().toISOString(),
          completedAt: null,
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
            highlights: ['highlight'],
          },
          branches: [
            {
              branchId: 'branch-1',
              policyPackId: 'baseline',
              label: 'Baseline',
              status: 'completed',
              verdict: 'winner',
              summary: 'summary',
              nodeCount: 1,
              completedNodes: 1,
              failedNodes: 0,
              latencyMs: 1,
              totalSpent: 0,
              evidenceRefs: [],
              riskFlags: [],
              highRiskFlags: [],
              score: 1,
              completionScore: 1,
              evidenceCoverage: 1,
              latencyScore: 1,
              costScore: 1,
              riskPenalty: 0,
              outputHighlights: [],
            },
          ],
          decision: {
            winnerBranchId: 'branch-1',
            winnerLabel: 'Baseline',
            winnerReason: 'reason',
            mode: 'score_only',
            usedTruthCourt: false,
            committeeDisagreement: false,
            scoreDelta: 1,
            promotedRunId: null,
            topBranchIds: ['branch-1'],
          },
          replay: {
            events: [
              {
                id: 'evt-1',
                eventType: 'case_created',
                phase: 'capture',
                title: 'Case opened',
                description: 'desc',
                branchId: null,
                branchLabel: null,
                createdAt: 1,
                offsetMs: 0,
                tone: 'neutral',
              },
            ],
          },
          shareCard: {
            headline: 'headline',
            kicker: 'kicker',
            body: 'body',
            scoreline: 'scoreline',
            bullets: ['bullet'],
            xPost: 'x post',
          },
        },
      })
    ).not.toThrow();
  });
});
