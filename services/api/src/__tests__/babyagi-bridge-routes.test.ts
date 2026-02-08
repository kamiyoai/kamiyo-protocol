import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import express from 'express';
import http from 'http';
import babyagiRoutes, { __resetBabyagiBridgeForTests } from '../api/routes/babyagi';

function startServer(app: express.Express): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  return new Promise((resolve) => {
    const server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (!addr || typeof addr === 'string') {
        throw new Error('Failed to bind test server');
      }
      const baseUrl = `http://127.0.0.1:${addr.port}`;
      resolve({
        baseUrl,
        close: () => new Promise((r) => server.close(() => r())),
      });
    });
  });
}

function jsonHeaders(token?: string): Record<string, string> {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
  };
  if (token) headers.authorization = `Bearer ${token}`;
  return headers;
}

async function postJson(url: string, body: unknown, token?: string): Promise<Response> {
  return fetch(url, {
    method: 'POST',
    headers: jsonHeaders(token),
    body: JSON.stringify(body),
  });
}

describe('BabyAGI bridge routes', () => {
  const previousAllowPrivate = process.env.BABYAGI_ALLOW_PRIVATE_NET;
  const previousKey = process.env.BABYAGI_BRIDGE_API_KEY;

  beforeEach(() => {
    __resetBabyagiBridgeForTests();
    process.env.BABYAGI_ALLOW_PRIVATE_NET = 'true';
    process.env.BABYAGI_BRIDGE_API_KEY = 'test-key';
  });

  afterEach(() => {
    __resetBabyagiBridgeForTests();
    if (previousAllowPrivate === undefined) delete process.env.BABYAGI_ALLOW_PRIVATE_NET;
    else process.env.BABYAGI_ALLOW_PRIVATE_NET = previousAllowPrivate;

    if (previousKey === undefined) delete process.env.BABYAGI_BRIDGE_API_KEY;
    else process.env.BABYAGI_BRIDGE_API_KEY = previousKey;
  });

  it('blocks calls without bridge api key when configured', async () => {
    const app = express();
    app.use(express.json());
    app.use('/babyagi/v1', babyagiRoutes);

    const { baseUrl, close } = await startServer(app);
    try {
      const res = await postJson(`${baseUrl}/babyagi/v1/escrows`, {
        provider_id: 'alpha',
        amount: 1,
        currency: 'USDC',
        transaction_id: 't1',
        timelock_seconds: 60,
        idempotency_key: 'k1',
      });

      expect(res.status).toBe(401);
    } finally {
      await close();
    }
  });

  it('supports happy path and idempotent settlement', async () => {
    // Provider server that returns a deterministic JSON payload
    const providerApp = express();
    providerApp.get('/good', (_req, res) => {
      res.json({ data: { result: 'ok', records: 12 } });
    });
    const provider = await startServer(providerApp);

    const apiApp = express();
    apiApp.use(express.json());
    apiApp.use('/babyagi/v1', babyagiRoutes);
    const api = await startServer(apiApp);

    try {
      // 1) Create escrow
      const escrowRes = await postJson(
        `${api.baseUrl}/babyagi/v1/escrows`,
        {
          provider_id: 'alpha',
          amount: 1.25,
          currency: 'USDC',
          transaction_id: 'demo-1',
          timelock_seconds: 120,
          idempotency_key: 'escrow-demo-1',
        },
        'test-key'
      );
      expect(escrowRes.status).toBe(200);
      const escrowJson = await escrowRes.json() as any;
      expect(escrowJson.ok).toBe(true);
      expect(typeof escrowJson.escrow_id).toBe('string');

      // 2) Execute provider call
      const execRes = await postJson(
        `${api.baseUrl}/babyagi/v1/execute`,
        {
          escrow_id: escrowJson.escrow_id,
          url: `${provider.baseUrl}/good`,
          method: 'GET',
        },
        'test-key'
      );
      expect(execRes.status).toBe(200);
      const execJson = await execRes.json() as any;
      expect(execJson.ok).toBe(true);
      expect(execJson.http_status).toBe(200);

      // 3) Assess quality
      const assessRes = await postJson(
        `${api.baseUrl}/babyagi/v1/quality/assess`,
        {
          escrow_id: escrowJson.escrow_id,
          response: execJson.response,
          expected_fields: ['data.result'],
          max_latency_ms: 2000,
          min_quality_score: 70,
        },
        'test-key'
      );
      expect(assessRes.status).toBe(200);
      const assessJson = await assessRes.json() as any;
      expect(assessJson.ok).toBe(true);
      expect(assessJson.passed).toBe(true);

      // 4) Settle
      const settleRes1 = await postJson(
        `${api.baseUrl}/babyagi/v1/settlements/resolve`,
        {
          escrow_id: escrowJson.escrow_id,
          quality_score: assessJson.quality_score,
          auto_dispute_threshold: 70,
          idempotency_key: 'settle-demo-1',
        },
        'test-key'
      );
      expect(settleRes1.status).toBe(200);
      const settleJson1 = await settleRes1.json() as any;
      expect(settleJson1.ok).toBe(true);
      expect(settleJson1.action).toBe('released');

      const settleRes2 = await postJson(
        `${api.baseUrl}/babyagi/v1/settlements/resolve`,
        {
          escrow_id: escrowJson.escrow_id,
          quality_score: assessJson.quality_score,
          auto_dispute_threshold: 70,
          idempotency_key: 'settle-demo-1',
        },
        'test-key'
      );
      const settleJson2 = await settleRes2.json() as any;
      expect(settleJson2.idempotent_replay).toBe(true);

      // 5) Reputation endpoint reflects settlement
      const repRes = await fetch(
        `${api.baseUrl}/babyagi/v1/providers/alpha/reputation?window_days=30`,
        { headers: { authorization: 'Bearer test-key' } }
      );
      expect(repRes.status).toBe(200);
      const repJson = await repRes.json() as any;
      expect(repJson.ok).toBe(true);
      expect(repJson.sample_size).toBeGreaterThan(0);
    } finally {
      await provider.close();
      await api.close();
    }
  });
});
