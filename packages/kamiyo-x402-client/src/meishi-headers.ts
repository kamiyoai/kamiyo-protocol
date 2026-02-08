export const MEISHI_HEADER_KEYS = {
  passport: 'x-meishi-passport',
  mandateVersion: 'x-meishi-mandate-version',
  complianceProof: 'x-meishi-compliance-proof',
  assertionUal: 'x-meishi-assertion-ual',
  assertionHash: 'x-meishi-assertion-hash',
  privateAssertionUal: 'x-meishi-private-assertion-ual',
  signature: 'x-meishi-signature',
  signatureTs: 'x-meishi-signature-ts',
  signatureNonce: 'x-meishi-signature-nonce',
  signatureMethod: 'x-meishi-signature-method',
  signaturePath: 'x-meishi-signature-path',
  signatureBodySha256: 'x-meishi-signature-body-sha256',
  liabilityRef: 'x-meishi-liability-ref',
} as const;

export interface MeishiHeaderData {
  passport: string;
  mandateVersion?: number;
  complianceProof?: string;
  assertionUal?: string;
  assertionHash?: string;
  privateAssertionUal?: string;
  signature?: string;
  signatureTs?: number;
  signatureNonce?: string;
  signatureMethod?: string;
  signaturePath?: string;
  signatureBodySha256?: string;
  liabilityRef?: string;
}

export interface BuildMeishiHeaderOptions {
  includeLegacyComplianceProof?: boolean;
}

export function buildMeishiHeaders(
  data: MeishiHeaderData,
  options: BuildMeishiHeaderOptions = {}
): Record<string, string> {
  const headers: Record<string, string> = {
    [MEISHI_HEADER_KEYS.passport]: data.passport,
  };

  if (data.mandateVersion !== undefined) {
    headers[MEISHI_HEADER_KEYS.mandateVersion] = String(data.mandateVersion);
  }
  if (options.includeLegacyComplianceProof && data.complianceProof) {
    headers[MEISHI_HEADER_KEYS.complianceProof] = data.complianceProof;
  }
  if (data.assertionUal) {
    headers[MEISHI_HEADER_KEYS.assertionUal] = data.assertionUal;
  }
  if (data.assertionHash) {
    headers[MEISHI_HEADER_KEYS.assertionHash] = data.assertionHash.toLowerCase();
  }
  if (data.privateAssertionUal) {
    headers[MEISHI_HEADER_KEYS.privateAssertionUal] = data.privateAssertionUal;
  }
  if (data.signature) {
    headers[MEISHI_HEADER_KEYS.signature] = data.signature;
  }
  if (data.signatureTs !== undefined) {
    headers[MEISHI_HEADER_KEYS.signatureTs] = String(data.signatureTs);
  }
  if (data.signatureNonce) {
    headers[MEISHI_HEADER_KEYS.signatureNonce] = data.signatureNonce;
  }
  if (data.signatureMethod) {
    headers[MEISHI_HEADER_KEYS.signatureMethod] = data.signatureMethod.toUpperCase();
  }
  if (data.signaturePath) {
    headers[MEISHI_HEADER_KEYS.signaturePath] = data.signaturePath;
  }
  if (data.signatureBodySha256) {
    headers[MEISHI_HEADER_KEYS.signatureBodySha256] = data.signatureBodySha256.toLowerCase();
  }
  if (data.liabilityRef) {
    headers[MEISHI_HEADER_KEYS.liabilityRef] = data.liabilityRef;
  }

  return headers;
}

