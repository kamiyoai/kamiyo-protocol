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
  const previousPartnerToken = process.env.OOBE_PARTNER_API_KEY;
  const previousEscrowAllowedApis = process.env.SAP_ESCROW_ALLOWED_APIS;
  const previousEscrowMaxAmountSol = process.env.SAP_ESCROW_MAX_AMOUNT_SOL;

  beforeEach(() => {
    process.env.OOBE_PARTNER_API_KEY = 'oobe-secret';
    process.env.SAP_ESCROW_ALLOWED_APIS = '11111111111111111111111111111111';
    process.env.SAP_ESCROW_MAX_AMOUNT_SOL = '0.25';
    executeHostedTool.mockReset();
  });

  afterEach(() => {
    if (previousPartnerToken === undefined) {
      delete process.env.OOBE_PARTNER_API_KEY;
    } else {
      process.env.OOBE_PARTNER_API_KEY = previousPartnerToken;
    }

    if (previousEscrowAllowedApis === undefined) {
      delete process.env.SAP_ESCROW_ALLOWED_APIS;
    } else {
      process.env.SAP_ESCROW_ALLOWED_APIS = previousEscrowAllowedApis;
    }

    if (previousEscrowMaxAmountSol === undefined) {
      delete process.env.SAP_ESCROW_MAX_AMOUNT_SOL;
    } else {
      process.env.SAP_ESCROW_MAX_AMOUNT_SOL = previousEscrowMaxAmountSol;
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

  it('rejects missing api key', async () => {
    await withServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/partners/oobe/x402/pricing?url=https://api.kamiyo.ai/api/paid/market`);

      expect(res.status).toBe(401);
      await expect(res.json()).resolves.toEqual({
        success: false,
        error: 'Missing API key',
        code: 'UNAUTHORIZED',
      });
    });
  });

  it('rejects invalid api key', async () => {
    await withServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/partners/oobe/x402/pricing?url=https://api.kamiyo.ai/api/paid/market`, {
        headers: { 'x-api-key': 'wrong-secret' },
      });

      expect(res.status).toBe(401);
      await expect(res.json()).resolves.toEqual({
        success: false,
        error: 'Invalid API key',
        code: 'UNAUTHORIZED',
      });
    });
  });

  it('accepts x-api-key headers', async () => {
    executeHostedTool.mockResolvedValue({
      success: true,
      free: false,
      options: [{ network: 'base', amount: '1000' }],
    });

    await withServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/partners/oobe/x402/pricing?url=https://api.kamiyo.ai/api/paid/market`, {
        headers: { 'x-api-key': 'oobe-secret' },
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

  it('applies escrow spend controls before executing the partner create route', async () => {
    delete process.env.SAP_ESCROW_ALLOWED_APIS;
    delete process.env.SAP_ESCROW_MAX_AMOUNT_SOL;

    await withServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/partners/oobe/escrows`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': 'oobe-secret',
        },
        body: JSON.stringify({
          api: '11111111111111111111111111111111',
          amount: 0.1,
        }),
      });

      expect(res.status).toBe(503);
      await expect(res.json()).resolves.toEqual({
        success: false,
        error: 'SAP create_escrow is disabled until allowlisted APIs and a spend cap are configured',
        code: 'SAP_ESCROW_DISABLED',
      });
      expect(executeHostedTool).not.toHaveBeenCalled();
    });
  });

  it('accepts api_key query params', async () => {
    executeHostedTool.mockResolvedValue({
      success: true,
      free: false,
      options: [{ network: 'base', amount: '1000' }],
    });

    await withServer(async (baseUrl) => {
      const res = await fetch(
        `${baseUrl}/api/partners/oobe/x402/pricing?url=https://api.kamiyo.ai/api/paid/market&api_key=oobe-secret`
      );

      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toEqual({
        success: true,
        free: false,
        options: [{ network: 'base', amount: '1000' }],
      });
    });
  });

  it('keeps bearer auth as a compatibility path', async () => {
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
    });
  });

  it('routes identity verification through the partner API', async () => {
    executeHostedTool.mockResolvedValue({
      success: true,
      passportAddress: 'passport-1',
      isValid: true,
    });

    await withServer(async (baseUrl) => {
      const res = await fetch(
        `${baseUrl}/api/partners/oobe/identity/verify?agentIdentity=agent-1&attestationProvider=openclaw`,
        {
          headers: { 'x-api-key': 'oobe-secret' },
        }
      );

      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toEqual({
        success: true,
        passportAddress: 'passport-1',
        isValid: true,
      });
      expect(executeHostedTool).toHaveBeenCalledWith(
        'meishi_verify_agent',
        {
          agentIdentity: 'agent-1',
          attestationProvider: 'openclaw',
        },
        expect.objectContaining({
          allowedTools: expect.arrayContaining(['meishi_verify_agent']),
        })
      );
    });
  });

  it('routes quality assessment through the partner API', async () => {
    executeHostedTool.mockResolvedValue({
      success: true,
      qualityScore: 92,
    });

    await withServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/partners/oobe/quality/assess`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': 'oobe-secret',
        },
        body: JSON.stringify({
          apiResponse: { foo: 'bar' },
          expectedCriteria: ['foo'],
        }),
      });

      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toEqual({
        success: true,
        qualityScore: 92,
      });
      expect(executeHostedTool).toHaveBeenCalledWith(
        'assess_data_quality',
        {
          apiResponse: { foo: 'bar' },
          expectedCriteria: ['foo'],
        },
        expect.objectContaining({
          allowedTools: expect.arrayContaining(['assess_data_quality']),
        })
      );
    });
  });
});
