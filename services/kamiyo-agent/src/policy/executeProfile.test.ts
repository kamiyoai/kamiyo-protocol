import assert from 'node:assert/strict';
import test from 'node:test';

import { buildExecutionPolicy, type ExecutionPolicyInput } from './executeProfile.js';

function baseInput(): ExecutionPolicyInput {
  return {
    KAMIYO_EXECUTION_STAGE: 'full',
    KAMIYO_EXECUTION_HARD_STOP: false,
    KAMIYO_SOL_DAILY_CAP: 0.2,
    KAMIYO_SOL_PER_TX_CAP: 0.05,
    KAMIYO_MAX_TX_PER_DAY: 50,
    KAMIYO_SWARM_JOB_EXECUTION_ENABLED: true,
    KAMIYO_SWARM_JOB_EXECUTIONS_PER_TICK: 3,
    KAMIYO_SWARM_JOB_MIN_MARGIN_SOL: 0.0005,
    KAMIYO_AUTO_CLAIM_ENABLED: true,
    KAMIYO_AGENT_AUTO_CLAIM_ENABLED: true,
    KAMIYO_AUTO_STAKE_ENABLED: true,
    KAMIYO_AUTO_STAKE_AVAILABLE_BPS: 4000,
    KAMIYO_AUTO_STAKE_MAX_LAMPORTS_PER_TX: 0,
    KAMIYO_STAKING_POOL: undefined,
    KAMIYO_AGENT_STAKING_POOL: undefined,
    KAMIYO_ALLOWED_STAKING_POOLS: ['PoolA', 'PoolB'],
    KAMIYO_REQUIRE_STAKING_POOL_ALLOWLIST: true,
  };
}

test('canary_1 enforces lower tx/spend caps and disables routing', () => {
  const policy = buildExecutionPolicy({
    ...baseInput(),
    KAMIYO_EXECUTION_STAGE: 'canary_1',
  });

  assert.equal(policy.stage, 'canary_1');
  assert.equal(policy.dailyCapSol, 0.02);
  assert.equal(policy.perTxCapSol, 0.003);
  assert.equal(policy.maxTxPerDay, 4);
  assert.equal(policy.swarmJobExecutionEnabled, true);
  assert.equal(policy.swarmJobExecutionsPerTick, 1);
  assert.equal(policy.autoStakeEnabled, false);
  assert.equal(policy.autoStakeAvailableBps, 0);
  assert.equal(policy.autoStakeMaxLamportsPerTx, 0);
});

test('hard stop disables all mutating operations', () => {
  const policy = buildExecutionPolicy({
    ...baseInput(),
    KAMIYO_EXECUTION_STAGE: 'full',
    KAMIYO_EXECUTION_HARD_STOP: true,
  });

  assert.equal(policy.swarmJobExecutionEnabled, false);
  assert.equal(policy.swarmJobExecutionsPerTick, 0);
  assert.equal(policy.autoClaimEnabled, false);
  assert.equal(policy.kamiyoAgentAutoClaimEnabled, false);
  assert.equal(policy.autoStakeEnabled, false);
});

test('full stage preserves configured caps and allowlist', () => {
  const policy = buildExecutionPolicy(baseInput());

  assert.equal(policy.dailyCapSol, 0.2);
  assert.equal(policy.perTxCapSol, 0.05);
  assert.equal(policy.maxTxPerDay, 50);
  assert.equal(policy.swarmJobExecutionsPerTick, 3);
  assert.equal(policy.autoStakeEnabled, true);
  assert.equal(policy.allowedStakingPools.has('PoolA'), true);
  assert.equal(policy.allowedStakingPools.has('PoolB'), true);
});

test('configured staking targets are auto-allowlisted', () => {
  const policy = buildExecutionPolicy({
    ...baseInput(),
    KAMIYO_ALLOWED_STAKING_POOLS: [],
    KAMIYO_STAKING_POOL: '9mEd5iRcdbNUwaCmkPqYggLfg25B2DsTn1w6gNrgvC9d',
    KAMIYO_AGENT_STAKING_POOL: 'Gxa8pZeSMGrNGTGLLyrPsqHgr6cUhBQrs7TEBhBSocYx',
  });

  assert.equal(policy.allowedStakingPools.has('9mEd5iRcdbNUwaCmkPqYggLfg25B2DsTn1w6gNrgvC9d'), true);
  assert.equal(policy.allowedStakingPools.has('Gxa8pZeSMGrNGTGLLyrPsqHgr6cUhBQrs7TEBhBSocYx'), true);
});
