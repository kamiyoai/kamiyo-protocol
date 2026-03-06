import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import rateLimit from 'express-rate-limit';
import { Router, Request, Response } from 'express';
import type { Router as IRouter } from 'express-serve-static-core';
import {
  FairscaleFusionEvent,
  getFairscaleFusionReliabilitySummary,
  insertFairscaleFusionEvent,
  listFairscaleFusionEvents,
} from '../../fairscale-fusion-store';
import { logger } from '../../logger';

const router: IRouter = Router();

const SOLANA_WALLET_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const DEFAULT_PARTNER = 'fairscale';
const DEFAULT_MAX_EVENT_AGE_MS = 365 * 24 * 60 * 60 * 1000;
const DEFAULT_MAX_FUTURE_SKEW_MS = 5 * 60 * 1000;
const PARTNER_RE = /^[a-z0-9][a-z0-9_-]{1,31}$/;

interface ParsedFusionEvent {
  eventId: string;
  partner: string;
  wallet: string;
  serviceId: string;
  qualityScore: number;
  refundPct: number;
  timestampMs: number;
  proofHash: string;
  metadata: Record<string, unknown>;
}

const ingestRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 600,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip || 'unknown',
  skip: (req) => req.method === 'OPTIONS',
  message: {
    error: {
      code: 'RATE_LIMITED',
      message: 'Too many ingest requests. Please retry later.',
    },
  },
});

const readRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 240,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip || 'unknown',
  skip: (req) => req.method === 'OPTIONS',
  message: {
    error: {
      code: 'RATE_LIMITED',
      message: 'Too many read requests. Please retry later.',
    },
  },
});

function getIngestSecret(): string {
  return process.env.FUSION_FAIRSCALE_HMAC_SECRET?.trim() || '';
}

function getReadToken(): string {
  return process.env.FUSION_FAIRSCALE_READ_TOKEN?.trim() || '';
}

function getFeedSigningSecret(): string {
  return (
    process.env.FUSION_FAIRSCALE_FEED_SIGNING_SECRET?.trim() ||
    process.env.FUSION_FAIRSCALE_HMAC_SECRET?.trim() ||
    ''
  );
}

