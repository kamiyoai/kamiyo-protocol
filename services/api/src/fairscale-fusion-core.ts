import { createHash } from 'node:crypto';

export const FAIRSCALE_FUSION_DEFAULT_PARTNER = 'fairscale';
export const FAIRSCALE_FUSION_SOLANA_WALLET_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export function normalizeFairscaleFusionTimestamp(rawTimestamp: number): number {
  if (!Number.isFinite(rawTimestamp)) return NaN;
  const rounded = Math.floor(rawTimestamp);
  if (rounded < 1_000_000_000_000) {
    return rounded * 1000;
  }
  return rounded;
}

export function roundFairscaleFusionNumber(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

export function canonicalFairscaleFusionPayload(event: {
  partner: string;
  wallet: string;
  serviceId: string;
  qualityScore: number;
  refundPct: number;
  timestampMs: number;
  proofHash: string;
}): string {
  return [
    event.partner,
    event.wallet,
    event.serviceId,
    event.qualityScore.toFixed(4),
    event.refundPct.toFixed(4),
    String(event.timestampMs),
    event.proofHash,
  ].join('|');
}

export function deriveFairscaleFusionEventId(payload: string): string {
  return createHash('sha256').update(payload).digest('hex').slice(0, 32);
}

export function hashFairscaleFusionHex(payload: string): string {
  return createHash('sha256').update(payload).digest('hex');
}
