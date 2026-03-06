import { beforeAll, beforeEach, afterAll, describe, expect, it } from 'vitest';
import express from 'express';
import http from 'http';
import { createHmac } from 'node:crypto';

let fusionRoutes: express.Router;
let resetFusionStore: () => Promise<void>;

function startServer(app: express.Express): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  return new Promise((resolve) => {
    const server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        throw new Error('Failed to bind test server');
      }
      resolve({
        baseUrl: `http://127.0.0.1:${address.port}`,
        close: () =>
          new Promise((done) => {
            server.close(() => done());
          }),
      });
    });
  });
}

function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function canonicalPayload(event: {
  partner?: string;
  wallet: string;
  serviceId: string;
  qualityScore: number;
  refundPct: number;
  timestampMs: number;
  proofHash: string;
}): string {
  const partner = (event.partner || 'fairscale').toLowerCase();
  return [
    partner,
    event.wallet,
    event.serviceId,
    round4(event.qualityScore).toFixed(4),
    round4(event.refundPct).toFixed(4),
    String(Math.floor(event.timestampMs)),
    event.proofHash,
  ].join('|');
}

function signEvent(
  event: {
    partner?: string;
    wallet: string;
    serviceId: string;
    qualityScore: number;
    refundPct: number;
    timestampMs: number;
    proofHash: string;
  },
  secret: string
): string {
  return createHmac('sha256', secret).update(canonicalPayload(event)).digest('hex');
}

