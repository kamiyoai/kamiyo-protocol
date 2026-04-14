import assert from 'node:assert/strict';
import test from 'node:test';

import { evaluateSelfImprove, parseSelfImproveState } from './selfImprove.js';

test('self improve tightens policy on high fail rate', () => {
  const decision = evaluateSelfImprove({
    state: parseSelfImproveState(undefined),
    nowIso: '2026-01-01T00:00:00.000Z',
    totalJobs: 20,
    failedJobs: 12,
    netRevenueSol: 0.01,
    minJobs: 10,
    failRateUpper: 0.35,
    failRateLower: 0.1,
    marginStepSol: 0.0002,
    minMarginFloorSol: 0.0002,
    currentMinMarginSol: 0.0005,
    baseExecutionsPerTick: 2,
    maxExecutionsPerTick: 6,
  });

  assert.equal(decision.action, 'tighten');
  assert.equal(decision.reason, 'high_fail_rate');
  assert.equal(decision.effectiveExecutionsPerTick, 1);
  assert.ok(decision.effectiveMinMarginSol > 0.0005);
});

test('self improve scales up on healthy outcomes', () => {
  const decision = evaluateSelfImprove({
    state: parseSelfImproveState(undefined),
    nowIso: '2026-01-01T00:00:00.000Z',
    totalJobs: 24,
    failedJobs: 1,
    netRevenueSol: 0.2,
    minJobs: 10,
    failRateUpper: 0.35,
    failRateLower: 0.1,
    marginStepSol: 0.0002,
    minMarginFloorSol: 0.0002,
    currentMinMarginSol: 0.0008,
    baseExecutionsPerTick: 1,
    maxExecutionsPerTick: 4,
  });

  assert.equal(decision.action, 'scale_up');
  assert.equal(decision.reason, 'healthy_margin_and_fail_rate');
  assert.equal(decision.effectiveExecutionsPerTick, 2);
  assert.ok(decision.effectiveMinMarginSol <= 0.0008);
});
