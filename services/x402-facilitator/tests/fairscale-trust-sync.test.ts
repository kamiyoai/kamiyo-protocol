import { createHmac } from 'crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockLeaseFairscaleTrustEventBatch = vi.fn();
const mockMarkFairscaleTrustEventsDelivered = vi.fn();
const mockMarkFairscaleTrustEventAttemptFailed = vi.fn();
const mockGetConfig = vi.fn();
const mockFetch = vi.fn();

vi.mock('../src/config', () => ({
  getConfig: mockGetConfig,
}));

vi.mock('../src/db/queries', () => ({
  leaseFairscaleTrustEventBatch: mockLeaseFairscaleTrustEventBatch,
  markFairscaleTrustEventsDelivered: mockMarkFairscaleTrustEventsDelivered,
  markFairscaleTrustEventAttemptFailed: mockMarkFairscaleTrustEventAttemptFailed,
}));

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

function makeConfig(overrides: Record<string, unknown> = {}) {
  return {
    FAIRSCALE_TRUST_EVENTS_URL: '',
    FAIRSCALE_TRUST_EVENTS_KEY: '',
    FAIRSCALE_TRUST_EVENTS_KEY_HEADER: 'x-kizuna-key',
    FAIRSCALE_TRUST_EVENTS_SIGNATURE_MODE: 'disabled',
    FAIRSCALE_TRUST_EVENTS_SIGNATURE_HEADER: 'x-kizuna-signature',
    FAIRSCALE_TRUST_EVENTS_HMAC_SECRET: '',
    FAIRSCALE_TRUST_EVENTS_EVENT_SIGNATURE_FIELD: '',
    FAIRSCALE_TRUST_EVENTS_BATCH_SIZE: 50,
    FAIRSCALE_TRUST_EVENTS_FLUSH_INTERVAL_MS: 5000,
    FAIRSCALE_TRUST_EVENTS_TIMEOUT_MS: 5000,
    FAIRSCALE_TRUST_EVENTS_LEASE_MS: 30000,
    FAIRSCALE_TRUST_EVENTS_MAX_RETRY_MS: 300000,
    ...overrides,
  };
}

function makeOutboxRow(overrides: Record<string, unknown> = {}) {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    event_id: 'evt_1',
    event_type: 'settlement_confirmed',
    entity_id: 'agent-1',
    idempotency_key: 'settlement:1:1',
    payload: {
      eventId: 'evt_1',
      entityId: 'agent-1',
      eventType: 'settlement_confirmed',
      occurredAt: '2026-03-13T10:00:00.000Z',
      lane: 'enterprise',
      poolId: 'enterprise-main',
      network: 'eip155:8453',
      amountMicro: '1000000',
      currency: 'USDC',
      txHash: '0xsettle',
      referenceId: null,
      settlementId: 'settlement-1',
      reservationId: 'reservation-1',
      debtId: null,
      payerWallet: '0x1111111111111111111111111111111111111111',
      repayWallet: '0x2222222222222222222222222222222222222222',
      merchantWallet: '0x3333333333333333333333333333333333333333',
      collateralAccount: null,
      assetId: null,
      metadata: {
        decisionId: 'decision-1',
      },
    },
    attempt_count: 0,
    next_attempt_at: new Date('2026-03-13T10:00:00.000Z'),
    leased_until: null,
    last_attempt_at: null,
    last_http_status: null,
    last_error: null,
    delivered_at: null,
    created_at: new Date('2026-03-13T10:00:00.000Z'),
    updated_at: new Date('2026-03-13T10:00:00.000Z'),
    ...overrides,
  };
}

