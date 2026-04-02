import { describe, expect, it } from 'vitest';
import { adaptCompanionCaseToScenario } from './adapter';
import type { CompanionControlRoomCaseDetail } from './types';

const detail: CompanionControlRoomCaseDetail = {
  caseId: 'cf_case_demo',
  id: 'cf_case_demo',
  teamId: 'team-1',
  mission: 'Decide whether to ship the candidate build.',
  status: 'ready',
  decisionMode: 'score_then_truth_court',
  snapshotHash: 'snapshot-hash',
  source: { type: 'observatory_session', ref: 'session-1' },
  winnerBranchId: 'branch-1',
  promotedRunId: null,
  error: null,
  createdByWallet: null,
  createdAt: 1,
  completedAt: 2,
  snapshot: {
    mission: 'Decide whether to ship the candidate build.',
    team: {
      id: 'team-1',
      members: [{ id: 'mem-a', agentId: 'agent-a', role: 'research', drawLimit: 10 }],
    },
    source: { type: 'observatory_session', ref: 'session-1' },
    capturedAt: new Date().toISOString(),
    observatory: {
      escrows: [{ escrowPda: 'escrow-1', sessionId: 'session-1', lastSignature: 'sig-1' }],
      events: [
        { id: 'evt-1', signature: 'sig-1', session_id: 'session-1', escrow_pda: 'escrow-1' },
      ],
    },
    manualEvidence: null,
    runtimeContext: {
      planner: { anthropic: true },
      truthCourt: { local: true, committeeSize: 3 },
      flags: { swarmNodeTimeoutMs: null },
    },
  },
  branches: [
    {
      branchId: 'branch-1',
      policyPackId: 'baseline',
      branchKind: 'baseline',
      status: 'completed',
      swarmRunId: 'run-1',
      resultHash: 'hash-1',
      plan: {
        mode: 'dag',
        nodes: [
          { id: 'research', memberId: 'mem-a', description: 'Research', budget: 1, dependsOn: [] },
        ],
      },
      maxParallel: 1,
      failFast: true,
      scorecard: {
        branchId: 'branch-1',
        policyPackId: 'baseline',
        completionScore: 1,
        evidenceCoverage: 1,
        riskPenalty: 0,
        latencyScore: 1,
        costScore: 1,
        finalScore: 0.92,
        metrics: {
          completedNodes: 1,
          failedNodes: 0,
          totalNodes: 1,
          latencyMs: 120,
          totalSpent: 0.04,
          distinctEvidenceRefs: ['evt-1', 'escrow-1'],
          totalSnapshotArtifacts: 4,
        },
        riskFlags: [],
        highRiskFlags: [],
      },
      committee: null,
      run: {
        runId: 'run-1',
        id: 'run-1',
        teamId: 'team-1',
        mission: 'mission',
        status: 'completed',
        executionMode: 'readonly',
        snapshotHash: 'snapshot-hash',
        counterfactualCaseId: 'cf_case_demo',
        counterfactualBranchId: 'branch-1',
        plan: {
          mode: 'dag',
          nodes: [
            {
              id: 'research',
              memberId: 'mem-a',
              description: 'Research',
              budget: 1,
              dependsOn: [],
            },
          ],
        },
        totals: { reserved: 1, spent: 0.04 },
        error: null,
        kiroku: { receipt: null, url: null, error: null },
        startedAt: 1,
        completedAt: 2,
        nodes: [
          {
            id: 'research',
            memberId: 'mem-a',
            agentId: 'agent-a',
            dependsOn: [],
            description: 'Research',
            budgetReserved: 1,
            amountDrawn: 0.04,
            reuseKey: null,
            status: 'completed',
            output: {
              output: {
                result: 'Evidence points toward shipping with a guarded rollout.',
                evidenceRefs: ['evt-1'],
              },
            },
            error: null,
            startedAt: 1,
            completedAt: 2,
          },
        ],
      },
      createdAt: 1,
      completedAt: 2,
    },
  ],
  events: [
    {
      id: 'evt-created',
      caseId: 'cf_case_demo',
      branchId: null,
      eventType: 'case_created',
      payload: { mission: 'Decide whether to ship the candidate build.' },
      createdAt: 1,
    },
    {
      id: 'evt-adjudicated',
      caseId: 'cf_case_demo',
      branchId: null,
      eventType: 'adjudication_completed',
      payload: {
        winnerBranchId: 'branch-1',
        winnerReason: 'highest deterministic score',
        usedTruthCourt: false,
        committeeDisagreement: false,
        scoreDelta: 0.2,
        topBranchIds: ['branch-1'],
        mode: 'score_then_truth_court',
      },
      createdAt: 2,
    },
  ],
};

describe('adaptCompanionCaseToScenario', () => {
  it('maps a control-room case into the public scenario shape', () => {
    const scenario = adaptCompanionCaseToScenario(detail, {
      title: 'Ship the build?',
      summary: 'A software ship/no-ship counterfactual.',
      tags: ['software', 'release'],
    });

    expect(scenario.title).toBe('Ship the build?');
    expect(scenario.branches[0]?.label).toBe('Baseline');
    expect(scenario.snapshot.artifactRefs).toContain('evt-1');
    expect(scenario.shareCard.headline).toContain('wins');
  });
});