function getMaxEventAgeMs(): number {
  const parsed = Number.parseInt(process.env.FUSION_FAIRSCALE_MAX_EVENT_AGE_MS || '', 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_MAX_EVENT_AGE_MS;
  return parsed;
}

function getMaxFutureSkewMs(): number {
  const parsed = Number.parseInt(process.env.FUSION_FAIRSCALE_MAX_FUTURE_SKEW_MS || '', 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_MAX_FUTURE_SKEW_MS;
  return parsed;
}

function sendError(res: Response, status: number, code: string, message: string): void {
  res.status(status).json({
    error: {
      code,
      message,
    },
  });
}

function parseString(body: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = body[key];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }
  return null;
}

function parseNumberValue(body: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const value = body[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === 'string' && value.trim().length > 0) {
      const parsed = Number.parseFloat(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }
  return null;
}

function normalizeTimestamp(rawTimestamp: number): number {
  if (!Number.isFinite(rawTimestamp)) return NaN;
  const rounded = Math.floor(rawTimestamp);
  if (rounded < 1_000_000_000_000) {
    return rounded * 1000;
  }
  return rounded;
}

function toFixedNumber(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function canonicalSignaturePayload(event: Omit<ParsedFusionEvent, 'eventId' | 'metadata'>): string {
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

function deriveEventId(payload: string): string {
  return createHash('sha256').update(payload).digest('hex').slice(0, 32);
}

function hashHex(payload: string): string {
  return createHash('sha256').update(payload).digest('hex');
}

function parseFusionEvent(body: unknown): { ok: true; event: ParsedFusionEvent } | { ok: false; message: string } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, message: 'Request body must be an object' };
  }

  const record = body as Record<string, unknown>;

  const partnerRaw = parseString(record, ['partner']);
  const partner = partnerRaw ? partnerRaw.toLowerCase() : DEFAULT_PARTNER;
  if (!PARTNER_RE.test(partner)) {
    return { ok: false, message: 'partner must match [a-z0-9_-], length 2-32' };
  }

  const wallet = parseString(record, ['wallet']);
  if (!wallet || !SOLANA_WALLET_RE.test(wallet)) {
    return { ok: false, message: 'wallet must be a valid Solana address' };
  }

  const serviceId = parseString(record, ['serviceId', 'service_id']);
  if (!serviceId || serviceId.length > 128) {
    return { ok: false, message: 'serviceId is required (max 128 chars)' };
  }

  const qualityScoreRaw = parseNumberValue(record, ['qualityScore', 'quality_score']);
  if (qualityScoreRaw === null || qualityScoreRaw < 0 || qualityScoreRaw > 100) {
    return { ok: false, message: 'qualityScore must be between 0 and 100' };
  }

  const refundPctRaw = parseNumberValue(record, ['refundPct', 'refund_pct']);
  if (refundPctRaw === null || refundPctRaw < 0 || refundPctRaw > 100) {
    return { ok: false, message: 'refundPct must be between 0 and 100' };
  }

  const timestampRaw = parseNumberValue(record, ['timestamp', 'timestampMs', 'timestamp_ms']);
  if (timestampRaw === null) {
    return { ok: false, message: 'timestamp is required' };
  }

  const timestampMs = normalizeTimestamp(timestampRaw);
  if (!Number.isFinite(timestampMs) || timestampMs <= 0) {
    return { ok: false, message: 'timestamp must be a valid unix timestamp (seconds or ms)' };
  }

  const proofHash = parseString(record, ['proofHash', 'proof_hash']);
  if (!proofHash || proofHash.length > 256) {
    return { ok: false, message: 'proofHash is required (max 256 chars)' };
  }

  const metadataValue = record.metadata;
  const metadata =
    metadataValue && typeof metadataValue === 'object' && !Array.isArray(metadataValue)
      ? (metadataValue as Record<string, unknown>)
      : {};

  const normalizedForSignature = {
    partner,
    wallet,
    serviceId,
    qualityScore: toFixedNumber(qualityScoreRaw),
    refundPct: toFixedNumber(refundPctRaw),
    timestampMs,
    proofHash,
  };

  const canonicalPayload = canonicalSignaturePayload(normalizedForSignature);
  const eventId =
    parseString(record, ['eventId', 'event_id']) || deriveEventId(canonicalPayload);

  const now = Date.now();
  const maxEventAgeMs = getMaxEventAgeMs();
  const maxFutureSkewMs = getMaxFutureSkewMs();

  if (timestampMs < now - maxEventAgeMs) {
    return { ok: false, message: 'timestamp is too old for ingest policy' };
  }

  if (timestampMs > now + maxFutureSkewMs) {
    return { ok: false, message: 'timestamp is too far in the future' };
  }

  return {
    ok: true,
    event: {
      eventId,
      partner,
      wallet,
      serviceId,
      qualityScore: normalizedForSignature.qualityScore,
      refundPct: normalizedForSignature.refundPct,
      timestampMs,
      proofHash,
      metadata,
    },
  };
}

function normalizeSignature(rawHeader: string | null): string | null {
  if (!rawHeader) return null;
  const trimmed = rawHeader.trim();
  const candidate = trimmed.startsWith('sha256=') ? trimmed.slice('sha256='.length) : trimmed;
  if (!/^[0-9a-fA-F]{64}$/.test(candidate)) return null;
  return candidate.toLowerCase();
}

function hmacHex(secret: string, payload: string): string {
  return createHmac('sha256', secret).update(payload).digest('hex');
}

function signaturesMatch(expectedHex: string, providedHex: string): boolean {
  const expected = Buffer.from(expectedHex, 'hex');
  const provided = Buffer.from(providedHex, 'hex');
  if (expected.length !== provided.length) return false;
  return timingSafeEqual(expected, provided);
}

function hasReadAccess(req: Request): boolean {
  const readToken = getReadToken();
  if (!readToken) return true;

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return false;

  const token = authHeader.slice('Bearer '.length).trim();
  return token === readToken;
}

function eventToFeedRecord(event: FairscaleFusionEvent): Record<string, unknown> {
  const base = {
    eventId: event.eventId,
    canonicalHash: event.canonicalHash,
    partner: event.partner,
    wallet: event.wallet,
    serviceId: event.serviceId,
    qualityScore: event.qualityScore,
    refundPct: event.refundPct,
    timestampMs: event.timestampMs,
    proofHash: event.proofHash,
    createdAt: event.createdAt,
    sourceSignature: event.sourceSignature,
    keyId: event.keyId,
  };

  const feedSecret = getFeedSigningSecret();
  if (!feedSecret) {
    return base;
  }

  const feedSignaturePayload = canonicalSignaturePayload({
    partner: event.partner,
    wallet: event.wallet,
    serviceId: event.serviceId,
    qualityScore: event.qualityScore,
    refundPct: event.refundPct,
    timestampMs: event.timestampMs,
    proofHash: event.proofHash,
  });

  return {
    ...base,
    feedSignature: hmacHex(feedSecret, feedSignaturePayload),
    signatureAlgorithm: 'hmac-sha256',
  };
}

router.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    partner: DEFAULT_PARTNER,
    ingestConfigured: Boolean(getIngestSecret()),
    readTokenRequired: Boolean(getReadToken()),
  });
});

