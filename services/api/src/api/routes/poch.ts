import { createHash } from 'node:crypto';
import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import {
  AgentParanetClient,
  type PoCHChallenge,
  type PoCHContribution,
  type PoCHEnforcementMode,
  type PoCHGateDecision,
  type PoCHScoreBundle,
  type PoCHStatus,
  type PoCHSlashingMode,
  type ParanetConfig,
  buildPoCHChallengeId,
  buildPoCHURN,
  hashPoCHScoreBundle,
  loadPoCHObservations,
} from '@kamiyo/agent-paranet';
import { logger } from '../../logger';
import {
  computePoCHRolloutMetrics,
  finalizePoCHChallenge,
  getPoCHChallenge,
  getLatestPoCHRolloutSnapshot,
  getPoCHOracleCommitment,
  getPoCHOracleVote,
  getPoCHProofSubmission,
  getPoCHRevealedVotes,
  getPoCHRolloutState,
  getPoCHStatus,
  hasBlockingPoCHDispute,
  incrementPoCHPenalty,
  listPoCHDisputes,
  openPoCHDispute,
  PoCHRollbackTrigger,
  PoCHRolloutSnapshot,
  PoCHRolloutStage,
  registerPoCHNullifier,
  recordPoCHGateDecision,
  resolvePoCHDispute,
  revealPoCHOracleVote,
  setPoCHProofAccepted,
  StoredChallenge,
  getLatestOpenPoCHChallenge,
  upsertPoCHRolloutSnapshot,
  upsertPoCHRolloutState,
  upsertPoCHChallenge,
  upsertPoCHContribution,
  upsertPoCHOracleCommit,
  upsertPoCHProofSubmission,
  upsertPoCHStatus,
} from './poch-store';
import {
  pochDisputeTotal,
  pochGateDecisionTotal,
  pochOracleCommitTotal,
  pochOracleRevealTotal,
  pochProofTotal,
  pochRollbackTotal,
  pochRolloutEvaluatorLastRunTimestamp,
  pochRolloutFalsePositiveDenyRate24h,
  pochRolloutOpenBlockingDisputes,
  pochRolloutOracleRevealCompletion24h,
  pochRolloutOracleRevealCompletion2h,
  pochRolloutProofFailureRate1h,
  pochRolloutProofPassRate24h,
  pochRolloutStage,
  pochRolloutUnresolvedBlockingDisputesOver24h,
  pochSubmissionTotal,
} from '../../metrics';

const router = Router();

const writeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: process.env.NODE_ENV === 'test' ? 1000 : 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many PoCH requests' } },
});

const readLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: process.env.NODE_ENV === 'test' ? 2000 : 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many PoCH reads' } },
});

type Chain = 'solana' | 'base';
type PoCHStatusReason =
  | 'proof_missing'
  | 'oracle_quorum_pending'
  | 'oracle_timeout'
  | 'blocking_dispute'
  | 'policy_failed'
  | 'oracle_rejected'
  | 'verified';
type StoredPoCHStatus = PoCHStatus & { statusReason?: PoCHStatusReason };

interface ProofRequestBody {
  challengeId?: string;
  assetDid?: string;
  identityDid?: string;
  chain?: Chain;
  zkProof?: string;
  identityNullifier?: string;
}

interface OracleRegistryEntry {
  id: string;
  weight?: number;
  stakeLamports?: string | number;
  active?: boolean;
}

interface OracleDecision {
  ready: boolean;
  accepted: boolean;
  voteCount: number;
  totalWeight: number;
  weightedConfidence: number;
  authenticityYesWeight: number;
  uniquenessYesWeight: number;
}

interface FinalizeResult {
  finalized: boolean;
  accepted?: boolean;
  reason?: string;
  statusReason?: PoCHStatusReason;
  oracleRoundId?: string;
  proofStatementId?: string;
}

interface PoCHPromotionGates {
  oracleRevealCompletion: boolean;
  proofPassRate: boolean;
  unresolvedBlockingDisputes: boolean;
  falsePositiveDenyRate: boolean;
}

interface PoCHRolloutStatusResponse {
  stage: PoCHRolloutStage;
  modeOverride?: PoCHRolloutStage;
  effectiveMode: PoCHEnforcementMode;
  stageStartedAt: string;
  updatedAt: string;
  updatedBy: string;
  evaluatorLastRunAt?: string;
  snapshotAgeSeconds?: number;
  rollbackCooldownUntil?: string;
  baselineProofFailRate: number;
  gateMetrics: {
    oracleRevealCompletion24h: number;
    proofPassRate24h: number;
    unresolvedBlockingDisputesOver24h: number;
    falsePositiveDenyRate24h: number;
  };
  rollbackMetrics: {
    oracleRevealCompletion2h: number;
    proofFailureRate1h: number;
    openBlockingDisputes: number;
  };
  gates: PoCHPromotionGates;
  rollbackState: {
    inCooldown: boolean;
    trigger?: PoCHRollbackTrigger;
    reason?: string;
    snapshotAt?: string;
  };
}

const POCH_TOPICS = {
  submissions: process.env.POCH_TOPIC_SUBMISSIONS || 'poch-submissions',
  scoring: process.env.POCH_TOPIC_SCORING || 'poch-scoring',
  votes: process.env.POCH_TOPIC_ORACLE_VOTES || 'poch-oracle-votes',
  disputes: process.env.POCH_TOPIC_DISPUTES || 'poch-disputes',
  status: process.env.POCH_TOPIC_STATUS || 'poch-status',
};

const POCH_DEFAULT_BASELINE_PROOF_FAIL_RATE = Number(process.env.POCH_BASELINE_PROOF_FAIL_RATE || '0.05');
const POCH_ROLLOUT_EVALUATOR_INTERVAL_MS = (() => {
  const parsed = Number(process.env.POCH_ROLLOUT_EVALUATOR_INTERVAL_MS || '300000');
  if (!Number.isFinite(parsed) || parsed < 60_000) return 300_000;
  return parsed;
})();

const POCH_OBSERVE_START_AT = process.env.POCH_ROLLOUT_OBSERVE_START_AT || '2026-03-03T00:00:00Z';
const POCH_SOFT_START_AT = process.env.POCH_ROLLOUT_SOFT_START_AT || '2026-03-10T00:00:00Z';
const POCH_GATE_START_AT = process.env.POCH_ROLLOUT_GATE_START_AT || '2026-03-17T00:00:00Z';

function firstNonEmpty(keys: readonly string[]): string | undefined {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }
  return undefined;
}

