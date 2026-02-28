import db from '../../db';
import type { PoCHChallenge, PoCHContribution, PoCHStatus } from '@kamiyo/agent-paranet';

type Chain = 'solana' | 'base';
type ChallengePhase = 'commit' | 'reveal' | 'finalized';
const POCH_SCHEMA_NAME = 'poch';
const POCH_SCHEMA_VERSION = 3;
export type PoCHRolloutStage = 'observe' | 'soft' | 'gate_high_impact';
export type PoCHRollbackTrigger =
  | 'manual'
  | 'oracle_reveal_drop'
  | 'proof_failure_anomaly'
  | 'dispute_backlog';
type PoCHStatusReason =
  | 'proof_missing'
  | 'oracle_quorum_pending'
  | 'oracle_timeout'
  | 'blocking_dispute'
  | 'policy_failed'
  | 'oracle_rejected'
  | 'verified';
type StoredPoCHStatus = PoCHStatus & { statusReason?: PoCHStatusReason };

export interface PoCHRolloutState {
  stage: PoCHRolloutStage;
  modeOverride?: PoCHRolloutStage;
  startedAt: string;
  updatedAt: string;
  updatedBy: string;
  rollbackCooldownUntil?: string;
  baselineProofFailRate?: number;
}

export interface PoCHRolloutStateUpdate {
  stage?: PoCHRolloutStage;
  modeOverride?: PoCHRolloutStage | null;
  updatedBy: string;
  rollbackCooldownUntil?: string | null;
  baselineProofFailRate?: number | null;
}

export interface PoCHRolloutSnapshot {
  bucketStart: number;
  capturedAt: string;
  stage: PoCHRolloutStage;
  effectiveMode: PoCHRolloutStage;
  oracleRevealCompletion24h: number;
  proofPassRate24h: number;
  unresolvedBlockingDisputesOver24h: number;
  falsePositiveDenyRate24h: number;
  oracleRevealCompletion2h: number;
  proofFailureRate1h: number;
  openBlockingDisputes: number;
  promotionEligible: boolean;
  rollbackTrigger?: PoCHRollbackTrigger;
  rollbackReason?: string;
}

export interface PoCHRolloutMetrics {
  oracleRevealCompletion24h: number;
  proofPassRate24h: number;
  unresolvedBlockingDisputesOver24h: number;
  falsePositiveDenyRate24h: number;
  oracleRevealCompletion2h: number;
  proofFailureRate1h: number;
  openBlockingDisputes: number;
  commits24h: number;
  reveals24h: number;
  acceptedProofs24h: number;
  rejectedProofs24h: number;
  totalProofs24h: number;
  commits2h: number;
  reveals2h: number;
  rejectedProofs1h: number;
  totalProofs1h: number;
  deniedGateDecisions24h: number;
  falsePositiveDenials24h: number;
}

export interface StoredChallenge extends PoCHChallenge {
  contentHash: string;
  phase: ChallengePhase;
  commitDeadline: number;
  revealDeadline: number;
  accepted?: boolean;
  finalizedAt?: number;
  finalizationReason?: PoCHStatusReason;
  oracleRoundId?: string;
  proofStatementId?: string;
}

export interface StoredProofSubmission {
  challengeId: string;
  assetDid: string;
  identityDid: string;
  chain: Chain;
  proofStatementId: string;
  zkProofHash: string;
  identityNullifierHash: string;
  submittedAt: string;
  accepted?: boolean;
}

export interface StoredOracleReveal {
  challengeId: string;
  oracleId: string;
  weight: number;
  authenticityVerdict: boolean;
  uniquenessVerdict: boolean;
  confidence: number;
  revealedAt: number;
}

export interface StoredOracleVote {
  challengeId: string;
  oracleId: string;
  commitmentHash: string;
  committedAt: number;
  revealSaltHash?: string;
  authenticityVerdict?: boolean;
  uniquenessVerdict?: boolean;
  confidence?: number;
  revealedAt?: number;
  weight: number;
}

export interface StoredDispute {
  id: number;
  challengeId: string;
  identityDid: string;
  chain: Chain;
  reason: string;
  blocking: boolean;
  status: 'open' | 'resolved';
  openedAt: number;
  resolvedAt?: number;
}

