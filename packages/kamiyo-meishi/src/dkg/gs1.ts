/**
 * GS1 Digital Link URI utilities.
 * @see https://ref.gs1.org/standards/digital-link/uri-syntax/
 */

export const GS1_AI = {
  GIAI: '8004',           // Global Individual Asset Identifier
  PAYMENT_REF: '8020',    // Payment slip reference number
  BATCH_LOT: '10',        // Batch/lot number
  SERIAL: '21',           // Serial number
  GLN: '414',             // Global Location Number (party)
} as const;

// 099* reserved for test/internal use by GS1
const DEFAULT_GS1_PREFIX = '0999999';
const DEFAULT_RESOLVER = 'https://id.gs1.org';
const GS1_VOCAB = 'https://www.gs1.org/voc/';

const MAX_ASSET_REF_LENGTH = 23; // GIAI max 30 minus 7-digit prefix

export interface GS1Config {
  companyPrefix?: string;
  resolverDomain?: string;
}

let _config: Required<GS1Config> = {
  companyPrefix: DEFAULT_GS1_PREFIX,
  resolverDomain: DEFAULT_RESOLVER,
};

/**
 * Configure the GS1 prefix and resolver domain.
 * Call once at startup with your registered GS1 Company Prefix.
 */
export function configureGS1(config: GS1Config): void {
  if (config.companyPrefix !== undefined) {
    if (!/^\d{7,12}$/.test(config.companyPrefix)) {
      throw new Error('GS1 Company Prefix must be 7-12 digits');
    }
    _config.companyPrefix = config.companyPrefix;
  }
  if (config.resolverDomain !== undefined) {
    try {
      const url = new URL(config.resolverDomain);
      if (url.protocol !== 'https:' && url.protocol !== 'http:') {
        throw new Error('Resolver domain must use http or https');
      }
      _config.resolverDomain = config.resolverDomain.replace(/\/+$/, '');
    } catch (e) {
      if (e instanceof TypeError) {
        throw new Error('Invalid resolver domain URL');
      }
      throw e;
    }
  }
}

export function gs1Context(): Record<string, string> {
  // Inline the context to avoid runtime JSON-LD dereferencing (GS1 blocks crawlers/automations).
  return { gs1: GS1_VOCAB };
}

// {companyPrefix}{assetRef}
export function buildAgentGIAI(meishiPda: string): string {
  const safeRef = meishiPda
    .replace(/[^a-zA-Z0-9]/g, '')
    .slice(0, MAX_ASSET_REF_LENGTH);

  if (safeRef.length === 0) {
    throw new Error('Cannot derive GIAI: empty PDA after sanitization');
  }

  return `${_config.companyPrefix}${safeRef}`;
}

export function isValidGIAI(value: string): boolean {
  // GS1 GIAI up to 30 alphanumeric chars; keep validation permissive.
  return /^[A-Za-z0-9]{8,30}$/.test(value);
}

export type MeishiAssetType = 'tx-decision' | 'audit' | 'liability';

// {resolver}/8004/{GIAI}/8020/{assetType}-{timestamp}
export function buildMeishiDigitalLink(params: {
  agentGIAI: string;
  assetType: MeishiAssetType;
  timestamp: number;
  qualifier?: string;
}): string {
  const { agentGIAI, assetType, timestamp, qualifier } = params;

  if (!agentGIAI || agentGIAI.length < 8) {
    throw new Error('Invalid GIAI: must be at least 8 characters (prefix + reference)');
  }
  if (!isValidGIAI(agentGIAI)) {
    throw new Error('Invalid GIAI format');
  }

  const ref = qualifier ?? `${assetType}-${timestamp}`;
  const safeRef = ref.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 70);

  if (safeRef.length === 0) {
    throw new Error('Invalid qualifier: empty after sanitization');
  }

  return `${_config.resolverDomain}/${GS1_AI.GIAI}/${encodeURIComponent(agentGIAI)}/${GS1_AI.PAYMENT_REF}/${encodeURIComponent(safeRef)}`;
}

export function buildAgentDigitalLink(meishiPda: string): string {
  const giai = buildAgentGIAI(meishiPda);
  return `${_config.resolverDomain}/${GS1_AI.GIAI}/${encodeURIComponent(giai)}`;
}

// 13-digit identifier with GS1 check digit
export function isValidGLN(value: string): boolean {
  if (!/^\d{13}$/.test(value)) return false;
  return computeGS1CheckDigit(value.slice(0, 12)) === parseInt(value[12], 10);
}

// Mod-10, alternating weights 1/3
export function computeGS1CheckDigit(digits: string): number {
  if (!/^\d+$/.test(digits)) {
    throw new Error('Check digit input must be numeric');
  }

  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    const digit = parseInt(digits[i], 10);
    // Weights alternate 3, 1, 3, 1... from the rightmost position
    const weight = (digits.length - i) % 2 === 0 ? 1 : 3;
    sum += digit * weight;
  }

  return (10 - (sum % 10)) % 10;
}

export interface ParsedDigitalLink {
  resolver: string;
  primaryAI: string;
  primaryValue: string;
  qualifiers: Array<{ ai: string; value: string }>;
}

export function parseDigitalLink(uri: string): ParsedDigitalLink | null {
  try {
    const url = new URL(uri);
    const segments = url.pathname.split('/').filter(Boolean);

    if (segments.length < 2) return null;

    const primaryAI = segments[0];
    const primaryValue = decodeURIComponent(segments[1]);
    const qualifiers: Array<{ ai: string; value: string }> = [];

    for (let i = 2; i < segments.length - 1; i += 2) {
      qualifiers.push({
        ai: segments[i],
        value: decodeURIComponent(segments[i + 1]),
      });
    }

    return {
      resolver: `${url.protocol}//${url.host}`,
      primaryAI,
      primaryValue,
      qualifiers,
    };
  } catch {
    return null;
  }
}
