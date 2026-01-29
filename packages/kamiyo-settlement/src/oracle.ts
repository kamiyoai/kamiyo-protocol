import { PublicKey } from '@solana/web3.js';
import { createHash } from 'crypto';

export const MIN_ORACLES = 3;
export const MAX_SCORE_DEVIATION = 15;
export const COMMIT_PHASE_DURATION = 5 * 60 * 1000; // 5 minutes
export const REVEAL_PHASE_DURATION = 30 * 60 * 1000; // 30 minutes

export interface OracleCommitment {
  oracle: PublicKey;
  commitmentHash: Uint8Array;
  committedAt: number;
  revealed: boolean;
}

export interface OracleSubmission {
  oracle: PublicKey;
  score: number;
  submittedAt: number;
}

export interface ConsensusResult {
  score: number;
  validScores: number[];
  outliers: number[];
  oracleCount: number;
}

export function computeCommitmentHash(
  settlementId: string,
  oracle: PublicKey,
  score: number,
  salt: Uint8Array
): Uint8Array {
  if (salt.length !== 32) {
    throw new Error('Salt must be 32 bytes');
  }
  if (score < 0 || score > 100) {
    throw new Error('Score must be 0-100');
  }

  const hash = createHash('sha256');
  hash.update(settlementId);
  hash.update(oracle.toBuffer());
  hash.update(Buffer.from([score]));
  hash.update(salt);
  return new Uint8Array(hash.digest());
}

export function verifyCommitment(
  commitment: OracleCommitment,
  settlementId: string,
  score: number,
  salt: Uint8Array
): boolean {
  const expected = computeCommitmentHash(settlementId, commitment.oracle, score, salt);
  if (expected.length !== commitment.commitmentHash.length) return false;
  for (let i = 0; i < expected.length; i++) {
    if (expected[i] !== commitment.commitmentHash[i]) return false;
  }
  return true;
}

export function calculateConsensus(scores: number[]): ConsensusResult {
  if (scores.length < MIN_ORACLES) {
    throw new Error(`At least ${MIN_ORACLES} oracle submissions required`);
  }

  const sorted = [...scores].sort((a, b) => a - b);

  // Calculate median
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];

  // Filter outliers
  const validScores: number[] = [];
  const outliers: number[] = [];

  for (const score of sorted) {
    if (Math.abs(score - median) <= MAX_SCORE_DEVIATION) {
      validScores.push(score);
    } else {
      outliers.push(score);
    }
  }

  if (validScores.length < MIN_ORACLES) {
    throw new Error('No consensus: too many outliers');
  }

  // Final score is average of valid scores
  const consensusScore = Math.round(
    validScores.reduce((a, b) => a + b, 0) / validScores.length
  );

  return {
    score: consensusScore,
    validScores,
    outliers,
    oracleCount: scores.length,
  };
}

export function isCommitPhaseActive(createdAt: number): boolean {
  const elapsed = Date.now() - createdAt;
  return elapsed < COMMIT_PHASE_DURATION;
}

export function isRevealPhaseActive(createdAt: number): boolean {
  const elapsed = Date.now() - createdAt;
  return elapsed >= COMMIT_PHASE_DURATION && elapsed < COMMIT_PHASE_DURATION + REVEAL_PHASE_DURATION;
}

export function canFinalize(createdAt: number, submissionCount: number): boolean {
  const elapsed = Date.now() - createdAt;
  const phasesComplete = elapsed >= COMMIT_PHASE_DURATION + REVEAL_PHASE_DURATION;
  return phasesComplete || submissionCount >= MIN_ORACLES;
}
