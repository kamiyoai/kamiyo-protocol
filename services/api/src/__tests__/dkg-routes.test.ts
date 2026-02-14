import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import express from 'express';
import http from 'http';

var assetGetMock: ReturnType<typeof vi.fn>;

vi.mock('@kamiyo/agent-paranet', async () => {
  const actual = await vi.importActual<any>('@kamiyo/agent-paranet');

  assetGetMock = vi.fn(async (ual: string) => ({
    public: {
      '@id': ual,
      '@type': ['TestAsset'],
      name: 'Test Knowledge Asset',
      description: 'Hello from DKG',
      issuer: 'urn:example:issuer',
    },
  }));

  return {
    ...actual,
    createDKGClient: vi.fn(async () => ({
      asset: {
        get: assetGetMock,
        create: vi.fn(async () => ({ UAL: 'urn:example:created' })),
        update: vi.fn(async () => ({ UAL: 'urn:example:updated' })),
      },
      graph: {
        query: vi.fn(async () => ({ data: [] })),
      },
    })),
  };
});

import dkgRoutes, { __resetDkgResolverForTests } from '../api/routes/dkg';

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

describe('DKG resolver routes', () => {
  const prevEndpoint = process.env.DKG_ENDPOINT;
  const prevPort = process.env.DKG_PORT;
  const prevChain = process.env.DKG_BLOCKCHAIN;
  const prevPrivKey = process.env.DKG_PRIVATE_KEY;
  const prevParanet = process.env.PARANET_UAL;

  beforeEach(() => {
    __resetDkgResolverForTests();
    assetGetMock?.mockClear();

    process.env.DKG_ENDPOINT = 'http://127.0.0.1:9999';
    process.env.DKG_PORT = '8900';
    process.env.DKG_BLOCKCHAIN = 'base:8453';
    process.env.DKG_PRIVATE_KEY = '';
    process.env.PARANET_UAL = '';
  });

  afterEach(() => {
    __resetDkgResolverForTests();

    if (prevEndpoint === undefined) delete process.env.DKG_ENDPOINT;
    else process.env.DKG_ENDPOINT = prevEndpoint;

    if (prevPort === undefined) delete process.env.DKG_PORT;
    else process.env.DKG_PORT = prevPort;

    if (prevChain === undefined) delete process.env.DKG_BLOCKCHAIN;
    else process.env.DKG_BLOCKCHAIN = prevChain;

    if (prevPrivKey === undefined) delete process.env.DKG_PRIVATE_KEY;
    else process.env.DKG_PRIVATE_KEY = prevPrivKey;

    if (prevParanet === undefined) delete process.env.PARANET_UAL;
    else process.env.PARANET_UAL = prevParanet;
  });

  it('validates missing ual', async () => {
    const app = express();
    app.use('/api/dkg', dkgRoutes);

    const { baseUrl, close } = await startServer(app);
    try {
      const res = await fetch(`${baseUrl}/api/dkg/resolve`);
      expect(res.status).toBe(400);
      const body = await res.json() as any;
      expect(body.source).toBe('unavailable');
      expect(body.error.code).toBe('INVALID_INPUT');
    } finally {
      await close();
    }
  });

  it('returns summary and caches by ual', async () => {
    const app = express();
    app.use('/api/dkg', dkgRoutes);

    const { baseUrl, close } = await startServer(app);
    try {
      const ual = 'urn:example:ka:1';

      const res1 = await fetch(`${baseUrl}/api/dkg/resolve?ual=${encodeURIComponent(ual)}`);
      expect(res1.status).toBe(200);
      const body1 = await res1.json() as any;
      expect(body1.source).toBe('dkg');
      expect(body1.ual).toBe(ual);
      expect(body1.summary.name).toBe('Test Knowledge Asset');

      const res2 = await fetch(`${baseUrl}/api/dkg/resolve?ual=${encodeURIComponent(ual)}`);
      expect(res2.status).toBe(200);

      expect(assetGetMock).toHaveBeenCalledTimes(1);
    } finally {
      await close();
    }
  });

  it('dedupes inflight resolves', async () => {
    const app = express();
    app.use('/api/dkg', dkgRoutes);

    const { baseUrl, close } = await startServer(app);
    try {
      const ual = 'urn:example:ka:2';

      const [a, b] = await Promise.all([
        fetch(`${baseUrl}/api/dkg/resolve?ual=${encodeURIComponent(ual)}`),
        fetch(`${baseUrl}/api/dkg/resolve?ual=${encodeURIComponent(ual)}`),
      ]);

      expect(a.status).toBe(200);
      expect(b.status).toBe(200);
      expect(assetGetMock).toHaveBeenCalledTimes(1);
    } finally {
      await close();
    }
  });
});
