import assert from 'node:assert/strict';
import test from 'node:test';

import { classifyMandate } from './mandate.js';
import type { MandateClassificationInput } from './mandate.js';

function makeInput(
  overrides: Partial<MandateClassificationInput> = {}
): MandateClassificationInput {
  return {
    estimatedCostSol: overrides.estimatedCostSol ?? 0.005,
    dailyCapSol: overrides.dailyCapSol ?? 0.1,
    sourceReliability: overrides.sourceReliability ?? 0.9,
    agentSuccessRate: overrides.agentSuccessRate ?? 0.8,
    sourceDisabledByRollback: overrides.sourceDisabledByRollback ?? false,
    agentPaused: overrides.agentPaused ?? false,
    thresholds: overrides.thresholds,
  };
}

test('auto_approve for low-cost, reliable source, good agent', () => {
  const result = classifyMandate(
    makeInput({
      estimatedCostSol: 0.005, // 5% of daily cap
      dailyCapSol: 0.1,
      sourceReliability: 0.9,
      agentSuccessRate: 0.8,
    })
  );

  assert.equal(result.tier, 'auto_approve');
  assert.equal(result.reason, 'low_risk');
  assert.ok(result.costRelativeToCap < 0.1);
});

test('verify_first for moderate cost', () => {
  const result = classifyMandate(
    makeInput({
      estimatedCostSol: 0.015, // 15% of daily cap
      dailyCapSol: 0.1,
      sourceReliability: 0.7,
      agentSuccessRate: 0.8,
    })
  );

  assert.equal(result.tier, 'verify_first');
  assert.equal(result.reason, 'moderate_risk');
});

test('verify_first for low cost but poor agent history', () => {
  const result = classifyMandate(
    makeInput({
      estimatedCostSol: 0.005,
      sourceReliability: 0.9,
      agentSuccessRate: 0.4, // below auto_approve threshold
    })
  );

  assert.equal(result.tier, 'verify_first');
});

test('require_approval for high cost ratio', () => {
  const result = classifyMandate(
    makeInput({
      estimatedCostSol: 0.05, // 50% of daily cap
      dailyCapSol: 0.1,
      sourceReliability: 0.9,
      agentSuccessRate: 0.9,
    })
  );

  assert.equal(result.tier, 'require_approval');
  assert.equal(result.reason, 'high_cost_ratio');
});

test('require_approval for low source reliability', () => {
  const result = classifyMandate(
    makeInput({
      estimatedCostSol: 0.015,
      sourceReliability: 0.3, // below verify_first threshold
      agentSuccessRate: 0.8,
    })
  );

  assert.equal(result.tier, 'require_approval');
  assert.equal(result.reason, 'low_source_reliability');
});

test('deny when source disabled by rollback', () => {
  const result = classifyMandate(
    makeInput({
      sourceDisabledByRollback: true,
    })
  );

  assert.equal(result.tier, 'deny');
  assert.equal(result.reason, 'source_disabled_by_rollback');
});

test('deny when agent is paused', () => {
  const result = classifyMandate(
    makeInput({
      agentPaused: true,
    })
  );

  assert.equal(result.tier, 'deny');
  assert.equal(result.reason, 'agent_paused');
});

test('deny takes priority over auto_approve conditions', () => {
  const result = classifyMandate(
    makeInput({
      estimatedCostSol: 0.001,
      sourceReliability: 1.0,
      agentSuccessRate: 1.0,
      sourceDisabledByRollback: true,
    })
  );

  assert.equal(result.tier, 'deny');
});

test('costRelativeToCap is 1 when dailyCapSol is 0', () => {
  const result = classifyMandate(
    makeInput({
      estimatedCostSol: 0.01,
      dailyCapSol: 0,
    })
  );

  assert.equal(result.costRelativeToCap, 1);
  assert.equal(result.tier, 'require_approval');
});

test('custom thresholds are respected', () => {
  const result = classifyMandate(
    makeInput({
      estimatedCostSol: 0.02,
      dailyCapSol: 0.1,
      sourceReliability: 0.8,
      agentSuccessRate: 0.7,
      thresholds: {
        autoApproveCostRatio: 0.25, // higher threshold
        autoApproveMinReliability: 0.7,
        autoApproveMinSuccessRate: 0.6,
        verifyFirstCostRatio: 0.5,
        verifyFirstMinReliability: 0.4,
      },
    })
  );

  assert.equal(result.tier, 'auto_approve'); // would be verify_first with defaults
});

test('classification includes all numeric scores', () => {
  const result = classifyMandate(
    makeInput({
      estimatedCostSol: 0.005,
      dailyCapSol: 0.1,
      sourceReliability: 0.85,
      agentSuccessRate: 0.72,
    })
  );

  assert.ok(Math.abs(result.costRelativeToCap - 0.05) < 1e-10);
  assert.equal(result.sourceReliability, 0.85);
  assert.equal(result.agentHistoryScore, 0.72);
});
