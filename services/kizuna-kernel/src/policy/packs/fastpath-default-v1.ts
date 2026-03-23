import type { PolicyPack } from '../index.js';

export const fastpathDefaultV1: PolicyPack = {
  id: 'fastpath-default-v1',
  version: 'v1',
  lane: 'crypto-fast',
  poolIds: ['fastpath-main'],
  envelopeTtlMs: 120_000,
  thresholds: {
    trusted: 700,
    standard: 420,
    minSettlements: 3,
  },
  scoreWeights: {
    dispute: 250,
    repayment: 250,
    quality: 250,
    tenure: 250,
    inactivityHalfLifeDays: 30,
    collateralMultiplier: 3,
  },
  limits: {
    throttleMaxApprovedMicro: '250000',
    throttleRatioBps: 2000,
  },
  rules: {
    denyAccountStatuses: ['suspended'],
    enterprisePrefundRequired: false,
    minHealthFactor: 1.5,
    maxLtvBps: 4000,
    freezeActions: ['freeze'],
    throttleActions: ['throttle'],
  },
  actions: {
    replayFreezeAfter: 1,
    payerFanOutThrottleAfter: 4,
    agentFanInThrottleAfter: 4,
    poolHopFreezeAfter: 2,
    prefundDriftFreezeAfter: 99,
    collateralChurnThrottleAfter: 3,
    commitRetryThrottleAfter: 2,
    settlementFailureFreezeAfter: 3,
    disputeSpikeThrottleAfter: 2,
    lowHealthFreezeAfter: 1,
  },
};
