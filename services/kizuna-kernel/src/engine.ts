import { createHash, randomUUID } from 'node:crypto';
import type { PolicyPack } from './policy/index.js';
import {
  countDistinctRiskEdgeSources,
  countDistinctRiskEdgeTargets,
  createRiskAction,
  getDecisionByNonce,
  insertDecision,
  listActiveRiskActions,
  recordInternalEvent,
  recordRelationshipGraph,
  resolveRiskActions,
  sumRiskCounter,
  commitDecision,
} from './db/queries.js';
import { getConfig } from './config.js';
import {
  type KizunaDecisionEnvelopeV2,
  mintDecisionEnvelope,
  getSigningContext,
} from './decision/envelope.js';
import {
  canonicalString,
  normalizeRequestHashInput,
  type RequestHashInput,
} from './decision/request-hash.js';

export type KizunaLane = 'enterprise' | 'crypto-fast';
export type RiskAction = 'none' | 'freeze' | 'throttle' | 'unfreeze';

export interface KernelEvaluateInput extends RequestHashInput {
  maxSingleMicro?: string;
  outstandingMicro: string;
  prefundAvailableMicro?: string | null;
  mandateSingleLimitMicro?: string | null;
  accountStatus: string;
  accountAgeDays: number;
  settlementCount: number;
  disputesFiled: number;
  disputesWon: number;
  avgQuality: number;
  debtClosed: number;
  debtTotal: number;
  collateral?: {
    collateralAccount: string;
    assetId: string;
    totalDepositedMicro: string;
    totalWithdrawnMicro: string;
    availableMicro: string;
    effectiveCollateralMicro: string;
    ltvCapBps: number;
    healthFactor: number;
  };
}

