import db from '../../db';
import type { PoCHChallenge, PoCHContribution, PoCHStatus } from '@kamiyo/agent-paranet';

type Chain = 'solana' | 'base';
type ChallengePhase = 'commit' | 'reveal' | 'finalized';

export interface StoredChallenge extends PoCHChallenge {
  contentHash: string;
  phase: ChallengePhase;
  commitDeadline: number;
  revealDeadline: number;
  accepted?: boolean;
  finalizedAt?: number;
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
    oracle_round_id TEXT,
    proof_statement_id TEXT
  );

  CREATE TABLE IF NOT EXISTS poch_status (
    identity_did TEXT NOT NULL,
    chain TEXT NOT NULL,
    status TEXT NOT NULL,
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

  CREATE INDEX IF NOT EXISTS idx_poch_status_chain ON poch_status(chain);
  CREATE INDEX IF NOT EXISTS idx_poch_challenges_identity ON poch_challenges(identity_did, chain);
  CREATE INDEX IF NOT EXISTS idx_poch_votes_challenge ON poch_oracle_votes(challenge_id);
  CREATE INDEX IF NOT EXISTS idx_poch_disputes_challenge ON poch_disputes(challenge_id, status);
`);

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
      commit_deadline, reveal_deadline, accepted, finalized_at, oracle_round_id, proof_statement_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
    oracleRoundId: row.oracle_round_id ?? undefined,
    proofStatementId: row.proof_statement_id ?? undefined,
  };
}

export function finalizePoCHChallenge(
  challengeId: string,
  params: {
    accepted: boolean;
    oracleRoundId: string;
    proofStatementId: string;
    finalizedAt: number;
  }
): void {
  db.prepare(`
    UPDATE poch_challenges
    SET
      accepted = ?,
      finalized_at = ?,
      phase = 'finalized',
      oracle_round_id = ?,
      proof_statement_id = ?
    WHERE challenge_id = ?
  `).run(
    params.accepted ? 1 : 0,
    params.finalizedAt,
    params.oracleRoundId,
    params.proofStatementId,
    challengeId
  );
}

export function upsertPoCHStatus(status: PoCHStatus): void {
  db.prepare(`
    INSERT INTO poch_status (
      identity_did, chain, status, score_bundle_commitment,
      oracle_round_id, proof_statement_id, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(identity_did, chain) DO UPDATE SET
      status = excluded.status,
      score_bundle_commitment = excluded.score_bundle_commitment,
      oracle_round_id = excluded.oracle_round_id,
      proof_statement_id = excluded.proof_statement_id,
      updated_at = excluded.updated_at
  `).run(
    status.identityDid,
    status.chain,
    status.status,
    status.scoreBundleCommitment || null,
    status.oracleRoundId || null,
    status.proofStatementId || null,
    status.updatedAt
  );
}

export function getPoCHStatus(identityDid: string, chain: Chain): PoCHStatus | null {
  const row = db.prepare(`
    SELECT * FROM poch_status WHERE identity_did = ? AND chain = ?
  `).get(identityDid, chain) as {
    identity_did: string;
    chain: Chain;
    status: PoCHStatus['status'];
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
    scoreBundleCommitment: row.score_bundle_commitment ?? undefined,
    oracleRoundId: row.oracle_round_id ?? undefined,
    proofStatementId: row.proof_statement_id ?? undefined,
    updatedAt: row.updated_at,
  };
}

export function upsertPoCHProofSubmission(submission: StoredProofSubmission): void {
  db.prepare(`
    INSERT INTO poch_proofs (
      challenge_id, asset_did, identity_did, chain,
      proof_statement_id, zk_proof_hash, identity_nullifier_hash,
      submitted_at, accepted
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(challenge_id) DO UPDATE SET
      asset_did = excluded.asset_did,
      identity_did = excluded.identity_did,
      chain = excluded.chain,
      proof_statement_id = excluded.proof_statement_id,
      zk_proof_hash = excluded.zk_proof_hash,
      identity_nullifier_hash = excluded.identity_nullifier_hash,
      submitted_at = excluded.submitted_at,
      accepted = excluded.accepted
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
    WHERE challenge_id = ? AND oracle_id = ?
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
