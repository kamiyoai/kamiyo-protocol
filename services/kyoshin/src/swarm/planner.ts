import type { SwarmAgentProfile, SwarmMission, SwarmMissionPlan, SwarmRegistry } from './types.js';

export type SwarmMissionOpportunityHint = {
  id: string;
  source: string;
  title: string;
  summary: string;
  expectedRewardSol: number | null;
  assignmentReason: string;
};

function normalizeCursor(value: number, size: number): number {
  if (size <= 0) return 0;
  if (!Number.isFinite(value)) return 0;
  const floor = Math.floor(value);
  const mod = floor % size;
  return mod < 0 ? mod + size : mod;
}

function selectAgents(agents: SwarmAgentProfile[], cursor: number, count: number): SwarmAgentProfile[] {
  if (agents.length === 0 || count <= 0) return [];
  const start = normalizeCursor(cursor, agents.length);
  const selected: SwarmAgentProfile[] = [];
  for (let i = 0; i < count; i += 1) {
    selected.push(agents[(start + i) % agents.length]);
  }
  return selected;
}

function autonomyReadinessScore(agent: SwarmAgentProfile): number {
  const sourceSet = new Set(agent.jobSources);
  const machinePayScore =
    ((sourceSet.has('x402') ? 1 : 0) + (sourceSet.has('direct_api') ? 1 : 0)) / 2;
  const approvedMarketplaceScore =
    Math.min(
      3,
      agent.marketplaceProfiles.filter(profile => profile.state === 'approved').length
    ) / 3;
  const channelDiversityScore = Math.min(1, sourceSet.size / 4);

  return machinePayScore * 0.5 + approvedMarketplaceScore * 0.35 + channelDiversityScore * 0.15;
}

function describeJobSources(jobSources: SwarmAgentProfile['jobSources']): string {
  if (jobSources.length === 0) return 'x402 or direct API contracts';
  const labels = jobSources.map(source => {
    if (source === 'x402') return 'x402';
    if (source === 'direct_api') return 'direct API contracts';
    if (source === 'agent_ai') return 'Agent.ai leads';
    if (source === 'relevance') return 'Relevance marketplace';
    if (source === 'kore') return 'Kore enterprise channel';
    return 'internal task queue';
  });
  return Array.from(new Set(labels)).join(', ');
}

function objectiveForAgent(
  agent: SwarmAgentProfile,
  primeDirective: string,
  opportunityHint?: SwarmMissionOpportunityHint
): string {
  if (opportunityHint) {
    const expectedReward =
      typeof opportunityHint.expectedRewardSol === 'number'
        ? ` Expected reward: ~${opportunityHint.expectedRewardSol.toFixed(4)} SOL.`
        : '';
    return `Pursue opportunity ${opportunityHint.id}: ${opportunityHint.title}. ${opportunityHint.summary}${expectedReward} ${primeDirective}`;
  }

  if (agent.missionHints.length > 0) return agent.missionHints[0];

  const role = agent.role.toLowerCase();
  if (role.includes('signal')) {
    return `Find one high-conviction signal and convert it into a concrete execution brief that increases quality volume. ${primeDirective}`;
  }
  if (role.includes('deal') || role.includes('x402') || role.includes('executor')) {
    const channels = describeJobSources(agent.jobSources);
    return `Close one paid execution path via ${channels} with verifiable outcome and receipt-ready accounting. ${primeDirective}`;
  }
  if (role.includes('research')) {
    return `Produce one verifiable research artifact that improves launch or routing decisions this cycle. ${primeDirective}`;
  }
  if (role.includes('ops') || role.includes('keeper')) {
    return `Reduce one operational bottleneck that blocks repeatable fee capture and routing. ${primeDirective}`;
  }

  return `${agent.mandate} ${primeDirective}`;
}

function selectAgentsWithHints(params: {
  activeAgents: SwarmAgentProfile[];
  cursor: number;
  missionCount: number;
  opportunityHintsByAgent?: Record<string, SwarmMissionOpportunityHint>;
}): { selected: SwarmAgentProfile[]; nextCursor: number } {
  if (params.missionCount <= 0 || params.activeAgents.length === 0) {
    return { selected: [], nextCursor: 0 };
  }

  const hintedAgentIds = new Set(
    Object.keys(params.opportunityHintsByAgent ?? {}).filter(agentId =>
      params.activeAgents.some(agent => agent.id === agentId)
    )
  );

  const selected: SwarmAgentProfile[] = [];
  const usedIds = new Set<string>();

  for (const agent of params.activeAgents) {
    if (selected.length >= params.missionCount) break;
    if (!hintedAgentIds.has(agent.id)) continue;
    selected.push(agent);
    usedIds.add(agent.id);
  }

  if (selected.length >= params.missionCount) {
    return { selected, nextCursor: params.cursor };
  }

  const remainingAgents = params.activeAgents.filter(agent => !usedIds.has(agent.id));
  if (remainingAgents.length === 0) {
    return { selected, nextCursor: params.cursor };
  }

  const rotatingCount = params.missionCount - selected.length;
  const rotatingSelected = selectAgents(remainingAgents, params.cursor, rotatingCount);
  selected.push(...rotatingSelected);

  const start = normalizeCursor(params.cursor, remainingAgents.length);
  const nextCursor = normalizeCursor(start + rotatingSelected.length, remainingAgents.length);
  return { selected, nextCursor };
}