export interface KernelEvaluateResult {
  approved: boolean;
  decisionId: string;
  approvedMicro: string;
  availableMicro: string;
  outstandingMicro: string;
  scoreRaw: number;
  reasonCodes: string[];
  tier: 'guarded' | 'standard' | 'trusted';
  lane: KizunaLane;
  poolId: string;
  policyPackId: string;
  policyPackVersion: string;
  riskBand: string;
  riskLevel: string;
  riskAction: RiskAction;
  requestHash: string;
  envelopeVersion: 'kizuna-envelope-v2';
  signingKid: string | null;
  ltvBps?: number;
  healthFactor?: number;
  decisionEnvelope: KizunaDecisionEnvelopeV2 | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_RAW_SCORE = 1000;

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function parseMicro(value: string | null | undefined): bigint {
  if (!value) return 0n;
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return 0n;
  return BigInt(trimmed);
}

function minBigint(a: bigint, b: bigint): bigint {
  return a < b ? a : b;
}

function toSafeNumber(value: bigint): number {
  if (value <= 0n) return 0;
  const max = BigInt(Number.MAX_SAFE_INTEGER);
  return Number(value > max ? max : value);
}

function computeAgingPenalty(inactiveDays: number, halfLifeDays: number): number {
  if (!Number.isFinite(inactiveDays) || inactiveDays <= 0) return 1;
  if (!Number.isFinite(halfLifeDays) || halfLifeDays <= 0) return 0;
  return Math.exp(-inactiveDays * (Math.LN2 / halfLifeDays));
}

function computeScore(input: KernelEvaluateInput, pack: PolicyPack): { rawScore: number; effectiveLimit: bigint } {
  const disputeRate = input.disputesFiled > 0 ? input.disputesWon / input.disputesFiled : null;
  const repaymentRate = input.debtTotal > 0 ? input.debtClosed / input.debtTotal : null;
  const disputeComponent =
    disputeRate !== null ? pack.scoreWeights.dispute * clamp(disputeRate, 0, 1) : pack.scoreWeights.dispute * 0.8;
  const repaymentComponent =
    repaymentRate !== null
      ? pack.scoreWeights.repayment * clamp(repaymentRate, 0, 1)
      : pack.scoreWeights.repayment * 0.5;
  const qualityComponent = pack.scoreWeights.quality * (clamp(input.avgQuality, 0, 100) / 100);
  const tenureComponent =
    pack.scoreWeights.tenure * Math.min(1, clamp(input.accountAgeDays, 0, 180) / 180);
  const rawScore = Math.round(
    clamp(disputeComponent + repaymentComponent + qualityComponent + tenureComponent, 0, MAX_RAW_SCORE)
  );

  const maxSingle = parseMicro(input.maxSingleMicro);
  const mandateCap = parseMicro(input.mandateSingleLimitMicro);
  const hardCap =
    mandateCap > 0n && maxSingle > 0n ? minBigint(mandateCap, maxSingle) : mandateCap > 0n ? mandateCap : maxSingle;

  const inactivityPenalty = computeAgingPenalty(
    Math.max(0, Math.floor((Date.now() - Math.max(0, input.accountAgeDays) * DAY_MS) / DAY_MS) - input.accountAgeDays),
    pack.scoreWeights.inactivityHalfLifeDays
  );
  const collateralBoost =
    input.lane === 'crypto-fast' && input.collateral
      ? toSafeNumber(parseMicro(input.collateral.effectiveCollateralMicro)) *
        pack.scoreWeights.collateralMultiplier
      : 0;
  const effectiveLimit =
    input.settlementCount < pack.thresholds.minSettlements
      ? 0n
      : BigInt(
          Math.max(
            0,
            Math.floor(
              toSafeNumber(hardCap) * ((rawScore / 1000) * Math.max(0.25, inactivityPenalty)) + collateralBoost
            )
          )
        );

  return { rawScore, effectiveLimit: hardCap > 0n ? minBigint(hardCap, effectiveLimit) : effectiveLimit };
}

function tierForScore(scoreRaw: number, pack: PolicyPack): 'guarded' | 'standard' | 'trusted' {
  if (scoreRaw >= pack.thresholds.trusted) return 'trusted';
  if (scoreRaw >= pack.thresholds.standard) return 'standard';
  return 'guarded';
}

function riskLevelFor(params: {
  scoreRaw: number;
  riskAction: RiskAction;
  lane: KizunaLane;
  healthFactor?: number;
}): string {
  if (params.riskAction === 'freeze') return 'critical';
  if (params.riskAction === 'throttle') return 'elevated';
  if (params.lane === 'crypto-fast' && (params.healthFactor ?? 9999) < 1) return 'critical';
  if (params.lane === 'crypto-fast' && (params.healthFactor ?? 9999) < 1.2) return 'elevated';
  if (params.scoreRaw >= 700) return 'low';
  if (params.scoreRaw >= 420) return 'medium';
  return 'high';
}

function computeRequestHash(input: RequestHashInput): string {
  const normalized = normalizeRequestHashInput(input);
  return createHash('sha256').update(canonicalString(normalized)).digest('hex');
}

async function resolveRiskAction(input: KernelEvaluateInput, pack: PolicyPack): Promise<RiskAction> {
  const now = new Date();
  const lastHour = new Date(now.getTime() - 60 * 60 * 1000);
  const lastDay = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const [activeAgentActions, activePayerActions, payerFanOut, agentFanIn, poolHopCount, collateralChurnCount, disputeCount, failureCount] =
    await Promise.all([
      listActiveRiskActions({
        entityType: 'agent',
        entityKey: input.agentId,
        lane: input.lane,
        poolId: input.poolId,
      }),
      listActiveRiskActions({
        entityType: 'payer_wallet',
        entityKey: input.payerWallet,
        lane: input.lane,
        poolId: input.poolId,
      }),
      countDistinctRiskEdgeTargets({
        fromType: 'payer_wallet',
        fromKey: input.payerWallet,
        relation: 'funds_agent',
        since: lastHour,
      }),
      countDistinctRiskEdgeSources({
        toType: 'agent',
        toKey: input.agentId,
        relation: 'funds_agent',
        since: lastHour,
      }),
      countDistinctRiskEdgeTargets({
        fromType: 'agent',
        fromKey: input.agentId,
        relation: 'uses_pool',
        since: lastHour,
      }),
      sumRiskCounter({
        entityType: 'agent',
        entityKey: input.agentId,
        metric: 'collateral_churn',
        windowSeconds: 86_400,
        since: lastDay,
      }),
      sumRiskCounter({
        entityType: 'agent',
        entityKey: input.agentId,
        metric: 'dispute',
        windowSeconds: 86_400,
        since: lastDay,
      }),
      sumRiskCounter({
        entityType: 'agent',
        entityKey: input.agentId,
        metric: 'settlement_failure',
        windowSeconds: 86_400,
        since: lastDay,
      }),
    ]);

  const currentActions = [...activeAgentActions, ...activePayerActions].map((action) => action.action);
  if (currentActions.some((action) => pack.rules.freezeActions.includes(action))) {
    return 'freeze';
  }
  if (currentActions.some((action) => pack.rules.throttleActions.includes(action))) {
    return 'throttle';
  }

  const replayExisting = await getDecisionByNonce(input.payerWallet, input.requestNonce);
  if (replayExisting && replayExisting.request_hash !== computeRequestHash(input)) {
    await createRiskAction({
      entityType: 'payer_wallet',
      entityKey: input.payerWallet,
      lane: input.lane,
      poolId: input.poolId,
      action: 'freeze',
      reason: 'replay_nonce_hash_mismatch',
      source: 'system',
      metadata: {
        requestNonce: input.requestNonce,
        existingRequestHash: replayExisting.request_hash,
      },
    });
    return 'freeze';
  }

  if (payerFanOut >= pack.actions.payerFanOutThrottleAfter) {
    return 'throttle';
  }
  if (agentFanIn >= pack.actions.agentFanInThrottleAfter) {
    return 'throttle';
  }
  if (poolHopCount >= pack.actions.poolHopFreezeAfter) {
    return 'freeze';
  }

  if (
    input.lane === 'enterprise' &&
    pack.rules.enterprisePrefundRequired &&
    parseMicro(input.prefundAvailableMicro) < parseMicro(input.requestedMicro) &&
    pack.actions.prefundDriftFreezeAfter <= 1
  ) {
    return 'freeze';
  }

  if (collateralChurnCount >= pack.actions.collateralChurnThrottleAfter) {
    return 'throttle';
  }
  if (disputeCount >= pack.actions.disputeSpikeThrottleAfter) {
    return 'throttle';
  }
  if (failureCount >= pack.actions.settlementFailureFreezeAfter) {
    return 'freeze';
  }

  if (
    input.lane === 'crypto-fast' &&
    input.collateral &&
    input.collateral.healthFactor < pack.rules.minHealthFactor &&
    pack.actions.lowHealthFreezeAfter <= 1
  ) {
    return 'freeze';
  }

  return 'none';
}

export async function evaluateDecision(
  input: KernelEvaluateInput,
  pack: PolicyPack
): Promise<KernelEvaluateResult> {
  const requestHash = computeRequestHash(input);
  const existing = await getDecisionByNonce(input.payerWallet, input.requestNonce);
  if (existing && existing.request_hash === requestHash) {
    const envelope = existing.envelope as KizunaDecisionEnvelopeV2 | null;
    return {
      approved: existing.approved,
      decisionId: existing.decision_id,
      approvedMicro: existing.approved_micro,
      availableMicro: existing.available_micro,
      outstandingMicro: existing.outstanding_micro,
      scoreRaw: existing.score_raw,
      reasonCodes: existing.reason_codes,
      tier: existing.tier as KernelEvaluateResult['tier'],
      lane: existing.lane,
      poolId: existing.pool_id,
      policyPackId: existing.policy_pack_id || 'unknown-policy',
      policyPackVersion: existing.policy_pack_version || 'unknown-version',
      riskBand: existing.risk_level,
      riskLevel: existing.risk_level,
      riskAction: (existing.risk_action || 'none') as RiskAction,
      requestHash: existing.request_hash || requestHash,
      envelopeVersion: 'kizuna-envelope-v2',
      signingKid: existing.signing_kid,
      decisionEnvelope: envelope,
    };
  }

  await recordRelationshipGraph({
    agentId: input.agentId,
    payerWallet: input.payerWallet,
    repayWallet: input.repayWallet,
    lane: input.lane,
    poolId: input.poolId,
    network: input.network,
    collateralAccount: input.collateral?.collateralAccount,
  });

  const riskAction = await resolveRiskAction(input, pack);
  const reasonCodes: string[] = [];

  if (pack.rules.denyAccountStatuses.includes(input.accountStatus)) {
    reasonCodes.push('account_status_denied');
  }

  if (
    input.lane === 'enterprise' &&
    pack.rules.enterprisePrefundRequired &&
    parseMicro(input.prefundAvailableMicro) < parseMicro(input.requestedMicro)
  ) {
    reasonCodes.push('prefund_insufficient');
  }

  let healthFactor: number | undefined;
  let ltvBps: number | undefined;
  if (input.lane === 'crypto-fast') {
    if (!input.collateral) {
      reasonCodes.push('collateral_missing');
    } else {
      healthFactor = input.collateral.healthFactor;
      ltvBps =
        parseMicro(input.collateral.effectiveCollateralMicro) > 0n
          ? Number(
              (parseMicro(input.outstandingMicro) * 10_000n) /
                parseMicro(input.collateral.effectiveCollateralMicro)
            )
          : 0;
      if (healthFactor < pack.rules.minHealthFactor) {
        reasonCodes.push('health_factor_below_policy');
      }
      if ((ltvBps || 0) > pack.rules.maxLtvBps) {
        reasonCodes.push('ltv_above_policy');
      }
    }
  }

  const scoring = computeScore(input, pack);
  const tier = tierForScore(scoring.rawScore, pack);
  const outstanding = parseMicro(input.outstandingMicro);
  let availableMicro = scoring.effectiveLimit > outstanding ? scoring.effectiveLimit - outstanding : 0n;
  const requested = parseMicro(input.requestedMicro);

  if (input.lane === 'crypto-fast' && input.collateral) {
    const collateralLimit =
      (parseMicro(input.collateral.effectiveCollateralMicro) * BigInt(input.collateral.ltvCapBps)) /
      10_000n;
    const collateralAvailable = collateralLimit > outstanding ? collateralLimit - outstanding : 0n;
    availableMicro = minBigint(availableMicro, collateralAvailable);
  }

  let approvedMicro = minBigint(requested, availableMicro);

  if (riskAction === 'freeze') {
    approvedMicro = 0n;
    reasonCodes.push('risk_action_freeze');
  } else if (riskAction === 'throttle') {
    const throttledCap = parseMicro(pack.limits.throttleMaxApprovedMicro);
    const throttledByRatio = (requested * BigInt(pack.limits.throttleRatioBps)) / 10_000n;
    approvedMicro = minBigint(approvedMicro, minBigint(throttledCap, throttledByRatio));
    reasonCodes.push('risk_action_throttle');
  }

  if (!approvedMicro) {
    reasonCodes.push('approval_denied');
  } else if (approvedMicro < requested) {
    reasonCodes.push('partial_approval');
  }

  if (reasonCodes.length === 0) {
    reasonCodes.push('approved');
  }

  const riskLevel = riskLevelFor({
    scoreRaw: scoring.rawScore,
    riskAction,
    lane: input.lane,
    healthFactor,
  });

  const decisionId = `kz2:${randomUUID()}`;
  let decisionEnvelope: KizunaDecisionEnvelopeV2 | null = null;
  let signingKid: string | null = null;
  if (approvedMicro > 0n && riskAction !== 'freeze') {
    const signingContext = await getSigningContext();
    signingKid = signingContext.kid;
    decisionEnvelope = await mintDecisionEnvelope({
      ttlMs: Math.min(getConfig().KIZUNA_KERNEL_ENVELOPE_TTL_MS, pack.envelopeTtlMs),
      payload: {
        decisionId,
        agentId: input.agentId,
        payerWallet: input.payerWallet,
        repayWallet: input.repayWallet,
        requestNonce: input.requestNonce,
        network: input.network,
        lane: input.lane,
        poolId: input.poolId,
        approvedMicro: approvedMicro.toString(),
        policyPackId: pack.id,
        policyPackVersion: pack.version,
        riskLevel,
        riskAction,
        requestHash,
        ltvBps,
        healthFactor,
      },
    });
  }

  await insertDecision({
    decisionId,
    payerWallet: input.payerWallet,
    requestNonce: input.requestNonce,
    requestHash,
    agentId: input.agentId,
    repayWallet: input.repayWallet,
    network: input.network,
    lane: input.lane,
    poolId: input.poolId,
    requestedMicro: input.requestedMicro,
    approved: approvedMicro > 0n,
    approvedMicro: approvedMicro.toString(),
    availableMicro: availableMicro.toString(),
    outstandingMicro: input.outstandingMicro,
    scoreRaw: scoring.rawScore,
    reasonCodes,
    tier,
    policyPackId: pack.id,
    policyPackVersion: pack.version,
    riskLevel,
    riskAction,
    signingKid,
    envelopeVersion: decisionEnvelope ? 'kizuna-envelope-v2' : null,
    envelope: decisionEnvelope,
  });

  return {
    approved: approvedMicro > 0n,
    decisionId,
    approvedMicro: approvedMicro.toString(),
    availableMicro: availableMicro.toString(),
    outstandingMicro: input.outstandingMicro,
    scoreRaw: scoring.rawScore,
    reasonCodes,
    tier,
    lane: input.lane,
    poolId: input.poolId,
    policyPackId: pack.id,
    policyPackVersion: pack.version,
    riskBand: riskLevel,
    riskLevel,
    riskAction,
    requestHash,
    envelopeVersion: 'kizuna-envelope-v2',
    signingKid,
    ltvBps,
    healthFactor,
    decisionEnvelope,
  };
}

export async function handleCommit(input: {
  decisionId: string;
  settlementId: string;
  debtId?: string;
  txHash: string;
  lane: KizunaLane;
  poolId: string;
}): Promise<void> {
  await commitDecision(input);
}

export async function handleRepaymentIngest(input: {
  agentId: string;
  lane: KizunaLane;
  poolId: string;
  referenceId: string;
  amountMicro: string;
  appliedMicro: string;
}): Promise<void> {
  void input.referenceId;
  await recordInternalEvent({
    entityType: 'agent',
    entityKey: input.agentId,
    metric: 'repayment',
    lane: input.lane,
    poolId: input.poolId,
    metadata: {
      amountMicro: input.amountMicro,
      appliedMicro: input.appliedMicro,
    },
  });
  await resolveRiskActions({
    entityType: 'agent',
    entityKey: input.agentId,
    lane: input.lane,
    poolId: input.poolId,
  });
}

export async function handleCollateralIngest(input: {
  agentId: string;
  lane: KizunaLane;
  poolId: string;
  collateralAccount: string;
  assetId: string;
  amountMicro: string;
  eventType: 'deposit' | 'withdraw';
  referenceId: string;
}): Promise<void> {
  void input.referenceId;
  await recordInternalEvent({
    entityType: 'agent',
    entityKey: input.agentId,
    metric: 'collateral_churn',
    lane: input.lane,
    poolId: input.poolId,
    metadata: {
      collateralAccount: input.collateralAccount,
      assetId: input.assetId,
      amountMicro: input.amountMicro,
      eventType: input.eventType,
    },
  });
}

export async function handleInternalEvent(input: {
  entityType: string;
  entityKey: string;
  metric: string;
  lane: KizunaLane;
  poolId: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await recordInternalEvent(input);
}
