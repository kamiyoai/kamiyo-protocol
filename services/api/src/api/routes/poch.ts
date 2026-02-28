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
  finalizePoCHChallenge,
  getPoCHChallenge,
  getPoCHOracleCommitment,
  getPoCHOracleVote,
  getPoCHProofSubmission,
  getPoCHRevealedVotes,
  getPoCHStatus,
  hasBlockingPoCHDispute,
  incrementPoCHPenalty,
  listPoCHDisputes,
  openPoCHDispute,
  registerPoCHNullifier,
  resolvePoCHDispute,
  revealPoCHOracleVote,
  setPoCHProofAccepted,
  StoredChallenge,
  upsertPoCHChallenge,
  upsertPoCHContribution,
  upsertPoCHOracleCommit,
  upsertPoCHProofSubmission,
  upsertPoCHStatus,
} from './poch-store';

const router = Router();

const writeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many PoCH requests' } },
});

const readLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many PoCH reads' } },
});

type Chain = 'solana' | 'base';

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

const POCH_TOPICS = {
  submissions: process.env.POCH_TOPIC_SUBMISSIONS || 'poch-submissions',
  scoring: process.env.POCH_TOPIC_SCORING || 'poch-scoring',
  votes: process.env.POCH_TOPIC_ORACLE_VOTES || 'poch-oracle-votes',
  disputes: process.env.POCH_TOPIC_DISPUTES || 'poch-disputes',
  status: process.env.POCH_TOPIC_STATUS || 'poch-status',
};

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

