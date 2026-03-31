import assert from 'node:assert/strict';
import test from 'node:test';

import { inferSpecialization, composeTeamForOpportunity, executeTeamMission } from './teams.js';
import type { AgentTeam } from './teams.js';
import type { SwarmAgentProfile, SwarmRegistry } from './types.js';

function makeAgent(overrides: Partial<SwarmAgentProfile> = {}): SwarmAgentProfile {
  return {
    id: overrides.id ?? 'agent-1',
    name: overrides.name ?? 'Test Agent',
    role: overrides.role ?? 'generalist',
    mandate: overrides.mandate ?? 'general purpose agent',
    mint: overrides.mint ?? 'mint-1',
    status: overrides.status ?? 'active',
    priority: overrides.priority ?? 100,
    jobSources: overrides.jobSources ?? ['x402'],
    marketplaceProfiles: overrides.marketplaceProfiles ?? [],
    missionHints: overrides.missionHints ?? [],
  };
}

function makeRegistry(agents: SwarmAgentProfile[]): SwarmRegistry {
  return { version: 1, parent: 'test-parent', agents };
}

// ── inferSpecialization ────────────────────────────────────────────────

test('infers scout from role', () => {
  assert.equal(inferSpecialization(makeAgent({ role: 'Discovery Scout' })), 'scout');
});

test('infers verifier from mandate', () => {
  assert.equal(
    inferSpecialization(makeAgent({ mandate: 'Quality verification agent' })),
    'verifier'
  );
});

test('infers executor from role', () => {
  assert.equal(inferSpecialization(makeAgent({ role: 'Task Executor' })), 'executor');
});

test('infers negotiator from mandate', () => {
  assert.equal(
    inferSpecialization(makeAgent({ mandate: 'Bid negotiation specialist' })),
    'negotiator'
  );
});

test('defaults to generalist', () => {
  assert.equal(
    inferSpecialization(makeAgent({ role: 'helper', mandate: 'do things' })),
    'generalist'
  );
});

// ── composeTeamForOpportunity ──────────────────────────────────────────

test('composes team with scout, executor, verifier', () => {
  const agents = [
    makeAgent({ id: 'scout-1', role: 'Discovery Scout', priority: 90 }),
    makeAgent({ id: 'exec-1', role: 'Task Executor', priority: 100 }),
    makeAgent({ id: 'verify-1', role: 'Quality Verifier', priority: 80 }),
  ];

  const team = composeTeamForOpportunity({
    registry: makeRegistry(agents),
    opportunityId: 'opp-1',
    source: 'relevance',
    requireScout: true,
    requireVerifier: true,
  });

  assert.equal(team.roles.scout, 'scout-1');
  assert.equal(team.roles.executor, 'exec-1');
  assert.equal(team.roles.verifier, 'verify-1');
  assert.deepEqual(team.sequenceOrder, ['scout', 'executor', 'verifier']);
});

test('composes team without scout when not required', () => {
  const agents = [
    makeAgent({ id: 'exec-1', role: 'Task Executor' }),
    makeAgent({ id: 'scout-1', role: 'Discovery Scout' }),
  ];

  const team = composeTeamForOpportunity({
    registry: makeRegistry(agents),
    opportunityId: 'opp-1',
    source: 'x402',
    requireScout: false,
    requireVerifier: false,
  });

  assert.equal(team.roles.scout, undefined);
  assert.equal(team.roles.executor, 'exec-1');
  assert.deepEqual(team.sequenceOrder, ['executor']);
});

test('falls back to generalist when no specialists available', () => {
  const agents = [makeAgent({ id: 'gen-1', role: 'helper', mandate: 'general work' })];

  const team = composeTeamForOpportunity({
    registry: makeRegistry(agents),
    opportunityId: 'opp-1',
    source: 'x402',
    requireScout: true,
    requireVerifier: false,
  });

  // generalist should fill both scout and executor
  assert.ok(team.roles.executor);
  // scout may or may not be filled depending on agent availability (only 1 agent)
});

