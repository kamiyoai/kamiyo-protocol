import { computeRiskHash } from './risk-hash.js';
import { SaepTaskStatus } from './status.js';
import type { SaepTaskSnapshot, SaepTaskStatusString, SaepWorkRef } from './types.js';

const STATUS_STRINGS: Readonly<Record<SaepTaskStatus, SaepTaskStatusString>> = Object.freeze({
  [SaepTaskStatus.Created]: 'created',
  [SaepTaskStatus.Funded]: 'funded',
  [SaepTaskStatus.InExecution]: 'in_execution',
  [SaepTaskStatus.ProofSubmitted]: 'proof_submitted',
  [SaepTaskStatus.Verified]: 'verified',
  [SaepTaskStatus.Released]: 'released',
  [SaepTaskStatus.Expired]: 'expired',
  [SaepTaskStatus.Disputed]: 'disputed',
  [SaepTaskStatus.Resolved]: 'resolved',
});

/**
 * Stable string form of a {@link SaepTaskStatus}. Useful for serializing into
 * JSON without leaking the numeric discriminant (which can shift across
 * SAEP program upgrades).
 */
export function statusString(status: SaepTaskStatus): SaepTaskStatusString {
  return STATUS_STRINGS[status];
}

/**
 * Normalize a {@link SaepTaskSnapshot} into a {@link SaepWorkRef} suitable
 * for KAMIYO underwriting / receipts / debt records.
 *
 * The normalization is deterministic — calling this twice with the same
 * snapshot returns identical output (same risk hash, same string fields).
 * No clocks, no random salts.
 */
export function normalizeSnapshot(snapshot: SaepTaskSnapshot): SaepWorkRef {
  const partial: Omit<SaepWorkRef, 'riskHash'> = {
    venue: 'saep',
    cluster: snapshot.cluster,
    taskPda: snapshot.taskPda.toBase58(),
    taskId: bytesToHex(snapshot.taskId),
    paymentMint: snapshot.paymentMint.toBase58(),
    amountMicro: snapshot.paymentAmount.toString(10),
    clientWallet: snapshot.client.toBase58(),
    agentRef: bytesToHex(snapshot.agentDid),
    status: statusString(snapshot.status),
  };
  return { ...partial, riskHash: computeRiskHash(partial) };
}

function bytesToHex(bytes: Uint8Array): string {
  let hex = '';
  for (const b of bytes) {
    hex += b.toString(16).padStart(2, '0');
  }
  return hex;
}