db.exec(`
  CREATE TABLE IF NOT EXISTS poch_schema_migrations (
    schema_name TEXT PRIMARY KEY,
    version INTEGER NOT NULL,
    applied_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS poch_contributions (
    asset_did TEXT PRIMARY KEY,
    identity_did TEXT NOT NULL,
    content_hash TEXT NOT NULL,
    created_at TEXT NOT NULL,
    contribution_type TEXT NOT NULL,
    provenance_refs TEXT NOT NULL DEFAULT '[]',
    context_metadata TEXT NOT NULL DEFAULT '{}',
    score_bundle_commitment TEXT,
    oracle_round_id TEXT,
    proof_statement_id TEXT,
    chain_anchors TEXT NOT NULL DEFAULT '{}',
    ual TEXT,
    inserted_at INTEGER DEFAULT (unixepoch()),
    updated_at INTEGER DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS poch_challenges (
    challenge_id TEXT PRIMARY KEY,
    asset_did TEXT NOT NULL,
    identity_did TEXT NOT NULL,
    chain TEXT NOT NULL,
    policy_id TEXT NOT NULL,
    content_hash TEXT NOT NULL,
    score_bundle TEXT NOT NULL,
    score_bundle_commitment TEXT NOT NULL,
    created_at TEXT NOT NULL,
    phase TEXT NOT NULL DEFAULT 'commit',
    commit_deadline INTEGER NOT NULL,
    reveal_deadline INTEGER NOT NULL,
    accepted INTEGER,
    finalized_at INTEGER,
    finalization_reason TEXT,
    oracle_round_id TEXT,
    proof_statement_id TEXT
  );

  CREATE TABLE IF NOT EXISTS poch_status (
    identity_did TEXT NOT NULL,
    chain TEXT NOT NULL,
    status TEXT NOT NULL,
    status_reason TEXT,
    score_bundle_commitment TEXT,
    oracle_round_id TEXT,
    proof_statement_id TEXT,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (identity_did, chain)
  );

  CREATE TABLE IF NOT EXISTS poch_proofs (
    challenge_id TEXT PRIMARY KEY,
    asset_did TEXT NOT NULL,
    identity_did TEXT NOT NULL,
    chain TEXT NOT NULL,
    proof_statement_id TEXT NOT NULL,
    zk_proof_hash TEXT NOT NULL,
    identity_nullifier_hash TEXT NOT NULL,
    submitted_at TEXT NOT NULL,
    accepted INTEGER
  );

  CREATE TABLE IF NOT EXISTS poch_penalties (
    identity_did TEXT NOT NULL,
    chain TEXT NOT NULL,
    strikes INTEGER NOT NULL DEFAULT 0,
    last_updated_at TEXT NOT NULL,
    PRIMARY KEY (identity_did, chain)
  );

  CREATE TABLE IF NOT EXISTS poch_oracle_votes (
    challenge_id TEXT NOT NULL,
    oracle_id TEXT NOT NULL,
    commitment_hash TEXT NOT NULL,
    committed_at INTEGER NOT NULL,
    reveal_salt_hash TEXT,
    authenticity_verdict INTEGER,
    uniqueness_verdict INTEGER,
    confidence REAL,
    revealed_at INTEGER,
    weight INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY (challenge_id, oracle_id)
  );

  CREATE TABLE IF NOT EXISTS poch_disputes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    challenge_id TEXT NOT NULL,
    identity_did TEXT NOT NULL,
    chain TEXT NOT NULL,
    reason TEXT NOT NULL,
    blocking INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'open',
    opened_at INTEGER NOT NULL DEFAULT (unixepoch()),
    resolved_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS poch_nullifiers (
    chain TEXT NOT NULL,
    identity_nullifier_hash TEXT NOT NULL,
    challenge_id TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    PRIMARY KEY (chain, identity_nullifier_hash)
  );

  CREATE TABLE IF NOT EXISTS poch_rollout_state (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    stage TEXT NOT NULL,
    mode_override TEXT,
    started_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    updated_by TEXT NOT NULL,
    rollback_cooldown_until TEXT,
    baseline_proof_fail_rate REAL
  );

  CREATE TABLE IF NOT EXISTS poch_rollout_metric_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bucket_start INTEGER NOT NULL UNIQUE,
    captured_at TEXT NOT NULL,
    stage TEXT NOT NULL,
    effective_mode TEXT NOT NULL,
    oracle_reveal_completion_24h REAL NOT NULL,
    proof_pass_rate_24h REAL NOT NULL,
    unresolved_blocking_disputes_over_24h INTEGER NOT NULL,
    false_positive_deny_rate_24h REAL NOT NULL,
    oracle_reveal_completion_2h REAL NOT NULL,
    proof_failure_rate_1h REAL NOT NULL,
    open_blocking_disputes INTEGER NOT NULL,
    promotion_eligible INTEGER NOT NULL,
    rollback_trigger TEXT,
    rollback_reason TEXT
  );

  CREATE TABLE IF NOT EXISTS poch_gate_decisions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    identity_did TEXT NOT NULL,
    chain TEXT NOT NULL,
    action TEXT NOT NULL,
    allowed INTEGER NOT NULL,
    status_reason TEXT,
    decided_at INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE INDEX IF NOT EXISTS idx_poch_status_chain ON poch_status(chain);
  CREATE INDEX IF NOT EXISTS idx_poch_challenges_identity ON poch_challenges(identity_did, chain);
  CREATE INDEX IF NOT EXISTS idx_poch_challenges_identity_chain_finalized
    ON poch_challenges(identity_did, chain, finalized_at);
  CREATE INDEX IF NOT EXISTS idx_poch_votes_challenge ON poch_oracle_votes(challenge_id);
  CREATE INDEX IF NOT EXISTS idx_poch_disputes_challenge ON poch_disputes(challenge_id, status);
  CREATE INDEX IF NOT EXISTS idx_poch_disputes_status_blocking_opened
    ON poch_disputes(status, blocking, opened_at);
  CREATE INDEX IF NOT EXISTS idx_poch_gate_decisions_window ON poch_gate_decisions(decided_at);
  CREATE INDEX IF NOT EXISTS idx_poch_gate_decisions_identity_chain
    ON poch_gate_decisions(identity_did, chain, decided_at);
`);

function hasColumn(tableName: string, columnName: string): boolean {
  const rows = db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>;
  return rows.some((row) => row.name === columnName);
}

function getPoCHSchemaVersion(): number {
  const row = db.prepare(`
    SELECT version
    FROM poch_schema_migrations
    WHERE schema_name = ?
  `).get(POCH_SCHEMA_NAME) as { version: number } | undefined;
  return row?.version ?? 0;
}

