import { createHash, createHmac, createVerify, timingSafeEqual } from 'crypto';
import { getConfig } from '../config';
import { canonicalString } from './kizuna-request-hash';

export type KizunaLane = 'enterprise' | 'crypto-fast';
export type KizunaRiskAction = 'none' | 'freeze' | 'throttle' | 'unfreeze';

export type KizunaDecisionEnvelopeV1Payload = {
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

export type KizunaDecisionEnvelopeV1 = {
  version: 'kizuna-envelope-v1';
  keyId: string;
  issuedAt: number;
  expiresAt: number;
  payload: KizunaDecisionEnvelopeV1Payload;
  signature: string;
};

export type KizunaDecisionEnvelopeV2Payload = {
  decisionId: string;
  agentId: string;
  payerWallet: string;
  repayWallet: string;
  requestNonce: string;
  network: string;
  lane: KizunaLane;
  poolId: string;
  approvedMicro: string;
  policyPackId: string;
  policyPackVersion: string;
  riskLevel: string;
  riskAction: KizunaRiskAction;
  requestHash: string;
  ltvBps?: number;
  healthFactor?: number;
};

export type KizunaDecisionEnvelopeV2 = {
  version: 'kizuna-envelope-v2';
  alg: 'ES256';
  kid: string;
  issuedAt: number;
  expiresAt: number;
  payload: KizunaDecisionEnvelopeV2Payload;
  signature: string;
};

export type KizunaDecisionEnvelope = KizunaDecisionEnvelopeV1 | KizunaDecisionEnvelopeV2;

export type KernelEvaluateInput = {
  agentId: string;
  payerWallet: string;
  repayWallet: string;
  requestNonce: string;
  network: string;
  requestedMicro: string;
  resource?: string | null;
  payTo?: string | null;
  maxSingleMicro?: string;
  outstandingMicro: string;
  prefundAvailableMicro?: string | null;
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
  policyPackVersion: string;
  riskBand: string;
  riskLevel: string;
  riskAction: KizunaRiskAction;
  requestHash: string;
  envelopeVersion: 'kizuna-envelope-v2';
  signingKid: string | null;
  ltvBps?: number;
  healthFactor?: number;
  decisionEnvelope: KizunaDecisionEnvelopeV2 | null;
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

function getBaseUrl(): string {
  return getConfig().KIZUNA_KERNEL_URL.replace(/\/+$/, '');
}

function getTimeoutMs(): number {
  return getConfig().KIZUNA_KERNEL_TIMEOUT_MS;
}

function safeEqualHex(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, 'hex');
  const bBuf = Buffer.from(b, 'hex');
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

function verifyLegacySignature(envelope: Omit<KizunaDecisionEnvelopeV1, 'signature'>, signature: string): boolean {
  const keys = getConfig().KIZUNA_KERNEL_SIGNING_KEYS;
  const secret = keys[envelope.keyId];
  if (!secret) {
    throw new Error(`unknown_kizuna_kernel_key:${envelope.keyId}`);
  }

  const expected = createHmac('sha256', secret).update(canonicalString(envelope)).digest('hex');
  return safeEqualHex(expected, signature);
}

function verifyV2Signature(envelope: Omit<KizunaDecisionEnvelopeV2, 'signature'>, signature: string): boolean {
  const keys = getConfig().KIZUNA_KERNEL_PUBLIC_KEYS;
  const publicKeyPem = keys[envelope.kid];
  if (!publicKeyPem) {
    throw new Error(`unknown_kizuna_kernel_public_key:${envelope.kid}`);
  }

  const verifier = createVerify('SHA256');
  verifier.update(canonicalString(envelope));
  verifier.end();
  return verifier.verify(publicKeyPem, Buffer.from(signature, 'base64url'));
}

function parseLegacyEnvelope(value: unknown): KizunaDecisionEnvelopeV1 {
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

  if (version !== 'kizuna-envelope-v1' || !keyId || issuedAt == null || expiresAt == null || !signature || !payloadRecord) {
    throw new Error('kizuna_kernel_invalid_envelope');
  }

  const lane = asString(payloadRecord.lane);
  if (lane !== 'enterprise' && lane !== 'crypto-fast') {
    throw new Error('kizuna_kernel_invalid_envelope_lane');
  }

  const payload: KizunaDecisionEnvelopeV1Payload = {
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
    version,
    keyId,
    issuedAt,
    expiresAt,
    payload,
    signature,
  };
}

function parseV2Envelope(value: unknown): KizunaDecisionEnvelopeV2 {
  const envelope = asRecord(value);
  if (!envelope) {
    throw new Error('kizuna_kernel_invalid_envelope');
  }

  const version = asString(envelope.version);
  const alg = asString(envelope.alg);
  const kid = asString(envelope.kid);
  const issuedAt = asNumber(envelope.issuedAt);
  const expiresAt = asNumber(envelope.expiresAt);
  const signature = asString(envelope.signature);
  const payloadRecord = asRecord(envelope.payload);

  if (
    version !== 'kizuna-envelope-v2' ||
    alg !== 'ES256' ||
    !kid ||
    issuedAt == null ||
    expiresAt == null ||
    !signature ||
    !payloadRecord
  ) {
    throw new Error('kizuna_kernel_invalid_envelope');
  }

  const lane = asString(payloadRecord.lane);
  const riskAction = asString(payloadRecord.riskAction);
  if (lane !== 'enterprise' && lane !== 'crypto-fast') {
    throw new Error('kizuna_kernel_invalid_envelope_lane');
  }
  if (
    riskAction !== 'none' &&
    riskAction !== 'freeze' &&
    riskAction !== 'throttle' &&
    riskAction !== 'unfreeze'
  ) {
    throw new Error('kizuna_kernel_invalid_envelope_risk_action');
  }

  const payload: KizunaDecisionEnvelopeV2Payload = {
    decisionId: asString(payloadRecord.decisionId) || '',
    agentId: asString(payloadRecord.agentId) || '',
    payerWallet: asString(payloadRecord.payerWallet) || '',
    repayWallet: asString(payloadRecord.repayWallet) || '',
    requestNonce: asString(payloadRecord.requestNonce) || '',
    network: asString(payloadRecord.network) || '',
    lane,
    poolId: asString(payloadRecord.poolId) || '',
    approvedMicro: asString(payloadRecord.approvedMicro) || '0',
    policyPackId: asString(payloadRecord.policyPackId) || '',
    policyPackVersion: asString(payloadRecord.policyPackVersion) || '',
    riskLevel: asString(payloadRecord.riskLevel) || '',
    riskAction,
    requestHash: asString(payloadRecord.requestHash) || '',
    ltvBps: asNumber(payloadRecord.ltvBps) ?? undefined,
    healthFactor: asNumber(payloadRecord.healthFactor) ?? undefined,
  };

  if (
    !payload.decisionId ||
    !payload.agentId ||
    !payload.payerWallet ||
    !payload.repayWallet ||
    !payload.requestNonce ||
    !payload.network ||
    !payload.poolId ||
    !payload.policyPackId ||
    !payload.policyPackVersion ||
    !payload.riskLevel ||
    !payload.requestHash
  ) {
    throw new Error('kizuna_kernel_invalid_envelope_payload');
  }

  return {
    version,
    alg: 'ES256',
    kid,
    issuedAt,
    expiresAt,
    payload,
    signature,
  };
}

function parseAnyEnvelope(value: unknown): KizunaDecisionEnvelope {
  const envelope = asRecord(value);
  const version = asString(envelope?.version);
  if (version === 'kizuna-envelope-v2') {
    return parseV2Envelope(value);
  }
  return parseLegacyEnvelope(value);
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
  const policyPackVersion = asString(root.policyPackVersion);
  const riskLevel = asString(root.riskLevel) || asString(root.riskBand);
  const riskAction = asString(root.riskAction) || 'none';
  const requestHash = asString(root.requestHash);
  const envelopeVersion = asString(root.envelopeVersion);
  const signingKid = asString(root.signingKid);

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
    !policyPackVersion ||
    !riskLevel ||
    !requestHash ||
    envelopeVersion !== 'kizuna-envelope-v2'
  ) {
    throw new Error('kizuna_kernel_invalid_response');
  }

  if (
    riskAction !== 'none' &&
    riskAction !== 'freeze' &&
    riskAction !== 'throttle' &&
    riskAction !== 'unfreeze'
  ) {
    throw new Error('kizuna_kernel_invalid_response');
  }

  const decisionEnvelope =
    root.decisionEnvelope == null ? null : (parseAnyEnvelope(root.decisionEnvelope) as KizunaDecisionEnvelopeV2);
  if (decisionEnvelope && decisionEnvelope.version !== 'kizuna-envelope-v2') {
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
    policyPackVersion,
    riskBand: riskLevel,
    riskLevel,
    riskAction: riskAction as KizunaRiskAction,
    requestHash,
    envelopeVersion: 'kizuna-envelope-v2',
    signingKid,
    ltvBps: asNumber(root.ltvBps) ?? undefined,
    healthFactor: asNumber(root.healthFactor) ?? undefined,
    decisionEnvelope,
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
  const payload = await kernelFetch('/v2/decisions/evaluate', input);
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
  await kernelFetch('/v2/decisions/commit', input);
}

export async function ingestKizunaKernelRepayment(input: {
  agentId: string;
  lane: KizunaLane;
  poolId: string;
  referenceId: string;
  amountMicro: string;
  appliedMicro: string;
}): Promise<void> {
  await kernelFetch('/v2/repayments/ingest', input);
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
  await kernelFetch('/v2/collateral/ingest', input);
}

export function hashKizunaDecisionEnvelope(envelope: unknown): string {
  return createHash('sha256').update(canonicalString(envelope)).digest('hex');
}

function ensureEnvelopeWindow(envelope: KizunaDecisionEnvelope, nowMs: number): void {
  if (envelope.expiresAt <= nowMs) {
    throw new Error('kizuna_envelope_expired');
  }
  if (envelope.issuedAt > nowMs + 60_000) {
    throw new Error('kizuna_envelope_issued_in_future');
  }
}

export function verifyKizunaDecisionEnvelope(
  envelopeInput: unknown,
  nowMs = Date.now()
): KizunaDecisionEnvelope {
  const envelope = parseAnyEnvelope(envelopeInput);
  ensureEnvelopeWindow(envelope, nowMs);

  if (envelope.version === 'kizuna-envelope-v1') {
    const valid = verifyLegacySignature(
      {
        version: envelope.version,
        keyId: envelope.keyId,
        issuedAt: envelope.issuedAt,
        expiresAt: envelope.expiresAt,
        payload: envelope.payload,
      },
      envelope.signature
    );
    if (!valid) {
      throw new Error('kizuna_envelope_invalid_signature');
    }
    return envelope;
  }

  const valid = verifyV2Signature(
    {
      version: envelope.version,
      alg: envelope.alg,
      kid: envelope.kid,
      issuedAt: envelope.issuedAt,
      expiresAt: envelope.expiresAt,
      payload: envelope.payload,
    },
    envelope.signature
  );
  if (!valid) {
    throw new Error('kizuna_envelope_invalid_signature');
  }
  return envelope;
}
