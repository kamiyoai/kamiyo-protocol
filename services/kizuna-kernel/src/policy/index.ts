export type KizunaLane = 'enterprise' | 'crypto-fast';

export interface PolicyPack {
  id: string;
  version: string;
  lane: KizunaLane;
  poolIds: string[];
  envelopeTtlMs: number;
  thresholds: {
    trusted: number;
    standard: number;
    minSettlements: number;
  };
  scoreWeights: {
    dispute: number;
    repayment: number;
    quality: number;
    tenure: number;
    inactivityHalfLifeDays: number;
    collateralMultiplier: number;
  };
  limits: {
    throttleMaxApprovedMicro: string;
    throttleRatioBps: number;
  };
  rules: {
    denyAccountStatuses: string[];
    enterprisePrefundRequired: boolean;
    minHealthFactor: number;
    maxLtvBps: number;
    freezeActions: string[];
    throttleActions: string[];
  };
  actions: {
    replayFreezeAfter: number;
    payerFanOutThrottleAfter: number;
    agentFanInThrottleAfter: number;
    poolHopFreezeAfter: number;
    prefundDriftFreezeAfter: number;
    collateralChurnThrottleAfter: number;
    commitRetryThrottleAfter: number;
    settlementFailureFreezeAfter: number;
    disputeSpikeThrottleAfter: number;
    lowHealthFreezeAfter: number;
  };
}

import { enterpriseDefaultV1 } from './packs/enterprise-default-v1.js';
import { fastpathDefaultV1 } from './packs/fastpath-default-v1.js';

const POLICY_PACKS: PolicyPack[] = [enterpriseDefaultV1, fastpathDefaultV1];

export function listPolicyPacks(): PolicyPack[] {
  return POLICY_PACKS.map((pack) => ({ ...pack }));
}

export function getPolicyPack(id: string): PolicyPack | null {
  return POLICY_PACKS.find((pack) => pack.id === id) || null;
}
