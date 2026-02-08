type UnknownRecord = Record<string, unknown>;

const USDC_DECIMALS = 6;
const USDC_MICRO = 10 ** USDC_DECIMALS;

export interface ParsedVerifyInput {
  mode: 'legacy' | 'x402';
  paymentHeader: string;
  resource?: string;
  maxAmount?: number;
  requirementAmountRaw?: string;
  requirementNetwork?: string;
}

export interface ParsedSettleInput {
  mode: 'legacy' | 'x402';
  paymentHeader: string;
  merchantWallet: string;
  amount?: number;
  asset: string;
  requirementAmountRaw?: string;
  requirementNetwork?: string;
  requirementResource?: string;
}

function asRecord(value: unknown): UnknownRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function isDecodedPaymentShape(payload: UnknownRecord): boolean {
  return (
    typeof payload.signature === 'string' &&
    typeof payload.payer === 'string' &&
    typeof payload.timestamp === 'number' &&
    typeof payload.nonce === 'string' &&
    typeof payload.resource === 'string' &&
    typeof payload.amount === 'string' &&
    typeof payload.authSignature === 'string'
  );
}

function encodeDecodedPaymentHeader(payload: UnknownRecord, scheme: string, network: string): string {
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64');
  return `${scheme}:${network}:${encoded}`;
}

function extractPaymentHeader(
  payload: unknown,
  scheme: string,
  network: string
): string | undefined {
  if (typeof payload === 'string' && payload.trim().length > 0) {
    return payload.trim();
  }

  const record = asRecord(payload);
  if (!record) return undefined;

  const embeddedHeader = asString(record.paymentHeader);
  if (embeddedHeader) return embeddedHeader;

  if (isDecodedPaymentShape(record)) {
    return encodeDecodedPaymentHeader(record, scheme, network);
  }

  return undefined;
}

function extractRequirementNetwork(
  paymentRequirements: UnknownRecord,
  paymentPayload: UnknownRecord
): string | undefined {
  return (
    asString(paymentRequirements.network) ||
    asString(asRecord(paymentPayload.accepted)?.network) ||
    asString(paymentPayload.network)
  );
}

function extractRequirementAmountRaw(
  paymentRequirements: UnknownRecord,
  paymentPayload: UnknownRecord
): string | undefined {
  const accepted = asRecord(paymentPayload.accepted);
  return (
    asString(paymentRequirements.amount) ||
    asString(paymentRequirements.maxAmountRequired) ||
    asString(accepted?.amount) ||
    asString(accepted?.maxAmountRequired)
  );
}

function extractResource(
  paymentRequirements: UnknownRecord,
  paymentPayload: UnknownRecord
): string | undefined {
  const payloadResource = asRecord(paymentPayload.resource);
  return asString(paymentRequirements.resource) || asString(payloadResource?.url);
}

function extractMerchantWallet(
  paymentRequirements: UnknownRecord,
  paymentPayload: UnknownRecord
): string | undefined {
  return (
    asString(paymentRequirements.payTo) ||
    asString(asRecord(paymentPayload.accepted)?.payTo)
  );
}

function extractAsset(
  paymentRequirements: UnknownRecord,
  paymentPayload: UnknownRecord,
  fallback?: string
): string {
  return (
    asString(paymentRequirements.asset) ||
    asString(asRecord(paymentPayload.accepted)?.asset) ||
    asString(fallback) ||
    'USDC'
  );
}

function parseUsdcMicroAmount(amountRaw: string): number | null {
  const trimmed = amountRaw.trim();
  if (!trimmed) return null;

  if (/^\d+$/.test(trimmed)) {
    const units = Number(trimmed);
    if (!Number.isSafeInteger(units) || units <= 0) return null;
    return units;
  }

  const n = Number(trimmed);
  if (!Number.isFinite(n) || n <= 0) return null;

  const units = Math.round(n * USDC_MICRO);
  if (!Number.isSafeInteger(units) || units <= 0) return null;
  return units;
}

export function parseSignedUsdcAmount(
  signedAmountRaw: string,
  expectedAmountRaw?: string
): number | null {
  const expectedMicro =
    typeof expectedAmountRaw === 'string' && expectedAmountRaw.trim().length > 0
      ? parseUsdcMicroAmount(expectedAmountRaw)
      : null;

  const trimmed = signedAmountRaw.trim();
  if (!trimmed) return null;

  const candidates: number[] = [];

  const asDecimal = Number(trimmed);
  if (Number.isFinite(asDecimal) && asDecimal > 0) {
    const micro = Math.round(asDecimal * USDC_MICRO);
    if (Number.isSafeInteger(micro) && micro > 0) candidates.push(micro);
  }

  if (/^\d+$/.test(trimmed)) {
    const micro = Number(trimmed);
    if (Number.isSafeInteger(micro) && micro > 0) candidates.push(micro);
  }

  const unique = Array.from(new Set(candidates));
  if (!unique.length) return null;

  if (expectedMicro == null) {
    return Math.min(...unique) / USDC_MICRO;
  }

  if (unique.includes(expectedMicro)) {
    return expectedMicro / USDC_MICRO;
  }

  return null;
}

