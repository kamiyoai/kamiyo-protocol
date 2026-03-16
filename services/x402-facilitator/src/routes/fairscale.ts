import { Router, Request, Response, NextFunction } from 'express';
import { getConfig } from '../config';
import {
  getFairscaleTrustEventOutboxSummary,
  listFairscaleTrustEventOutbox,
  requeueFairscaleTrustEvents,
  type FairscaleTrustEventOutboxRow,
  type FairscaleTrustEventOutboxSummary,
} from '../db/queries';
import { internalTokenAuth } from '../middleware/auth';
import { flushFairscaleTrustEventsNow } from '../services/fairscale-trust-sync';

function sendError(res: Response, status: number, error: string): void {
  res.status(status).json({ error });
}

function ensureKizunaEnabled(_req: Request, res: Response, next: NextFunction): void {
  if (!getConfig().KIZUNA_ENABLED) {
    sendError(res, 404, 'Kizuna is disabled');
    return;
  }
  next();
}

function parseRecentLimit(value: unknown): number {
  if (typeof value === 'string') {
    const parsed = parseInt(value, 10);
    if (Number.isSafeInteger(parsed) && parsed > 0) {
      return Math.min(parsed, 50);
    }
  }
  return 10;
}

function parseBatchLimit(value: unknown, fallback: number, max: number): number {
  if (typeof value === 'string') {
    const parsed = parseInt(value, 10);
    if (Number.isSafeInteger(parsed) && parsed > 0) {
      return Math.min(parsed, max);
    }
  }
  return fallback;
}

function parseBooleanFlag(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
}

function toIso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function isFairscaleConfigured(): boolean {
  const config = getConfig();
  return (
    config.FAIRSCALE_TRUST_EVENTS_URL.trim().length > 0 &&
    config.FAIRSCALE_TRUST_EVENTS_KEY.trim().length > 0
  );
}

function serializeQueue(summary: FairscaleTrustEventOutboxSummary) {
  return {
    total: summary.total_count,
    pending: summary.pending_count,
    ready: summary.ready_count,
    leased: summary.leased_count,
    retrying: summary.retrying_count,
    failed: summary.failed_count,
    delivered: summary.delivered_count,
    oldestPendingAt: toIso(summary.oldest_pending_at),
    latestDeliveredAt: toIso(summary.latest_delivered_at),
    latestAttemptAt: toIso(summary.latest_attempt_at),
  };
}

function serializeEvent(row: FairscaleTrustEventOutboxRow) {
  return {
    id: row.id,
    eventId: row.event_id,
    eventType: row.event_type,
    entityId: row.entity_id,
    idempotencyKey: row.idempotency_key,
    payload: row.payload,
    attemptCount: row.attempt_count,
    nextAttemptAt: toIso(row.next_attempt_at),
    leasedUntil: toIso(row.leased_until),
    lastAttemptAt: toIso(row.last_attempt_at),
    lastHttpStatus: row.last_http_status,
    lastError: row.last_error,
    deliveredAt: toIso(row.delivered_at),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

function buildConfigSummary() {
  const config = getConfig();
  return {
    eventsUrl: config.FAIRSCALE_TRUST_EVENTS_URL || null,
    keyHeader: config.FAIRSCALE_TRUST_EVENTS_KEY_HEADER,
    signatureMode: config.FAIRSCALE_TRUST_EVENTS_SIGNATURE_MODE,
    signatureHeader:
      config.FAIRSCALE_TRUST_EVENTS_SIGNATURE_MODE === 'hmac-sha256-body'
        ? config.FAIRSCALE_TRUST_EVENTS_SIGNATURE_HEADER
        : null,
    eventSignatureField: config.FAIRSCALE_TRUST_EVENTS_EVENT_SIGNATURE_FIELD || null,
    batchSize: config.FAIRSCALE_TRUST_EVENTS_BATCH_SIZE,
    flushIntervalMs: config.FAIRSCALE_TRUST_EVENTS_FLUSH_INTERVAL_MS,
    timeoutMs: config.FAIRSCALE_TRUST_EVENTS_TIMEOUT_MS,
    leaseMs: config.FAIRSCALE_TRUST_EVENTS_LEASE_MS,
    maxRetryMs: config.FAIRSCALE_TRUST_EVENTS_MAX_RETRY_MS,
  };
}

export function createFairscaleRouter(): Router {
  const router = Router();

  router.get('/trust-sync', ensureKizunaEnabled, internalTokenAuth, async (req: Request, res: Response) => {
    const limit = parseRecentLimit(req.query.limit);
    const [summary, recent] = await Promise.all([
      getFairscaleTrustEventOutboxSummary(),
      listFairscaleTrustEventOutbox(limit),
    ]);

    res.json({
      configured: isFairscaleConfigured(),
      config: buildConfigSummary(),
      queue: serializeQueue(summary),
      recent: recent.map(serializeEvent),
    });
  });

  router.post(
    '/trust-sync/flush',
    ensureKizunaEnabled,
    internalTokenAuth,
    async (req: Request, res: Response) => {
      const limit = parseRecentLimit(req.query.limit);
      const flush = await flushFairscaleTrustEventsNow();
      const [summary, recent] = await Promise.all([
        getFairscaleTrustEventOutboxSummary(),
        listFairscaleTrustEventOutbox(limit),
      ]);

      res.json({
        configured: isFairscaleConfigured(),
        flush,
        queue: serializeQueue(summary),
        recent: recent.map(serializeEvent),
      });
    }
  );

  router.post(
    '/trust-sync/requeue',
    ensureKizunaEnabled,
    internalTokenAuth,
    async (req: Request, res: Response) => {
      const limit = parseBatchLimit(req.query.limit, 50, 200);
      const failedOnly = parseBooleanFlag(req.query.failedOnly);
      const recentLimit = parseRecentLimit(req.query.recent);
      const requeued = await requeueFairscaleTrustEvents({
        limit,
        failedOnly,
      });
      const [summary, recent] = await Promise.all([
        getFairscaleTrustEventOutboxSummary(),
        listFairscaleTrustEventOutbox(recentLimit),
      ]);

      res.json({
        configured: isFairscaleConfigured(),
        requeue: {
          requeued,
          failedOnly,
          limit,
        },
        queue: serializeQueue(summary),
        recent: recent.map(serializeEvent),
      });
    }
  );

  return router;
}
