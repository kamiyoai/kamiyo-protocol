import { clampMaxParallel } from '../swarm/runtime';
import { planDag, sanitizeDagPlan } from '../swarm/planner';
import type { SwarmDagNode, SwarmDagPlan, SwarmTeamMember } from '../swarm/types';
import type { ControlRoomBranchPlan } from './types';

function clonePlan(plan: SwarmDagPlan): SwarmDagPlan {
  return JSON.parse(JSON.stringify(plan)) as SwarmDagPlan;
}

function bestMember(members: SwarmTeamMember[]): SwarmTeamMember {
  return members
    .slice()
    .sort((left, right) => right.drawLimit - left.drawLimit)[0] ?? members[0];
}

function memberLimitMap(members: SwarmTeamMember[]): Map<string, number> {
  return new Map(members.map((member) => [member.id, member.drawLimit]));
}

function uniqueNodeId(plan: SwarmDagPlan, base: string): string {
  const used = new Set(plan.nodes.map((node) => node.id));
  if (!used.has(base)) return base;

  let suffix = 2;
  while (used.has(`${base}_${suffix}`)) suffix += 1;
  return `${base}_${suffix}`;
}

function rootNodeIds(plan: SwarmDagPlan): string[] {
  return plan.nodes.filter((node) => node.dependsOn.length === 0).map((node) => node.id);
}

function finalNode(plan: SwarmDagPlan): SwarmDagNode | undefined {
  return plan.nodes.find((node) => node.id === 'final');
}

function prependDirective(plan: SwarmDagPlan, prefix: string): SwarmDagPlan {
  return {
    mode: 'dag',
    nodes: plan.nodes.map((node) => ({
      ...node,
      description: `${prefix}\n\n${node.description}`,
    })),
  };
}

function withAggressivePolicy(plan: SwarmDagPlan, members: SwarmTeamMember[], baselineMaxParallel: number): ControlRoomBranchPlan {
  const limits = memberLimitMap(members);
  const aggressivePlan = prependDirective(clonePlan(plan), 'Bias toward speed, decisive execution, and reward capture. Prefer action over exhaustive deliberation.');
  for (const node of aggressivePlan.nodes) {
    const limit = limits.get(node.memberId) ?? node.budget;
    node.budget = Math.min(limit, Number((node.budget * 1.25).toFixed(6)));
  }

  return {
    policyPackId: 'aggressive',
    branchKind: 'aggressive',
    plan: aggressivePlan,
    maxParallel: clampMaxParallel(Math.max(1, Math.min(4, members.length, baselineMaxParallel + 1))),
    failFast: false,
  };
}

function withVerifyFirstPolicy(plan: SwarmDagPlan, members: SwarmTeamMember[], maxParallel: number, failFast: boolean): ControlRoomBranchPlan {
  const verifyPlan = clonePlan(plan);
  const lead = bestMember(members);
  const verifySnapshotId = uniqueNodeId(verifyPlan, 'verify_snapshot');
  const enumerateRisksId = uniqueNodeId(verifyPlan, 'enumerate_risks');
  const originalRoots = rootNodeIds(verifyPlan);

  for (const node of verifyPlan.nodes) {
    if (!originalRoots.includes(node.id)) continue;
    node.dependsOn = Array.from(new Set([...node.dependsOn, verifySnapshotId]));
  }

  const final = finalNode(verifyPlan);
  if (final) {
    final.dependsOn = Array.from(new Set([...final.dependsOn, enumerateRisksId]));
  }

  verifyPlan.nodes.unshift(
    {
      id: enumerateRisksId,
      memberId: lead.id,
      description: 'Enumerate the principal operational, financial, and evidence risks visible in the current snapshot before any irreversible action.',
      budget: lead.drawLimit,
      dependsOn: [],
    },
    {
      id: verifySnapshotId,
      memberId: lead.id,
      description: 'Verify the snapshot assumptions, key evidence anchors, and missing information before downstream execution.',
      budget: lead.drawLimit,
      dependsOn: [],
    }
  );

  return {
    policyPackId: 'verify_first',
    branchKind: 'verify_first',
    plan: verifyPlan,
    maxParallel,
    failFast,
  };
}

function withSafeExitPolicy(plan: SwarmDagPlan): ControlRoomBranchPlan {
  const safeExitPlan = clonePlan(plan);
  const exitNodeId = uniqueNodeId(safeExitPlan, 'exit_options');

  for (const node of safeExitPlan.nodes) {
    node.budget = Number((node.budget / 2).toFixed(6));
  }

  const final = finalNode(safeExitPlan);
  if (final) {
    final.description =
      'Prefer the most reversible, low-risk outcome available. Optimize for preserving optionality and evidence quality over reward maximization.';
    final.dependsOn = Array.from(new Set([...final.dependsOn, exitNodeId]));
  }

  safeExitPlan.nodes.unshift({
    id: exitNodeId,
    memberId: safeExitPlan.nodes[0]?.memberId ?? final?.memberId ?? '',
    description: 'Map reversible exit paths, fallback plans, and low-risk alternatives before recommending an action.',
    budget: safeExitPlan.nodes[0]?.budget ?? final?.budget ?? 0,
    dependsOn: [],
  });

  return {
    policyPackId: 'safe_exit',
    branchKind: 'safe_exit',
    plan: safeExitPlan,
    maxParallel: clampMaxParallel(2),
    failFast: true,
  };
}

export async function buildControlRoomBranchPlans(params: {
  mission: string;
  members: SwarmTeamMember[];
  baselinePlan?: unknown;
  baselineMaxParallel?: number;
  baselineFailFast?: boolean;
}): Promise<ControlRoomBranchPlan[]> {
  if (params.members.length === 0) {
    throw new Error('team has no members');
  }

  const baselinePlan = params.baselinePlan
    ? sanitizeDagPlan(params.baselinePlan, params.members, params.mission, { maxNodes: 24 })
    : await planDag(params.mission, params.members, { maxNodes: 24 });

  const baselineMaxParallel = clampMaxParallel(params.baselineMaxParallel ?? 3);
  const baselineFailFast = params.baselineFailFast === undefined ? true : !!params.baselineFailFast;

  return [
    {
      policyPackId: 'baseline',
      branchKind: 'baseline',
      plan: clonePlan(baselinePlan),
      maxParallel: baselineMaxParallel,
      failFast: baselineFailFast,
    },
    withAggressivePolicy(baselinePlan, params.members, baselineMaxParallel),
    withVerifyFirstPolicy(baselinePlan, params.members, baselineMaxParallel, baselineFailFast),
    withSafeExitPolicy(baselinePlan),
  ];
}
