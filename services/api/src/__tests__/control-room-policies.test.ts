import { describe, expect, it } from 'vitest';
import { buildControlRoomBranchPlans } from '../control-room/policies';

const members = [
  { id: 'mem-a', agentId: 'agent-a', role: 'research', drawLimit: 10 },
  { id: 'mem-b', agentId: 'agent-b', role: 'ops', drawLimit: 8 },
];

const baselinePlan = {
  mode: 'dag' as const,
  nodes: [
    {
      id: 'research',
      memberId: 'mem-a',
      description: 'Gather evidence from the snapshot.',
      budget: 4,
      dependsOn: [],
    },
    {
      id: 'final',
      memberId: 'mem-b',
      description: 'Synthesize the final recommendation.',
      budget: 3,
      dependsOn: ['research'],
    },
  ],
};

describe('control-room policies', () => {
  it('derives the four fixed branch plans from a baseline', async () => {
    const branches = await buildControlRoomBranchPlans({
      mission: 'Decide what to do next.',
      members,
      baselinePlan,
      baselineMaxParallel: 3,
    });

    expect(branches.map((branch) => branch.policyPackId)).toEqual([
      'baseline',
      'aggressive',
      'verify_first',
      'safe_exit',
    ]);

    const aggressive = branches.find((branch) => branch.policyPackId === 'aggressive')!;
    expect(aggressive.failFast).toBe(false);
    expect(aggressive.plan.nodes[0]?.budget).toBe(5);
    expect(aggressive.plan.nodes[0]?.description).toContain('Bias toward speed');

    const verifyFirst = branches.find((branch) => branch.policyPackId === 'verify_first')!;
    expect(verifyFirst.plan.nodes.map((node) => node.id)).toContain('verify_snapshot');
    expect(verifyFirst.plan.nodes.map((node) => node.id)).toContain('enumerate_risks');
    expect(
      verifyFirst.plan.nodes.find((node) => node.id === 'research')?.dependsOn
    ).toContain('verify_snapshot');

    const safeExit = branches.find((branch) => branch.policyPackId === 'safe_exit')!;
    expect(safeExit.maxParallel).toBe(2);
    expect(safeExit.plan.nodes.map((node) => node.id)).toContain('exit_options');
    expect(safeExit.plan.nodes.find((node) => node.id === 'research')?.budget).toBe(2);
    expect(safeExit.plan.nodes.find((node) => node.id === 'final')?.description).toContain('reversible');
  });
});