function getEnforcementMode(): PoCHEnforcementMode {
  const mode = process.env.POCH_ENFORCEMENT_MODE;
  if (mode === 'observe' || mode === 'soft' || mode === 'gate_high_impact') {
    return mode;
  }
  return 'soft';
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

function statusForChallenge(challenge: StoredChallenge, status: PoCHStatus['status'], proofStatementId?: string): PoCHStatus {
  return {
    identityDid: challenge.identityDid,
    chain: challenge.chain,
    status,
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

function maybeFinalizeChallenge(challengeId: string): {
  finalized: boolean;
  accepted?: boolean;
  reason?: string;
  oracleRoundId?: string;
  proofStatementId?: string;
} {
  const challenge = getPoCHChallenge(challengeId);
  if (!challenge) {
    return { finalized: false, reason: 'challenge_missing' };
  }
  if (challenge.phase === 'finalized') {
    return {
      finalized: true,
      accepted: challenge.accepted,
      oracleRoundId: challenge.oracleRoundId,
      proofStatementId: challenge.proofStatementId,
    };
  }

  const proof = getPoCHProofSubmission(challengeId);
  if (!proof) return { finalized: false, reason: 'proof_missing' };
  if (hasBlockingPoCHDispute(challengeId)) {
    upsertPoCHStatus(statusForChallenge(challenge, 'disputed', proof.proofStatementId));
    return { finalized: false, reason: 'blocking_dispute' };
  }

  const oracle = evaluateOracleDecision(challengeId);
  if (!oracle.ready) {
    return { finalized: false, reason: 'oracle_quorum_pending' };
  }

  const policyPass = meetsPolicy(challenge.scoreBundle, challenge.policyId);
  const accepted = policyPass && oracle.accepted;
  const finalizedAt = Math.floor(Date.now() / 1000);
  const oracleRoundId = challenge.oracleRoundId || `poch_oracle_${challengeId.slice(5, 13)}`;
  const proofStatementId = proof.proofStatementId;

  finalizePoCHChallenge(challengeId, {
    accepted,
    oracleRoundId,
    proofStatementId,
    finalizedAt,
  });
  setPoCHProofAccepted(challengeId, accepted);

  const finalizedChallenge = getPoCHChallenge(challengeId);
  if (finalizedChallenge) {
    upsertPoCHStatus(statusForChallenge(finalizedChallenge, accepted ? 'verified' : 'rejected', proofStatementId));
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
    oracleRoundId,
    proofStatementId,
    oracleVoteCount: oracle.voteCount,
    oracleTotalWeight: oracle.totalWeight,
    oracleConfidence: oracle.weightedConfidence,
  });

  return {
    finalized: true,
    accepted,
    oracleRoundId,
    proofStatementId,
  };
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

    res.status(201).json({ success: true, assetDid, ual: published.ual });
  } catch (error) {
    logger.error('Failed to publish PoCH contribution', {
      error: error instanceof Error ? error.message : String(error),
    });
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

    const status: PoCHStatus = {
      identityDid: body.identityDid,
      chain: body.chain,
      status: 'pending',
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
    return res.status(200).json({
      accepted,
      pending: false,
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
    upsertPoCHStatus({
      identityDid: body.identityDid,
      chain: body.chain,
      status: 'rejected',
      scoreBundleCommitment: challenge.scoreBundleCommitment,
      updatedAt: new Date().toISOString(),
    });
    return sendError(res, 400, 'INVALID_PROOF', 'Invalid proof payload shape');
  }

  const proofHash = hashHex(body.zkProof);
  const identityNullifierHash = hashHex(`${body.chain}|${body.identityNullifier}`);
  const uniqueNullifier = registerPoCHNullifier(body.chain, identityNullifierHash, body.challengeId);
  if (!uniqueNullifier) {
    return sendError(res, 409, 'REPLAYED_NULLIFIER', 'Identity nullifier already used on this chain');
  }

  const proofStatementId = createProofStatementId(
    body.challengeId,
    proofHash,
    identityNullifierHash
  );

  upsertPoCHProofSubmission({
    challengeId: body.challengeId,
    assetDid: body.assetDid,
    identityDid: body.identityDid,
    chain: body.chain,
    proofStatementId,
    zkProofHash: proofHash,
    identityNullifierHash,
    submittedAt: new Date().toISOString(),
  });

  upsertPoCHStatus({
    identityDid: body.identityDid,
    chain: body.chain,
    status: hasBlockingPoCHDispute(body.challengeId) ? 'disputed' : 'pending',
    scoreBundleCommitment: challenge.scoreBundleCommitment,
    proofStatementId,
    updatedAt: new Date().toISOString(),
  });

  const finalizeResult = maybeFinalizeChallenge(body.challengeId);

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
    return sendError(res, 400, 'COMMIT_PHASE_ENDED', 'Commit phase has ended');
  }

  const registry = parseOracleRegistry();
  const strict = requiresRegisteredOracles(registry);
  if (strict && !registry.has(body.oracleId)) {
    return sendError(res, 403, 'UNREGISTERED_ORACLE', 'Oracle is not in active registry');
  }

  const weight = resolveOracleWeight(body.oracleId, registry);
  upsertPoCHOracleCommit(body.challengeId, body.oracleId, body.commitmentHash, weight);

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
    oracleRoundId: finalizeResult.oracleRoundId,
  });
});

router.get('/oracle/round/:challengeId', readLimiter, (req: Request, res: Response) => {
  const challengeId = decodeURIComponent(req.params.challengeId);
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

  upsertPoCHStatus(statusForChallenge(challenge, 'disputed'));

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

  const resolved = resolvePoCHDispute(disputeId);
  if (!resolved) {
    return sendError(res, 404, 'NOT_FOUND', 'Open dispute not found');
  }

  const challenge = getPoCHChallenge(body.challengeId);
  if (challenge && !hasBlockingPoCHDispute(body.challengeId)) {
    upsertPoCHStatus(statusForChallenge(challenge, 'pending'));
  }

  const finalizeResult = maybeFinalizeChallenge(body.challengeId);
  res.status(200).json({
    disputeId,
    resolved: true,
    finalized: finalizeResult.finalized,
    accepted: finalizeResult.accepted,
    finalizeReason: finalizeResult.reason,
  });
});

router.get('/status/:identity', readLimiter, (req: Request, res: Response) => {
  const identityDid = decodeURIComponent(req.params.identity);
  const chainRaw = (req.query.chain as string | undefined) || 'solana';
  const chain: Chain = chainRaw === 'base' ? 'base' : 'solana';

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

  const mode = getEnforcementMode();
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

  res.json(decision);
});

export default router;
