import { createHash, createHmac, timingSafeEqual } from 'crypto';
import { getConfig } from '../config';

export type KizunaLane = 'enterprise' | 'crypto-fast';

export type KizunaDecisionEnvelopePayload = {
  decisionId: string;
  agentId: string;
  payerWallet: string;
  requestNonce: string;
  network: string;
  lane: KizunaLane;
  poolId: string;
  approvedMicro: string;
  policyPackId: string;
  riskBand: string;
  ltvBps?: number;
  healthFactor?: number;
};

export type KizunaDecisionEnvelope = {
  version: 'kizuna-envelope-v1';
  keyId: string;
  issuedAt: number;
  expiresAt: number;
  payload: KizunaDecisionEnvelopePayload;
  signature: string;
};

export type KernelEvaluateInput = {
  agentId: string;
  payerWallet: string;
  repayWallet: string;
  requestNonce: string;
  network: string;
  requestedMicro: string;
  maxSingleMicro?: string;
  outstandingMicro: string;
  lane: KizunaLane;
  poolId: string;
  mandateSingleLimitMicro?: string | null;
  accountStatus: string;
  accountAgeDays: number;
  settlementCount: number;
  disputesFiled: number;
  disputesWon: number;
  avgQuality: number;
  debtClosed: number;
  debtTotal: number;
  collateral?: {
    collateralAccount: string;
    assetId: string;
    totalDepositedMicro: string;
    totalWithdrawnMicro: string;
    availableMicro: string;
    effectiveCollateralMicro: string;
    ltvCapBps: number;
    healthFactor: number;
  };
};

export type KernelEvaluateResult = {
  approved: boolean;
  decisionId: string;
  approvedMicro: string;
  availableMicro: string;
  outstandingMicro: string;
  scoreRaw: number;
  reasonCodes: string[];
  tier: string;
  lane: KizunaLane;
  poolId: string;
  policyPackId: string;
  riskBand: string;
  ltvBps?: number;
  healthFactor?: number;
  decisionEnvelope: KizunaDecisionEnvelope | null;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function asBoolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

function parseReasonCodes(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
    .filter((entry) => entry.length > 0);
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((entry) => canonicalize(entry));
  const record = asRecord(value);
  if (!record) return value;

  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(record).sort()) {
    sorted[key] = canonicalize(record[key]);
  }
  return sorted;
}

function canonicalString(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function getBaseUrl(): string {
  return getConfig().KIZUNA_KERNEL_URL.replace(/\/+$/, '');
}

function getTimeoutMs(): number {
  return getConfig().KIZUNA_KERNEL_TIMEOUT_MS;
}

function signMaterial(envelope: Omit<KizunaDecisionEnvelope, 'signature'>): string {
  const keys = getConfig().KIZUNA_KERNEL_SIGNING_KEYS;
  const secret = keys[envelope.keyId];
  if (!secret) {
    throw new Error(`unknown_kizuna_kernel_key:${envelope.keyId}`);
  }
  const material = canonicalString(envelope);
  return createHmac('sha256', secret).update(material).digest('hex');
}

function safeEqualHex(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, 'hex');
  const bBuf = Buffer.from(b, 'hex');
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

function parseDecisionEnvelope(value: unknown): KizunaDecisionEnvelope {
  const envelope = asRecord(value);
  if (!envelope) {
    throw new Error('kizuna_kernel_invalid_envelope');
  }

  const version = asString(envelope.version);
  const keyId = asString(envelope.keyId);
  const issuedAt = asNumber(envelope.issuedAt);
  const expiresAt = asNumber(envelope.expiresAt);
  const signature = asString(envelope.signature);

  const payloadRecord = asRecord(envelope.payload);
  if (!payloadRecord || !version || !keyId || issuedAt == null || expiresAt == null || !signature) {
    throw new Error('kizuna_kernel_invalid_envelope');
  }

  const lane = asString(payloadRecord.lane);
  if (lane !== 'enterprise' && lane !== 'crypto-fast') {
    throw new Error('kizuna_kernel_invalid_envelope_lane');
  }

  const payload: KizunaDecisionEnvelopePayload = {
    decisionId: asString(payloadRecord.decisionId) || '',
    agentId: asString(payloadRecord.agentId) || '',
    payerWallet: asString(payloadRecord.payerWallet) || '',
    requestNonce: asString(payloadRecord.requestNonce) || '',
    network: asString(payloadRecord.network) || '',
    lane,
    poolId: asString(payloadRecord.poolId) || '',
    approvedMicro: asString(payloadRecord.approvedMicro) || '0',
    policyPackId: asString(payloadRecord.policyPackId) || 'unknown-policy',
    riskBand: asString(payloadRecord.riskBand) || 'unknown',
    ltvBps: asNumber(payloadRecord.ltvBps) ?? undefined,
    healthFactor: asNumber(payloadRecord.healthFactor) ?? undefined,
  };

  if (
    !payload.decisionId ||
    !payload.agentId ||
    !payload.payerWallet ||
    !payload.requestNonce ||
    !payload.network ||
    !payload.poolId
  ) {
    throw new Error('kizuna_kernel_invalid_envelope_payload');
  }

  return {
    version: version as KizunaDecisionEnvelope['version'],
    keyId,
    issuedAt,
    expiresAt,
    payload,
    signature,
  };
}

function mapKernelEvaluateResult(data: unknown): KernelEvaluateResult {
  const root = asRecord(data);
  if (!root) throw new Error('kizuna_kernel_invalid_response');

  const approved = asBoolean(root.approved);
  const decisionId = asString(root.decisionId);
  const approvedMicro = asString(root.approvedMicro);
  const availableMicro = asString(root.availableMicro);
  const outstandingMicro = asString(root.outstandingMicro);
  const scoreRaw = asNumber(root.scoreRaw);
  const tier = asString(root.tier);
  const lane = asString(root.lane);
  const poolId = asString(root.poolId);
  const policyPackId = asString(root.policyPackId);
  const riskBand = asString(root.riskBand);

  if (
    approved == null ||
    !decisionId ||
    !approvedMicro ||
    !availableMicro ||
    !outstandingMicro ||
    scoreRaw == null ||
    !tier ||
    (lane !== 'enterprise' && lane !== 'crypto-fast') ||
    !poolId ||
    !policyPackId ||
    !riskBand
  ) {
    throw new Error('kizuna_kernel_invalid_response');
  }

  return {
    approved,
    decisionId,
    approvedMicro,
    availableMicro,
    outstandingMicro,
    scoreRaw,
    reasonCodes: parseReasonCodes(root.reasonCodes),
    tier,
    lane,
    poolId,
    policyPackId,
    riskBand,
    ltvBps: asNumber(root.ltvBps) ?? undefined,
    healthFactor: asNumber(root.healthFactor) ?? undefined,
    decisionEnvelope: parseDecisionEnvelope(root.decisionEnvelope),
  };
}

async function kernelFetch(path: string, body: unknown): Promise<unknown> {
  const baseUrl = getBaseUrl();
  if (!baseUrl) {
    throw new Error('kizuna_kernel_not_configured');
  }

  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), getTimeoutMs());
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${getConfig().KIZUNA_INTERNAL_TOKEN}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const message =
        payload && typeof payload === 'object' && typeof (payload as any).error === 'string'
          ? (payload as any).error
          : `HTTP ${response.status}`;
      throw new Error(`kizuna_kernel_http_error:${message}`);
    }

    return payload;
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('kizuna_kernel_timeout');
    }
    throw err;
  } finally {
    clearTimeout(timeoutHandle);
  }
}

