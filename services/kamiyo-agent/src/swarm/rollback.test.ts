import assert from 'node:assert/strict';
import test from 'node:test';

import {
  evaluateRollbackPolicy,
  isRollbackSourceDisabled,
  parseRollbackState,
  pruneRollbackState,
} from './rollback.js';

test('rollback policy disables worst source when weekly net drops below trigger', () => {
  const evaluation = evaluateRollbackPolicy({
    state: parseRollbackState(undefined),
    nowIso: '2026-02-20T00:00:00.000Z',
    weeklyNetSol: -0.3,
    weeklySourceStats: [
      { source: 'direct', total: 6, revenueSol: -0.25 },
      { source: 'x402', total: 6, revenueSol: 0.1 },
    ],
    minJobs: 5,
    sourceMinJobs: 2,
    netSolTrigger: -0.1,
    maxDisabledSources: 2,
    cooldownHours: 24,
    recoveryNetSol: 0,
  });

  assert.equal(evaluation.triggered, true);
  assert.deepEqual(evaluation.disabledSources, ['direct']);

  const status = isRollbackSourceDisabled({
    state: evaluation.state,
    source: 'direct',
    nowIso: '2026-02-20T01:00:00.000Z',
  });
  assert.equal(status.disabled, true);
});

test('rollback policy clears disabled sources after recovery', () => {
  const triggered = evaluateRollbackPolicy({
    state: parseRollbackState(undefined),
    nowIso: '2026-02-20T00:00:00.000Z',
    weeklyNetSol: -0.2,
    weeklySourceStats: [{ source: 'kore', total: 5, revenueSol: -0.2 }],
    minJobs: 5,
    sourceMinJobs: 2,
    netSolTrigger: -0.1,
    maxDisabledSources: 1,
    cooldownHours: 24,
    recoveryNetSol: 0,
  });
  assert.equal(triggered.triggered, true);

  const recovered = evaluateRollbackPolicy({
    state: triggered.state,
    nowIso: '2026-02-21T00:00:00.000Z',
    weeklyNetSol: 0.05,
    weeklySourceStats: [{ source: 'kore', total: 5, revenueSol: 0.05 }],
    minJobs: 5,
    sourceMinJobs: 2,
    netSolTrigger: -0.1,
    maxDisabledSources: 1,
    cooldownHours: 24,
    recoveryNetSol: 0,
  });

  assert.equal(recovered.triggered, false);
  assert.equal(Object.keys(recovered.state.sources).length, 0);
  assert.equal(recovered.reason, 'recovered');
});

test('rollback pruning removes expired source windows', () => {
  const state = parseRollbackState(
    JSON.stringify({
      updatedAt: '2026-02-20T00:00:00.000Z',
      sources: {
        direct: {
          source: 'direct',
          disabledUntil: '2026-02-19T00:00:00.000Z',
          reason: 'weekly_negative_net_sol',
          weeklyNetSol: -0.2,
          sourceRevenueSol: -0.2,
          sourceSampleCount: 10,
          updatedAt: '2026-02-19T00:00:00.000Z',
        },
      },
    })
  );

  const pruned = pruneRollbackState({
    state,
    nowIso: '2026-02-20T00:00:00.000Z',
  });
  assert.equal(Object.keys(pruned.sources).length, 0);
});