function setPoCHSchemaVersion(version: number): void {
  db.prepare(`
    INSERT INTO poch_schema_migrations (schema_name, version, applied_at)
    VALUES (?, ?, unixepoch())
    ON CONFLICT(schema_name) DO UPDATE SET
      version = excluded.version,
      applied_at = excluded.applied_at
  `).run(POCH_SCHEMA_NAME, version);
}

function runPoCHMigrations(): void {
  const currentVersion = getPoCHSchemaVersion();
  if (currentVersion < 1) {
    setPoCHSchemaVersion(1);
  }

  if (!hasColumn('poch_challenges', 'finalization_reason')) {
    db.exec(`ALTER TABLE poch_challenges ADD COLUMN finalization_reason TEXT`);
  }
  if (!hasColumn('poch_status', 'status_reason')) {
    db.exec(`ALTER TABLE poch_status ADD COLUMN status_reason TEXT`);
  }

  if (currentVersion < POCH_SCHEMA_VERSION) {
    setPoCHSchemaVersion(POCH_SCHEMA_VERSION);
  }
}

runPoCHMigrations();

function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw);
    return parsed as T;
  } catch {
    return fallback;
  }
}

function asBool(value: number | null | undefined): boolean | undefined {
  if (value === null || value === undefined) return undefined;
  return value === 1;
}

function parseRolloutStage(value: string | null | undefined): PoCHRolloutStage {
  if (value === 'observe' || value === 'soft' || value === 'gate_high_impact') {
    return value;
  }
  return 'observe';
}

export function upsertPoCHContribution(
  contribution: PoCHContribution,
  ual?: string,
  derived?: {
    scoreBundleCommitment?: string;
    oracleRoundId?: string;
    proofStatementId?: string;
    chainAnchors?: {
      solanaTxId?: string;
      baseTxHash?: string;
    };
  }
): void {
  db.prepare(`
    INSERT INTO poch_contributions (
      asset_did, identity_did, content_hash, created_at, contribution_type,
      provenance_refs, context_metadata, score_bundle_commitment,
      oracle_round_id, proof_statement_id, chain_anchors, ual, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, unixepoch())
    ON CONFLICT(asset_did) DO UPDATE SET
      identity_did = excluded.identity_did,
      content_hash = excluded.content_hash,
      created_at = excluded.created_at,
      contribution_type = excluded.contribution_type,
      provenance_refs = excluded.provenance_refs,
      context_metadata = excluded.context_metadata,
      score_bundle_commitment = excluded.score_bundle_commitment,
      oracle_round_id = excluded.oracle_round_id,
      proof_statement_id = excluded.proof_statement_id,
      chain_anchors = excluded.chain_anchors,
      ual = excluded.ual,
      updated_at = unixepoch()
  `).run(
    contribution.assetDid,
    contribution.identityDid,
    contribution.contentHash,
    contribution.createdAt,
    contribution.contributionType,
    JSON.stringify(contribution.provenanceRefs || []),
    JSON.stringify(contribution.contextMetadata || {}),
    derived?.scoreBundleCommitment || null,
    derived?.oracleRoundId || null,
    derived?.proofStatementId || null,
    JSON.stringify(derived?.chainAnchors || {}),
    ual || null
  );
}

export function upsertPoCHChallenge(challenge: StoredChallenge): void {
  db.prepare(`
    INSERT INTO poch_challenges (
      challenge_id, asset_did, identity_did, chain, policy_id, content_hash,
      score_bundle, score_bundle_commitment, created_at, phase,
      commit_deadline, reveal_deadline, accepted, finalized_at, finalization_reason, oracle_round_id, proof_statement_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(challenge_id) DO UPDATE SET
      asset_did = excluded.asset_did,
      identity_did = excluded.identity_did,
      chain = excluded.chain,
      policy_id = excluded.policy_id,
      content_hash = excluded.content_hash,
      score_bundle = excluded.score_bundle,
      score_bundle_commitment = excluded.score_bundle_commitment,
      phase = excluded.phase,
      commit_deadline = excluded.commit_deadline,
      reveal_deadline = excluded.reveal_deadline,
      accepted = excluded.accepted,
      finalized_at = excluded.finalized_at,
      finalization_reason = excluded.finalization_reason,
      oracle_round_id = excluded.oracle_round_id,
      proof_statement_id = excluded.proof_statement_id
  `).run(
    challenge.challengeId,
    challenge.assetDid,
    challenge.identityDid,
    challenge.chain,
    challenge.policyId,
    challenge.contentHash,
    JSON.stringify(challenge.scoreBundle),
    challenge.scoreBundleCommitment,
    challenge.createdAt,
    challenge.phase,
    challenge.commitDeadline,
    challenge.revealDeadline,
    challenge.accepted === undefined ? null : (challenge.accepted ? 1 : 0),
    challenge.finalizedAt ?? null,
    challenge.finalizationReason || null,
    challenge.oracleRoundId || null,
    challenge.proofStatementId || null
  );
}

