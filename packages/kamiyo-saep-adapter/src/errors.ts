/**
 * Stable error codes for `@kamiyo/saep-adapter`. Callers should switch on
 * `code`; messages may be reworded between minor versions.
 *
 * Codes are organized into three groups:
 *   - decode_*       failed to read a SAEP account into a typed snapshot
 *   - validate_*     a snapshot was decoded but failed an underwriting predicate
 *   - rpc_*          a network/RPC failure prevented us from reaching SAEP
 */
export type SaepAdapterErrorCode =
  | 'decode_invalid_discriminator'
  | 'decode_truncated_account'
  | 'decode_unknown_status'
  | 'decode_payload_unsupported'
  | 'validate_unsupported_mint'
  | 'validate_amount_zero'
  | 'validate_status_not_eligible'
  | 'validate_deadline_passed'
  | 'validate_deadline_too_far'
  | 'validate_terminal'
  | 'validate_agent_mismatch'
  | 'validate_snapshot_stale'
  | 'rpc_account_not_found'
  | 'rpc_unreachable';

export class SaepAdapterError extends Error {
  readonly code: SaepAdapterErrorCode;
  readonly details: Readonly<Record<string, unknown>>;

  constructor(code: SaepAdapterErrorCode, message: string, details: Record<string, unknown> = {}) {
    super(`[saep-adapter:${code}] ${message}`);
    this.name = 'SaepAdapterError';
    this.code = code;
    this.details = Object.freeze({ ...details });
    // Preserve the prototype chain across `extends Error` in older targets.
    Object.setPrototypeOf(this, SaepAdapterError.prototype);
  }
}
