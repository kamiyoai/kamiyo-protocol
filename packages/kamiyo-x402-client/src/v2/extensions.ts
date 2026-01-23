// x402 v2 extension builders and parsers

import type {
  ExtensionDeclaration,
  KamiyoReputationInfo,
  KamiyoReputationPayload,
  KamiyoReputationTier,
  KamiyoEscrowInfo,
  KamiyoEscrowPayload,
  KamiyoRefundEntry,
  KamiyoCreditInfo,
  KamiyoCreditPayload,
  CreditScoringWeights,
  PaymentRequired402,
} from './types';

const REPUTATION_KEY = 'kamiyo-reputation';

const REPUTATION_CLIENT_SCHEMA: Record<string, unknown> = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  properties: {
    proof: { type: 'string', minLength: 1 },
    commitment: { type: 'string', pattern: '^0x[0-9a-fA-F]{64}$' },
    threshold: { type: 'integer', minimum: 0, maximum: 100 },
    agentPk: { type: 'string', minLength: 1 },
    publicSignals: { type: 'array', items: { type: 'string', pattern: '^[0-9]+$' }, minItems: 1 },
  },
  required: ['proof', 'commitment', 'threshold', 'agentPk', 'publicSignals'],
};

export function declareReputationExtension(opts: {
  minThreshold: number;
  tiers?: KamiyoReputationTier[];
  creditEnabled?: boolean;
}): Record<string, ExtensionDeclaration> {
  const info: KamiyoReputationInfo = {
    minThreshold: opts.minThreshold,
    proofType: 'groth16-bn254',
    tiers: opts.tiers || DEFAULT_REPUTATION_TIERS,
    creditEnabled: opts.creditEnabled ?? false,
  };
  return { [REPUTATION_KEY]: { info: info as unknown as Record<string, unknown>, schema: REPUTATION_CLIENT_SCHEMA } };
}

export function buildReputationPayload(data: {
  proof: Uint8Array | string;
  commitment: string;
  threshold: number;
  agentPk: string;
  publicSignals: string[];
}): Record<string, ExtensionDeclaration> {
  const proof = typeof data.proof === 'string'
    ? data.proof
    : Buffer.from(data.proof).toString('base64');

  return {
    [REPUTATION_KEY]: {
      info: {
        proof,
        commitment: data.commitment,
        threshold: data.threshold,
        agentPk: data.agentPk,
        publicSignals: data.publicSignals,
      },
    },
  };
}

export function parseReputationExtension(
  response: PaymentRequired402 | { extensions?: Record<string, ExtensionDeclaration> }
): KamiyoReputationInfo | null {
  const extensions = response.extensions;
  if (!extensions?.[REPUTATION_KEY]) return null;

  const info = extensions[REPUTATION_KEY].info as unknown as KamiyoReputationInfo;
  if (typeof info.minThreshold !== 'number') return null;

  return info;
}

export function parseReputationPayload(
  extensions?: Record<string, unknown>
): KamiyoReputationPayload | null {
  if (!extensions?.[REPUTATION_KEY]) return null;

  const entry = extensions[REPUTATION_KEY] as { info?: unknown } | KamiyoReputationPayload;
  const payload = (entry && typeof entry === 'object' && 'info' in entry
    ? entry.info
    : entry) as KamiyoReputationPayload;

  if (!payload || !payload.proof || !payload.commitment || typeof payload.threshold !== 'number') {
    return null;
  }

  return payload;
}