export function getPoCHChallenge(challengeId: string): StoredChallenge | null {
  const row = db.prepare(`
    SELECT * FROM poch_challenges WHERE challenge_id = ?
  `).get(challengeId) as {
    challenge_id: string;
    asset_did: string;
    identity_did: string;
    chain: Chain;
    policy_id: string;
    content_hash: string;
    score_bundle: string;
    score_bundle_commitment: string;
    created_at: string;
    phase: ChallengePhase;
    commit_deadline: number;
    reveal_deadline: number;
    accepted: number | null;
    finalized_at: number | null;
    finalization_reason: PoCHStatusReason | null;
    oracle_round_id: string | null;
    proof_statement_id: string | null;
  } | undefined;
  if (!row) return null;

  return {
    challengeId: row.challenge_id,
    assetDid: row.asset_did,
    identityDid: row.identity_did,
    chain: row.chain,
    policyId: row.policy_id,
    contentHash: row.content_hash,
    scoreBundle: parseJson(row.score_bundle, {
      policyId: row.policy_id,
      uniquenessScore: 0,
      graphDivergence: 0,
      clusterOverlapRisk: 100,
      nonMembershipSignal: false,
      evaluatedAt: new Date().toISOString(),
    }),
    scoreBundleCommitment: row.score_bundle_commitment,
    createdAt: row.created_at,
    phase: row.phase,
    commitDeadline: row.commit_deadline,
    revealDeadline: row.reveal_deadline,
    accepted: asBool(row.accepted),
    finalizedAt: row.finalized_at ?? undefined,
    finalizationReason: row.finalization_reason ?? undefined,
    oracleRoundId: row.oracle_round_id ?? undefined,
    proofStatementId: row.proof_statement_id ?? undefined,
  };
}

export function getLatestOpenPoCHChallenge(identityDid: string, chain: Chain): StoredChallenge | null {
  const row = db.prepare(`
    SELECT challenge_id
    FROM poch_challenges
    WHERE identity_did = ? AND chain = ? AND phase != 'finalized'
    ORDER BY created_at DESC
    LIMIT 1
  `).get(identityDid, chain) as { challenge_id: string } | undefined;
  if (!row) return null;
  return getPoCHChallenge(row.challenge_id);
}

export function finalizePoCHChallenge(
  challengeId: string,
  params: {
    accepted: boolean;
    oracleRoundId: string;
    proofStatementId: string;
    statusReason: PoCHStatusReason;
    finalizedAt: number;
  }
): boolean {
  const result = db.prepare(`
    UPDATE poch_challenges
    SET
      accepted = ?,
      finalized_at = ?,
      phase = 'finalized',
      finalization_reason = ?,
      oracle_round_id = ?,
      proof_statement_id = ?
    WHERE challenge_id = ? AND phase != 'finalized'
  `).run(
    params.accepted ? 1 : 0,
    params.finalizedAt,
    params.statusReason,
    params.oracleRoundId,
    params.proofStatementId,
    challengeId
  );
  return result.changes > 0;
}

export function upsertPoCHStatus(status: StoredPoCHStatus): void {
  db.prepare(`
    INSERT INTO poch_status (
      identity_did, chain, status, status_reason, score_bundle_commitment,
      oracle_round_id, proof_statement_id, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(identity_did, chain) DO UPDATE SET
      status = excluded.status,
      status_reason = excluded.status_reason,
      score_bundle_commitment = excluded.score_bundle_commitment,
      oracle_round_id = excluded.oracle_round_id,
      proof_statement_id = excluded.proof_statement_id,
      updated_at = excluded.updated_at
  `).run(
    status.identityDid,
    status.chain,
    status.status,
    status.statusReason || null,
    status.scoreBundleCommitment || null,
    status.oracleRoundId || null,
    status.proofStatementId || null,
    status.updatedAt
  );
}

export function getPoCHStatus(identityDid: string, chain: Chain): StoredPoCHStatus | null {
  const row = db.prepare(`
    SELECT * FROM poch_status WHERE identity_did = ? AND chain = ?
  `).get(identityDid, chain) as {
    identity_did: string;
    chain: Chain;
    status: PoCHStatus['status'];
    status_reason: PoCHStatusReason | null;
    score_bundle_commitment: string | null;
    oracle_round_id: string | null;
    proof_statement_id: string | null;
    updated_at: string;
  } | undefined;
  if (!row) return null;
  return {
    identityDid: row.identity_did,
    chain: row.chain,
    status: row.status,
    statusReason: row.status_reason ?? undefined,
    scoreBundleCommitment: row.score_bundle_commitment ?? undefined,
    oracleRoundId: row.oracle_round_id ?? undefined,
    proofStatementId: row.proof_statement_id ?? undefined,
    updatedAt: row.updated_at,
  };
}

export type PoCHProofWriteResult = 'inserted' | 'duplicate' | 'conflict';

function isSameProofSubmission(a: StoredProofSubmission, b: StoredProofSubmission): boolean {
  return (
    a.challengeId === b.challengeId &&
    a.assetDid === b.assetDid &&
    a.identityDid === b.identityDid &&
    a.chain === b.chain &&
    a.proofStatementId === b.proofStatementId &&
    a.zkProofHash === b.zkProofHash &&
    a.identityNullifierHash === b.identityNullifierHash
  );
}

