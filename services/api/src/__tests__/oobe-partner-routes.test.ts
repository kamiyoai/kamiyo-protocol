import { once } from 'node:events';
import express from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const executeHostedTool = vi.fn();

vi.mock('../mcp/server', async () => {
  const actual = await vi.importActual<typeof import('../mcp/server')>('../mcp/server');
  return {
    ...actual,
    executeHostedTool,
  };
});

describe('OOBE partner HTTP routes', () => {
  const previousPartnerToken = process.env.OOBE_PARTNER_BEARER_TOKEN;

  beforeEach(() => {
    process.env.OOBE_PARTNER_BEARER_TOKEN = 'oobe-secret';
    executeHostedTool.mockReset();
  });

  afterEach(() => {
    if (previousPartnerToken === undefined) {
      delete process.env.OOBE_PARTNER_BEARER_TOKEN;
    } else {
      process.env.OOBE_PARTNER_BEARER_TOKEN = previousPartnerToken;
    }
  });

  async function withServer(
    run: (baseUrl: string) => Promise<void>
  ): Promise<void> {
    const { default: oobePartnerRoutes } = await import('../api/routes/oobe-partner');
    const app = express();
    app.use(express.json());
    app.use('/api/partners/oobe', oobePartnerRoutes);

    const server = app.listen(0);
    await once(server, 'listening');

    try {
      const address = server.address();
      if (!address || typeof address === 'string') {
        throw new Error('Unexpected server address');
      }
      await run(`http://127.0.0.1:${address.port}`);
    } finally {
      server.close();
    }
  }

  it('rejects missing bearer auth', async () => {
    await withServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/partners/oobe/x402/pricing?url=https://api.kamiyo.ai/api/paid/market`);

      expect(res.status).toBe(401);
      await expect(res.json()).resolves.toEqual({
        success: false,
        error: 'Missing bearer token',
        code: 'UNAUTHORIZED',
      });
    });
  });

  it('rejects invalid bearer auth', async () => {
    await withServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/partners/oobe/x402/pricing?url=https://api.kamiyo.ai/api/paid/market`, {
        headers: { authorization: 'Bearer wrong-secret' },
      });

      expect(res.status).toBe(401);
      await expect(res.json()).resolves.toEqual({
        success: false,
        error: 'Invalid bearer token',
        code: 'UNAUTHORIZED',
      });
    });
  });

  it('forwards pricing calls to the hosted MCP tool execution path', async () => {
    executeHostedTool.mockResolvedValue({
      success: true,
      free: false,
      options: [{ network: 'base', amount: '1000' }],
    });

    await withServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/partners/oobe/x402/pricing?url=https://api.kamiyo.ai/api/paid/market`, {
        headers: { authorization: 'Bearer oobe-secret' },
      });

      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toEqual({
        success: true,
        free: false,
        options: [{ network: 'base', amount: '1000' }],
      });
      expect(executeHostedTool).toHaveBeenCalledWith(
        'x402_check_pricing',
        { url: 'https://api.kamiyo.ai/api/paid/market' },
        expect.objectContaining({
          allowedTools: expect.arrayContaining(['x402_check_pricing', 'x402_fetch']),
        })
      );
    });
  });
});