router.post('/events', ingestRateLimiter, (req: Request, res: Response) => {
  const ingestSecret = getIngestSecret();
  if (!ingestSecret) {
    return sendError(res, 503, 'INGEST_NOT_CONFIGURED', 'FUSION_FAIRSCALE_HMAC_SECRET is not configured');
  }

  const parsed = parseFusionEvent(req.body);
  if (!parsed.ok) {
    return sendError(res, 400, 'INVALID_EVENT', parsed.message);
  }

  const providedSignature = normalizeSignature(
    typeof req.headers['x-kamiyo-signature'] === 'string'
      ? req.headers['x-kamiyo-signature']
      : null
  );

  if (!providedSignature) {
    return sendError(res, 401, 'INVALID_SIGNATURE', 'x-kamiyo-signature header is required');
  }

  const signaturePayload = canonicalSignaturePayload({
    partner: parsed.event.partner,
    wallet: parsed.event.wallet,
    serviceId: parsed.event.serviceId,
    qualityScore: parsed.event.qualityScore,
    refundPct: parsed.event.refundPct,
    timestampMs: parsed.event.timestampMs,
    proofHash: parsed.event.proofHash,
  });

  const expectedSignature = hmacHex(ingestSecret, signaturePayload);
  if (!signaturesMatch(expectedSignature, providedSignature)) {
    logger.warn('FairScale fusion ingest signature mismatch', {
      wallet: parsed.event.wallet,
      serviceId: parsed.event.serviceId,
      eventId: parsed.event.eventId,
    });
    return sendError(res, 401, 'INVALID_SIGNATURE', 'Signature mismatch');
  }

  const payloadJson = JSON.stringify({
    eventId: parsed.event.eventId,
    partner: parsed.event.partner,
    wallet: parsed.event.wallet,
    serviceId: parsed.event.serviceId,
    qualityScore: parsed.event.qualityScore,
    refundPct: parsed.event.refundPct,
    timestampMs: parsed.event.timestampMs,
    proofHash: parsed.event.proofHash,
    metadata: parsed.event.metadata,
  });

  try {
    const canonicalHash = hashHex(signaturePayload);
    const keyId = typeof req.headers['x-kamiyo-key-id'] === 'string' ? req.headers['x-kamiyo-key-id'].trim() : null;
    const inserted = insertFairscaleFusionEvent({
      eventId: parsed.event.eventId,
      canonicalHash,
      partner: parsed.event.partner,
      wallet: parsed.event.wallet,
      serviceId: parsed.event.serviceId,
      qualityScore: parsed.event.qualityScore,
      refundPct: parsed.event.refundPct,
      timestampMs: parsed.event.timestampMs,
      proofHash: parsed.event.proofHash,
      payloadJson,
      sourceSignature: providedSignature,
      keyId,
    });

    res.status(inserted.inserted ? 202 : 200).json({
      ok: true,
      idempotent: !inserted.inserted,
      event: eventToFeedRecord(inserted.event),
    });
  } catch (error) {
    logger.error('Failed to persist FairScale fusion event', {
      error: error instanceof Error ? error.message : String(error),
      eventId: parsed.event.eventId,
      wallet: parsed.event.wallet,
    });
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to persist event');
  }
});

router.get('/events', readRateLimiter, (req: Request, res: Response) => {
  if (!hasReadAccess(req)) {
    return sendError(res, 401, 'UNAUTHORIZED', 'Missing or invalid read token');
  }

  const wallet = typeof req.query.wallet === 'string' ? req.query.wallet.trim() : undefined;
  if (wallet && !SOLANA_WALLET_RE.test(wallet)) {
    return sendError(res, 400, 'INVALID_WALLET', 'wallet must be a valid Solana address');
  }

  const sinceMsRaw = typeof req.query.since_ms === 'string' ? Number.parseInt(req.query.since_ms, 10) : undefined;
  const sinceMs = Number.isFinite(sinceMsRaw) ? sinceMsRaw : undefined;

  const limitRaw = typeof req.query.limit === 'string' ? Number.parseInt(req.query.limit, 10) : undefined;
  const limit = Number.isFinite(limitRaw) ? limitRaw : 100;

  const partner =
    typeof req.query.partner === 'string' && req.query.partner.trim().length > 0
      ? req.query.partner.trim().toLowerCase()
      : DEFAULT_PARTNER;

  const events = listFairscaleFusionEvents({
    partner,
    wallet,
    sinceMs,
    limit,
  });

  res.json({
    ok: true,
    partner,
    count: events.length,
    events: events.map(eventToFeedRecord),
  });
});

router.get('/reliability/:wallet', readRateLimiter, (req: Request, res: Response) => {
  if (!hasReadAccess(req)) {
    return sendError(res, 401, 'UNAUTHORIZED', 'Missing or invalid read token');
  }

  const wallet = req.params.wallet?.trim();
  if (!wallet || !SOLANA_WALLET_RE.test(wallet)) {
    return sendError(res, 400, 'INVALID_WALLET', 'wallet must be a valid Solana address');
  }

  const windowDaysRaw = typeof req.query.window_days === 'string' ? Number.parseInt(req.query.window_days, 10) : 30;
  const windowDays = Number.isFinite(windowDaysRaw) ? windowDaysRaw : 30;

  const serviceLimitRaw =
    typeof req.query.service_limit === 'string' ? Number.parseInt(req.query.service_limit, 10) : 10;
  const serviceLimit = Number.isFinite(serviceLimitRaw) ? serviceLimitRaw : 10;

  try {
    const summary = getFairscaleFusionReliabilitySummary(wallet, windowDays, serviceLimit);
    res.json({ ok: true, ...summary });
  } catch (error) {
    logger.error('Failed to load FairScale reliability summary', {
      wallet,
      error: error instanceof Error ? error.message : String(error),
    });
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to load reliability summary');
  }
});

export default router;
