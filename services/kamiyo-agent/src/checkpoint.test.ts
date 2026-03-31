import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createCheckpoint,
  saveCheckpoint,
  loadCheckpoint,
  clearCheckpoint,
  shouldResume,
  isPhaseCompleted,
  markPhaseCompleted,
} from './checkpoint.js';
import type { TickCheckpointState } from './checkpoint.js';

function makeKv(): {
  kvGet(key: string): string | undefined;
  kvSet(key: string, value: string): void;
} & { store: Record<string, string> } {
  const store: Record<string, string> = {};
  return {
    store,
    kvGet: (key: string) => store[key],
    kvSet: (key: string, value: string) => {
      store[key] = value;
    },
  };
}

const NOW = '2026-03-31T12:00:00.000Z';

test('createCheckpoint returns empty state', () => {
  const cp = createCheckpoint('tick-1', NOW);
  assert.equal(cp.tickId, 'tick-1');
  assert.equal(cp.startedAt, NOW);
  assert.deepEqual(cp.completedPhases, []);
  assert.deepEqual(cp.phaseOutputs, {});
});

test('save and load round-trips correctly', () => {
  const kv = makeKv();
  const cp = createCheckpoint('tick-1', NOW);
  saveCheckpoint(kv, cp);

  const loaded = loadCheckpoint(kv);
  assert.ok(loaded);
  assert.equal(loaded.tickId, 'tick-1');
  assert.deepEqual(loaded.completedPhases, []);
});

test('loadCheckpoint returns null when no checkpoint exists', () => {
  const kv = makeKv();
  assert.equal(loadCheckpoint(kv), null);
});

test('loadCheckpoint returns null for invalid JSON', () => {
  const kv = makeKv();
  kv.kvSet('tick_checkpoint', 'not json');
  assert.equal(loadCheckpoint(kv), null);
});

test('loadCheckpoint returns null for empty string', () => {
  const kv = makeKv();
  kv.kvSet('tick_checkpoint', '');
  assert.equal(loadCheckpoint(kv), null);
});

test('loadCheckpoint filters invalid phases', () => {
  const kv = makeKv();
  kv.kvSet(
    'tick_checkpoint',
    JSON.stringify({
      tickId: 'tick-1',
      startedAt: NOW,
      completedPhases: ['policy_refresh', 'invalid_phase', 'execution'],
      phaseOutputs: {},
      lastCheckpointAt: NOW,
    })
  );

  const loaded = loadCheckpoint(kv);
  assert.ok(loaded);
  assert.deepEqual(loaded.completedPhases, ['policy_refresh', 'execution']);
});

test('clearCheckpoint removes checkpoint for matching tickId', () => {
  const kv = makeKv();
  const cp = createCheckpoint('tick-1', NOW);
  saveCheckpoint(kv, cp);
  clearCheckpoint(kv, 'tick-1');

  assert.equal(loadCheckpoint(kv), null);
});

test('clearCheckpoint does not remove checkpoint for different tickId', () => {
  const kv = makeKv();
  const cp = createCheckpoint('tick-1', NOW);
  saveCheckpoint(kv, cp);
  clearCheckpoint(kv, 'tick-2');

  const loaded = loadCheckpoint(kv);
  assert.ok(loaded);
  assert.equal(loaded.tickId, 'tick-1');
});

test('shouldResume returns true for fresh checkpoint with phases', () => {
  const cp: TickCheckpointState = {
    tickId: 'tick-1',
    startedAt: NOW,
    completedPhases: ['policy_refresh'],
    phaseOutputs: {},
    lastCheckpointAt: new Date().toISOString(),
  };

  assert.equal(shouldResume(cp, 600_000), true);
});

test('shouldResume returns false when no phases completed', () => {
  const cp: TickCheckpointState = {
    tickId: 'tick-1',
    startedAt: NOW,
    completedPhases: [],
    phaseOutputs: {},
    lastCheckpointAt: new Date().toISOString(),
  };

  assert.equal(shouldResume(cp, 600_000), false);
});

test('shouldResume returns false for stale checkpoint', () => {
  const cp: TickCheckpointState = {
    tickId: 'tick-1',
    startedAt: '2020-01-01T00:00:00.000Z',
    completedPhases: ['policy_refresh'],
    phaseOutputs: {},
    lastCheckpointAt: '2020-01-01T00:00:00.000Z',
  };

  assert.equal(shouldResume(cp, 600_000), false);
});

test('isPhaseCompleted returns correct boolean', () => {
  const cp: TickCheckpointState = {
    tickId: 'tick-1',
    startedAt: NOW,
    completedPhases: ['policy_refresh', 'execution'],
    phaseOutputs: {},
    lastCheckpointAt: NOW,
  };

  assert.equal(isPhaseCompleted(cp, 'policy_refresh'), true);
  assert.equal(isPhaseCompleted(cp, 'execution'), true);
  assert.equal(isPhaseCompleted(cp, 'settlement'), false);
  assert.equal(isPhaseCompleted(null, 'policy_refresh'), false);
});

test('markPhaseCompleted adds phase and stores output', () => {
  const cp = createCheckpoint('tick-1', NOW);
  const updated = markPhaseCompleted(cp, 'policy_refresh', { some: 'data' });

  assert.deepEqual(updated.completedPhases, ['policy_refresh']);
  assert.deepEqual(updated.phaseOutputs.policy_refresh, { some: 'data' });
  assert.notEqual(updated.lastCheckpointAt, cp.lastCheckpointAt);
});

test('markPhaseCompleted does not duplicate phases', () => {
  let cp = createCheckpoint('tick-1', NOW);
  cp = markPhaseCompleted(cp, 'policy_refresh');
  cp = markPhaseCompleted(cp, 'policy_refresh');

  assert.equal(cp.completedPhases.length, 1);
});

test('full checkpoint lifecycle', () => {
  const kv = makeKv();

  // Create and save
  let cp = createCheckpoint('tick-1', NOW);
  cp = markPhaseCompleted(cp, 'policy_refresh', { refreshed: true });
  cp = markPhaseCompleted(cp, 'opportunity_collection', { count: 5 });
  saveCheckpoint(kv, cp);

  // Load and verify
  const loaded = loadCheckpoint(kv)!;
  assert.ok(loaded);
  assert.equal(loaded.tickId, 'tick-1');
  assert.deepEqual(loaded.completedPhases, ['policy_refresh', 'opportunity_collection']);
  assert.equal(isPhaseCompleted(loaded, 'policy_refresh'), true);
  assert.equal(isPhaseCompleted(loaded, 'mission_planning'), false);

  // Complete tick and clear
  clearCheckpoint(kv, 'tick-1');
  assert.equal(loadCheckpoint(kv), null);
});
