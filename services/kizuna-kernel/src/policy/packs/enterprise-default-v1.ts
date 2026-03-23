import type { PolicyPack } from '../index.js';

export const enterpriseDefaultV1: PolicyPack = {
  id: 'enterprise-default-v1',
  version: 'v1',
  lane: 'enterprise',
  poolIds: ['enterprise-main'],
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
    collateralMultiplier: 0,
  },
  limits: {
    throttleMaxApprovedMicro: '500000',
    throttleRatioBps: 2500,
  },
  rules: {
    denyAccountStatuses: ['suspended'],
    enterprisePrefundRequired: true,
    minHealthFactor: 1.0,
    maxLtvBps: 10000,
    freezeActions: ['freeze'],
    throttleActions: ['throttle'],
  },
  actions: {
    replayFreezeAfter: 1,
    payerFanOutThrottleAfter: 4,
    agentFanInThrottleAfter: 4,
    poolHopFreezeAfter: 2,
    prefundDriftFreezeAfter: 1,
    collateralChurnThrottleAfter: 4,
    commitRetryThrottleAfter: 2,
    settlementFailureFreezeAfter: 3,
    disputeSpikeThrottleAfter: 2,
    lowHealthFreezeAfter: 99,
  },
};