export function validateReputationPayload(payload: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!payload || typeof payload !== 'object') {
    return { valid: false, errors: ['Payload must be an object'] };
  }

  const p = payload as Record<string, unknown>;

  if (typeof p.proof !== 'string' || p.proof.length === 0) {
    errors.push('proof must be a non-empty base64 string');
  }
  if (typeof p.commitment !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(p.commitment)) {
    errors.push('commitment must be a 0x-prefixed 32-byte hex string');
  }
  if (typeof p.threshold !== 'number' || p.threshold < 0 || p.threshold > 100 || !Number.isInteger(p.threshold)) {
    errors.push('threshold must be an integer 0-100');
  }
  if (typeof p.agentPk !== 'string' || p.agentPk.length === 0) {
    errors.push('agentPk must be a non-empty string');
  }
  if (!Array.isArray(p.publicSignals) || p.publicSignals.length === 0) {
    errors.push('publicSignals must be a non-empty array');
  } else {
    for (const s of p.publicSignals) {
      if (typeof s !== 'string' || !/^[0-9]+$/.test(s)) {
        errors.push('publicSignals entries must be numeric strings');
        break;
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

const ESCROW_KEY = 'kamiyo-escrow';

const ESCROW_CLIENT_SCHEMA: Record<string, unknown> = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  properties: {
    escrowPda: { type: 'string', minLength: 32, maxLength: 44 },
    transactionId: { type: 'string', minLength: 1, maxLength: 128 },
    agentPk: { type: 'string', minLength: 32, maxLength: 44 },
  },
  required: ['escrowPda', 'transactionId', 'agentPk'],
};

export function declareEscrowExtension(opts: {
  timelockSeconds?: number;
  qualityThreshold?: number;
  programId: string;
  refundSchedule?: KamiyoRefundEntry[];
  required?: boolean;
}): Record<string, ExtensionDeclaration> {
  const info: KamiyoEscrowInfo = {
    required: opts.required ?? true,
    timelockSeconds: opts.timelockSeconds ?? 3600,
    qualityThreshold: opts.qualityThreshold ?? 70,
    programId: opts.programId,
    refundSchedule: opts.refundSchedule || DEFAULT_REFUND_SCHEDULE,
  };
  return { [ESCROW_KEY]: { info: info as unknown as Record<string, unknown>, schema: ESCROW_CLIENT_SCHEMA } };
}

export function buildEscrowPayload(data: {
  escrowPda: string;
  transactionId: string;
  agentPk: string;
}): Record<string, ExtensionDeclaration> {
  return {
    [ESCROW_KEY]: {
      info: {
        escrowPda: data.escrowPda,
        transactionId: data.transactionId,
        agentPk: data.agentPk,
      },
    },
  };
}

export function parseEscrowExtension(
  response: PaymentRequired402 | { extensions?: Record<string, ExtensionDeclaration> }
): KamiyoEscrowInfo | null {
  const extensions = response.extensions;
  if (!extensions?.[ESCROW_KEY]) return null;

  const info = extensions[ESCROW_KEY].info as unknown as KamiyoEscrowInfo;
  if (typeof info.programId !== 'string') return null;

  return info;
}

export function parseEscrowPayload(
  extensions?: Record<string, unknown>
): KamiyoEscrowPayload | null {
  if (!extensions?.[ESCROW_KEY]) return null;

  const entry = extensions[ESCROW_KEY] as { info?: unknown } | KamiyoEscrowPayload;
  const payload = (entry && typeof entry === 'object' && 'info' in entry
    ? entry.info
    : entry) as KamiyoEscrowPayload;

  if (!payload || !payload.escrowPda || !payload.transactionId || !payload.agentPk) {
    return null;
  }

  return payload;
}

export function validateEscrowPayload(payload: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!payload || typeof payload !== 'object') {
    return { valid: false, errors: ['Payload must be an object'] };
  }

  const p = payload as Record<string, unknown>;

  if (typeof p.escrowPda !== 'string' || p.escrowPda.length < 32 || p.escrowPda.length > 44) {
    errors.push('escrowPda must be a base58 string (32-44 chars)');
  }
  if (typeof p.transactionId !== 'string' || p.transactionId.length === 0 || p.transactionId.length > 128) {
    errors.push('transactionId must be 1-128 chars');
  }
  if (typeof p.agentPk !== 'string' || p.agentPk.length < 32 || p.agentPk.length > 44) {
    errors.push('agentPk must be a base58 string (32-44 chars)');
  }

  return { valid: errors.length === 0, errors };
}

export const DEFAULT_REPUTATION_TIERS: KamiyoReputationTier[] = [
  { name: 'untrusted', minThreshold: 0, discountPercent: 0 },
  { name: 'basic', minThreshold: 50, discountPercent: 5 },
  { name: 'trusted', minThreshold: 70, discountPercent: 10 },
  { name: 'premium', minThreshold: 85, discountPercent: 15 },
  { name: 'elite', minThreshold: 95, discountPercent: 25 },
];

export const DEFAULT_REFUND_SCHEDULE: KamiyoRefundEntry[] = [
  { minQuality: 0, maxQuality: 49, refundPercent: 100 },
  { minQuality: 50, maxQuality: 69, refundPercent: 75 },
  { minQuality: 70, maxQuality: 79, refundPercent: 35 },
  { minQuality: 80, maxQuality: 100, refundPercent: 0 },
];

export const REPUTATION_EXTENSION_KEY = REPUTATION_KEY;
export const ESCROW_EXTENSION_KEY = ESCROW_KEY;

const CREDIT_KEY = 'kamiyo-credit';

export const CREDIT_EXTENSION_KEY = CREDIT_KEY;

export const CREDIT_CLIENT_SCHEMA: Record<string, unknown> = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  properties: {
    agentPk: { type: 'string', minLength: 1 },
    commitment: { type: 'string', pattern: '^0x[0-9a-fA-F]{64}$' },
    requestedCredit: { type: 'number', minimum: 0 },
    collateralEscrowPda: { type: 'string', minLength: 32, maxLength: 44 },
    collateralAmount: { type: 'number', minimum: 0 },
  },
  required: ['agentPk', 'commitment', 'requestedCredit'],
};

