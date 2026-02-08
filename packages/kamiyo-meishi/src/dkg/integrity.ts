import crypto from 'crypto';

type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

function normalizeJson(value: unknown): JsonValue {
  if (value === null) return null;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error('Non-finite numbers are not valid JSON values');
    }
    return Object.is(value, -0) ? 0 : value;
  }
  if (Array.isArray(value)) return value.map((entry) => normalizeJson(entry));
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const out: Record<string, JsonValue> = {};
    for (const key of Object.keys(record).sort()) {
      const entry = record[key];
      if (entry === undefined) continue;
      out[key] = normalizeJson(entry);
    }
    return out;
  }

  throw new Error(`Unsupported JSON value type: ${typeof value}`);
}

/**
 * Deterministic JSON serialization for integrity commitments.
 *
 * This is intentionally strict:
 * - keys are sorted recursively
 * - `undefined` entries are omitted
 * - non-finite numbers throw
 */
export function canonicalizeJson(value: unknown): string {
  return JSON.stringify(normalizeJson(value));
}

export function sha256Hex(value: Buffer | string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function sha256Bytes(value: Buffer | string): number[] {
  return Array.from(crypto.createHash('sha256').update(value).digest());
}

export function sha256HexCanonicalJson(value: unknown): string {
  return sha256Hex(canonicalizeJson(value));
}

export function sha256BytesCanonicalJson(value: unknown): number[] {
  return sha256Bytes(canonicalizeJson(value));
}