export async function evaluateKizunaKernelDecision(input: KernelEvaluateInput): Promise<KernelEvaluateResult> {
  const payload = await kernelFetch('/v1/decisions/evaluate', input);
  return mapKernelEvaluateResult(payload);
}

export async function commitKizunaKernelDecision(input: {
  decisionId: string;
  debtId?: string;
  settlementId: string;
  txHash: string;
  lane: KizunaLane;
  poolId: string;
}): Promise<void> {
  await kernelFetch('/v1/decisions/commit', input);
}

export async function ingestKizunaKernelRepayment(input: {
  agentId: string;
  lane: KizunaLane;
  poolId: string;
  referenceId: string;
  amountMicro: string;
  appliedMicro: string;
}): Promise<void> {
  await kernelFetch('/v1/repayments/ingest', input);
}

export async function ingestKizunaKernelCollateral(input: {
  agentId: string;
  lane: KizunaLane;
  poolId: string;
  collateralAccount: string;
  assetId: string;
  amountMicro: string;
  eventType: 'deposit' | 'withdraw';
  referenceId: string;
}): Promise<void> {
  await kernelFetch('/v1/collateral/ingest', input);
}

export function hashKizunaDecisionEnvelope(envelope: unknown): string {
  return createHash('sha256').update(canonicalString(envelope)).digest('hex');
}

export function verifyKizunaDecisionEnvelope(
  envelopeInput: unknown,
  nowMs = Date.now()
): KizunaDecisionEnvelope {
  const envelope = parseDecisionEnvelope(envelopeInput);
  if (envelope.expiresAt <= nowMs) {
    throw new Error('kizuna_envelope_expired');
  }
  if (envelope.issuedAt > nowMs + 60_000) {
    throw new Error('kizuna_envelope_issued_in_future');
  }

  const expected = signMaterial({
    version: envelope.version,
    keyId: envelope.keyId,
    issuedAt: envelope.issuedAt,
    expiresAt: envelope.expiresAt,
    payload: envelope.payload,
  });

  if (!safeEqualHex(expected, envelope.signature)) {
    throw new Error('kizuna_envelope_invalid_signature');
  }

  return envelope;
}

export function mintLocalKizunaEnvelope(payload: KizunaDecisionEnvelopePayload): KizunaDecisionEnvelope | null {
  const keyIds = Object.keys(getConfig().KIZUNA_KERNEL_SIGNING_KEYS);
  if (!keyIds.length) return null;

  const issuedAt = Date.now();
  const unsigned: Omit<KizunaDecisionEnvelope, 'signature'> = {
    version: 'kizuna-envelope-v1',
    keyId: keyIds[0],
    issuedAt,
    expiresAt: issuedAt + 2 * 60_000,
    payload,
  };

  return {
    ...unsigned,
    signature: signMaterial(unsigned),
  };
}