test('prefers specified executor', () => {
  const agents = [
    makeAgent({ id: 'exec-1', role: 'Task Executor', priority: 200 }),
    makeAgent({ id: 'exec-2', role: 'Task Executor', priority: 100 }),
  ];

  const team = composeTeamForOpportunity({
    registry: makeRegistry(agents),
    opportunityId: 'opp-1',
    source: 'x402',
    requireScout: false,
    requireVerifier: false,
    preferredExecutorId: 'exec-2',
  });

  assert.equal(team.roles.executor, 'exec-2');
});

test('returns empty team when no active agents', () => {
  const team = composeTeamForOpportunity({
    registry: makeRegistry([]),
    opportunityId: 'opp-1',
    source: 'x402',
    requireScout: false,
    requireVerifier: false,
  });

  assert.equal(team.roles.executor, '');
  assert.deepEqual(team.sequenceOrder, []);
});

// ── executeTeamMission ─────────────────────────────────────────────────

test('executes full team successfully', async () => {
  const team: AgentTeam = {
    teamId: 'team-1',
    opportunityId: 'opp-1',
    roles: { scout: 'scout-1', executor: 'exec-1', verifier: 'verify-1' },
    sequenceOrder: ['scout', 'executor', 'verifier'],
  };

  const result = await executeTeamMission(team, async role => ({
    status: 'executed',
    gateDecision: 'proceed',
    output: { role },
  }));

  assert.equal(result.finalStatus, 'executed');
  assert.equal(result.reason, 'team_success');
  assert.equal(result.phases.length, 3);
});

test('scout abort prevents executor', async () => {
  const team: AgentTeam = {
    teamId: 'team-1',
    opportunityId: 'opp-1',
    roles: { scout: 'scout-1', executor: 'exec-1' },
    sequenceOrder: ['scout', 'executor'],
  };

  const executedRoles: string[] = [];
  const result = await executeTeamMission(team, async role => {
    executedRoles.push(role);
    if (role === 'scout') return { status: 'executed', gateDecision: 'abort' };
    return { status: 'executed', gateDecision: 'proceed' };
  });

  assert.equal(result.finalStatus, 'skipped');
  assert.equal(result.reason, 'scout_abort');
  assert.deepEqual(executedRoles, ['scout']); // executor never ran
});

test('executor failure stops pipeline', async () => {
  const team: AgentTeam = {
    teamId: 'team-1',
    opportunityId: 'opp-1',
    roles: { scout: 'scout-1', executor: 'exec-1', verifier: 'verify-1' },
    sequenceOrder: ['scout', 'executor', 'verifier'],
  };

  const result = await executeTeamMission(team, async role => {
    if (role === 'executor') return { status: 'failed' };
    return { status: 'executed', gateDecision: 'proceed' };
  });

  assert.equal(result.finalStatus, 'failed');
  assert.equal(result.reason, 'executor_failed');
  assert.equal(result.phases.length, 2); // scout + executor, no verifier
});

test('verifier rejection fails the team', async () => {
  const team: AgentTeam = {
    teamId: 'team-1',
    opportunityId: 'opp-1',
    roles: { executor: 'exec-1', verifier: 'verify-1' },
    sequenceOrder: ['executor', 'verifier'],
  };

  const result = await executeTeamMission(team, async role => {
    if (role === 'verifier') return { status: 'failed', output: { reason: 'quality too low' } };
    return { status: 'executed', gateDecision: 'proceed' };
  });

  assert.equal(result.finalStatus, 'failed');
  assert.equal(result.reason, 'verifier_rejected');
});

test('executor-only team works', async () => {
  const team: AgentTeam = {
    teamId: 'team-1',
    opportunityId: 'opp-1',
    roles: { executor: 'exec-1' },
    sequenceOrder: ['executor'],
  };

  const result = await executeTeamMission(team, async () => ({
    status: 'executed',
  }));

  assert.equal(result.finalStatus, 'executed');
  assert.equal(result.phases.length, 1);
});
