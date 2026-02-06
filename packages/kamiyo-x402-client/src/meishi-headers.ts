/**
 * Meishi compliance header helpers for x402 payment requests.
 *
 * When an agent has a Meishi passport, these headers are attached
 * to x402 payment requests so merchants can verify compliance
 * before accepting payment.
 */

export const MEISHI_HEADER_KEYS = {
  passport: 'x-meishi-passport',
  mandateVersion: 'x-meishi-mandate-version',
  complianceProof: 'x-meishi-compliance-proof',
  signature: 'x-meishi-signature',
  liabilityRef: 'x-meishi-liability-ref',
} as const;

export interface MeishiHeaderData {
  /** Base58-encoded Meishi passport PDA address */
  passport: string;
  /** Current mandate version number */
  mandateVersion?: number;
  /** Base64-encoded ZK compliance proof (optional) */
  complianceProof?: string;
  /** Base64-encoded Ed25519 signature of the request body */
  signature?: string;
  /** Base58-encoded LiabilityAllocation PDA address */
  liabilityRef?: string;
}

/** Build x402-compatible header record from Meishi data. */
export function buildMeishiHeaders(data: MeishiHeaderData): Record<string, string> {
  const headers: Record<string, string> = {
    [MEISHI_HEADER_KEYS.passport]: data.passport,
  };

  if (data.mandateVersion !== undefined) {
    headers[MEISHI_HEADER_KEYS.mandateVersion] = String(data.mandateVersion);
  }
  if (data.complianceProof) {
    headers[MEISHI_HEADER_KEYS.complianceProof] = data.complianceProof;
  }
  if (data.signature) {
    headers[MEISHI_HEADER_KEYS.signature] = data.signature;
  }
  if (data.liabilityRef) {
    headers[MEISHI_HEADER_KEYS.liabilityRef] = data.liabilityRef;
  }

  return headers;
}

/** Parse Meishi headers from an incoming request header map. */
export function parseMeishiHeaders(
  headers: Record<string, string | string[] | undefined>
): MeishiHeaderData | null {
  const passport = normalize(headers[MEISHI_HEADER_KEYS.passport]);
  if (!passport) return null;

  const versionStr = normalize(headers[MEISHI_HEADER_KEYS.mandateVersion]);

  return {
    passport,
    mandateVersion: versionStr ? parseInt(versionStr, 10) : undefined,
    complianceProof: normalize(headers[MEISHI_HEADER_KEYS.complianceProof]),
    signature: normalize(headers[MEISHI_HEADER_KEYS.signature]),
    liabilityRef: normalize(headers[MEISHI_HEADER_KEYS.liabilityRef]),
  };
}

function normalize(value: string | string[] | undefined): string | undefined {
  if (!value) return undefined;
  return Array.isArray(value) ? value[0] : value;
}
