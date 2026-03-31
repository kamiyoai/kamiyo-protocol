import assert from 'node:assert/strict';
import test from 'node:test';

import {
  isMarginCircuitOpen,
  parseMarginCircuitState,
  pruneMarginCircuitState,
  updateMarginCircuit,
} from './circuitBreaker.js';

test('opens margin circuit after configured negative streak', () => {
  let state = parseMarginCircuitState(undefined);
  const openedAt = '2026-02-20T00:00:00.000Z';

  const first = updateMarginCircuit({
    state,
    agentId: 'a1',
    source: 'x402',
    marginSol: -0.01,
    failed: false,
    negativeMarginThreshold: 2,
    cooldownMinutes: 60,
    nowIso: openedAt,
  });
  state = first.state;
  assert.equal(first.event, undefined);

  const second = updateMarginCircuit({
    state,
    agentId: 'a1',
    source: 'x402',
    marginSol: -0.02,
    failed: false,
    negativeMarginThreshold: 2,
    cooldownMinutes: 60,
    nowIso: openedAt,
  });

  assert.equal(second.event?.type, 'opened');
  const open = isMarginCircuitOpen({
    state: second.state,
    agentId: 'a1',
    source: 'x402',
    nowIso: openedAt,
  });
  assert.equal(open.open, true);
  assert.ok(open.openUntil);
});

test('closes margin circuit when positive recovery is observed', () => {
  const opened = updateMarginCircuit({
    state: parseMarginCircuitState(undefined),
    agentId: 'a1',
    source: 'direct',
    marginSol: -0.03,
    failed: true,
    negativeMarginThreshold: 1,
    cooldownMinutes: 120,
    nowIso: '2026-02-20T00:00:00.000Z',
  });

  const closed = updateMarginCircuit({
    state: opened.state,
    agentId: 'a1',
    source: 'direct',
    marginSol: 0.02,
    failed: false,
    negativeMarginThreshold: 1,
    cooldownMinutes: 120,
    nowIso: '2026-02-20T00:10:00.000Z',
  });

  assert.equal(closed.event?.type, 'closed');
  const open = isMarginCircuitOpen({
    state: closed.state,
    agentId: 'a1',
    source: 'direct',
    nowIso: '2026-02-20T00:10:00.000Z',
  });
  assert.equal(open.open, false);
});

test('prunes stale margin circuit entries', () => {
  const staleState = parseMarginCircuitState(
    JSON.stringify({
      updatedAt: '2026-02-20T00:00:00.000Z',
      entries: {
        'a1:x402': {
          agentId: 'a1',
          source: 'x402',
          negativeMarginStreak: 0,
          updatedAt: '2025-12-01T00:00:00.000Z',
        },
      },
    })
  );

  const pruned = pruneMarginCircuitState({
    state: staleState,
    keepDays: 7,
    nowIso: '2026-02-20T00:00:00.000Z',
  });

  assert.equal(Object.keys(pruned.entries).length, 0);
});
