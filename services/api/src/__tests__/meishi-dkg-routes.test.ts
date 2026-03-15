import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import express from 'express';
import http from 'http';

const { graphQueryMock, createClientMock } = vi.hoisted(() => ({
  graphQueryMock: vi.fn<(...args: any[]) => Promise<{ data: unknown[] }>>(async () => ({ data: [] })),
  createClientMock: vi.fn<(...args: any[]) => Promise<unknown>>(),
}));

vi.mock('@kamiyo/agent-paranet', async () => {
  const actual = await vi.importActual<any>('@kamiyo/agent-paranet');
  createClientMock.mockImplementation(async () => ({
    rawDKG: {
      graph: {
        query: graphQueryMock,
      },
    },
  }));

  return {
    ...actual,
    AgentParanetClient: {
      create: createClientMock,
    },
  };
});

import meishiDkgRoutes, { __resetMeishiDkgRoutesForTests } from '../api/routes/meishi-dkg';

function startServer(app: express.Express): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  return new Promise((resolve) => {
    const server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (!addr || typeof addr === 'string') {
        throw new Error('Failed to bind test server');
      }
      resolve({
        baseUrl: `http://127.0.0.1:${addr.port}`,
        close: () => new Promise((done) => server.close(() => done())),
      });
    });
  });
}