export function upsertPoCHProofSubmission(submission: StoredProofSubmission): PoCHProofWriteResult {
  try {
    db.prepare(`
      INSERT INTO poch_proofs (
        challenge_id, asset_did, identity_did, chain,
        proof_statement_id, zk_proof_hash, identity_nullifier_hash,
        submitted_at, accepted
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      submission.challengeId,
      submission.assetDid,
      submission.identityDid,
      submission.chain,
      submission.proofStatementId,
      submission.zkProofHash,
      submission.identityNullifierHash,
      submission.submittedAt,
      submission.accepted === undefined ? null : (submission.accepted ? 1 : 0)
    );
    return 'inserted';
  } catch {
    const existing = getPoCHProofSubmission(submission.challengeId);
    if (!existing) {
      return 'conflict';
    }
    return isSameProofSubmission(existing, submission) ? 'duplicate' : 'conflict';
  }
}

export function setPoCHProofAccepted(challengeId: string, accepted: boolean): void {
  db.prepare(`UPDATE poch_proofs SET accepted = ? WHERE challenge_id = ?`)
    .run(accepted ? 1 : 0, challengeId);
}

export function getPoCHProofSubmission(challengeId: string): StoredProofSubmission | null {
  const row = db.prepare(`SELECT * FROM poch_proofs WHERE challenge_id = ?`)
    .get(challengeId) as {
      challenge_id: string;
      asset_did: string;
      identity_did: string;
      chain: Chain;
      proof_statement_id: string;
      zk_proof_hash: string;
      identity_nullifier_hash: string;
      submitted_at: string;
      accepted: number | null;
    } | undefined;
  if (!row) return null;
  return {
    challengeId: row.challenge_id,
    assetDid: row.asset_did,
    identityDid: row.identity_did,
    chain: row.chain,
    proofStatementId: row.proof_statement_id,
    zkProofHash: row.zk_proof_hash,
    identityNullifierHash: row.identity_nullifier_hash,
    submittedAt: row.submitted_at,
    accepted: asBool(row.accepted),
  };
}

export function registerPoCHNullifier(chain: Chain, identityNullifierHash: string, challengeId: string): boolean {
  try {
    db.prepare(`
      INSERT INTO poch_nullifiers (chain, identity_nullifier_hash, challenge_id)
      VALUES (?, ?, ?)
    `).run(chain, identityNullifierHash, challengeId);
    return true;
  } catch {
    return false;
  }
}

export function incrementPoCHPenalty(identityDid: string, chain: Chain): number {
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO poch_penalties (identity_did, chain, strikes, last_updated_at)
    VALUES (?, ?, 1, ?)
    ON CONFLICT(identity_did, chain) DO UPDATE SET
      strikes = strikes + 1,
      last_updated_at = excluded.last_updated_at
  `).run(identityDid, chain, now);
  const row = db.prepare(`
    SELECT strikes FROM poch_penalties WHERE identity_did = ? AND chain = ?
  `).get(identityDid, chain) as { strikes: number } | undefined;
  return row?.strikes || 0;
}

export function upsertPoCHOracleCommit(
  challengeId: string,
  oracleId: string,
  commitmentHash: string,
  weight: number
): void {
  const committedAt = Math.floor(Date.now() / 1000);
  db.prepare(`
    INSERT INTO poch_oracle_votes (
      challenge_id, oracle_id, commitment_hash, committed_at, weight
    ) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(challenge_id, oracle_id) DO UPDATE SET
      commitment_hash = excluded.commitment_hash,
      committed_at = excluded.committed_at,
      weight = excluded.weight
    WHERE poch_oracle_votes.revealed_at IS NULL
  `).run(challengeId, oracleId, commitmentHash, committedAt, Math.max(1, weight));
}

export function revealPoCHOracleVote(params: {
  challengeId: string;
  oracleId: string;
  revealSaltHash: string;
  authenticityVerdict: boolean;
  uniquenessVerdict: boolean;
  confidence: number;
}): boolean {
  const revealedAt = Math.floor(Date.now() / 1000);
  const result = db.prepare(`
    UPDATE poch_oracle_votes
    SET
      reveal_salt_hash = ?,
      authenticity_verdict = ?,
      uniqueness_verdict = ?,
      confidence = ?,
      revealed_at = ?
    WHERE challenge_id = ? AND oracle_id = ? AND revealed_at IS NULL
  `).run(
    params.revealSaltHash,
    params.authenticityVerdict ? 1 : 0,
    params.uniquenessVerdict ? 1 : 0,
    params.confidence,
    revealedAt,
    params.challengeId,
    params.oracleId
  );
  return result.changes > 0;
}

export function getPoCHOracleCommitment(challengeId: string, oracleId: string): string | null {
  const row = db.prepare(`
    SELECT commitment_hash FROM poch_oracle_votes WHERE challenge_id = ? AND oracle_id = ?
  `).get(challengeId, oracleId) as { commitment_hash: string } | undefined;
  return row?.commitment_hash || null;
}

export function getPoCHOracleVote(challengeId: string, oracleId: string): StoredOracleVote | null {
  const row = db.prepare(`
    SELECT
      challenge_id,
      oracle_id,
      commitment_hash,
      committed_at,
      reveal_salt_hash,
      authenticity_verdict,
      uniqueness_verdict,
      confidence,
      revealed_at,
      weight
    FROM poch_oracle_votes
    WHERE challenge_id = ? AND oracle_id = ?
  `).get(challengeId, oracleId) as {
    challenge_id: string;
    oracle_id: string;
    commitment_hash: string;
    committed_at: number;
    reveal_salt_hash: string | null;
    authenticity_verdict: number | null;
    uniqueness_verdict: number | null;
    confidence: number | null;
    revealed_at: number | null;
    weight: number;
  } | undefined;

  if (!row) return null;

  return {
    challengeId: row.challenge_id,
    oracleId: row.oracle_id,
    commitmentHash: row.commitment_hash,
    committedAt: row.committed_at,
    revealSaltHash: row.reveal_salt_hash ?? undefined,
    authenticityVerdict: asBool(row.authenticity_verdict),
    uniquenessVerdict: asBool(row.uniqueness_verdict),
    confidence: row.confidence ?? undefined,
    revealedAt: row.revealed_at ?? undefined,
    weight: row.weight,
  };
}

export function getPoCHRevealedVotes(challengeId: string): StoredOracleReveal[] {
  const rows = db.prepare(`
    SELECT challenge_id, oracle_id, weight, authenticity_verdict, uniqueness_verdict, confidence, revealed_at
    FROM poch_oracle_votes
    WHERE challenge_id = ? AND revealed_at IS NOT NULL
  `).all(challengeId) as Array<{
    challenge_id: string;
    oracle_id: string;
    weight: number;
    authenticity_verdict: number;
    uniqueness_verdict: number;
    confidence: number | null;
    revealed_at: number;
  }>;

  return rows.map((row) => ({
    challengeId: row.challenge_id,
    oracleId: row.oracle_id,
    weight: row.weight,
    authenticityVerdict: row.authenticity_verdict === 1,
    uniquenessVerdict: row.uniqueness_verdict === 1,
    confidence: row.confidence ?? 0.5,
    revealedAt: row.revealed_at,
  }));
}

export function openPoCHDispute(params: {
  challengeId: string;
  identityDid: string;
  chain: Chain;
  reason: string;
  blocking: boolean;
}): number {
  const result = db.prepare(`
    INSERT INTO poch_disputes (challenge_id, identity_did, chain, reason, blocking, status)
    VALUES (?, ?, ?, ?, ?, 'open')
  `).run(
    params.challengeId,
    params.identityDid,
    params.chain,
    params.reason,
    params.blocking ? 1 : 0
  );
  return Number(result.lastInsertRowid);
}

export function resolvePoCHDispute(disputeId: number): boolean {
  const result = db.prepare(`
    UPDATE poch_disputes
    SET status = 'resolved', resolved_at = unixepoch()
    WHERE id = ? AND status = 'open'
  `).run(disputeId);
  return result.changes > 0;
}

export function hasBlockingPoCHDispute(challengeId: string): boolean {
  const row = db.prepare(`
    SELECT COUNT(*) AS count
    FROM poch_disputes
    WHERE challenge_id = ? AND status = 'open' AND blocking = 1
  `).get(challengeId) as { count: number } | undefined;
  return (row?.count || 0) > 0;
}

export function listPoCHDisputes(challengeId: string): StoredDispute[] {
  const rows = db.prepare(`
    SELECT id, challenge_id, identity_did, chain, reason, blocking, status, opened_at, resolved_at
    FROM poch_disputes
    WHERE challenge_id = ?
    ORDER BY opened_at DESC
  `).all(challengeId) as Array<{
    id: number;
    challenge_id: string;
    identity_did: string;
    chain: Chain;
    reason: string;
    blocking: number;
    status: 'open' | 'resolved';
    opened_at: number;
    resolved_at: number | null;
  }>;

  return rows.map((row) => ({
    id: row.id,
    challengeId: row.challenge_id,
    identityDid: row.identity_did,
    chain: row.chain,
    reason: row.reason,
    blocking: row.blocking === 1,
    status: row.status,
    openedAt: row.opened_at,
    resolvedAt: row.resolved_at ?? undefined,
  }));
}

function readPoCHRolloutState(): PoCHRolloutState | null {
  const row = db.prepare(`
    SELECT stage, mode_override, started_at, updated_at, updated_by, rollback_cooldown_until, baseline_proof_fail_rate
    FROM poch_rollout_state
    WHERE id = 1
  `).get() as {
    stage: string;
    mode_override: string | null;
    started_at: string;
    updated_at: string;
    updated_by: string;
    rollback_cooldown_until: string | null;
    baseline_proof_fail_rate: number | null;
  } | undefined;

  if (!row) return null;

  return {
    stage: parseRolloutStage(row.stage),
    modeOverride: row.mode_override ? parseRolloutStage(row.mode_override) : undefined,
    startedAt: row.started_at,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
    rollbackCooldownUntil: row.rollback_cooldown_until ?? undefined,
    baselineProofFailRate: row.baseline_proof_fail_rate ?? undefined,
  };
}

export function getPoCHRolloutState(fallbackStage = 'observe' as PoCHRolloutStage): PoCHRolloutState {
  const existing = readPoCHRolloutState();
  if (existing) return existing;

  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO poch_rollout_state (
      id, stage, mode_override, started_at, updated_at, updated_by, rollback_cooldown_until, baseline_proof_fail_rate
    ) VALUES (1, ?, NULL, ?, ?, 'system', NULL, NULL)
  `).run(fallbackStage, now, now);

  return {
    stage: fallbackStage,
    startedAt: now,
    updatedAt: now,
    updatedBy: 'system',
  };
}

export function upsertPoCHRolloutState(update: PoCHRolloutStateUpdate): PoCHRolloutState {
  const now = new Date().toISOString();
  const current = readPoCHRolloutState();
  const stage = update.stage ?? current?.stage ?? 'observe';
  const modeOverride = update.modeOverride === undefined
    ? current?.modeOverride
    : update.modeOverride ?? undefined;
  const startedAt = update.stage && update.stage !== current?.stage
    ? now
    : current?.startedAt ?? now;
  const rollbackCooldownUntil = update.rollbackCooldownUntil === undefined
    ? current?.rollbackCooldownUntil
    : update.rollbackCooldownUntil ?? undefined;
  const baselineProofFailRate = update.baselineProofFailRate === undefined
    ? current?.baselineProofFailRate
    : update.baselineProofFailRate ?? undefined;

  db.prepare(`
    INSERT INTO poch_rollout_state (
      id, stage, mode_override, started_at, updated_at, updated_by, rollback_cooldown_until, baseline_proof_fail_rate
    ) VALUES (1, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      stage = excluded.stage,
      mode_override = excluded.mode_override,
      started_at = excluded.started_at,
      updated_at = excluded.updated_at,
      updated_by = excluded.updated_by,
      rollback_cooldown_until = excluded.rollback_cooldown_until,
      baseline_proof_fail_rate = excluded.baseline_proof_fail_rate
  `).run(
    stage,
    modeOverride ?? null,
    startedAt,
    now,
    update.updatedBy,
    rollbackCooldownUntil ?? null,
    baselineProofFailRate ?? null
  );

  return {
    stage,
    modeOverride,
    startedAt,
    updatedAt: now,
    updatedBy: update.updatedBy,
    rollbackCooldownUntil,
    baselineProofFailRate,
  };
}

export function upsertPoCHRolloutSnapshot(snapshot: PoCHRolloutSnapshot): void {
  db.prepare(`
    INSERT INTO poch_rollout_metric_snapshots (
      bucket_start, captured_at, stage, effective_mode,
      oracle_reveal_completion_24h, proof_pass_rate_24h, unresolved_blocking_disputes_over_24h,
      false_positive_deny_rate_24h, oracle_reveal_completion_2h, proof_failure_rate_1h,
      open_blocking_disputes, promotion_eligible, rollback_trigger, rollback_reason
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(bucket_start) DO UPDATE SET
      captured_at = excluded.captured_at,
      stage = excluded.stage,
      effective_mode = excluded.effective_mode,
      oracle_reveal_completion_24h = excluded.oracle_reveal_completion_24h,
      proof_pass_rate_24h = excluded.proof_pass_rate_24h,
      unresolved_blocking_disputes_over_24h = excluded.unresolved_blocking_disputes_over_24h,
      false_positive_deny_rate_24h = excluded.false_positive_deny_rate_24h,
      oracle_reveal_completion_2h = excluded.oracle_reveal_completion_2h,
      proof_failure_rate_1h = excluded.proof_failure_rate_1h,
      open_blocking_disputes = excluded.open_blocking_disputes,
      promotion_eligible = excluded.promotion_eligible,
      rollback_trigger = excluded.rollback_trigger,
      rollback_reason = excluded.rollback_reason
  `).run(
    snapshot.bucketStart,
    snapshot.capturedAt,
    snapshot.stage,
    snapshot.effectiveMode,
    snapshot.oracleRevealCompletion24h,
    snapshot.proofPassRate24h,
    snapshot.unresolvedBlockingDisputesOver24h,
    snapshot.falsePositiveDenyRate24h,
    snapshot.oracleRevealCompletion2h,
    snapshot.proofFailureRate1h,
    snapshot.openBlockingDisputes,
    snapshot.promotionEligible ? 1 : 0,
    snapshot.rollbackTrigger ?? null,
    snapshot.rollbackReason ?? null
  );
}

export function getLatestPoCHRolloutSnapshot(): PoCHRolloutSnapshot | null {
  const row = db.prepare(`
    SELECT
      bucket_start, captured_at, stage, effective_mode,
      oracle_reveal_completion_24h, proof_pass_rate_24h,
      unresolved_blocking_disputes_over_24h, false_positive_deny_rate_24h,
      oracle_reveal_completion_2h, proof_failure_rate_1h,
      open_blocking_disputes, promotion_eligible, rollback_trigger, rollback_reason
    FROM poch_rollout_metric_snapshots
    ORDER BY bucket_start DESC
    LIMIT 1
  `).get() as {
    bucket_start: number;
    captured_at: string;
    stage: string;
    effective_mode: string;
    oracle_reveal_completion_24h: number;
    proof_pass_rate_24h: number;
    unresolved_blocking_disputes_over_24h: number;
    false_positive_deny_rate_24h: number;
    oracle_reveal_completion_2h: number;
    proof_failure_rate_1h: number;
    open_blocking_disputes: number;
    promotion_eligible: number;
    rollback_trigger: PoCHRollbackTrigger | null;
    rollback_reason: string | null;
  } | undefined;
  if (!row) return null;

  return {
    bucketStart: row.bucket_start,
    capturedAt: row.captured_at,
    stage: parseRolloutStage(row.stage),
    effectiveMode: parseRolloutStage(row.effective_mode),
    oracleRevealCompletion24h: row.oracle_reveal_completion_24h,
    proofPassRate24h: row.proof_pass_rate_24h,
    unresolvedBlockingDisputesOver24h: row.unresolved_blocking_disputes_over_24h,
    falsePositiveDenyRate24h: row.false_positive_deny_rate_24h,
    oracleRevealCompletion2h: row.oracle_reveal_completion_2h,
    proofFailureRate1h: row.proof_failure_rate_1h,
    openBlockingDisputes: row.open_blocking_disputes,
    promotionEligible: row.promotion_eligible === 1,
    rollbackTrigger: row.rollback_trigger ?? undefined,
    rollbackReason: row.rollback_reason ?? undefined,
  };
}

export function recordPoCHGateDecision(params: {
  identityDid: string;
  chain: Chain;
  action: 'stake_amplification' | 'premium_attestation' | 'high_trust_agent_action';
  allowed: boolean;
  statusReason?: string;
  decidedAt?: number;
}): void {
  db.prepare(`
    INSERT INTO poch_gate_decisions (identity_did, chain, action, allowed, status_reason, decided_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    params.identityDid,
    params.chain,
    params.action,
    params.allowed ? 1 : 0,
    params.statusReason || null,
    params.decidedAt ?? Math.floor(Date.now() / 1000)
  );
}

export function computePoCHRolloutMetrics(nowSec = Math.floor(Date.now() / 1000)): PoCHRolloutMetrics {
  const cutoff24h = nowSec - (24 * 60 * 60);
  const cutoff2h = nowSec - (2 * 60 * 60);
  const cutoff1h = nowSec - (60 * 60);

  const reveals24h = db.prepare(`
    SELECT
      COUNT(*) AS commits,
      SUM(CASE WHEN revealed_at IS NOT NULL THEN 1 ELSE 0 END) AS reveals
    FROM poch_oracle_votes
    WHERE committed_at >= ?
  `).get(cutoff24h) as { commits: number; reveals: number | null };

  const reveals2h = db.prepare(`
    SELECT
      COUNT(*) AS commits,
      SUM(CASE WHEN revealed_at IS NOT NULL THEN 1 ELSE 0 END) AS reveals
    FROM poch_oracle_votes
    WHERE committed_at >= ?
  `).get(cutoff2h) as { commits: number; reveals: number | null };

  const proofs24h = db.prepare(`
    SELECT
      SUM(CASE WHEN accepted = 1 THEN 1 ELSE 0 END) AS accepted_count,
      SUM(CASE WHEN accepted = 0 THEN 1 ELSE 0 END) AS rejected_count
    FROM poch_proofs
    WHERE submitted_at >= ? AND accepted IS NOT NULL
  `).get(new Date(cutoff24h * 1000).toISOString()) as {
    accepted_count: number | null;
    rejected_count: number | null;
  };

  const proofs1h = db.prepare(`
    SELECT
      SUM(CASE WHEN accepted = 0 THEN 1 ELSE 0 END) AS rejected_count,
      COUNT(*) AS total_count
    FROM poch_proofs
    WHERE submitted_at >= ? AND accepted IS NOT NULL
  `).get(new Date(cutoff1h * 1000).toISOString()) as {
    rejected_count: number | null;
    total_count: number;
  };

  const disputes = db.prepare(`
    SELECT
      SUM(CASE WHEN status = 'open' AND blocking = 1 THEN 1 ELSE 0 END) AS open_blocking,
      SUM(CASE WHEN status = 'open' AND blocking = 1 AND opened_at <= ? THEN 1 ELSE 0 END) AS open_blocking_older_than_24h
    FROM poch_disputes
  `).get(cutoff24h) as {
    open_blocking: number | null;
    open_blocking_older_than_24h: number | null;
  };

  const denies = db.prepare(`
    SELECT
      COUNT(*) AS denied_count,
      SUM(
        CASE
          WHEN EXISTS (
            SELECT 1
            FROM poch_challenges c
            WHERE c.identity_did = d.identity_did
              AND c.chain = d.chain
              AND c.accepted = 1
              AND c.finalized_at IS NOT NULL
              AND c.finalized_at >= d.decided_at
              AND c.finalized_at <= d.decided_at + 86400
          )
          THEN 1 ELSE 0
        END
      ) AS false_positive_count
    FROM poch_gate_decisions d
    WHERE d.allowed = 0 AND d.decided_at >= ?
  `).get(cutoff24h) as {
    denied_count: number;
    false_positive_count: number | null;
  };

  const commits24h = reveals24h.commits || 0;
  const revealCount24h = reveals24h.reveals || 0;
  const commits2h = reveals2h.commits || 0;
  const revealCount2h = reveals2h.reveals || 0;
  const acceptedProofs24h = proofs24h.accepted_count || 0;
  const rejectedProofs24h = proofs24h.rejected_count || 0;
  const totalProofs24h = acceptedProofs24h + rejectedProofs24h;
  const rejectedProofs1h = proofs1h.rejected_count || 0;
  const totalProofs1h = proofs1h.total_count || 0;
  const deniedGateDecisions24h = denies.denied_count || 0;
  const falsePositiveDenials24h = denies.false_positive_count || 0;

  return {
    oracleRevealCompletion24h: commits24h > 0 ? revealCount24h / commits24h : 0,
    proofPassRate24h: totalProofs24h > 0 ? acceptedProofs24h / totalProofs24h : 0,
    unresolvedBlockingDisputesOver24h: disputes.open_blocking_older_than_24h || 0,
    falsePositiveDenyRate24h: deniedGateDecisions24h > 0
      ? falsePositiveDenials24h / deniedGateDecisions24h
      : 0,
    oracleRevealCompletion2h: commits2h > 0 ? revealCount2h / commits2h : 1,
    proofFailureRate1h: totalProofs1h > 0 ? rejectedProofs1h / totalProofs1h : 0,
    openBlockingDisputes: disputes.open_blocking || 0,
    commits24h,
    reveals24h: revealCount24h,
    acceptedProofs24h,
    rejectedProofs24h,
    totalProofs24h,
    commits2h,
    reveals2h: revealCount2h,
    rejectedProofs1h,
    totalProofs1h,
    deniedGateDecisions24h,
    falsePositiveDenials24h,
  };
}
