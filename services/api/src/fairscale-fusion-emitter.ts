import {
  canonicalFairscaleFusionPayload,
  deriveFairscaleFusionEventId,
  FAIRSCALE_FUSION_DEFAULT_PARTNER,
  FAIRSCALE_FUSION_SOLANA_WALLET_RE,
  hashFairscaleFusionHex,
  normalizeFairscaleFusionTimestamp,
  roundFairscaleFusionNumber,
} from './fairscale-fusion-core';
import { insertFairscaleFusionEvent, type FairscaleFusionEvent } from './fairscale-fusion-store';
import { logger } from './logger';

const SERVICE_ID_MAX_LENGTH = 128;
const PROOF_HASH_MAX_LENGTH = 256;
const PARTNER_RE = /^[a-z0-9][a-z0-9_-]{1,31}$/;

export interface FairscaleFusionEmitInput {
  wallet: string;
  serviceId: string;
  qualityScore: number;
  refundPct?: number;
  timestampMs?: number;
  proofHash: string;
  metadata?: Record<string, unknown>;
  partner?: string;
  eventId?: string;
  keyId?: string | null;
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, roundFairscaleFusionNumber(value)));
}

function normalizeMetadata(metadata: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return {};
  }
  return metadata;
}

export function emitFairscaleFusionEvent(
  input: FairscaleFusionEmitInput
): { inserted: boolean; event: FairscaleFusionEvent } | null {
  const wallet = typeof input.wallet === 'string' ? input.wallet.trim() : '';
  if (!FAIRSCALE_FUSION_SOLANA_WALLET_RE.test(wallet)) {
    return null;
  }

  const serviceId = typeof input.serviceId === 'string' ? input.serviceId.trim() : '';
  if (!serviceId || serviceId.length > SERVICE_ID_MAX_LENGTH) {
    return null;
  }

  const proofHash = typeof input.proofHash === 'string' ? input.proofHash.trim() : '';
  if (!proofHash || proofHash.length > PROOF_HASH_MAX_LENGTH) {
    return null;
  }

  const partnerRaw = typeof input.partner === 'string' ? input.partner.trim().toLowerCase() : '';
  const partner = partnerRaw || FAIRSCALE_FUSION_DEFAULT_PARTNER;
  if (!PARTNER_RE.test(partner)) {
    return null;
  }

  const timestampMs = normalizeFairscaleFusionTimestamp(input.timestampMs ?? Date.now());
  if (!Number.isFinite(timestampMs) || timestampMs <= 0) {
    return null;
  }

  const qualityScore = clampPercent(input.qualityScore);
  const refundPct = clampPercent(input.refundPct ?? 0);
  const metadata = normalizeMetadata(input.metadata);

  const canonicalPayload = canonicalFairscaleFusionPayload({
    partner,
    wallet,
    serviceId,
    qualityScore,
    refundPct,
    timestampMs,
    proofHash,
  });
  const eventId = typeof input.eventId === 'string' && input.eventId.trim()
    ? input.eventId.trim()
    : deriveFairscaleFusionEventId(canonicalPayload);

  try {
    return insertFairscaleFusionEvent({
      eventId,
      canonicalHash: hashFairscaleFusionHex(canonicalPayload),
      partner,
      wallet,
      serviceId,
      qualityScore,
      refundPct,
      timestampMs,
      proofHash,
      payloadJson: JSON.stringify({
        eventId,
        partner,
        wallet,
        serviceId,
        qualityScore,
        refundPct,
        timestampMs,
        proofHash,
        metadata,
      }),
      sourceSignature: hashFairscaleFusionHex(`internal:${canonicalPayload}`),
      keyId: input.keyId ?? 'kamiyo-internal',
    });
  } catch (error) {
    logger.error('Failed to emit FairScale fusion event', {
      wallet,
      serviceId,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}