describe('Meishi DKG routes', () => {
  const envBackup = {
    DKG_ENDPOINT: process.env.DKG_ENDPOINT,
    KAMIYO_DKG_ENDPOINT: process.env.KAMIYO_DKG_ENDPOINT,
    DKG_BLOCKCHAIN: process.env.DKG_BLOCKCHAIN,
    DKG_PORT: process.env.DKG_PORT,
    DKG_PRIVATE_KEY: process.env.DKG_PRIVATE_KEY,
    MEISHI_PARANET_UAL: process.env.MEISHI_PARANET_UAL,
    PARANET_UAL: process.env.PARANET_UAL,
    MEISHI_DKG_REPOSITORY: process.env.MEISHI_DKG_REPOSITORY,
  };

  beforeEach(() => {
    __resetMeishiDkgRoutesForTests();
    graphQueryMock.mockReset();
    createClientMock.mockClear();

    delete process.env.DKG_ENDPOINT;
    process.env.KAMIYO_DKG_ENDPOINT = 'ot-node.example:8900';
    process.env.DKG_BLOCKCHAIN = 'base:8453';
    process.env.DKG_PORT = '8900';
    process.env.DKG_PRIVATE_KEY = '';
    process.env.MEISHI_PARANET_UAL = 'urn:example:paranet';
    process.env.MEISHI_DKG_REPOSITORY = 'publicCurrent';
  });

  afterEach(() => {
    __resetMeishiDkgRoutesForTests();
    for (const [key, value] of Object.entries(envBackup)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it('uses alias endpoint envs and returns a live dashboard payload', async () => {
    graphQueryMock.mockResolvedValueOnce({
      data: [
        {
          audit: 'urn:dkg:audit:1',
          agent: 'agent-alpha',
          score: '91',
          classification: 'minimal',
          jurisdiction: 'global',
          auditor: 'auditor-1',
          auditType: 'periodic',
          date: '2026-03-15T12:00:00Z',
        },
        {
          audit: 'urn:dkg:audit:2',
          agent: 'agent-beta',
          score: '84',
          classification: 'limited',
          jurisdiction: 'eu',
          auditor: 'auditor-2',
          auditType: 'periodic',
          date: '2026-03-15T11:00:00Z',
        },
      ],
    });

    const app = express();
    app.use('/api/meishi-dkg', meishiDkgRoutes);
    const { baseUrl, close } = await startServer(app);

    try {
      const res = await fetch(`${baseUrl}/api/meishi-dkg/dashboard?limit=12`);
      expect(res.status).toBe(200);
      const body = await res.json() as any;
      expect(body.dataMode).toBe('live');
      expect(body.source).toBe('dkg');
      expect(body.health.endpoint).toBe('http://ot-node.example:8900');
      expect(body.health.scope).toBe('paranet');
      expect(body.leaderboard.agents).toHaveLength(2);
      expect(body.graph.nodes.some((node: any) => node.kind === 'agent')).toBe(true);
      expect(body.featuredAgent.agentId).toBe('agent-alpha');
      expect(createClientMock).toHaveBeenCalledTimes(1);
    } finally {
      await close();
    }
  });

  it('serves the last verified dashboard snapshot when live DKG reads fail', async () => {
    graphQueryMock
      .mockResolvedValueOnce({
        data: [
          {
            audit: 'urn:dkg:audit:1',
            agent: 'agent-alpha',
            score: '88',
            classification: 'minimal',
            jurisdiction: 'global',
            auditor: 'auditor-1',
            auditType: 'periodic',
            date: '2026-03-15T12:00:00Z',
          },
        ],
      })
      .mockRejectedValueOnce(new Error('node offline'));

    const app = express();
    app.use('/api/meishi-dkg', meishiDkgRoutes);
    const { baseUrl, close } = await startServer(app);

    try {
      const first = await fetch(`${baseUrl}/api/meishi-dkg/dashboard`);
      expect(first.status).toBe(200);
      const firstBody = await first.json() as any;
      expect(firstBody.dataMode).toBe('live');

      const second = await fetch(`${baseUrl}/api/meishi-dkg/dashboard`);
      expect(second.status).toBe(200);
      const secondBody = await second.json() as any;
      expect(secondBody.dataMode).toBe('snapshot');
      expect(secondBody.warnings.some((warning: string) => warning.includes('last verified DKG snapshot'))).toBe(true);
      expect(secondBody.leaderboard.agents[0].agentId).toBe('agent-alpha');
    } finally {
      await close();
    }
  });

  it('fails closed when no verified audits or snapshot exist', async () => {
    graphQueryMock.mockResolvedValueOnce({ data: [] });

    const app = express();
    app.use('/api/meishi-dkg', meishiDkgRoutes);
    const { baseUrl, close } = await startServer(app);

    try {
      const res = await fetch(`${baseUrl}/api/meishi-dkg/dashboard`);
      expect(res.status).toBe(503);
      const body = await res.json() as any;
      expect(body.dataMode).toBe('unavailable');
      expect(body.source).toBe('unavailable');
    } finally {
      await close();
    }
  });

  it('returns audit history for an agent', async () => {
    graphQueryMock.mockResolvedValueOnce({
      data: [
        {
          audit: 'urn:dkg:audit:10',
          agent: 'agent-kyoshin',
          score: '96',
          classification: 'minimal',
          jurisdiction: 'global',
          auditor: 'auditor-1',
          auditType: 'periodic',
          date: '2026-03-15T12:00:00Z',
        },
        {
          audit: 'urn:dkg:audit:9',
          agent: 'agent-kyoshin',
          score: '94',
          classification: 'minimal',
          jurisdiction: 'global',
          auditor: 'auditor-2',
          auditType: 'manual',
          date: '2026-03-14T12:00:00Z',
        },
      ],
    });

    const app = express();
    app.use('/api/meishi-dkg', meishiDkgRoutes);
    const { baseUrl, close } = await startServer(app);

    try {
      const res = await fetch(`${baseUrl}/api/meishi-dkg/agent/${encodeURIComponent('agent-kyoshin')}/audits?limit=5`);
      expect(res.status).toBe(200);
      const body = await res.json() as any;
      expect(body.dataMode).toBe('live');
      expect(body.audits).toHaveLength(2);
      expect(body.audits[0].agentId).toBe('agent-kyoshin');
      expect(body.audits[0].ual).toBe('urn:dkg:audit:10');
    } finally {
      await close();
    }
  });
});