export function parseMeishiHeaders(
  headers: Record<string, string | string[] | undefined>
): MeishiHeaderData | null {
  const passport = normalize(headers[MEISHI_HEADER_KEYS.passport]);
  if (!passport || !validateBase58(passport)) return null;

  const versionStr = normalize(headers[MEISHI_HEADER_KEYS.mandateVersion]);
  if (versionStr && !validateMandateVersion(versionStr)) return null;

  const complianceProof = normalize(headers[MEISHI_HEADER_KEYS.complianceProof]);
  if (complianceProof && !validateBase64(complianceProof)) return null;

  const assertionUal = normalize(headers[MEISHI_HEADER_KEYS.assertionUal]);
  if (assertionUal && !validateAssertionUal(assertionUal)) return null;

  const assertionHash = normalize(headers[MEISHI_HEADER_KEYS.assertionHash]);
  if (assertionHash && !validateHexSha256(assertionHash)) return null;

  const privateAssertionUal = normalize(headers[MEISHI_HEADER_KEYS.privateAssertionUal]);
  if (privateAssertionUal && !validateAssertionUal(privateAssertionUal)) return null;
  if ((assertionHash || privateAssertionUal) && !assertionUal) return null;

  const signature = normalize(headers[MEISHI_HEADER_KEYS.signature]);
  if (signature && !validateBase64(signature)) return null;

  const signatureTsStr = normalize(headers[MEISHI_HEADER_KEYS.signatureTs]);
  if (signatureTsStr && !validateTimestamp(signatureTsStr)) return null;

  const signatureNonce = normalize(headers[MEISHI_HEADER_KEYS.signatureNonce]);
  if (signatureNonce && !validateNonce(signatureNonce)) return null;

  const signatureMethod = normalize(headers[MEISHI_HEADER_KEYS.signatureMethod]);
  if (signatureMethod && !validateMethod(signatureMethod)) return null;

  const signaturePath = normalize(headers[MEISHI_HEADER_KEYS.signaturePath]);
  if (signaturePath && !validatePath(signaturePath)) return null;

  const signatureBodySha256 = normalize(headers[MEISHI_HEADER_KEYS.signatureBodySha256]);
  if (signatureBodySha256 && !validateHexSha256(signatureBodySha256)) return null;

  const hasAnyReplayField = Boolean(
    signatureTsStr || signatureNonce || signatureMethod || signaturePath || signatureBodySha256
  );
  if (
    hasAnyReplayField &&
    (!signatureTsStr || !signatureNonce || !signatureMethod || !signaturePath || !signatureBodySha256)
  ) {
    return null;
  }

  const liabilityRef = normalize(headers[MEISHI_HEADER_KEYS.liabilityRef]);
  if (liabilityRef && !validateBase58(liabilityRef)) return null;

  return {
    passport,
    mandateVersion: versionStr ? parseInt(versionStr, 10) : undefined,
    complianceProof,
    assertionUal,
    assertionHash: assertionHash?.toLowerCase(),
    privateAssertionUal,
    signature,
    signatureTs: signatureTsStr ? parseInt(signatureTsStr, 10) : undefined,
    signatureNonce,
    signatureMethod: signatureMethod?.toUpperCase(),
    signaturePath,
    signatureBodySha256: signatureBodySha256?.toLowerCase(),
    liabilityRef,
  };
}

export function validateBase58(value: string): boolean {
  const regex = /^[1-9A-HJ-NP-Za-km-z]+$/;
  return regex.test(value);
}

function validateBase64(value: string): boolean {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value)) return false;
  return value.length % 4 === 0;
}

function validateMandateVersion(value: string): boolean {
  if (!/^\d+$/.test(value)) return false;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0;
}

function validateTimestamp(value: string): boolean {
  if (!/^\d+$/.test(value)) return false;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0;
}

function validateNonce(value: string): boolean {
  return /^[a-zA-Z0-9_-]{8,128}$/.test(value);
}

function validateMethod(value: string): boolean {
  return /^[A-Z]+$/i.test(value);
}

function validatePath(value: string): boolean {
  return value.startsWith('/');
}

function validateAssertionUal(value: string): boolean {
  if (value.length < 8 || value.length > 512) return false;
  if (/\s/.test(value)) return false;
  return (
    value.startsWith('did:dkg:') ||
    value.startsWith('urn:') ||
    value.startsWith('https://') ||
    value.startsWith('http://')
  );
}

function validateHexSha256(value: string): boolean {
  return /^[a-f0-9]{64}$/i.test(value);
}

function normalize(value: string | string[] | undefined): string | undefined {
  if (!value) return undefined;
  const normalized = Array.isArray(value) ? value[0] : value;
  return normalized.trim();
}