function normalizeDkgEndpoint(endpoint: string): string {
  if (/^[a-zA-Z][a-zA-Z\d+.-]*:\/\//.test(endpoint)) return endpoint;
  return `http://${endpoint}`;
}

function getParanetConfig(): ParanetConfig {
  const endpoint = firstNonEmpty([
    'DKG_ENDPOINT',
    'KAMIYO_DKG_ENDPOINT',
    'PARANET_DKG_ENDPOINT',
    'OT_NODE_ENDPOINT',
  ]);
  if (!endpoint) {
    throw new Error('DKG endpoint missing. Set DKG_ENDPOINT or KAMIYO_DKG_ENDPOINT');
  }

  const blockchainRaw = firstNonEmpty(['DKG_BLOCKCHAIN', 'KAMIYO_DKG_BLOCKCHAIN', 'PARANET_BLOCKCHAIN']);
  const blockchain: ParanetConfig['blockchain'] =
    blockchainRaw === 'gnosis:100' || blockchainRaw === 'otp:2043' ? blockchainRaw : 'base:8453';

  const dkgPort = Number(firstNonEmpty(['DKG_PORT', 'KAMIYO_DKG_PORT', 'PARANET_DKG_PORT']) || '8900');
  const epochs = Number(firstNonEmpty(['DKG_EPOCHS', 'KAMIYO_DKG_EPOCHS', 'PARANET_EPOCHS']) || '12');

  return {
    dkgEndpoint: normalizeDkgEndpoint(endpoint),
    dkgPort: Number.isFinite(dkgPort) && dkgPort > 0 ? dkgPort : 8900,
    blockchain,
    privateKey: firstNonEmpty(['DKG_PRIVATE_KEY', 'KAMIYO_DKG_PRIVATE_KEY', 'PARANET_PRIVATE_KEY']),
    epochs: Number.isFinite(epochs) && epochs > 0 ? epochs : 12,
    paranetUAL: firstNonEmpty([
      'PARANET_UAL',
      'DKG_PARANET_UAL',
      'KAMIYO_DKG_PARANET_UAL',
      'MEISHI_PARANET_UAL',
    ]),
  };
}

function isPoCHEnabled(): boolean {
  return process.env.POCH_ENABLED !== 'false';
}

function parseRolloutStage(value: string | undefined): PoCHRolloutStage | undefined {
  if (value === 'observe' || value === 'soft' || value === 'gate_high_impact') {
    return value;
  }
  return undefined;
}

function stageToGauge(stage: PoCHRolloutStage): number {
  if (stage === 'observe') return 0;
  if (stage === 'soft') return 1;
  return 2;
}

function parseIsoOrNull(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return null;
  return parsed;
}

function getEnvEnforcementMode(): PoCHEnforcementMode {
  const mode = parseRolloutStage(process.env.POCH_ENFORCEMENT_MODE);
  if (mode) return mode;
  return 'observe';
}

function getEffectiveEnforcementMode(): PoCHEnforcementMode {
  const fallback = getEnvEnforcementMode();
  const state = getPoCHRolloutState(fallback);
  const effective = state.modeOverride || state.stage;
  pochRolloutStage.set(stageToGauge(effective));
  return effective;
}

function getRolloutBoundary(stage: PoCHRolloutStage): number {
  const raw = stage === 'observe'
    ? POCH_OBSERVE_START_AT
    : stage === 'soft'
      ? POCH_SOFT_START_AT
      : POCH_GATE_START_AT;
  const parsed = Date.parse(raw);
  return Number.isNaN(parsed) ? 0 : Math.floor(parsed / 1000);
}

function getRolloutThresholds() {
  const oracleRevealPromotionMin = Number(process.env.POCH_ROLLOUT_ORACLE_REVEAL_MIN_COMPLETION || '0.9');
  const proofPassPromotionMin = Number(process.env.POCH_ROLLOUT_PROOF_PASS_MIN_RATE || '0.95');
  const falsePositiveMax = Number(process.env.POCH_ROLLOUT_GATING_FALSE_POSITIVE_MAX_RATE || '0.01');
  const rollbackOracleRevealMin = Number(process.env.POCH_ROLLBACK_ORACLE_REVEAL_MIN_COMPLETION || '0.8');
  const rollbackProofFailureMultiplier = Number(
    process.env.POCH_ROLLBACK_PROOF_FAILURE_ANOMALY_MULTIPLIER || '2'
  );
  const rollbackBlockingDisputesThreshold = Number(
    process.env.POCH_ROLLBACK_BLOCKING_DISPUTE_OPEN_THRESHOLD || '50'
  );

  return {
    oracleRevealPromotionMin: Number.isFinite(oracleRevealPromotionMin) ? oracleRevealPromotionMin : 0.9,
    proofPassPromotionMin: Number.isFinite(proofPassPromotionMin) ? proofPassPromotionMin : 0.95,
    falsePositiveMax: Number.isFinite(falsePositiveMax) ? falsePositiveMax : 0.01,
    rollbackOracleRevealMin: Number.isFinite(rollbackOracleRevealMin) ? rollbackOracleRevealMin : 0.8,
    rollbackProofFailureMultiplier: Number.isFinite(rollbackProofFailureMultiplier)
      ? rollbackProofFailureMultiplier
      : 2,
    rollbackBlockingDisputesThreshold: Number.isFinite(rollbackBlockingDisputesThreshold)
      ? rollbackBlockingDisputesThreshold
      : 50,
  };
}

function getPromotionGates(snapshot: PoCHRolloutSnapshot): PoCHPromotionGates {
  const thresholds = getRolloutThresholds();
  return {
    oracleRevealCompletion: snapshot.oracleRevealCompletion24h >= thresholds.oracleRevealPromotionMin,
    proofPassRate: snapshot.proofPassRate24h >= thresholds.proofPassPromotionMin,
    unresolvedBlockingDisputes: snapshot.unresolvedBlockingDisputesOver24h === 0,
    falsePositiveDenyRate: snapshot.falsePositiveDenyRate24h < thresholds.falsePositiveMax,
  };
}

function allPromotionGatesPass(gates: PoCHPromotionGates): boolean {
  return gates.oracleRevealCompletion
    && gates.proofPassRate
    && gates.unresolvedBlockingDisputes
    && gates.falsePositiveDenyRate;
}

function resolveAuth(req: Request): string | null {
  const auth = req.headers.authorization?.trim();
  if (!auth || !auth.startsWith('Bearer ')) return null;
  return auth.slice('Bearer '.length).trim();
}

function getRolloutAdminSecret(): string {
  return process.env.POCH_ADMIN_SECRET || '';
}

function requireRolloutAdmin(req: Request, res: Response): boolean {
  const adminSecret = getRolloutAdminSecret();
  if (!adminSecret) {
    sendError(res, 503, 'ADMIN_NOT_CONFIGURED', 'PoCH admin routes are not configured');
    return false;
  }
  const token = resolveAuth(req);
  if (!token || token !== adminSecret) {
    sendError(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return false;
  }
  return true;
}

function nowSec(): number {
  return Math.floor(Date.now() / 1000);
}

function buildRolloutStatusResponse(
  snapshot: PoCHRolloutSnapshot,
  rollbackTrigger?: PoCHRollbackTrigger,
  rollbackReason?: string
): PoCHRolloutStatusResponse {
  const state = getPoCHRolloutState(getEnvEnforcementMode());
  const effectiveMode = state.modeOverride || state.stage;
  const gates = getPromotionGates(snapshot);
  const cooldownUntilMs = parseIsoOrNull(state.rollbackCooldownUntil);
  const inCooldown = cooldownUntilMs !== null && Date.now() < cooldownUntilMs;
  const snapshotCapturedAtMs = parseIsoOrNull(snapshot.capturedAt);
  const snapshotAgeSeconds = snapshotCapturedAtMs === null
    ? undefined
    : Math.max(0, Math.floor((Date.now() - snapshotCapturedAtMs) / 1000));

  return {
    stage: state.stage,
    modeOverride: state.modeOverride,
    effectiveMode,
    stageStartedAt: state.startedAt,
    updatedAt: state.updatedAt,
    updatedBy: state.updatedBy,
    evaluatorLastRunAt: snapshot.capturedAt,
    snapshotAgeSeconds,
    rollbackCooldownUntil: state.rollbackCooldownUntil,
    baselineProofFailRate: state.baselineProofFailRate ?? POCH_DEFAULT_BASELINE_PROOF_FAIL_RATE,
    gateMetrics: {
      oracleRevealCompletion24h: snapshot.oracleRevealCompletion24h,
      proofPassRate24h: snapshot.proofPassRate24h,
      unresolvedBlockingDisputesOver24h: snapshot.unresolvedBlockingDisputesOver24h,
      falsePositiveDenyRate24h: snapshot.falsePositiveDenyRate24h,
    },
    rollbackMetrics: {
      oracleRevealCompletion2h: snapshot.oracleRevealCompletion2h,
      proofFailureRate1h: snapshot.proofFailureRate1h,
      openBlockingDisputes: snapshot.openBlockingDisputes,
    },
    gates,
    rollbackState: {
      inCooldown,
      trigger: rollbackTrigger,
      reason: rollbackReason,
      snapshotAt: snapshot.capturedAt,
    },
  };
}

function getSlashingMode(): PoCHSlashingMode {
  const mode = process.env.POCH_SLASHING_MODE;
  if (mode === 'none' || mode === 'progressive' || mode === 'hard') return mode;
  return 'progressive';
}

function getPolicyProfile(): string {
  return process.env.POCH_THRESHOLD_PROFILE || 'v1';
}

function getCommitWindowSeconds(): number {
  const parsed = Number(process.env.POCH_ORACLE_COMMIT_WINDOW_SEC || '120');
  if (parsed === 0) return 0;
  return Number.isFinite(parsed) && parsed >= 10 ? parsed : 120;
}

function getRevealWindowSeconds(): number {
  const parsed = Number(process.env.POCH_ORACLE_REVEAL_WINDOW_SEC || '120');
  if (parsed === 0) return 0;
  return Number.isFinite(parsed) && parsed >= 10 ? parsed : 120;
}

function getOracleMinQuorum(): number {
  const parsed = Number(process.env.POCH_ORACLE_MIN_QUORUM || '3');
  return Number.isFinite(parsed) && parsed >= 1 ? parsed : 3;
}

function getOracleMinWeightQuorum(): number {
  const parsed = Number(process.env.POCH_ORACLE_MIN_WEIGHT_QUORUM || String(getOracleMinQuorum()));
  return Number.isFinite(parsed) && parsed >= 1 ? parsed : getOracleMinQuorum();
}

function normalizeConfidence(value: number | undefined): number {
  if (value === undefined || Number.isNaN(value)) return 0.5;
  if (value > 1 && value <= 100) return Math.max(0, Math.min(1, value / 100));
  return Math.max(0, Math.min(1, value));
}

function parseOracleRegistry(): Map<string, number> {
  const map = new Map<string, number>();

  const rawJson = process.env.POCH_ORACLE_REGISTRY_JSON?.trim();
  if (rawJson) {
    try {
      const parsed = JSON.parse(rawJson) as OracleRegistryEntry[];
      for (const entry of parsed) {
        if (!entry || typeof entry.id !== 'string' || !entry.id.trim()) continue;
        if (entry.active === false) continue;

        const explicitWeight = Number(entry.weight || 0);
        const stakeLamports = Number(entry.stakeLamports || 0);
        const stakeWeight = Number.isFinite(stakeLamports) && stakeLamports > 0
          ? Math.max(1, Math.floor(stakeLamports / 1_000_000_000))
          : 1;
        const weight = Number.isFinite(explicitWeight) && explicitWeight > 0
          ? Math.floor(explicitWeight)
          : stakeWeight;

        map.set(entry.id.trim(), Math.max(1, weight));
      }
      return map;
    } catch {
      logger.warn('Invalid POCH_ORACLE_REGISTRY_JSON, falling back to POCH_ORACLE_REGISTRY');
    }
  }

  const rawList = process.env.POCH_ORACLE_REGISTRY?.trim();
  if (!rawList) return map;

  for (const segment of rawList.split(',')) {
    const value = segment.trim();
    if (!value) continue;
    const [id, weightRaw] = value.split(':').map((p) => p.trim());
    if (!id) continue;
    const weight = Number(weightRaw || '1');
    map.set(id, Number.isFinite(weight) && weight > 0 ? Math.floor(weight) : 1);
  }

  return map;
}

function requiresRegisteredOracles(registry: Map<string, number>): boolean {
  const flag = process.env.POCH_REQUIRE_REGISTERED_ORACLES;
  if (flag === 'true') return true;
  if (flag === 'false') return false;
  return registry.size > 0;
}

function resolveOracleWeight(oracleId: string, registry: Map<string, number>): number {
  return registry.get(oracleId) || 1;
}

function hashHex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function createProofStatementId(challengeId: string, proofHash: string, identityNullifierHash: string): string {
  const digest = hashHex(`${challengeId}|${proofHash}|${identityNullifierHash}`);
  return `poch_stmt_${digest.slice(0, 24)}`;
}

function buildOracleCommitmentHash(params: {
  challengeId: string;
  oracleId: string;
  authenticityVerdict: boolean;
  uniquenessVerdict: boolean;
  confidence: number;
  salt: string;
}): string {
  return hashHex([
    params.challengeId,
    params.oracleId,
    params.authenticityVerdict ? '1' : '0',
    params.uniquenessVerdict ? '1' : '0',
    params.confidence.toFixed(6),
    params.salt,
  ].join('|'));
}

function parseScoreThresholds(profile: string): {
  minUniqueness: number;
  minDivergence: number;
  maxClusterRisk: number;
} {
  if (profile === 'v1_strict') {
    return { minUniqueness: 78, minDivergence: 65, maxClusterRisk: 35 };
  }
  if (profile === 'v1_relaxed') {
    return { minUniqueness: 60, minDivergence: 45, maxClusterRisk: 70 };
  }
  return { minUniqueness: 70, minDivergence: 55, maxClusterRisk: 50 };
}

function meetsPolicy(scoreBundle: PoCHScoreBundle, profile: string): boolean {
  const thresholds = parseScoreThresholds(profile);
  return (
    scoreBundle.uniquenessScore >= thresholds.minUniqueness &&
    scoreBundle.graphDivergence >= thresholds.minDivergence &&
    scoreBundle.clusterOverlapRisk <= thresholds.maxClusterRisk &&
    scoreBundle.nonMembershipSignal
  );
}

function evaluateOracleDecision(challengeId: string): OracleDecision {
  const votes = getPoCHRevealedVotes(challengeId);
  const minQuorum = getOracleMinQuorum();
  if (votes.length < minQuorum) {
    return {
      ready: false,
      accepted: false,
      voteCount: votes.length,
      totalWeight: 0,
      weightedConfidence: 0,
      authenticityYesWeight: 0,
      uniquenessYesWeight: 0,
    };
  }

  let totalWeight = 0;
  let confidenceWeight = 0;
  let authenticityYesWeight = 0;
  let authenticityNoWeight = 0;
  let uniquenessYesWeight = 0;
  let uniquenessNoWeight = 0;

  for (const vote of votes) {
    const weight = Math.max(1, vote.weight);
    totalWeight += weight;
    confidenceWeight += normalizeConfidence(vote.confidence) * weight;

    if (vote.authenticityVerdict) authenticityYesWeight += weight;
    else authenticityNoWeight += weight;

    if (vote.uniquenessVerdict) uniquenessYesWeight += weight;
    else uniquenessNoWeight += weight;
  }

  if (totalWeight < getOracleMinWeightQuorum()) {
    return {
      ready: false,
      accepted: false,
      voteCount: votes.length,
      totalWeight,
      weightedConfidence: totalWeight > 0 ? confidenceWeight / totalWeight : 0,
      authenticityYesWeight,
      uniquenessYesWeight,
    };
  }

  const authenticityPass = authenticityYesWeight > authenticityNoWeight;
  const uniquenessPass = uniquenessYesWeight > uniquenessNoWeight;

  return {
    ready: true,
    accepted: authenticityPass && uniquenessPass,
    voteCount: votes.length,
    totalWeight,
    weightedConfidence: totalWeight > 0 ? confidenceWeight / totalWeight : 0,
    authenticityYesWeight,
    uniquenessYesWeight,
  };
}

function emitPoCHEvent(topic: string, payload: Record<string, unknown>): void {
  logger.info('PoCH event', { topic, payload });
}

let clientPromise: Promise<AgentParanetClient> | null = null;

async function getClient(): Promise<AgentParanetClient> {
  if (clientPromise) return clientPromise;
  clientPromise = AgentParanetClient.create(getParanetConfig());
  return clientPromise;
}

function sendError(res: Response, status: number, code: string, message: string): void {
  res.status(status).json({ error: { code, message } });
}

function statusForChallenge(
  challenge: StoredChallenge,
  status: PoCHStatus['status'],
  statusReason?: PoCHStatusReason,
  proofStatementId?: string
): StoredPoCHStatus {
  return {
    identityDid: challenge.identityDid,
    chain: challenge.chain,
    status,
    statusReason,
    scoreBundleCommitment: challenge.scoreBundleCommitment,
    oracleRoundId: challenge.oracleRoundId,
    proofStatementId: proofStatementId || challenge.proofStatementId,
    updatedAt: new Date().toISOString(),
  };
}

function applyPenaltyIfNeeded(identityDid: string, chain: Chain): number {
  if (getSlashingMode() === 'none') return 0;
  return incrementPoCHPenalty(identityDid, chain);
}

function finalizedResultFromChallenge(challenge: StoredChallenge): FinalizeResult {
  const accepted = challenge.accepted === true;
  const statusReason = challenge.finalizationReason || (accepted ? 'verified' : 'oracle_rejected');
  return {
    finalized: true,
    accepted,
    reason: statusReason,
    statusReason,
    oracleRoundId: challenge.oracleRoundId,
    proofStatementId: challenge.proofStatementId,
  };
}

function maybeFinalizeChallenge(challengeId: string): FinalizeResult {
  const challenge = getPoCHChallenge(challengeId);
  if (!challenge) {
    return { finalized: false, reason: 'challenge_missing' };
  }
  if (challenge.phase === 'finalized') {
    return finalizedResultFromChallenge(challenge);
  }

  const now = Math.floor(Date.now() / 1000);
  const timeoutEnabled = getCommitWindowSeconds() > 0 && getRevealWindowSeconds() > 0;
  if (timeoutEnabled && now > challenge.revealDeadline) {
    const proof = getPoCHProofSubmission(challengeId);
    const oracleRoundId = challenge.oracleRoundId || `poch_oracle_${challengeId.slice(5, 13)}`;
    const proofStatementId = proof?.proofStatementId || challenge.proofStatementId || `poch_stmt_timeout_${challengeId.slice(-12)}`;
    const statusReason: PoCHStatusReason = 'oracle_timeout';
    const finalized = finalizePoCHChallenge(challengeId, {
      accepted: false,
      oracleRoundId,
      proofStatementId,
      statusReason,
      finalizedAt: now,
    });
    if (!finalized) {
      const finalizedChallenge = getPoCHChallenge(challengeId);
      if (finalizedChallenge) {
        return finalizedResultFromChallenge(finalizedChallenge);
      }
      return { finalized: false, reason: 'challenge_missing' };
    }

    setPoCHProofAccepted(challengeId, false);
    const finalizedChallenge = getPoCHChallenge(challengeId);
    if (finalizedChallenge) {
      upsertPoCHStatus(statusForChallenge(finalizedChallenge, 'rejected', statusReason, proof?.proofStatementId));
    }

    const strikes = applyPenaltyIfNeeded(challenge.identityDid, challenge.chain);
    if (strikes > 0) {
      emitPoCHEvent(POCH_TOPICS.disputes, {
        challengeId,
        identityDid: challenge.identityDid,
        chain: challenge.chain,
        strike: strikes,
        slashingMode: getSlashingMode(),
      });
    }

    emitPoCHEvent(POCH_TOPICS.status, {
      challengeId,
      identityDid: challenge.identityDid,
      chain: challenge.chain,
      status: 'rejected',
      statusReason,
      oracleRoundId,
      proofStatementId,
    });

    return {
      finalized: true,
      accepted: false,
      reason: statusReason,
      statusReason,
      oracleRoundId,
      proofStatementId,
    };
  }

  const proof = getPoCHProofSubmission(challengeId);
  if (!proof) {
    upsertPoCHStatus(statusForChallenge(challenge, 'pending', 'proof_missing'));
    return { finalized: false, reason: 'proof_missing', statusReason: 'proof_missing' };
  }
  if (hasBlockingPoCHDispute(challengeId)) {
    upsertPoCHStatus(statusForChallenge(challenge, 'disputed', 'blocking_dispute', proof.proofStatementId));
    return { finalized: false, reason: 'blocking_dispute', statusReason: 'blocking_dispute' };
  }

  const oracle = evaluateOracleDecision(challengeId);
  if (!oracle.ready) {
    upsertPoCHStatus(statusForChallenge(challenge, 'pending', 'oracle_quorum_pending', proof.proofStatementId));
    return { finalized: false, reason: 'oracle_quorum_pending', statusReason: 'oracle_quorum_pending' };
  }

  const policyPass = meetsPolicy(challenge.scoreBundle, challenge.policyId);
  const accepted = policyPass && oracle.accepted;
  const statusReason: PoCHStatusReason = accepted ? 'verified' : (!policyPass ? 'policy_failed' : 'oracle_rejected');
  const finalizedAt = Math.floor(Date.now() / 1000);
  const oracleRoundId = challenge.oracleRoundId || `poch_oracle_${challengeId.slice(5, 13)}`;
  const proofStatementId = proof.proofStatementId;

  const finalized = finalizePoCHChallenge(challengeId, {
    accepted,
    oracleRoundId,
    proofStatementId,
    statusReason,
    finalizedAt,
  });
  if (!finalized) {
    const finalizedChallenge = getPoCHChallenge(challengeId);
    if (finalizedChallenge) {
      return finalizedResultFromChallenge(finalizedChallenge);
    }
    return { finalized: false, reason: 'challenge_missing' };
  }
  setPoCHProofAccepted(challengeId, accepted);

  const finalizedChallenge = getPoCHChallenge(challengeId);
  if (finalizedChallenge) {
    upsertPoCHStatus(
      statusForChallenge(finalizedChallenge, accepted ? 'verified' : 'rejected', statusReason, proofStatementId)
    );
  }

  if (!accepted) {
    const strikes = applyPenaltyIfNeeded(challenge.identityDid, challenge.chain);
    if (strikes > 0) {
      emitPoCHEvent(POCH_TOPICS.disputes, {
        challengeId,
        identityDid: challenge.identityDid,
        chain: challenge.chain,
        strike: strikes,
        slashingMode: getSlashingMode(),
      });
    }
  }

  emitPoCHEvent(POCH_TOPICS.status, {
    challengeId,
    identityDid: challenge.identityDid,
    chain: challenge.chain,
    status: accepted ? 'verified' : 'rejected',
    statusReason,
    oracleRoundId,
    proofStatementId,
    oracleVoteCount: oracle.voteCount,
    oracleTotalWeight: oracle.totalWeight,
    oracleConfidence: oracle.weightedConfidence,
  });

  return {
    finalized: true,
    accepted,
    reason: statusReason,
    statusReason,
    oracleRoundId,
    proofStatementId,
  };
}

interface RolloutEvaluationResult {
  snapshot: PoCHRolloutSnapshot;
  rollbackTrigger?: PoCHRollbackTrigger;
  rollbackReason?: string;
}

let rolloutEvaluatorRunning = false;
let rolloutLastRunSec = 0;
let rolloutEvaluatorTimer: NodeJS.Timeout | null = null;

function normalizeStatusReasonLabel(statusReason?: string): string {
  if (!statusReason || !statusReason.trim()) return 'none';
  return statusReason;
}

function applyPoCHRollback(
  stage: PoCHRolloutStage,
  trigger: PoCHRollbackTrigger,
  reason: string,
  updatedBy: string,
  nowUnixSec: number
): PoCHRolloutStage {
  const nextStage = stage === 'gate_high_impact' ? 'soft' : 'observe';
  const cooldownUntil = new Date((nowUnixSec + (24 * 60 * 60)) * 1000).toISOString();
  upsertPoCHRolloutState({
    stage: nextStage,
    modeOverride: nextStage,
    rollbackCooldownUntil: cooldownUntil,
    updatedBy,
  });
  pochRollbackTotal.labels(trigger).inc();
  logger.error('PoCH rollback activated', {
    trigger,
    reason,
    fromStage: stage,
    toStage: nextStage,
    cooldownUntil,
  });
  return nextStage;
}

function applyPoCHPromotion(
  stage: PoCHRolloutStage,
  nowUnixSec: number,
  updatedBy: string
): PoCHRolloutStage {
  if (stage === 'gate_high_impact') return stage;
  if (stage === 'observe' && nowUnixSec >= getRolloutBoundary('soft')) {
    upsertPoCHRolloutState({
      stage: 'soft',
      modeOverride: 'soft',
      updatedBy,
      rollbackCooldownUntil: null,
    });
    return 'soft';
  }
  if (stage === 'soft' && nowUnixSec >= getRolloutBoundary('gate_high_impact')) {
    upsertPoCHRolloutState({
      stage: 'gate_high_impact',
      modeOverride: 'gate_high_impact',
      updatedBy,
      rollbackCooldownUntil: null,
    });
    return 'gate_high_impact';
  }
  return stage;
}

function evaluatePoCHRollout(force = false): RolloutEvaluationResult {
  const nowUnixSec = nowSec();
  const intervalSec = Math.floor(POCH_ROLLOUT_EVALUATOR_INTERVAL_MS / 1000);
  if (!force && nowUnixSec - rolloutLastRunSec < intervalSec) {
    const latest = getLatestPoCHRolloutSnapshot();
    if (latest) {
      return { snapshot: latest };
    }
  }

  const fallbackMode = getEnvEnforcementMode();
  const state = getPoCHRolloutState(fallbackMode);
  const metrics = computePoCHRolloutMetrics(nowUnixSec);
  const thresholds = getRolloutThresholds();
  const baselineProofFailRate = state.baselineProofFailRate ?? POCH_DEFAULT_BASELINE_PROOF_FAIL_RATE;
  const cooldownUntilMs = parseIsoOrNull(state.rollbackCooldownUntil);
  const inCooldown = cooldownUntilMs !== null && Date.now() < cooldownUntilMs;

  let nextStage = state.stage;
  let rollbackTrigger: PoCHRollbackTrigger | undefined;
  let rollbackReason: string | undefined;

  if (metrics.commits2h > 0 && metrics.oracleRevealCompletion2h < thresholds.rollbackOracleRevealMin) {
    rollbackTrigger = 'oracle_reveal_drop';
    rollbackReason = `Oracle reveal completion dropped to ${metrics.oracleRevealCompletion2h.toFixed(4)} over 2h`;
  } else if (
    metrics.totalProofs1h > 0
    && baselineProofFailRate > 0
    && metrics.proofFailureRate1h > (baselineProofFailRate * thresholds.rollbackProofFailureMultiplier)
  ) {
    rollbackTrigger = 'proof_failure_anomaly';
    rollbackReason = `Proof failure rate ${metrics.proofFailureRate1h.toFixed(4)} exceeded baseline multiplier`;
  } else if (metrics.openBlockingDisputes > thresholds.rollbackBlockingDisputesThreshold) {
    rollbackTrigger = 'dispute_backlog';
    rollbackReason = `Open blocking disputes ${metrics.openBlockingDisputes} exceeded threshold`;
  }

  if (rollbackTrigger && rollbackReason) {
    nextStage = applyPoCHRollback(state.stage, rollbackTrigger, rollbackReason, 'poch-evaluator', nowUnixSec);
  } else {
    const gates = getPromotionGates({
      bucketStart: 0,
      capturedAt: new Date(nowUnixSec * 1000).toISOString(),
      stage: state.stage,
      effectiveMode: state.modeOverride || state.stage,
      oracleRevealCompletion24h: metrics.oracleRevealCompletion24h,
      proofPassRate24h: metrics.proofPassRate24h,
      unresolvedBlockingDisputesOver24h: metrics.unresolvedBlockingDisputesOver24h,
      falsePositiveDenyRate24h: metrics.falsePositiveDenyRate24h,
      oracleRevealCompletion2h: metrics.oracleRevealCompletion2h,
      proofFailureRate1h: metrics.proofFailureRate1h,
      openBlockingDisputes: metrics.openBlockingDisputes,
      promotionEligible: false,
    });
    if (!inCooldown && allPromotionGatesPass(gates)) {
      nextStage = applyPoCHPromotion(state.stage, nowUnixSec, 'poch-evaluator');
    }
  }

  const latestState = getPoCHRolloutState(fallbackMode);
  const effectiveMode = latestState.modeOverride || latestState.stage;
  pochRolloutStage.set(stageToGauge(effectiveMode));
  pochRolloutOracleRevealCompletion24h.set(metrics.oracleRevealCompletion24h);
  pochRolloutOracleRevealCompletion2h.set(metrics.oracleRevealCompletion2h);
  pochRolloutProofPassRate24h.set(metrics.proofPassRate24h);
  pochRolloutProofFailureRate1h.set(metrics.proofFailureRate1h);
  pochRolloutOpenBlockingDisputes.set(metrics.openBlockingDisputes);
  pochRolloutUnresolvedBlockingDisputesOver24h.set(metrics.unresolvedBlockingDisputesOver24h);
  pochRolloutFalsePositiveDenyRate24h.set(metrics.falsePositiveDenyRate24h);

  if (latestState.baselineProofFailRate === undefined && metrics.totalProofs24h > 0) {
    upsertPoCHRolloutState({
      baselineProofFailRate: 1 - metrics.proofPassRate24h,
      updatedBy: 'poch-evaluator',
    });
  }

  const bucketSpanSec = 5 * 60;
  const bucketStart = Math.floor(nowUnixSec / bucketSpanSec) * bucketSpanSec;
  const snapshot: PoCHRolloutSnapshot = {
    bucketStart,
    capturedAt: new Date(nowUnixSec * 1000).toISOString(),
    stage: nextStage,
    effectiveMode,
    oracleRevealCompletion24h: metrics.oracleRevealCompletion24h,
    proofPassRate24h: metrics.proofPassRate24h,
    unresolvedBlockingDisputesOver24h: metrics.unresolvedBlockingDisputesOver24h,
    falsePositiveDenyRate24h: metrics.falsePositiveDenyRate24h,
    oracleRevealCompletion2h: metrics.oracleRevealCompletion2h,
    proofFailureRate1h: metrics.proofFailureRate1h,
    openBlockingDisputes: metrics.openBlockingDisputes,
    promotionEligible: !inCooldown && allPromotionGatesPass(getPromotionGates({
      bucketStart,
      capturedAt: '',
      stage: nextStage,
      effectiveMode,
      oracleRevealCompletion24h: metrics.oracleRevealCompletion24h,
      proofPassRate24h: metrics.proofPassRate24h,
      unresolvedBlockingDisputesOver24h: metrics.unresolvedBlockingDisputesOver24h,
      falsePositiveDenyRate24h: metrics.falsePositiveDenyRate24h,
      oracleRevealCompletion2h: metrics.oracleRevealCompletion2h,
      proofFailureRate1h: metrics.proofFailureRate1h,
      openBlockingDisputes: metrics.openBlockingDisputes,
      promotionEligible: false,
    })),
    rollbackTrigger,
    rollbackReason,
  };
  upsertPoCHRolloutSnapshot(snapshot);
  pochRolloutEvaluatorLastRunTimestamp.set(nowUnixSec);
  rolloutLastRunSec = nowUnixSec;

  return { snapshot, rollbackTrigger, rollbackReason };
}

function evaluatePoCHRolloutSafe(force = false): RolloutEvaluationResult | null {
  if (rolloutEvaluatorRunning) return null;
  rolloutEvaluatorRunning = true;
  try {
    return evaluatePoCHRollout(force);
  } catch (error) {
    logger.error('PoCH rollout evaluator failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  } finally {
    rolloutEvaluatorRunning = false;
  }
}

export function startPoCHRolloutEvaluator(): void {
  if (process.env.NODE_ENV === 'test') return;
  if (rolloutEvaluatorTimer) return;
  evaluatePoCHRolloutSafe(true);
  rolloutEvaluatorTimer = setInterval(() => {
    evaluatePoCHRolloutSafe(true);
  }, POCH_ROLLOUT_EVALUATOR_INTERVAL_MS);
  rolloutEvaluatorTimer.unref?.();
}

export function stopPoCHRolloutEvaluator(): void {
  if (!rolloutEvaluatorTimer) return;
  clearInterval(rolloutEvaluatorTimer);
  rolloutEvaluatorTimer = null;
}

router.post('/contributions', writeLimiter, async (req: Request, res: Response) => {
  if (!isPoCHEnabled()) {
    return sendError(res, 503, 'POCH_DISABLED', 'PoCH is disabled');
  }

  const body = req.body as Partial<PoCHContribution> & Record<string, unknown>;
  if (!body || typeof body !== 'object') {
    return sendError(res, 400, 'INVALID_INPUT', 'Request body is required');
  }
  if (!body.identityDid || typeof body.identityDid !== 'string') {
    return sendError(res, 400, 'INVALID_INPUT', 'identityDid is required');
  }
  if (!body.contentHash || typeof body.contentHash !== 'string') {
    return sendError(res, 400, 'INVALID_INPUT', 'contentHash is required');
  }
  if (!body.contributionType || typeof body.contributionType !== 'string') {
    return sendError(res, 400, 'INVALID_INPUT', 'contributionType is required');
  }

  try {
    const createdAt = body.createdAt || new Date().toISOString();
    const assetDid = body.assetDid || buildPoCHURN(body.identityDid, body.contentHash, createdAt);
    const contribution: PoCHContribution = {
      assetDid,
      identityDid: body.identityDid,
      contentHash: body.contentHash,
      createdAt,
      contributionType: body.contributionType,
      provenanceRefs: body.provenanceRefs || [],
      contextMetadata: body.contextMetadata || {},
    };

    const client = await getClient();
    const published = await client.publishPoCHContribution(contribution);
    if (!published.success || !published.ual) {
      pochSubmissionTotal.labels('rejected').inc();
      return sendError(res, 400, 'PUBLISH_FAILED', published.error || 'Failed to publish contribution');
    }

    upsertPoCHContribution(contribution, published.ual, {
      scoreBundleCommitment: typeof body.scoreBundleCommitment === 'string' ? body.scoreBundleCommitment : undefined,
      oracleRoundId: typeof body.oracleRoundId === 'string' ? body.oracleRoundId : undefined,
      proofStatementId: typeof body.proofStatementId === 'string' ? body.proofStatementId : undefined,
      chainAnchors:
        body.chainAnchors && typeof body.chainAnchors === 'object'
          ? (body.chainAnchors as { solanaTxId?: string; baseTxHash?: string })
          : undefined,
    });

    emitPoCHEvent(POCH_TOPICS.submissions, {
      identityDid: contribution.identityDid,
      assetDid,
      ual: published.ual,
      createdAt: contribution.createdAt,
    });
    pochSubmissionTotal.labels('accepted').inc();

    res.status(201).json({ success: true, assetDid, ual: published.ual });
  } catch (error) {
    logger.error('Failed to publish PoCH contribution', {
      error: error instanceof Error ? error.message : String(error),
    });
    pochSubmissionTotal.labels('invalid').inc();
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to publish PoCH contribution');
  }
});

router.post('/challenges', writeLimiter, async (req: Request, res: Response) => {
  if (!isPoCHEnabled()) {
    return sendError(res, 503, 'POCH_DISABLED', 'PoCH is disabled');
  }

  const body = req.body as {
    assetDid?: string;
    identityDid?: string;
    chain?: Chain;
    policyId?: string;
    contentHash?: string;
    daysBack?: number;
  };

  if (!body.assetDid || !body.identityDid || !body.chain || !body.policyId || !body.contentHash) {
    return sendError(
      res,
      400,
      'INVALID_INPUT',
      'assetDid, identityDid, chain, policyId, and contentHash are required'
    );
  }
  if (body.chain !== 'solana' && body.chain !== 'base') {
    return sendError(res, 400, 'INVALID_INPUT', 'chain must be solana or base');
  }

  try {
    const client = await getClient();
    const score = await loadPoCHObservations(client.rawDKG, {
      identityDid: body.identityDid,
      contentHash: body.contentHash,
      policyId: body.policyId,
      daysBack: body.daysBack,
    });

    const scoreBundleCommitment = hashPoCHScoreBundle(score.scoreBundle);
    const challengeId = buildPoCHChallengeId(body.assetDid, scoreBundleCommitment, body.chain);

    const now = Math.floor(Date.now() / 1000);
    const commitDeadline = now + getCommitWindowSeconds();
    const revealDeadline = commitDeadline + getRevealWindowSeconds();

    const challenge: StoredChallenge = {
      challengeId,
      assetDid: body.assetDid,
      identityDid: body.identityDid,
      chain: body.chain,
      policyId: body.policyId,
      scoreBundle: score.scoreBundle,
      scoreBundleCommitment,
      contentHash: body.contentHash,
      createdAt: new Date().toISOString(),
      phase: 'commit',
      commitDeadline,
      revealDeadline,
    };

    upsertPoCHChallenge(challenge);

    const status: StoredPoCHStatus = {
      identityDid: body.identityDid,
      chain: body.chain,
      status: 'pending',
      statusReason: 'proof_missing',
      scoreBundleCommitment,
      updatedAt: new Date().toISOString(),
    };
    upsertPoCHStatus(status);

    emitPoCHEvent(POCH_TOPICS.scoring, {
      challengeId,
      identityDid: body.identityDid,
      chain: body.chain,
      policyId: body.policyId,
      scoreBundleCommitment,
      scoreBundle: score.scoreBundle,
      commitDeadline,
      revealDeadline,
    });

    res.status(201).json(challenge);
  } catch (error) {
    logger.error('Failed to create PoCH challenge', {
      error: error instanceof Error ? error.message : String(error),
    });
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to create PoCH challenge');
  }
});

router.post('/proofs', writeLimiter, async (req: Request, res: Response) => {
  if (!isPoCHEnabled()) {
    return sendError(res, 503, 'POCH_DISABLED', 'PoCH is disabled');
  }

  const body = req.body as ProofRequestBody;
  if (!body.challengeId || !body.assetDid || !body.identityDid || !body.chain || !body.zkProof || !body.identityNullifier) {
    return sendError(
      res,
      400,
      'INVALID_INPUT',
      'challengeId, assetDid, identityDid, chain, zkProof, and identityNullifier are required'
    );
  }
  if (body.chain !== 'solana' && body.chain !== 'base') {
    return sendError(res, 400, 'INVALID_INPUT', 'chain must be solana or base');
  }

  const challenge = getPoCHChallenge(body.challengeId);
  if (!challenge) {
    return sendError(res, 404, 'NOT_FOUND', 'PoCH challenge not found');
  }
  if (
    challenge.assetDid !== body.assetDid ||
    challenge.identityDid !== body.identityDid ||
    challenge.chain !== body.chain
  ) {
    return sendError(res, 400, 'INVALID_INPUT', 'Challenge payload mismatch');
  }

  if (challenge.phase === 'finalized') {
    const accepted = challenge.accepted === true;
    const statusReason = challenge.finalizationReason || (accepted ? 'verified' : 'oracle_rejected');
    pochProofTotal.labels(accepted ? 'accepted' : 'rejected').inc();
    return res.status(200).json({
      accepted,
      pending: false,
      statusReason,
      challengeId: body.challengeId,
      assetDid: body.assetDid,
      identityDid: body.identityDid,
      chain: body.chain,
      verifiedAt: new Date().toISOString(),
      proofStatementId: challenge.proofStatementId,
      oracleRoundId: challenge.oracleRoundId,
    });
  }

  const validProofShape = body.zkProof.length >= 32 && body.identityNullifier.length >= 16;
  if (!validProofShape) {
    applyPenaltyIfNeeded(body.identityDid, body.chain);
    pochProofTotal.labels('invalid').inc();
    upsertPoCHStatus({
      identityDid: body.identityDid,
      chain: body.chain,
      status: 'rejected',
      statusReason: 'policy_failed',
      scoreBundleCommitment: challenge.scoreBundleCommitment,
      updatedAt: new Date().toISOString(),
    });
    return sendError(res, 400, 'INVALID_PROOF', 'Invalid proof payload shape');
  }

  const proofHash = hashHex(body.zkProof);
  const identityNullifierHash = hashHex(`${body.chain}|${body.identityNullifier}`);
  const proofStatementId = createProofStatementId(
    body.challengeId,
    proofHash,
    identityNullifierHash
  );

  const existingProof = getPoCHProofSubmission(body.challengeId);
  if (existingProof) {
    const sameProof = (
      existingProof.assetDid === body.assetDid &&
      existingProof.identityDid === body.identityDid &&
      existingProof.chain === body.chain &&
      existingProof.proofStatementId === proofStatementId &&
      existingProof.zkProofHash === proofHash &&
      existingProof.identityNullifierHash === identityNullifierHash
    );
    if (!sameProof) {
      pochProofTotal.labels('replayed').inc();
      return sendError(res, 409, 'PROOF_ALREADY_SUBMITTED', 'Proof already submitted for this challenge');
    }

    const finalizeResult = maybeFinalizeChallenge(body.challengeId);
    if (!finalizeResult.finalized) pochProofTotal.labels('pending').inc();
    else pochProofTotal.labels(finalizeResult.accepted ? 'accepted' : 'rejected').inc();
    return res.status(200).json({
      accepted: finalizeResult.accepted === true,
      pending: !finalizeResult.finalized,
      finalizeReason: finalizeResult.reason,
      statusReason: finalizeResult.statusReason,
      challengeId: body.challengeId,
      assetDid: body.assetDid,
      identityDid: body.identityDid,
      chain: body.chain,
      verifiedAt: new Date().toISOString(),
      proofStatementId: existingProof.proofStatementId,
      oracleRoundId: finalizeResult.oracleRoundId,
    });
  }

  const uniqueNullifier = registerPoCHNullifier(body.chain, identityNullifierHash, body.challengeId);
  if (!uniqueNullifier) {
    const racedProof = getPoCHProofSubmission(body.challengeId);
    const sameRacedProof = racedProof
      && racedProof.assetDid === body.assetDid
      && racedProof.identityDid === body.identityDid
      && racedProof.chain === body.chain
      && racedProof.proofStatementId === proofStatementId
      && racedProof.zkProofHash === proofHash
      && racedProof.identityNullifierHash === identityNullifierHash;
    if (!sameRacedProof) {
      pochProofTotal.labels('replayed').inc();
      return sendError(res, 409, 'REPLAYED_NULLIFIER', 'Identity nullifier already used on this chain');
    }
  }

  const proofWrite = upsertPoCHProofSubmission({
    challengeId: body.challengeId,
    assetDid: body.assetDid,
    identityDid: body.identityDid,
    chain: body.chain,
    proofStatementId,
    zkProofHash: proofHash,
    identityNullifierHash,
    submittedAt: new Date().toISOString(),
  });
  if (proofWrite === 'conflict') {
    pochProofTotal.labels('replayed').inc();
    return sendError(res, 409, 'PROOF_ALREADY_SUBMITTED', 'Proof already submitted for this challenge');
  }
  if (proofWrite === 'duplicate') {
    const finalizeResult = maybeFinalizeChallenge(body.challengeId);
    if (!finalizeResult.finalized) pochProofTotal.labels('pending').inc();
    else pochProofTotal.labels(finalizeResult.accepted ? 'accepted' : 'rejected').inc();
    return res.status(200).json({
      accepted: finalizeResult.accepted === true,
      pending: !finalizeResult.finalized,
      finalizeReason: finalizeResult.reason,
      statusReason: finalizeResult.statusReason,
      challengeId: body.challengeId,
      assetDid: body.assetDid,
      identityDid: body.identityDid,
      chain: body.chain,
      verifiedAt: new Date().toISOString(),
      proofStatementId,
      oracleRoundId: finalizeResult.oracleRoundId,
    });
  }

  const hasBlockingDispute = hasBlockingPoCHDispute(body.challengeId);
  upsertPoCHStatus({
    identityDid: body.identityDid,
    chain: body.chain,
    status: hasBlockingDispute ? 'disputed' : 'pending',
    statusReason: hasBlockingDispute ? 'blocking_dispute' : 'oracle_quorum_pending',
    scoreBundleCommitment: challenge.scoreBundleCommitment,
    proofStatementId,
    updatedAt: new Date().toISOString(),
  });

  const finalizeResult = maybeFinalizeChallenge(body.challengeId);
  if (!finalizeResult.finalized) pochProofTotal.labels('pending').inc();
  else pochProofTotal.labels(finalizeResult.accepted ? 'accepted' : 'rejected').inc();

  emitPoCHEvent(POCH_TOPICS.votes, {
    challengeId: body.challengeId,
    identityDid: body.identityDid,
    chain: body.chain,
    proofStatementId,
    finalized: finalizeResult.finalized,
    accepted: finalizeResult.accepted,
    reason: finalizeResult.reason,
  });

  res.status(202).json({
    accepted: finalizeResult.accepted === true,
    pending: !finalizeResult.finalized,
    finalizeReason: finalizeResult.reason,
    statusReason: finalizeResult.statusReason,
    challengeId: body.challengeId,
    assetDid: body.assetDid,
    identityDid: body.identityDid,
    chain: body.chain,
    verifiedAt: new Date().toISOString(),
    proofStatementId,
    oracleRoundId: finalizeResult.oracleRoundId,
  });
});

router.post('/oracle/commit', writeLimiter, (req: Request, res: Response) => {
  if (!isPoCHEnabled()) {
    return sendError(res, 503, 'POCH_DISABLED', 'PoCH is disabled');
  }

  const body = req.body as {
    challengeId?: string;
    oracleId?: string;
    commitmentHash?: string;
  };
  if (!body.challengeId || !body.oracleId || !body.commitmentHash) {
    return sendError(res, 400, 'INVALID_INPUT', 'challengeId, oracleId, and commitmentHash are required');
  }

  const challenge = getPoCHChallenge(body.challengeId);
  if (!challenge) {
    return sendError(res, 404, 'NOT_FOUND', 'PoCH challenge not found');
  }
  if (challenge.phase === 'finalized') {
    return sendError(res, 400, 'INVALID_STATE', 'Challenge already finalized');
  }
  if (challenge.phase === 'reveal') {
    return sendError(res, 400, 'INVALID_STATE', 'Commit phase has ended');
  }

  const existingVote = getPoCHOracleVote(body.challengeId, body.oracleId);
  if (existingVote?.revealedAt) {
    return sendError(res, 409, 'ALREADY_REVEALED', 'Oracle reveal already submitted for this challenge');
  }

  const now = Math.floor(Date.now() / 1000);
  const instantOracleMode = getCommitWindowSeconds() === 0;
  if (!instantOracleMode && now > challenge.commitDeadline) {
    const nextPhase = challenge.phase === 'commit' ? { ...challenge, phase: 'reveal' as const } : challenge;
    if (nextPhase.phase !== challenge.phase) upsertPoCHChallenge(nextPhase);
    if (now > challenge.revealDeadline) {
      maybeFinalizeChallenge(body.challengeId);
    }
    return sendError(res, 400, 'COMMIT_PHASE_ENDED', 'Commit phase has ended');
  }

  const registry = parseOracleRegistry();
  const strict = requiresRegisteredOracles(registry);
  if (strict && !registry.has(body.oracleId)) {
    return sendError(res, 403, 'UNREGISTERED_ORACLE', 'Oracle is not in active registry');
  }

  const weight = resolveOracleWeight(body.oracleId, registry);
  upsertPoCHOracleCommit(body.challengeId, body.oracleId, body.commitmentHash, weight);
  pochOracleCommitTotal.inc();

  emitPoCHEvent(POCH_TOPICS.votes, {
    challengeId: body.challengeId,
    oracleId: body.oracleId,
    phase: 'commit',
    weight,
  });

  res.status(202).json({ accepted: true, challengeId: body.challengeId, oracleId: body.oracleId, weight });
});

router.post('/oracle/reveal', writeLimiter, (req: Request, res: Response) => {
  if (!isPoCHEnabled()) {
    return sendError(res, 503, 'POCH_DISABLED', 'PoCH is disabled');
  }

  const body = req.body as {
    challengeId?: string;
    oracleId?: string;
    authenticityVerdict?: boolean;
    uniquenessVerdict?: boolean;
    confidence?: number;
    salt?: string;
  };

  if (!body.challengeId || !body.oracleId || body.authenticityVerdict === undefined || body.uniquenessVerdict === undefined || !body.salt) {
    return sendError(
      res,
      400,
      'INVALID_INPUT',
      'challengeId, oracleId, authenticityVerdict, uniquenessVerdict, and salt are required'
    );
  }

  const challenge = getPoCHChallenge(body.challengeId);
  if (!challenge) {
    return sendError(res, 404, 'NOT_FOUND', 'PoCH challenge not found');
  }
  if (challenge.phase === 'finalized') {
    return sendError(res, 400, 'INVALID_STATE', 'Challenge already finalized');
  }

  const now = Math.floor(Date.now() / 1000);
  const instantOracleMode = getCommitWindowSeconds() === 0;
  if (!instantOracleMode && now < challenge.commitDeadline) {
    return sendError(res, 400, 'NOT_REVEAL_PHASE', 'Reveal phase has not started');
  }
  if (!instantOracleMode && now > challenge.revealDeadline) {
    maybeFinalizeChallenge(body.challengeId);
    return sendError(res, 400, 'REVEAL_PHASE_ENDED', 'Reveal phase has ended');
  }

  const storedCommitment = getPoCHOracleCommitment(body.challengeId, body.oracleId);
  if (!storedCommitment) {
    return sendError(res, 404, 'NO_COMMITMENT', 'Oracle commitment not found');
  }

  const existingVote = getPoCHOracleVote(body.challengeId, body.oracleId);
  if (existingVote?.revealedAt) {
    return sendError(res, 409, 'ALREADY_REVEALED', 'Oracle reveal already submitted for this challenge');
  }

  const confidence = normalizeConfidence(body.confidence);
  const expectedCommitment = buildOracleCommitmentHash({
    challengeId: body.challengeId,
    oracleId: body.oracleId,
    authenticityVerdict: body.authenticityVerdict,
    uniquenessVerdict: body.uniquenessVerdict,
    confidence,
    salt: body.salt,
  });

  if (expectedCommitment !== storedCommitment) {
    return sendError(res, 400, 'INVALID_COMMITMENT', 'Reveal payload does not match committed hash');
  }

  const revealSaltHash = hashHex(body.salt);
  const revealed = revealPoCHOracleVote({
    challengeId: body.challengeId,
    oracleId: body.oracleId,
    revealSaltHash,
    authenticityVerdict: body.authenticityVerdict,
    uniquenessVerdict: body.uniquenessVerdict,
    confidence,
  });

  if (!revealed) {
    return sendError(res, 400, 'REVEAL_FAILED', 'Failed to persist oracle reveal');
  }
  pochOracleRevealTotal.inc();

  if (challenge.phase === 'commit') {
    upsertPoCHChallenge({ ...challenge, phase: 'reveal' });
  }

  emitPoCHEvent(POCH_TOPICS.votes, {
    challengeId: body.challengeId,
    oracleId: body.oracleId,
    phase: 'reveal',
    authenticityVerdict: body.authenticityVerdict,
    uniquenessVerdict: body.uniquenessVerdict,
    confidence,
  });

  const finalizeResult = maybeFinalizeChallenge(body.challengeId);
  res.status(200).json({
    accepted: true,
    finalized: finalizeResult.finalized,
    acceptedDecision: finalizeResult.accepted,
    finalizeReason: finalizeResult.reason,
    statusReason: finalizeResult.statusReason,
    oracleRoundId: finalizeResult.oracleRoundId,
  });
});

router.get('/oracle/round/:challengeId', readLimiter, (req: Request, res: Response) => {
  const challengeId = decodeURIComponent(req.params.challengeId);
  const finalizeResult = maybeFinalizeChallenge(challengeId);
  const challenge = getPoCHChallenge(challengeId);
  if (!challenge) {
    return sendError(res, 404, 'NOT_FOUND', 'PoCH challenge not found');
  }

  const oracle = evaluateOracleDecision(challengeId);
  const disputes = listPoCHDisputes(challengeId);
  const proof = getPoCHProofSubmission(challengeId);

  res.json({
    challengeId,
    phase: challenge.phase,
    commitDeadline: challenge.commitDeadline,
    revealDeadline: challenge.revealDeadline,
    oracle,
    proofSubmitted: !!proof,
    disputes,
    finalized: finalizeResult.finalized,
    finalizeReason: finalizeResult.reason,
    statusReason: finalizeResult.statusReason,
  });
});

router.post('/disputes', writeLimiter, (req: Request, res: Response) => {
  const body = req.body as {
    challengeId?: string;
    reason?: string;
    blocking?: boolean;
  };

  if (!body.challengeId) {
    return sendError(res, 400, 'INVALID_INPUT', 'challengeId is required');
  }

  const challenge = getPoCHChallenge(body.challengeId);
  if (!challenge) {
    return sendError(res, 404, 'NOT_FOUND', 'PoCH challenge not found');
  }

  const disputeId = openPoCHDispute({
    challengeId: body.challengeId,
    identityDid: challenge.identityDid,
    chain: challenge.chain,
    reason: body.reason || 'manual dispute',
    blocking: body.blocking !== false,
  });

  upsertPoCHStatus(statusForChallenge(challenge, 'disputed', 'blocking_dispute'));
  pochDisputeTotal.labels('open', body.blocking === false ? 'false' : 'true').inc();

  emitPoCHEvent(POCH_TOPICS.disputes, {
    disputeId,
    challengeId: body.challengeId,
    identityDid: challenge.identityDid,
    chain: challenge.chain,
    reason: body.reason || 'manual dispute',
    blocking: body.blocking !== false,
  });

  res.status(201).json({ disputeId, challengeId: body.challengeId, status: 'open' });
});

router.post('/disputes/:id/resolve', writeLimiter, (req: Request, res: Response) => {
  const disputeId = Number(req.params.id);
  const body = req.body as { challengeId?: string };

  if (!Number.isFinite(disputeId) || disputeId <= 0) {
    return sendError(res, 400, 'INVALID_INPUT', 'Invalid dispute id');
  }
  if (!body.challengeId) {
    return sendError(res, 400, 'INVALID_INPUT', 'challengeId is required');
  }

  const priorDisputes = listPoCHDisputes(body.challengeId);
  const priorDispute = priorDisputes.find((entry) => entry.id === disputeId);
  const resolved = resolvePoCHDispute(disputeId);
  if (!resolved) {
    return sendError(res, 404, 'NOT_FOUND', 'Open dispute not found');
  }
  pochDisputeTotal.labels('resolved', priorDispute?.blocking ? 'true' : 'false').inc();

  const challenge = getPoCHChallenge(body.challengeId);
  if (challenge && !hasBlockingPoCHDispute(body.challengeId)) {
    const statusReason: PoCHStatusReason = getPoCHProofSubmission(body.challengeId)
      ? 'oracle_quorum_pending'
      : 'proof_missing';
    upsertPoCHStatus(statusForChallenge(challenge, 'pending', statusReason));
  }

  const finalizeResult = maybeFinalizeChallenge(body.challengeId);
  res.status(200).json({
    disputeId,
    resolved: true,
    finalized: finalizeResult.finalized,
    accepted: finalizeResult.accepted,
    finalizeReason: finalizeResult.reason,
    statusReason: finalizeResult.statusReason,
  });
});

router.get('/rollout/status', readLimiter, (_req: Request, res: Response) => {
  const evaluation = evaluatePoCHRolloutSafe(true);
  const snapshot = evaluation?.snapshot || getLatestPoCHRolloutSnapshot();
  if (!snapshot) {
    return sendError(res, 503, 'ROLL_OUT_UNAVAILABLE', 'PoCH rollout status is unavailable');
  }

  res.json(buildRolloutStatusResponse(snapshot, evaluation?.rollbackTrigger, evaluation?.rollbackReason));
});

router.post('/rollout/stage', writeLimiter, (req: Request, res: Response) => {
  if (!requireRolloutAdmin(req, res)) return;

  const body = req.body as { stage?: PoCHRolloutStage; reason?: string };
  if (!body.stage || !parseRolloutStage(body.stage)) {
    return sendError(res, 400, 'INVALID_INPUT', 'stage must be observe, soft, or gate_high_impact');
  }
  if (!body.reason || typeof body.reason !== 'string' || !body.reason.trim()) {
    return sendError(res, 400, 'INVALID_INPUT', 'reason is required');
  }

  const updatedBy = req.headers['x-admin-user'];
  const state = upsertPoCHRolloutState({
    stage: body.stage,
    modeOverride: body.stage,
    rollbackCooldownUntil: null,
    updatedBy: typeof updatedBy === 'string' && updatedBy.trim() ? updatedBy.trim() : 'admin',
  });
  pochRolloutStage.set(stageToGauge(state.modeOverride || state.stage));
  const evaluation = evaluatePoCHRolloutSafe(true);
  const snapshot = evaluation?.snapshot || getLatestPoCHRolloutSnapshot();
  if (!snapshot) {
    return sendError(res, 503, 'ROLL_OUT_UNAVAILABLE', 'PoCH rollout status is unavailable');
  }
  res.status(200).json(buildRolloutStatusResponse(snapshot, evaluation?.rollbackTrigger, evaluation?.rollbackReason));
});

router.post('/rollout/rollback', writeLimiter, (req: Request, res: Response) => {
  if (!requireRolloutAdmin(req, res)) return;

  const body = req.body as { reason?: string; trigger?: PoCHRollbackTrigger };
  if (!body.reason || typeof body.reason !== 'string' || !body.reason.trim()) {
    return sendError(res, 400, 'INVALID_INPUT', 'reason is required');
  }
  const trigger: PoCHRollbackTrigger = body.trigger || 'manual';
  if (
    trigger !== 'manual'
    && trigger !== 'oracle_reveal_drop'
    && trigger !== 'proof_failure_anomaly'
    && trigger !== 'dispute_backlog'
  ) {
    return sendError(
      res,
      400,
      'INVALID_INPUT',
      'trigger must be manual, oracle_reveal_drop, proof_failure_anomaly, or dispute_backlog'
    );
  }

  const fallbackMode = getEnvEnforcementMode();
  const state = getPoCHRolloutState(fallbackMode);
  const updatedBy = req.headers['x-admin-user'];
  const updater = typeof updatedBy === 'string' && updatedBy.trim() ? updatedBy.trim() : 'admin';
  const nowUnixSec = nowSec();
  let targetStage = state.stage;

  if (state.stage === 'observe') {
    const cooldownUntil = new Date((nowUnixSec + (24 * 60 * 60)) * 1000).toISOString();
    upsertPoCHRolloutState({
      stage: 'observe',
      modeOverride: 'observe',
      rollbackCooldownUntil: cooldownUntil,
      updatedBy: updater,
    });
    pochRollbackTotal.labels(trigger).inc();
    logger.error('PoCH rollback trigger while already in observe stage', {
      trigger,
      reason: body.reason,
    });
  } else {
    targetStage = applyPoCHRollback(state.stage, trigger, body.reason, updater, nowUnixSec);
  }

  const evaluation = evaluatePoCHRolloutSafe(true);
  const snapshot = evaluation?.snapshot || getLatestPoCHRolloutSnapshot();

  res.status(200).json({
    rolledBack: true,
    fromStage: state.stage,
    toStage: targetStage,
    trigger,
    reason: body.reason,
    snapshot: snapshot || null,
  });
});

router.get('/status/:identity', readLimiter, (req: Request, res: Response) => {
  const identityDid = decodeURIComponent(req.params.identity);
  const chainRaw = (req.query.chain as string | undefined) || 'solana';
  const chain: Chain = chainRaw === 'base' ? 'base' : 'solana';

  const openChallenge = getLatestOpenPoCHChallenge(identityDid, chain);
  if (openChallenge) {
    maybeFinalizeChallenge(openChallenge.challengeId);
  }

  const status = getPoCHStatus(identityDid, chain);
  if (!status) {
    return sendError(res, 404, 'NOT_FOUND', 'PoCH status not found');
  }

  res.json(status);
});

router.post('/verify-action', writeLimiter, (req: Request, res: Response) => {
  const body = req.body as {
    identityDid?: string;
    chain?: Chain;
    action?: 'stake_amplification' | 'premium_attestation' | 'high_trust_agent_action';
  };

  if (!body.identityDid || !body.chain || !body.action) {
    return sendError(res, 400, 'INVALID_INPUT', 'identityDid, chain, and action are required');
  }
  if (body.chain !== 'solana' && body.chain !== 'base') {
    return sendError(res, 400, 'INVALID_INPUT', 'chain must be solana or base');
  }

  const openChallenge = getLatestOpenPoCHChallenge(body.identityDid, body.chain);
  if (openChallenge) {
    maybeFinalizeChallenge(openChallenge.challengeId);
  }

  evaluatePoCHRolloutSafe(false);

  const mode = getEffectiveEnforcementMode();
  const status = getPoCHStatus(body.identityDid, body.chain);
  const verified = status?.status === 'verified';
  const decision: PoCHGateDecision =
    mode === 'observe'
      ? {
          allowed: true,
          mode,
          reason: 'PoCH observe mode',
          status: status || undefined,
        }
      : mode === 'soft'
        ? {
            allowed: true,
            mode,
            reason: verified ? undefined : 'PoCH missing, soft mode applied',
            status: status || undefined,
          }
        : {
            allowed: verified,
            mode,
            reason: verified ? undefined : 'PoCH verification required for this action',
            status: status || undefined,
          };

  const statusReason = status?.statusReason || (decision.allowed ? 'none' : 'proof_missing');
  recordPoCHGateDecision({
    identityDid: body.identityDid,
    chain: body.chain,
    action: body.action,
    allowed: decision.allowed,
    statusReason,
  });
  pochGateDecisionTotal.labels(
    body.action,
    decision.allowed ? 'true' : 'false',
    normalizeStatusReasonLabel(statusReason)
  ).inc();

  res.json(decision);
});

export default router;
