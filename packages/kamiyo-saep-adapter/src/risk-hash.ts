import { createHash } from 'node:crypto';

import type { SaepWorkRef } from './types.js';

/**
 * Fields that contribute to the deterministic risk hash. Pulling these out
 * as a constant keeps the hash stable across refactors of {@link SaepWorkRef}
 * — adding a new SaepWorkRef field does not silently change the hash.
 *
 * Order matters: the hash input is `field|value\n` lines in this exact
 * order. Reordering breaks every previously-issued risk hash.
 */
export const RISK_HASH_FIELDS: ReadonlyArray<keyof SaepWorkRef> = Object.freeze([
  'venue',
  'cluster',
  'taskPda',
  'taskId',
  'paymentMint',
  'amountMicro',
  'clientWallet',
  'agentRef',
  'status',
]);

/**
 * Hash of the underwriting-relevant fields of a {@link SaepWorkRef}.
 *
 * The hash is intended to be stable across RPC reads of the same on-chain
 * state — two reads of the same SAEP task should produce the same risk
 * hash. The hash deliberately excludes the existing `riskHash` field on
 * the input (if any) to avoid self-reference.
 *
 * Output: `sha256:` prefix + lowercase hex (32 bytes → 64 chars).
 *
 * @example
 *   computeRiskHash({ venue: 'saep', cluster: 'mainnet-beta', ... })
 *   // → "sha256:a1b2c3..."
 */
export function computeRiskHash(work: Omit<SaepWorkRef, 'riskHash'>): string {
  const lines = RISK_HASH_FIELDS.map(field => {
    const value = (work as Record<string, unknown>)[field as string];
    if (value === undefined || value === null) {
      throw new Error(`computeRiskHash: required field "${String(field)}" is missing`);
    }
    return `${String(field)}|${String(value)}`;
  });
  const input = lines.join('\n');
  const digest = createHash('sha256').update(input, 'utf8').digest('hex');
  return `sha256:${digest}`;
}

/**
 * Constant-time comparison of two risk hashes. Use over `===` when the hash
 * being compared comes from an untrusted source (e.g. a request body) so
 * timing attacks cannot leak information about the expected hash.
 */
export function risksMatch(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