export function parseVerifyInput(body: unknown): { ok: true; value: ParsedVerifyInput } | { ok: false; error: string } {
  const root = asRecord(body);
  if (!root) return { ok: false, error: 'Missing request body' };

  const legacyHeader = asString(root.paymentHeader);
  if (legacyHeader) {
    return {
      ok: true,
      value: {
        mode: 'legacy',
        paymentHeader: legacyHeader,
        resource: asString(root.resource),
        maxAmount: asNumber(root.maxAmount),
      },
    };
  }

  const paymentPayload = asRecord(root.paymentPayload);
  const paymentRequirements = asRecord(root.paymentRequirements);
  if (!paymentPayload || !paymentRequirements) {
    return { ok: false, error: 'Missing paymentPayload or paymentRequirements' };
  }

  const network = extractRequirementNetwork(paymentRequirements, paymentPayload);
  if (!network) return { ok: false, error: 'Missing paymentRequirements.network' };

  const scheme =
    asString(paymentRequirements.scheme) ||
    asString(asRecord(paymentPayload.accepted)?.scheme) ||
    asString(paymentPayload.scheme) ||
    'exact';

  const paymentHeader = extractPaymentHeader(paymentPayload.payload, scheme, network);
  if (!paymentHeader) {
    return { ok: false, error: 'Missing or invalid paymentPayload.payload' };
  }

  return {
    ok: true,
    value: {
      mode: 'x402',
      paymentHeader,
      resource: extractResource(paymentRequirements, paymentPayload),
      requirementAmountRaw: extractRequirementAmountRaw(paymentRequirements, paymentPayload),
      requirementNetwork: network,
    },
  };
}

export function parseSettleInput(body: unknown): { ok: true; value: ParsedSettleInput } | { ok: false; error: string } {
  const root = asRecord(body);
  if (!root) return { ok: false, error: 'Missing request body' };

  const legacyHeader = asString(root.paymentHeader);
  const legacyWallet = asString(root.merchantWallet);
  if (legacyHeader && legacyWallet) {
    return {
      ok: true,
      value: {
        mode: 'legacy',
        paymentHeader: legacyHeader,
        merchantWallet: legacyWallet,
        amount: asNumber(root.amount),
        asset: asString(root.asset) || 'USDC',
      },
    };
  }

  const paymentPayload = asRecord(root.paymentPayload);
  const paymentRequirements = asRecord(root.paymentRequirements);
  if (!paymentPayload || !paymentRequirements) {
    return { ok: false, error: 'Missing paymentPayload or paymentRequirements' };
  }

  const network = extractRequirementNetwork(paymentRequirements, paymentPayload);
  if (!network) return { ok: false, error: 'Missing paymentRequirements.network' };

  const scheme =
    asString(paymentRequirements.scheme) ||
    asString(asRecord(paymentPayload.accepted)?.scheme) ||
    asString(paymentPayload.scheme) ||
    'exact';

  const paymentHeader = extractPaymentHeader(paymentPayload.payload, scheme, network);
  if (!paymentHeader) {
    return { ok: false, error: 'Missing or invalid paymentPayload.payload' };
  }

  const merchantWallet = extractMerchantWallet(paymentRequirements, paymentPayload);
  if (!merchantWallet) {
    return { ok: false, error: 'Missing paymentRequirements.payTo' };
  }

  return {
    ok: true,
    value: {
      mode: 'x402',
      paymentHeader,
      merchantWallet,
      asset: extractAsset(paymentRequirements, paymentPayload, asString(root.asset)),
      requirementAmountRaw: extractRequirementAmountRaw(paymentRequirements, paymentPayload),
      requirementNetwork: network,
      requirementResource: extractResource(paymentRequirements, paymentPayload),
    },
  };
}

export function matchesUsdcAmount(signedAmount: number, requirementAmountRaw?: string): boolean {
  if (!requirementAmountRaw) return true;

  const requirementMicro = parseUsdcMicroAmount(requirementAmountRaw);
  if (requirementMicro == null) return false;

  if (!Number.isFinite(signedAmount) || signedAmount <= 0) return false;
  const signedMicro = Math.round(signedAmount * USDC_MICRO);
  return signedMicro === requirementMicro;
}
