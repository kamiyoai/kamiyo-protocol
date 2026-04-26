import type { PublicKey } from '@solana/web3.js';

import { SaepAdapterError } from './errors.js';
import { isTerminal, SaepTaskStatus } from './status.js';
import type { SaepTaskSnapshot, SaepWorkRef } from './types.js';

export interface UnderwritingPolicy {
  /** Pubkeys of allowed payment mints (e.g. USDC). Empty = none allowed. */
  allowedPaymentMints: ReadonlyArray<PublicKey>;
  /**
   * Statuses in which the task is eligible for a fresh underwriting
   * decision. By default {Funded, ProofSubmitted, Verified} — the lanes
   * where escrow exists and the agent can still earn payout.
   */
  eligibleStatuses?: ReadonlySet<SaepTaskStatus>;
  /**
   * Reject if the deadline is sooner than `minSecondsToDeadline` from
   * `nowSec`. Default: 60 seconds. Prevents underwriting tasks that will
   * expire before the agent can complete them.
   */
  minSecondsToDeadline?: number;
  /**
   * Reject if the deadline is more than `maxSecondsToDeadline` from
   * `nowSec`. Default: 30 days (matches SAEP MAX_DEADLINE_SECS).
   */
  maxSecondsToDeadline?: number;
  /**
   * Reject if the snapshot was decoded more than `maxSnapshotAgeSec`
   * seconds ago, measured against `nowSec`. Default: 60 seconds. Stale
   * snapshots aren't safe for underwriting because state may have moved.
   */
  maxSnapshotAgeSec?: number;
}

const DEFAULT_ELIGIBLE: ReadonlySet<SaepTaskStatus> = new Set([
  SaepTaskStatus.Funded,
  SaepTaskStatus.ProofSubmitted,
  SaepTaskStatus.Verified,
]);

const DEFAULT_MIN_SECONDS = 60;
const DEFAULT_MAX_SECONDS = 30 * 24 * 60 * 60;
const DEFAULT_MAX_SNAPSHOT_AGE_SEC = 60;

export interface UnderwritingContext {
  /**
   * The `agent_did` (32 bytes) that the requesting agent claims. Must match
   * the snapshot's `agentDid` exactly. Bypass with `undefined` only when
   * underwriting on behalf of any agent (rare).
   */
  expectedAgentDid?: Uint8Array;
  /** Wall-clock seconds at the moment of validation. */
  nowSec: number;
}

/**
 * Validate that a SAEP task snapshot is eligible for underwriting under the
 * given policy. Throws {@link SaepAdapterError} on the first failure.
 */
export function validateForUnderwriting(
  snapshot: SaepTaskSnapshot,
  ctx: UnderwritingContext,
  policy: UnderwritingPolicy
): void {
  // 1. Snapshot freshness — stale reads can't safely drive underwriting.
  const maxAge = policy.maxSnapshotAgeSec ?? DEFAULT_MAX_SNAPSHOT_AGE_SEC;
  const ageSec = ctx.nowSec - Math.floor(snapshot.decodedAtMs / 1000);
  if (ageSec > maxAge) {
    throw new SaepAdapterError(
      'validate_snapshot_stale',
      'Snapshot is older than the configured max age',
      { ageSec, maxAge }
    );
  }

  // 2. Status eligibility.
  const eligible = policy.eligibleStatuses ?? DEFAULT_ELIGIBLE;
  if (isTerminal(snapshot.status)) {
    throw new SaepAdapterError(
      'validate_terminal',
      'Task is in a terminal state; underwriting cannot proceed',
      { status: snapshot.status }
    );
  }
  if (!eligible.has(snapshot.status)) {
    throw new SaepAdapterError(
      'validate_status_not_eligible',
      'Task status is not eligible for underwriting under the active policy',
      { status: snapshot.status }
    );
  }

  // 3. Payment mint allowlist.
  if (policy.allowedPaymentMints.length === 0) {
    throw new SaepAdapterError(
      'validate_unsupported_mint',
      'Underwriting policy has no allowed payment mints'
    );
  }
  const mintAllowed = policy.allowedPaymentMints.some(m => m.equals(snapshot.paymentMint));
  if (!mintAllowed) {
    throw new SaepAdapterError(
      'validate_unsupported_mint',
      'Task payment_mint is not in the policy allowlist',
      { paymentMint: snapshot.paymentMint.toBase58() }
    );
  }

  // 4. Amount > 0.
  if (snapshot.paymentAmount.isZero()) {
    throw new SaepAdapterError('validate_amount_zero', 'Task payment_amount must be > 0');
  }

  // 5. Deadline window.
  const minSecs = policy.minSecondsToDeadline ?? DEFAULT_MIN_SECONDS;
  const maxSecs = policy.maxSecondsToDeadline ?? DEFAULT_MAX_SECONDS;
  const remaining = snapshot.deadline - ctx.nowSec;
  if (remaining < minSecs) {
    throw new SaepAdapterError(
      'validate_deadline_passed',
      'Task deadline is too soon (or already passed) to underwrite',
      { remainingSec: remaining, minRequired: minSecs }
    );
  }
  if (remaining > maxSecs) {
    throw new SaepAdapterError(
      'validate_deadline_too_far',
      'Task deadline exceeds policy maximum window',
      { remainingSec: remaining, maxAllowed: maxSecs }
    );
  }

  // 6. Agent identity match — defends against a different agent claiming
  //    underwriting for someone else's task.
  if (ctx.expectedAgentDid !== undefined) {
    if (
      ctx.expectedAgentDid.length !== snapshot.agentDid.length ||
      !ctx.expectedAgentDid.every((b, i) => b === snapshot.agentDid[i])
    ) {
      throw new SaepAdapterError(
        'validate_agent_mismatch',
        'Snapshot agent_did does not match the requesting agent'
      );
    }
  }
}

/**
 * Convenience wrapper that returns a {@link SaepWorkRef} on success and
 * throws on validation failure. For routes that want a single call site
 * combining "is this snapshot OK?" + "give me the normalized form".
 */
export function validatedWorkRef(
  snapshot: SaepTaskSnapshot,
  ctx: UnderwritingContext,
  policy: UnderwritingPolicy,
  // Imported lazily to keep this file decoupled from `normalize.ts`'s shape.
  normalize: (snap: SaepTaskSnapshot) => SaepWorkRef
): SaepWorkRef {
  validateForUnderwriting(snapshot, ctx, policy);
  return normalize(snapshot);
}
