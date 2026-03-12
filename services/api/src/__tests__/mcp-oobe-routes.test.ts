import { once } from 'node:events';
import express from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../db.js', () => ({
  createMcpSession: vi.fn(),
  updateMcpSessionActivity: vi.fn(),
  deleteMcpSession: vi.fn(),
  cleanupOldMcpSessions: vi.fn(() => 0),
  cleanupExpiredMcpOAuthCodes: vi.fn(() => 0),
  cleanupExpiredMcpOAuthTokens: vi.fn(() => 0),
  getMcpOAuthClient: vi.fn(() => null),
  createMcpOAuthClient: vi.fn(),
  getMcpOAuthCode: vi.fn(() => null),
  createMcpOAuthCode: vi.fn(),
  deleteMcpOAuthCode: vi.fn(),
  getMcpOAuthToken: vi.fn(() => null),
  createMcpOAuthToken: vi.fn(),
  revokeMcpOAuthToken: vi.fn(),
}));

vi.mock('../core-capabilities.js', () => ({
  getMcpCapability: () => ({
    publicBaseUrl: 'https://api.example.com',
  }),
}));

describe('OOBE MCP routes', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('blocks dynamic client registration for the OOBE resource', async () => {
    const { createMCPRoutes } = await import('../mcp');
    const app = express();
    app.use(createMCPRoutes());

    const server = app.listen(0);
    await once(server, 'listening');

    try {
      const address = server.address();
      if (!address || typeof address === 'string') {
        throw new Error('Unexpected server address');
      }

      const res = await fetch(`http://127.0.0.1:${address.port}/partners/oobe/oauth/register`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(403);
      await expect(res.json()).resolves.toEqual({ error: 'dynamic registration disabled' });
    } finally {
      server.close();
    }
  });

  it('exposes a separate OOBE MCP health route', async () => {
    const { createMCPRoutes } = await import('../mcp');
    const app = express();
    app.use(createMCPRoutes());

    const server = app.listen(0);
    await once(server, 'listening');

    try {
      const address = server.address();
      if (!address || typeof address === 'string') {
        throw new Error('Unexpected server address');
      }

      const res = await fetch(`http://127.0.0.1:${address.port}/partners/oobe/mcp/health`);

      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toEqual(
        expect.objectContaining({
          status: 'ok',
        })
      );
    } finally {
      server.close();
    }
  });
});
