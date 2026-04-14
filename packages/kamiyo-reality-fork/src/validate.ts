import type {
  RealityForkBranch,
  RealityForkFixtureBundle,
  RealityForkReplayEvent,
  RealityForkScenario,
} from './types';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function assertString(value: unknown, field: string): asserts value is string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${field} must be a non-empty string`);
  }
}

function assertNumber(value: unknown, field: string): asserts value is number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    throw new Error(`${field} must be a number`);
  }
}

function assertStringArray(value: unknown, field: string): asserts value is string[] {
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string')) {
    throw new Error(`${field} must be a string array`);
  }
}

function assertReplayEvent(event: unknown, index: number): asserts event is RealityForkReplayEvent {
  if (!isRecord(event)) throw new Error(`replay.events[${index}] must be an object`);
  assertString(event.id, `replay.events[${index}].id`);
  assertString(event.eventType, `replay.events[${index}].eventType`);
  assertString(event.phase, `replay.events[${index}].phase`);
  assertString(event.title, `replay.events[${index}].title`);
  assertString(event.description, `replay.events[${index}].description`);
  assertNumber(event.createdAt, `replay.events[${index}].createdAt`);
  assertNumber(event.offsetMs, `replay.events[${index}].offsetMs`);
}

function assertBranch(branch: unknown, index: number): asserts branch is RealityForkBranch {
  if (!isRecord(branch)) throw new Error(`branches[${index}] must be an object`);
  assertString(branch.branchId, `branches[${index}].branchId`);
  assertString(branch.policyPackId, `branches[${index}].policyPackId`);
  assertString(branch.label, `branches[${index}].label`);
  assertString(branch.summary, `branches[${index}].summary`);
  assertStringArray(branch.evidenceRefs, `branches[${index}].evidenceRefs`);
  assertStringArray(branch.riskFlags, `branches[${index}].riskFlags`);
  assertStringArray(branch.highRiskFlags, `branches[${index}].highRiskFlags`);
  assertStringArray(branch.outputHighlights, `branches[${index}].outputHighlights`);
  for (const field of [
    'score',
    'completionScore',
    'evidenceCoverage',
    'latencyScore',
    'costScore',
    'riskPenalty',
    'latencyMs',
    'totalSpent',
  ]) {
    assertNumber(branch[field], `branches[${index}].${field}`);
  }
}

export function assertRealityForkScenario(value: unknown): asserts value is RealityForkScenario {
  if (!isRecord(value)) throw new Error('scenario must be an object');
  assertString(value.id, 'scenario.id');
  assertString(value.slug, 'scenario.slug');
  assertString(value.title, 'scenario.title');
  assertString(value.tagline, 'scenario.tagline');
  assertString(value.summary, 'scenario.summary');
  assertString(value.sourceLabel, 'scenario.sourceLabel');
  assertString(value.mission, 'scenario.mission');
  assertString(value.createdAt, 'scenario.createdAt');
  assertString(value.snapshotHash, 'scenario.snapshotHash');
  assertStringArray(value.tags, 'scenario.tags');

  if (!isRecord(value.snapshot)) throw new Error('scenario.snapshot must be an object');
  assertString(value.snapshot.capturedAt, 'scenario.snapshot.capturedAt');
  assertString(value.snapshot.teamId, 'scenario.snapshot.teamId');
  assertNumber(value.snapshot.artifactCount, 'scenario.snapshot.artifactCount');
  assertStringArray(value.snapshot.artifactRefs, 'scenario.snapshot.artifactRefs');
  assertStringArray(value.snapshot.highlights, 'scenario.snapshot.highlights');

  if (!Array.isArray(value.branches) || value.branches.length === 0) {
    throw new Error('scenario.branches must be a non-empty array');
  }
  value.branches.forEach(assertBranch);

  if (!isRecord(value.decision)) throw new Error('scenario.decision must be an object');
  assertString(value.decision.winnerReason, 'scenario.decision.winnerReason');

  if (!isRecord(value.replay) || !Array.isArray(value.replay.events)) {
    throw new Error('scenario.replay.events must be an array');
  }
  value.replay.events.forEach(assertReplayEvent);

  if (!isRecord(value.shareCard)) throw new Error('scenario.shareCard must be an object');
  assertString(value.shareCard.headline, 'scenario.shareCard.headline');
  assertString(value.shareCard.kicker, 'scenario.shareCard.kicker');
  assertString(value.shareCard.body, 'scenario.shareCard.body');
  assertString(value.shareCard.scoreline, 'scenario.shareCard.scoreline');
  assertString(value.shareCard.xPost, 'scenario.shareCard.xPost');
  assertStringArray(value.shareCard.bullets, 'scenario.shareCard.bullets');
}

export function assertRealityForkFixtureBundle(
  value: unknown
): asserts value is RealityForkFixtureBundle {
  if (!isRecord(value)) throw new Error('fixture bundle must be an object');
  if (value.version !== 1) throw new Error('fixture bundle version must be 1');
  assertString(value.generatedAt, 'fixture.generatedAt');
  if (!isRecord(value.generator)) throw new Error('fixture.generator must be an object');
  assertString(value.generator.source, 'fixture.generator.source');
  assertString(value.generator.teamId, 'fixture.generator.teamId');
  assertString(value.generator.caseId, 'fixture.generator.caseId');
  assertRealityForkScenario(value.scenario);
}
