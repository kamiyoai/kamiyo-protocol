import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearConfigCache } from '../src/config';

const mockGetFairscaleTrustEventOutboxSummary = vi.fn();
const mockListFairscaleTrustEventOutbox = vi.fn();
const mockRequeueFairscaleTrustEvents = vi.fn();
const mockFlushFairscaleTrustEventsNow = vi.fn();

vi.mock('../src/db/queries', () => ({
  getFairscaleTrustEventOutboxSummary: mockGetFairscaleTrustEventOutboxSummary,
  listFairscaleTrustEventOutbox: mockListFairscaleTrustEventOutbox,
  requeueFairscaleTrustEvents: mockRequeueFairscaleTrustEvents,
}));

vi.mock('../src/services/fairscale-trust-sync', () => ({
  flushFairscaleTrustEventsNow: mockFlushFairscaleTrustEventsNow,
}));

function setBaseEnv(): void {
  process.env.SOLANA_RPC_URL = 'https://api.mainnet-beta.solana.com';
  process.env.FACILITATOR_PRIVATE_KEY = JSON.stringify(Array.from({ length: 64 }, (_, i) => i));
  process.env.TREASURY_WALLET = '11111111111111111111111111111111';
  process.env.DATABASE_URL = 'postgresql://localhost:5432/test';
  process.env.KIZUNA_ENABLED = 'true';
  process.env.KIZUNA_INTERNAL_TOKEN = 'internal-token';
  process.env.WALLET_CONTROL_PLANE_URL = 'https://wcp.local';
  process.env.CREDITS_INTERNAL_URL = 'https://credits.local';
  process.env.KIZUNA_KERNEL_URL = 'https://kernel.local';
  process.env.KIZUNA_KERNEL_SIGNING_KEYS = JSON.stringify({ kid1: 'secret-1' });
  process.env.KIZUNA_ENTERPRISE_POOL_ID = 'enterprise-main';
  process.env.KIZUNA_FASTPATH_POOL_ID = 'fastpath-main';
  process.env.FAIRSCALE_TRUST_EVENTS_URL = 'https://fairscale.test/kizuna/trust-events';
  process.env.FAIRSCALE_TRUST_EVENTS_KEY = 'staging-key';
}

function makeSummary(overrides: Record<string, unknown> = {}) {
  return {
    total_count: 3,
    pending_count: 2,
    ready_count: 1,
    leased_count: 1,
    retrying_count: 1,
    failed_count: 1,
    delivered_count: 1,
    oldest_pending_at: new Date('2026-03-16T10:00:00.000Z'),
    latest_delivered_at: new Date('2026-03-16T10:05:00.000Z'),
    latest_attempt_at: new Date('2026-03-16T10:06:00.000Z'),
    ...overrides,
  };
}

function makeRow(overrides: Record<string, unknown> = {}) {
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
      occurredAt: '2026-03-16T10:00:00.000Z',
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
    next_attempt_at: new Date('2026-03-16T10:10:00.000Z'),
    leased_until: null,
    last_attempt_at: new Date('2026-03-16T10:06:00.000Z'),
    last_http_status: 202,
    last_error: null,
    delivered_at: new Date('2026-03-16T10:05:00.000Z'),
    created_at: new Date('2026-03-16T10:00:00.000Z'),
    updated_at: new Date('2026-03-16T10:06:00.000Z'),
    ...overrides,
  };
}

type InvokeOptions = {
  body?: Record<string, unknown>;
  headers?: Record<string, unknown>;
  query?: Record<string, unknown>;
};

type InvokeResult = {
  statusCode: number;
  body: any;
};

async function invokeRoute(
  router: any,
  method: 'get' | 'post',
  path: string,
  options: InvokeOptions = {}
): Promise<InvokeResult> {
  const layer = router.stack.find(
    (entry: any) => entry.route?.path === path && entry.route?.methods?.[method]
  );
  if (!layer) throw new Error(`route_not_found:${method}:${path}`);

  const handlers = layer.route.stack.map((entry: any) => entry.handle);

  return new Promise<InvokeResult>((resolve, reject) => {
    const req: any = {
      body: options.body || {},
      headers: options.headers || {},
      params: {},
      query: options.query || {},
      get(name: string) {
        return this.headers[String(name).toLowerCase()];
      },
    };

    const res: any = {
      statusCode: 200,
      body: undefined,
      status(code: number) {
        this.statusCode = code;
        return this;
      },
      json(payload: unknown) {
        this.body = payload;
        resolve({ statusCode: this.statusCode, body: payload });
        return this;
      },
    };

    let index = 0;
    const next = (error?: unknown) => {
      if (error) {
        reject(error);
        return;
      }

      const handler = handlers[index];
      index += 1;
      if (!handler) {
        resolve({ statusCode: res.statusCode, body: res.body });
        return;
      }

      Promise.resolve(handler(req, res, next)).catch(reject);
    };

    next();
  });
}