describe('FairScale fusion routes', () => {
  const previousIngestSecret = process.env.FUSION_FAIRSCALE_HMAC_SECRET;
  const previousReadToken = process.env.FUSION_FAIRSCALE_READ_TOKEN;
  const previousFeedSecret = process.env.FUSION_FAIRSCALE_FEED_SIGNING_SECRET;
  const previousDatabaseUrl = process.env.FUSION_FAIRSCALE_DATABASE_URL;

  beforeAll(async () => {
    process.env.FUSION_FAIRSCALE_HMAC_SECRET = 'fusion-test-ingest-secret';
    process.env.FUSION_FAIRSCALE_READ_TOKEN = 'fusion-read-token';
    process.env.FUSION_FAIRSCALE_FEED_SIGNING_SECRET = 'fusion-feed-sign-secret';
    delete process.env.FUSION_FAIRSCALE_DATABASE_URL;

    const routeModule = await import('../api/routes/fairscale-fusion');
    fusionRoutes = routeModule.default;

    const storeModule = await import('../fairscale-fusion-store');
    resetFusionStore = storeModule.__resetFairscaleFusionStoreForTests;
  });

  beforeEach(() => {
    return resetFusionStore();
  });

  afterAll(() => {
    if (previousIngestSecret === undefined) delete process.env.FUSION_FAIRSCALE_HMAC_SECRET;
    else process.env.FUSION_FAIRSCALE_HMAC_SECRET = previousIngestSecret;

    if (previousReadToken === undefined) delete process.env.FUSION_FAIRSCALE_READ_TOKEN;
    else process.env.FUSION_FAIRSCALE_READ_TOKEN = previousReadToken;

    if (previousFeedSecret === undefined) delete process.env.FUSION_FAIRSCALE_FEED_SIGNING_SECRET;
    else process.env.FUSION_FAIRSCALE_FEED_SIGNING_SECRET = previousFeedSecret;

    if (previousDatabaseUrl === undefined) delete process.env.FUSION_FAIRSCALE_DATABASE_URL;
    else process.env.FUSION_FAIRSCALE_DATABASE_URL = previousDatabaseUrl;
  });

  it('rejects ingest without signature header', async () => {
    const app = express();
    app.use(express.json());
    app.use('/api/fusion/fairscale', fusionRoutes);

    const { baseUrl, close } = await startServer(app);
    try {
      const response = await fetch(`${baseUrl}/api/fusion/fairscale/events`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          wallet: '7YWH4UqQqER4CHQxJz5N6Q9qM5rV7sB8w2K3dFgHjLmN',
          serviceId: 'api.inference.v1',
          qualityScore: 92,
          refundPct: 0,
          timestampMs: Date.now(),
          proofHash: 'proof_hash_1',
        }),
      });

      expect(response.status).toBe(401);
    } finally {
      await close();
    }
  });

  it('reports storage backend in health', async () => {
    const app = express();
    app.use(express.json());
    app.use('/api/fusion/fairscale', fusionRoutes);

    const { baseUrl, close } = await startServer(app);
    try {
      const response = await fetch(`${baseUrl}/api/fusion/fairscale/health`);
      expect(response.status).toBe(200);

      const body = (await response.json()) as {
        status: string;
        storage: { backend: string; durable: boolean; databaseUrlConfigured: boolean };
      };

      expect(body.status).toBe('ok');
      expect(body.storage.backend).toBe('sqlite');
      expect(body.storage.durable).toBe(false);
      expect(body.storage.databaseUrlConfigured).toBe(false);
    } finally {
      await close();
    }
  });

  it('ingests signed events and handles idempotent replays', async () => {
    const app = express();
    app.use(express.json());
    app.use('/api/fusion/fairscale', fusionRoutes);

    const { baseUrl, close } = await startServer(app);

    const payload = {
      wallet: '9J6kV8rQw1Nf4Pz7Xc2mT5hB8yD3uK6sL4aQ1wE7rYpC',
      serviceId: 'api.inference.v1',
      qualityScore: 88.5,
      refundPct: 12.5,
      timestampMs: Date.now(),
      proofHash: 'proof_hash_2',
    };

    const signature = signEvent(payload, 'fusion-test-ingest-secret');

    try {
      const first = await fetch(`${baseUrl}/api/fusion/fairscale/events`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-kamiyo-signature': signature,
        },
        body: JSON.stringify(payload),
      });
      expect(first.status).toBe(202);
      const firstBody = (await first.json()) as { ok: boolean; idempotent: boolean };
      expect(firstBody.ok).toBe(true);
      expect(firstBody.idempotent).toBe(false);

      const second = await fetch(`${baseUrl}/api/fusion/fairscale/events`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-kamiyo-signature': signature,
        },
        body: JSON.stringify(payload),
      });
      expect(second.status).toBe(200);
      const secondBody = (await second.json()) as { ok: boolean; idempotent: boolean };
      expect(secondBody.ok).toBe(true);
      expect(secondBody.idempotent).toBe(true);

      const third = await fetch(`${baseUrl}/api/fusion/fairscale/events`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-kamiyo-signature': signature,
        },
        body: JSON.stringify({ ...payload, eventId: 'fairscale_override_id' }),
      });
      expect(third.status).toBe(200);
      const thirdBody = (await third.json()) as { ok: boolean; idempotent: boolean };
      expect(thirdBody.ok).toBe(true);
      expect(thirdBody.idempotent).toBe(true);

      const unauthorized = await fetch(`${baseUrl}/api/fusion/fairscale/events`);
      expect(unauthorized.status).toBe(401);

      const listed = await fetch(`${baseUrl}/api/fusion/fairscale/events`, {
        headers: { authorization: 'Bearer fusion-read-token' },
      });
      expect(listed.status).toBe(200);
      const listedBody = (await listed.json()) as {
        ok: boolean;
        count: number;
        events: Array<{ feedSignature?: string }>;
      };
      expect(listedBody.ok).toBe(true);
      expect(listedBody.count).toBeGreaterThanOrEqual(1);
      expect(typeof listedBody.events[0]?.feedSignature).toBe('string');
    } finally {
      await close();
    }
  });

  it('returns wallet reliability metrics', async () => {
    const app = express();
    app.use(express.json());
    app.use('/api/fusion/fairscale', fusionRoutes);

    const { baseUrl, close } = await startServer(app);

    const wallet = '8Pq4tR7sW2dX9hK5mN3vB6yL1cF8uJ4qT7rY2wE5pHnA';
    const timestampMs = Date.now();

    const events = [
      {
        wallet,
        serviceId: 'api.inference.v1',
        qualityScore: 91,
        refundPct: 0,
        timestampMs,
        proofHash: 'proof_hash_3',
      },
      {
        wallet,
        serviceId: 'api.inference.v1',
        qualityScore: 70,
        refundPct: 35,
        timestampMs: timestampMs + 1,
        proofHash: 'proof_hash_4',
      },
      {
        wallet,
        serviceId: 'api.vision.v1',
        qualityScore: 82,
        refundPct: 10,
        timestampMs: timestampMs + 2,
        proofHash: 'proof_hash_5',
      },
    ];

    try {
      for (const event of events) {
        const signature = signEvent(event, 'fusion-test-ingest-secret');
        const response = await fetch(`${baseUrl}/api/fusion/fairscale/events`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-kamiyo-signature': signature,
          },
          body: JSON.stringify(event),
        });
        expect(response.status).toBe(202);
      }

      const response = await fetch(
        `${baseUrl}/api/fusion/fairscale/reliability/${wallet}?window_days=30&service_limit=5`,
        {
          headers: { authorization: 'Bearer fusion-read-token' },
        }
      );

      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        ok: boolean;
        sampleSize: number;
        avgQualityScore: number;
        services: Array<{ serviceId: string; sampleSize: number }>;
      };

      expect(body.ok).toBe(true);
      expect(body.sampleSize).toBe(3);
      expect(body.avgQualityScore).toBeGreaterThan(0);
      expect(body.services.length).toBeGreaterThan(0);
      expect(body.services.some((service) => service.serviceId === 'api.inference.v1')).toBe(true);
      expect(body.services.some((service) => service.serviceId === 'api.vision.v1')).toBe(true);
    } finally {
      await close();
    }
  });
});
