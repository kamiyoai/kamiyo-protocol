import { createHmac } from 'crypto';
import { getConfig } from '../config';
import {
  leaseFairscaleTrustEventBatch,
  markFairscaleTrustEventAttemptFailed,
  markFairscaleTrustEventsDelivered,
  type FairscaleTrustEventOutboxRow,
} from '../db/queries';

type FlushResult = {
  attempted: number;
  delivered: number;
  skipped: boolean;
};

let flushTimer: NodeJS.Timeout | null = null;
let flushInFlight: Promise<void> | null = null;

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => canonicalize(entry));
  }
  if (!value || typeof value !== 'object') {
    return value;
  }

  const record = value as Record<string, unknown>;
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(record).sort()) {
    sorted[key] = canonicalize(record[key]);
  }
  return sorted;
}

function canonicalString(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function compactRecord(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== null && entry !== undefined && entry !== '')
  );
}

function getRequestUrl(): string {
  return getConfig().FAIRSCALE_TRUST_EVENTS_URL.replace(/\/+$/, '');
}

function isConfigured(): boolean {
  const config = getConfig();
  return config.FAIRSCALE_TRUST_EVENTS_URL.trim().length > 0 && config.FAIRSCALE_TRUST_EVENTS_KEY.trim().length > 0;
}

function buildEventBody(row: FairscaleTrustEventOutboxRow): Record<string, unknown> {
  const config = getConfig();
  const baseEvent = compactRecord({
    eventId: row.payload.eventId,
    entityId: row.payload.entityId,
    eventType: row.payload.eventType,
    occurredAt: row.payload.occurredAt,
    lane: row.payload.lane,
    poolId: row.payload.poolId,
    network: row.payload.network,
    amountMicro: row.payload.amountMicro,
    currency: row.payload.currency,
    txHash: row.payload.txHash,
    referenceId: row.payload.referenceId,
    settlementId: row.payload.settlementId,
    reservationId: row.payload.reservationId,
    debtId: row.payload.debtId,
    payerWallet: row.payload.payerWallet,
    repayWallet: row.payload.repayWallet,
    merchantWallet: row.payload.merchantWallet,
    collateralAccount: row.payload.collateralAccount,
    assetId: row.payload.assetId,
    metadata: row.payload.metadata,
  });

  if (!config.FAIRSCALE_TRUST_EVENTS_EVENT_SIGNATURE_FIELD) {
    return baseEvent;
  }

  if (!config.FAIRSCALE_TRUST_EVENTS_HMAC_SECRET) {
    return baseEvent;
  }

  return {
    ...baseEvent,
    [config.FAIRSCALE_TRUST_EVENTS_EVENT_SIGNATURE_FIELD]: createHmac(
      'sha256',
      config.FAIRSCALE_TRUST_EVENTS_HMAC_SECRET
    )
      .update(canonicalString(baseEvent))
      .digest('hex'),
  };
}

function buildRequest(body: { events: Record<string, unknown>[] }): {
  payload: string;
  headers: Record<string, string>;
} {
  const config = getConfig();
  const payload = JSON.stringify(body);
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    [config.FAIRSCALE_TRUST_EVENTS_KEY_HEADER]: config.FAIRSCALE_TRUST_EVENTS_KEY,
  };

  if (
    config.FAIRSCALE_TRUST_EVENTS_SIGNATURE_MODE === 'hmac-sha256-body' &&
    config.FAIRSCALE_TRUST_EVENTS_HMAC_SECRET
  ) {
    headers[config.FAIRSCALE_TRUST_EVENTS_SIGNATURE_HEADER] = createHmac(
      'sha256',
      config.FAIRSCALE_TRUST_EVENTS_HMAC_SECRET
    )
      .update(payload)
      .digest('hex');
  }

  return { payload, headers };
}

function computeNextAttemptAt(attemptCount: number): Date {
  const config = getConfig();
  const delayMs = Math.min(
    config.FAIRSCALE_TRUST_EVENTS_MAX_RETRY_MS,
    5_000 * 2 ** Math.max(0, attemptCount)
  );
  return new Date(Date.now() + delayMs);
}

async function postBatch(batch: FairscaleTrustEventOutboxRow[]): Promise<number> {
  const { payload, headers } = buildRequest({
    events: batch.map((entry) => buildEventBody(entry)),
  });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), getConfig().FAIRSCALE_TRUST_EVENTS_TIMEOUT_MS);

  try {
    const response = await fetch(getRequestUrl(), {
      method: 'POST',
      headers,
      body: payload,
      signal: controller.signal,
    });

    if (!response.ok) {
      const responseText = (await response.text().catch(() => '')).trim();
      throw new Error(
        `fairscale_trust_sync_http_${response.status}:${responseText || 'request_failed'}`
      );
    }

    return response.status;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('fairscale_trust_sync_timeout');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function flushFairscaleTrustEventsOnce(): Promise<FlushResult> {
  if (!isConfigured()) {
    return { attempted: 0, delivered: 0, skipped: true };
  }

  const config = getConfig();
  const batch = await leaseFairscaleTrustEventBatch(
    config.FAIRSCALE_TRUST_EVENTS_BATCH_SIZE,
    config.FAIRSCALE_TRUST_EVENTS_LEASE_MS
  );

  if (!batch.length) {
    return { attempted: 0, delivered: 0, skipped: false };
  }

  try {
    const status = await postBatch(batch);
    await markFairscaleTrustEventsDelivered(
      batch.map((entry) => entry.id),
      status
    );
    return { attempted: batch.length, delivered: batch.length, skipped: false };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'fairscale_trust_sync_failed';
    await Promise.all(
      batch.map((entry) =>
        markFairscaleTrustEventAttemptFailed({
          id: entry.id,
          error: message,
          httpStatus: Number(message.match(/http_(\d+)/)?.[1] || 0) || null,
          nextAttemptAt: computeNextAttemptAt(entry.attempt_count),
        })
      )
    );
    console.error('[fairscale] trust sync failed', message);
    return { attempted: batch.length, delivered: 0, skipped: false };
  }
}

async function tick(): Promise<void> {
  for (let i = 0; i < 5; i += 1) {
    const result = await flushFairscaleTrustEventsOnce();
    if (result.skipped || result.attempted === 0 || result.delivered === 0) {
      return;
    }
  }
}

function runTick(): void {
  if (flushInFlight) {
    return;
  }

  flushInFlight = tick()
    .catch((error) => {
      console.error('[fairscale] trust sync tick failed', error instanceof Error ? error.message : error);
    })
    .finally(() => {
      flushInFlight = null;
    });
}

export function startFairscaleTrustSync(): void {
  if (flushTimer) {
    return;
  }

  flushTimer = setInterval(runTick, getConfig().FAIRSCALE_TRUST_EVENTS_FLUSH_INTERVAL_MS);
  flushTimer.unref?.();
  runTick();
}

export async function stopFairscaleTrustSync(): Promise<void> {
  if (flushTimer) {
    clearInterval(flushTimer);
    flushTimer = null;
  }
  if (flushInFlight) {
    await flushInFlight;
  }
}

export function __resetFairscaleTrustSyncForTests(): void {
  if (flushTimer) {
    clearInterval(flushTimer);
    flushTimer = null;
  }
  flushInFlight = null;
}