describe('fairscale routes', () => {
  beforeEach(() => {
    setBaseEnv();
    clearConfigCache();
    vi.clearAllMocks();

    mockGetFairscaleTrustEventOutboxSummary.mockResolvedValue(makeSummary());
    mockListFairscaleTrustEventOutbox.mockResolvedValue([makeRow()]);
    mockRequeueFairscaleTrustEvents.mockResolvedValue(0);
    mockFlushFairscaleTrustEventsNow.mockResolvedValue({
      attempted: 1,
      delivered: 1,
      skipped: false,
    });
  });

  it('requires the internal token', async () => {
    const { createFairscaleRouter } = await import('../src/routes/fairscale');
    const router = createFairscaleRouter();

    const result = await invokeRoute(router, 'get', '/trust-sync');

    expect(result.statusCode).toBe(401);
    expect(result.body).toEqual({ error: 'Invalid internal token' });
    expect(mockGetFairscaleTrustEventOutboxSummary).not.toHaveBeenCalled();
  });

  it('returns FairScale queue status and recent events', async () => {
    const { createFairscaleRouter } = await import('../src/routes/fairscale');
    const router = createFairscaleRouter();

    const result = await invokeRoute(router, 'get', '/trust-sync', {
      headers: {
        authorization: 'Bearer internal-token',
      },
      query: {
        limit: '25',
      },
    });

    expect(result.statusCode).toBe(200);
    expect(mockListFairscaleTrustEventOutbox).toHaveBeenCalledWith(25);
    expect(result.body.configured).toBe(true);
    expect(result.body.config.eventsUrl).toBe('https://fairscale.test/kizuna/trust-events');
    expect(result.body.queue).toEqual({
      total: 3,
      pending: 2,
      ready: 1,
      leased: 1,
      retrying: 1,
      failed: 1,
      delivered: 1,
      oldestPendingAt: '2026-03-16T10:00:00.000Z',
      latestDeliveredAt: '2026-03-16T10:05:00.000Z',
      latestAttemptAt: '2026-03-16T10:06:00.000Z',
    });
    expect(result.body.recent[0]).toMatchObject({
      eventId: 'evt_1',
      eventType: 'settlement_confirmed',
      entityId: 'agent-1',
      attemptCount: 0,
      deliveredAt: '2026-03-16T10:05:00.000Z',
    });
  });

  it('flushes the queue on demand and returns the post-flush snapshot', async () => {
    const { createFairscaleRouter } = await import('../src/routes/fairscale');
    const router = createFairscaleRouter();

    mockGetFairscaleTrustEventOutboxSummary.mockResolvedValueOnce(
      makeSummary({
        total_count: 1,
        pending_count: 0,
        ready_count: 0,
        leased_count: 0,
        retrying_count: 0,
        failed_count: 0,
        delivered_count: 1,
      })
    );
    mockListFairscaleTrustEventOutbox.mockResolvedValueOnce([]);

    const result = await invokeRoute(router, 'post', '/trust-sync/flush', {
      headers: {
        authorization: 'Bearer internal-token',
      },
    });

    expect(result.statusCode).toBe(200);
    expect(mockFlushFairscaleTrustEventsNow).toHaveBeenCalledTimes(1);
    expect(result.body.flush).toEqual({
      attempted: 1,
      delivered: 1,
      skipped: false,
    });
    expect(result.body.queue.pending).toBe(0);
    expect(result.body.recent).toEqual([]);
  });

  it('requeues failed rows for immediate retry', async () => {
    const { createFairscaleRouter } = await import('../src/routes/fairscale');
    const router = createFairscaleRouter();

    mockRequeueFairscaleTrustEvents.mockResolvedValueOnce(2);
    mockGetFairscaleTrustEventOutboxSummary.mockResolvedValueOnce(
      makeSummary({
        pending_count: 2,
        ready_count: 2,
        leased_count: 0,
        retrying_count: 2,
      })
    );
    mockListFairscaleTrustEventOutbox.mockResolvedValueOnce([makeRow({ attempt_count: 2 })]);

    const result = await invokeRoute(router, 'post', '/trust-sync/requeue', {
      headers: {
        authorization: 'Bearer internal-token',
      },
      query: {
        failedOnly: 'true',
        limit: '100',
        recent: '5',
      },
    });

    expect(result.statusCode).toBe(200);
    expect(mockRequeueFairscaleTrustEvents).toHaveBeenCalledWith({
      failedOnly: true,
      limit: 100,
    });
    expect(mockListFairscaleTrustEventOutbox).toHaveBeenCalledWith(5);
    expect(result.body.requeue).toEqual({
      requeued: 2,
      failedOnly: true,
      limit: 100,
    });
    expect(result.body.queue.ready).toBe(2);
  });
});
