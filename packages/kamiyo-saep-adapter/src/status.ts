/**
 * SAEP TaskMarket task status.
 *
 * Mirrors the on-chain `TaskStatus` enum from
 * https://github.com/SolanaAEP/saep/blob/main/specs/07-program-task-market.md.
 *
 * Variant ordering matches the Borsh encoding (0..=8). Do not reorder.
 */
export enum SaepTaskStatus {
  /** Task initialized; escrow not yet funded. */
  Created = 0,
  /** Payment in escrow; ready for agent submission. */
  Funded = 1,
  /** Agent acknowledged. M1 may skip this state. */
  InExecution = 2,
  /** result_hash + proof_key written; awaiting verification. */
  ProofSubmitted = 3,
  /** ProofVerifier confirmed; dispute window open. */
  Verified = 4,
  /** Terminal: funds paid to agent, fees collected. */
  Released = 5,
  /** Terminal: deadline passed; client refunded. */
  Expired = 6,
  /** Client raised dispute within window. */
  Disputed = 7,
  /** Terminal: post-dispute arbitration verdict applied. */
  Resolved = 8,
}

/**
 * Parse a numeric status discriminant into the enum. Throws on unknown values
 * to surface schema drift between this adapter and the SAEP program.
 */
export function parseSaepTaskStatus(discriminant: number): SaepTaskStatus {
  if (!(discriminant in SaepTaskStatus) || typeof discriminant !== 'number') {
    throw new Error(`Unknown SAEP TaskStatus discriminant: ${discriminant}`);
  }
  return discriminant as SaepTaskStatus;
}

/**
 * Status set in which a task is still actively worked on. Underwriting
 * decisions should accept these as live; settlement-ingest should reject.
 */
export const ACTIVE_STATUSES: ReadonlySet<SaepTaskStatus> = new Set([
  SaepTaskStatus.Created,
  SaepTaskStatus.Funded,
  SaepTaskStatus.InExecution,
  SaepTaskStatus.ProofSubmitted,
  SaepTaskStatus.Verified,
]);

/**
 * Status set in which a task has reached a terminal state. Underwriting
 * should reject; settlement-ingest accepts.
 */
export const TERMINAL_STATUSES: ReadonlySet<SaepTaskStatus> = new Set([
  SaepTaskStatus.Released,
  SaepTaskStatus.Expired,
  SaepTaskStatus.Resolved,
]);

export function isActive(status: SaepTaskStatus): boolean {
  return ACTIVE_STATUSES.has(status);
}

export function isTerminal(status: SaepTaskStatus): boolean {
  return TERMINAL_STATUSES.has(status);
}