describe('fairscale trust sync', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(async () => {
    const { __resetFairscaleTrustSyncForTests } = await import('../src/services/fairscale-trust-sync');
    __resetFairscaleTrustSyncForTests();
    vi.unstubAllGlobals();
  });

  it('skips delivery when FairScale is not configured', async () => {
    mockGetConfig.mockReturnValue(makeConfig());

    const { flushFairscaleTrustEventsOnce } = await import('../src/services/fairscale-trust-sync');
    const result = await flushFairscaleTrustEventsOnce();

    expect(result).toEqual({ attempted: 0, delivered: 0, skipped: true });
    expect(mockLeaseFairscaleTrustEventBatch).not.toHaveBeenCalled();
  });

  it('posts a signed batch and marks rows delivered', async () => {
    const row = makeOutboxRow();
    mockGetConfig.mockReturnValue(
      makeConfig({
        FAIRSCALE_TRUST_EVENTS_URL: 'https://fairscale.test/kizuna/trust-events',
        FAIRSCALE_TRUST_EVENTS_KEY: 'staging-key',
        FAIRSCALE_TRUST_EVENTS_SIGNATURE_MODE: 'hmac-sha256-body',
        FAIRSCALE_TRUST_EVENTS_HMAC_SECRET: 'staging-secret',
        FAIRSCALE_TRUST_EVENTS_EVENT_SIGNATURE_FIELD: 'signature',
      })
    );
    mockLeaseFairscaleTrustEventBatch.mockResolvedValue([row]);
    mockFetch.mockResolvedValue({
      ok: true,
      status: 202,
    });

    const { flushFairscaleTrustEventsOnce } = await import('../src/services/fairscale-trust-sync');
    const result = await flushFairscaleTrustEventsOnce();

    expect(result).toEqual({ attempted: 1, delivered: 1, skipped: false });
    expect(mockLeaseFairscaleTrustEventBatch).toHaveBeenCalledWith(50, 30000);
    expect(mockFetch).toHaveBeenCalledTimes(1);

    const [url, request] = mockFetch.mock.calls[0];
    expect(url).toBe('https://fairscale.test/kizuna/trust-events');
    expect(request.method).toBe('POST');

    const parsedBody = JSON.parse(request.body);
    const [event] = parsedBody.events;
    const unsignedEvent = { ...event };
    delete unsignedEvent.signature;

    expect(event.signature).toBe(
      createHmac('sha256', 'staging-secret')
        .update(JSON.stringify(canonicalize(unsignedEvent)))
        .digest('hex')
    );
    expect(request.headers['x-kizuna-key']).toBe('staging-key');
    expect(request.headers['x-kizuna-signature']).toBe(
      createHmac('sha256', 'staging-secret').update(request.body).digest('hex')
    );
    expect(mockMarkFairscaleTrustEventsDelivered).toHaveBeenCalledWith(
      ['11111111-1111-1111-1111-111111111111'],
      202
    );
  });

  it('requeues rows on delivery failure', async () => {
    const row = makeOutboxRow({ attempt_count: 2 });
    mockGetConfig.mockReturnValue(
      makeConfig({
        FAIRSCALE_TRUST_EVENTS_URL: 'https://fairscale.test/kizuna/trust-events',
        FAIRSCALE_TRUST_EVENTS_KEY: 'staging-key',
      })
    );
    mockLeaseFairscaleTrustEventBatch.mockResolvedValue([row]);
    mockFetch.mockResolvedValue({
      ok: false,
      status: 503,
      text: vi.fn().mockResolvedValue('upstream unavailable'),
    });

    const { flushFairscaleTrustEventsOnce } = await import('../src/services/fairscale-trust-sync');
    const result = await flushFairscaleTrustEventsOnce();

    expect(result).toEqual({ attempted: 1, delivered: 0, skipped: false });
    expect(mockMarkFairscaleTrustEventsDelivered).not.toHaveBeenCalled();
    expect(mockMarkFairscaleTrustEventAttemptFailed).toHaveBeenCalledTimes(1);

    const failure = mockMarkFairscaleTrustEventAttemptFailed.mock.calls[0][0];
    expect(failure.id).toBe('11111111-1111-1111-1111-111111111111');
    expect(failure.httpStatus).toBe(503);
    expect(failure.error).toContain('upstream unavailable');
    expect(failure.nextAttemptAt).toBeInstanceOf(Date);
  });
});
