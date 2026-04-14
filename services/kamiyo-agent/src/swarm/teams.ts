/**
 * Specialized Agent Teams
 *
 * Composes micro-teams per opportunity: scout evaluates, executor
 * performs, verifier validates. Each phase can gate the next —
 * scout abort prevents executor from running.
 *
 * @module swarm/teams
 */

import type { SwarmAgentProfile, SwarmRegistry } from './types.js';

export type AgentSpecialization = 'scout' | 'executor' | 'verifier' | 'negotiator' | 'generalist';

export type AgentTeam = {
  teamId: string;
  opportunityId: string;
  roles: {
    scout?: string;
    executor: string;
    verifier?: string;
  };
  sequenceOrder: AgentSpecialization[];
};

export type TeamPhaseResult = {
  role: AgentSpecialization;
  agentId: string;
  status: 'executed' | 'failed' | 'skipped';
  gateDecision?: 'proceed' | 'abort';
  output?: unknown;
  durationMs: number;
};

export type TeamExecutionResult = {
  teamId: string;
  phases: TeamPhaseResult[];
  finalStatus: 'executed' | 'failed' | 'skipped';
  reason: string;
};

export type TeamCompositionInput = {
  registry: SwarmRegistry;
  opportunityId: string;
  source: string;
  requireScout: boolean;
  requireVerifier: boolean;
  preferredExecutorId?: string;
};

/**
 * Infer an agent's specialization from its role/mandate fields,
 * with fallback to 'generalist' for backward compatibility.
 */
export function inferSpecialization(agent: SwarmAgentProfile): AgentSpecialization {
  const combined = `${agent.role} ${agent.mandate}`.toLowerCase();

  if (combined.includes('scout') || combined.includes('discovery') || combined.includes('research'))
    return 'scout';
  if (combined.includes('verif') || combined.includes('audit') || combined.includes('quality'))
    return 'verifier';
  if (combined.includes('negotiat') || combined.includes('bid') || combined.includes('proposal'))
    return 'negotiator';
  if (combined.includes('execut') || combined.includes('deliver') || combined.includes('fulfill'))
    return 'executor';

  return 'generalist';
}

/**
 * Compose a team for an opportunity.
 * Selects best-fit agents for each role based on specialization and priority.
 */
export function composeTeamForOpportunity(input: TeamCompositionInput): AgentTeam {
  const activeAgents = input.registry.agents.filter(a => a.status === 'active');
  const specMap = new Map<AgentSpecialization, SwarmAgentProfile[]>();

  for (const agent of activeAgents) {
    const spec = inferSpecialization(agent);
    const arr = specMap.get(spec) ?? [];
    arr.push(agent);
    specMap.set(spec, arr);
  }

  // Sort each group by priority (descending)
  for (const [, agents] of specMap) {
    agents.sort((a, b) => b.priority - a.priority);
  }

  // Select executor: prefer specified, then 'executor' specialists, then generalists
  const executor = selectAgent(activeAgents, specMap, 'executor', input.preferredExecutorId);
  if (!executor) {
    return {
      teamId: `team-${input.opportunityId}`,
      opportunityId: input.opportunityId,
      roles: { executor: '' },
      sequenceOrder: [],
    };
  }

  const usedIds = new Set([executor.id]);
  const roles: AgentTeam['roles'] = { executor: executor.id };
  const sequenceOrder: AgentSpecialization[] = [];

  // Select scout if required
  if (input.requireScout) {
    const scout = selectAgent(activeAgents, specMap, 'scout', undefined, usedIds);
    if (scout) {
      roles.scout = scout.id;
      usedIds.add(scout.id);
      sequenceOrder.push('scout');
    }
  }

  sequenceOrder.push('executor');

  // Select verifier if required
  if (input.requireVerifier) {
    const verifier = selectAgent(activeAgents, specMap, 'verifier', undefined, usedIds);
    if (verifier) {
      roles.verifier = verifier.id;
      usedIds.add(verifier.id);
      sequenceOrder.push('verifier');
    }
  }

  return {
    teamId: `team-${input.opportunityId}`,
    opportunityId: input.opportunityId,
    roles,
    sequenceOrder,
  };
}

/**
 * Execute a team mission sequentially. Scout can gate executor via abort.
 * Each phase function is provided externally for testability.
 */
export async function executeTeamMission(
  team: AgentTeam,
  executePhaseFn: (
    role: AgentSpecialization,
    agentId: string
  ) => Promise<{
    status: 'executed' | 'failed' | 'skipped';
    gateDecision?: 'proceed' | 'abort';
    output?: unknown;
  }>
): Promise<TeamExecutionResult> {
  const phases: TeamPhaseResult[] = [];

  for (const role of team.sequenceOrder) {
    const agentId = getAgentForRole(team, role);
    if (!agentId) {
      phases.push({
        role,
        agentId: '',
        status: 'skipped',
        gateDecision: 'proceed',
        durationMs: 0,
      });
      continue;
    }

    const start = Date.now();
    const result = await executePhaseFn(role, agentId);
    const durationMs = Date.now() - start;

    phases.push({
      role,
      agentId,
      status: result.status,
      gateDecision: result.gateDecision,
      output: result.output,
      durationMs,
    });

    // Gate check: if scout aborts, skip remaining phases
    if (role === 'scout' && result.gateDecision === 'abort') {
      return {
        teamId: team.teamId,
        phases,
        finalStatus: 'skipped',
        reason: 'scout_abort',
      };
    }

    // If executor fails, verifier is skipped
    if (role === 'executor' && result.status === 'failed') {
      return {
        teamId: team.teamId,
        phases,
        finalStatus: 'failed',
        reason: 'executor_failed',
      };
    }
  }

  // Check if verifier rejected
  const verifierPhase = phases.find(p => p.role === 'verifier');
  if (verifierPhase && verifierPhase.status === 'failed') {
    return {
      teamId: team.teamId,
      phases,
      finalStatus: 'failed',
      reason: 'verifier_rejected',
    };
  }

  return {
    teamId: team.teamId,
    phases,
    finalStatus: 'executed',
    reason: 'team_success',
  };
}

// ── Helpers ────────────────────────────────────────────────────────────

function selectAgent(
  allAgents: SwarmAgentProfile[],
  specMap: Map<AgentSpecialization, SwarmAgentProfile[]>,
  targetSpec: AgentSpecialization,
  preferredId?: string,
  excludeIds?: Set<string>
): SwarmAgentProfile | null {
  // Prefer specified ID
  if (preferredId) {
    const preferred = allAgents.find(a => a.id === preferredId && !excludeIds?.has(a.id));
    if (preferred) return preferred;
  }

  // Try specialists first
  const specialists = (specMap.get(targetSpec) ?? []).filter(a => !excludeIds?.has(a.id));
  if (specialists.length > 0) return specialists[0];

  // Fall back to generalists
  const generalists = (specMap.get('generalist') ?? []).filter(a => !excludeIds?.has(a.id));
  if (generalists.length > 0) return generalists[0];

  // Last resort: any available agent
  const remaining = allAgents.filter(a => !excludeIds?.has(a.id));
  return remaining.length > 0 ? remaining[0] : null;
}

function getAgentForRole(team: AgentTeam, role: AgentSpecialization): string | null {
  switch (role) {
    case 'scout':
      return team.roles.scout ?? null;
    case 'executor':
      return team.roles.executor || null;
    case 'verifier':
      return team.roles.verifier ?? null;
    default:
      return null;
  }
}