export function declareCreditExtension(opts: {
  maxCollateralMultiplier?: number;
  agingHalfLifeDays?: number;
  minHistoryForCredit?: number;
  scoringWeights?: Partial<CreditScoringWeights>;
}): Record<string, ExtensionDeclaration> {
  const info: KamiyoCreditInfo = {
    creditEnabled: true,
    maxCollateralMultiplier: opts.maxCollateralMultiplier ?? 3,
    agingHalfLifeDays: opts.agingHalfLifeDays ?? 30,
    minHistoryForCredit: opts.minHistoryForCredit ?? 3,
    scoringWeights: {
      disputeHistory: opts.scoringWeights?.disputeHistory ?? 0.25,
      paymentHistory: opts.scoringWeights?.paymentHistory ?? 0.25,
      escrowOutcomes: opts.scoringWeights?.escrowOutcomes ?? 0.25,
      tenure: opts.scoringWeights?.tenure ?? 0.25,
    },
  };
  return { [CREDIT_KEY]: { info: info as unknown as Record<string, unknown>, schema: CREDIT_CLIENT_SCHEMA } };
}

export function buildCreditPayload(data: {
  agentPk: string;
  commitment: string;
  requestedCredit: number;
  collateralEscrowPda?: string;
  collateralAmount?: number;
}): Record<string, ExtensionDeclaration> {
  const payload: Record<string, unknown> = {
    agentPk: data.agentPk,
    commitment: data.commitment,
    requestedCredit: data.requestedCredit,
  };
  if (data.collateralEscrowPda) payload.collateralEscrowPda = data.collateralEscrowPda;
  if (data.collateralAmount != null) payload.collateralAmount = data.collateralAmount;

  return { [CREDIT_KEY]: { info: payload } };
}

export function parseCreditExtension(
  response: PaymentRequired402 | { extensions?: Record<string, ExtensionDeclaration> }
): KamiyoCreditInfo | null {
  const extensions = response.extensions;
  if (!extensions?.[CREDIT_KEY]) return null;

  const info = extensions[CREDIT_KEY].info as unknown as KamiyoCreditInfo;
  if (typeof info.creditEnabled !== 'boolean') return null;

  return info;
}

export function parseCreditPayload(
  extensions?: Record<string, unknown>
): KamiyoCreditPayload | null {
  if (!extensions?.[CREDIT_KEY]) return null;

  const entry = extensions[CREDIT_KEY] as { info?: unknown } | KamiyoCreditPayload;
  const payload = (entry && typeof entry === 'object' && 'info' in entry
    ? entry.info
    : entry) as KamiyoCreditPayload;

  if (!payload || !payload.agentPk || !payload.commitment || typeof payload.requestedCredit !== 'number') {
    return null;
  }

  return payload;
}

const BASE58_RE = /^[123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]+$/;

export function validateCreditPayload(payload: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!payload || typeof payload !== 'object') {
    return { valid: false, errors: ['Payload must be an object'] };
  }

  const p = payload as Record<string, unknown>;

  if (typeof p.agentPk !== 'string' || p.agentPk.length === 0) {
    errors.push('agentPk must be a non-empty string');
  }
  if (typeof p.commitment !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(p.commitment)) {
    errors.push('commitment must be a 0x-prefixed 32-byte hex string');
  }
  if (typeof p.requestedCredit !== 'number' || !Number.isFinite(p.requestedCredit) || p.requestedCredit < 0) {
    errors.push('requestedCredit must be a finite non-negative number');
  }

  const hasPda = p.collateralEscrowPda != null;
  const hasAmount = p.collateralAmount != null;

  if (hasPda !== hasAmount) {
    errors.push('collateralEscrowPda and collateralAmount must both be provided or both absent');
  }
  if (hasPda) {
    if (typeof p.collateralEscrowPda !== 'string' ||
        p.collateralEscrowPda.length < 32 ||
        p.collateralEscrowPda.length > 44 ||
        !BASE58_RE.test(p.collateralEscrowPda)) {
      errors.push('collateralEscrowPda must be a valid base58 string (32-44 chars)');
    }
  }
  if (hasAmount) {
    if (typeof p.collateralAmount !== 'number' || !Number.isFinite(p.collateralAmount) || p.collateralAmount < 0) {
      errors.push('collateralAmount must be a finite non-negative number');
    }
  }

  return { valid: errors.length === 0, errors };
}