function successMetricForAgent(
  agent: SwarmAgentProfile,
  opportunityHint?: SwarmMissionOpportunityHint
): string {
  if (opportunityHint) {
    return 'Opportunity progressed with explicit counterparty state, payout expectation, and next executable step.';
  }

  const role = agent.role.toLowerCase();
  if (role.includes('signal')) return 'At least one signal brief delivered with measurable follow-up action.';
  if (role.includes('deal') || role.includes('x402') || role.includes('executor')) {
    return 'At least one paid task path progressed with expected revenue and counterparty tracked.';
  }
  if (role.includes('research')) return 'One research artifact published with a clear decision impact.';
  if (role.includes('ops') || role.includes('keeper')) return 'One reliability or cost-efficiency improvement validated.';
  return 'One mission output delivered with measurable next action.';
}

function missionForAgent(params: {
  agent: SwarmAgentProfile;
  tickId: string;
  sequence: number;
  primeDirective: string;
  opportunityHint?: SwarmMissionOpportunityHint;
}): SwarmMission {
  const { agent, tickId, sequence, primeDirective, opportunityHint } = params;
  return {
    missionId: `swarm-${tickId.slice(0, 8)}-${String(sequence + 1).padStart(2, '0')}-${agent.id}`,
    agentId: agent.id,
    agentName: agent.name,
    role: agent.role,
    mint: agent.mint,
    objective: objectiveForAgent(agent, primeDirective, opportunityHint),
    successMetric: successMetricForAgent(agent, opportunityHint),
    constraints: [
      'Do not launch additional coins inside this mission.',
      'Route realized SOL via operator policy toward the $KAMIYO staking pool.',
      'Every financial step must produce a verifiable receipt and tx signature.',
    ],
    opportunityId: opportunityHint?.id,
    opportunitySource: opportunityHint?.source,
    expectedRewardSol: opportunityHint?.expectedRewardSol ?? undefined,
    assignmentReason: opportunityHint?.assignmentReason,
  };
}

export function planSwarmMissions(params: {
  registry: SwarmRegistry;
  tickId: string;
  maxMissions: number;
  maxActiveAgents: number;
  cursor: number;
  primeDirective: string;
  opportunityHintsByAgent?: Record<string, SwarmMissionOpportunityHint>;
  priorityOverridesByAgent?: Record<string, number>;
}): SwarmMissionPlan {
  const priorityFor = (agent: SwarmAgentProfile): number => {
    const override = params.priorityOverridesByAgent?.[agent.id];
    const base = typeof override === 'number' && Number.isFinite(override) ? override : agent.priority;
    const readinessBonus = autonomyReadinessScore(agent) * 12;
    return base + readinessBonus;
  };

  const activeAgents = params.registry.agents
    .filter(agent => agent.status === 'active')
    .sort((a, b) => {
      const aPriority = priorityFor(a);
      const bPriority = priorityFor(b);
      if (bPriority !== aPriority) return bPriority - aPriority;
      return a.id.localeCompare(b.id);
    })
    .slice(0, Math.max(1, params.maxActiveAgents));

  if (activeAgents.length === 0) {
    return {
      parent: params.registry.parent,
      registryVersion: params.registry.version,
      activeAgents: 0,
      selectedAgents: 0,
      nextCursor: 0,
      missions: [],
    };
  }

  const missionCount = Math.min(Math.max(1, params.maxMissions), activeAgents.length);
  const selection = selectAgentsWithHints({
    activeAgents,
    cursor: params.cursor,
    missionCount,
    opportunityHintsByAgent: params.opportunityHintsByAgent,
  });
  const selected = selection.selected;
  const nextCursor = selection.nextCursor;
  const missions = selected.map((agent, sequence) =>
    missionForAgent({
      agent,
      tickId: params.tickId,
      sequence,
      primeDirective: params.primeDirective,
      opportunityHint: params.opportunityHintsByAgent?.[agent.id],
    })
  );

  return {
    parent: params.registry.parent,
    registryVersion: params.registry.version,
    activeAgents: activeAgents.length,
    selectedAgents: selected.length,
    nextCursor,
    missions,
  };
}
