import { once } from 'node:events';
import express from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getSapMetadata, getSapPricingManifest } from '../sap';

const mocks = vi.hoisted(() => ({
  executeHostedTool: vi.fn(),
  getX402Gateway: vi.fn(),
  getX402Challenge: vi.fn(),
  getX402PaymentHeader: vi.fn(),
  verifyAndSettleX402Payment: vi.fn(),
}));

vi.mock('../mcp/server', async () => {
  const actual = await vi.importActual<typeof import('../mcp/server')>('../mcp/server');
  return {
    ...actual,
    executeHostedTool: mocks.executeHostedTool,
  };
});

vi.mock('../x402-runtime', () => ({
  getX402Gateway: mocks.getX402Gateway,
  getSupportedX402Networks: () => ['base'],
  getX402Challenge: mocks.getX402Challenge,
  getX402PaymentHeader: mocks.getX402PaymentHeader,
  verifyAndSettleX402Payment: mocks.verifyAndSettleX402Payment,
}));

describe('SAP HTTP routes', () => {
  const previousEscrowAllowedApis = process.env.SAP_ESCROW_ALLOWED_APIS;
  const previousEscrowMaxAmountSol = process.env.SAP_ESCROW_MAX_AMOUNT_SOL;
  const realFetch = globalThis.fetch;
  const fetchMock = vi.fn();

  beforeEach(() => {
    process.env.SAP_ESCROW_ALLOWED_APIS = '11111111111111111111111111111111';
    process.env.SAP_ESCROW_MAX_AMOUNT_SOL = '0.25';

    mocks.executeHostedTool.mockReset();
    mocks.getX402Gateway.mockReset();
    mocks.getX402Challenge.mockReset();
    mocks.getX402PaymentHeader.mockReset();
    mocks.verifyAndSettleX402Payment.mockReset();
    fetchMock.mockReset();

    vi.stubGlobal('fetch', ((input: unknown, init?: RequestInit) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : typeof input === 'object' && input !== null && 'url' in input && typeof input.url === 'string'
              ? input.url
              : '';

      if (url.startsWith('http://127.0.0.1:')) {
        return realFetch(input as string | URL | Request, init);
      }

      return fetchMock(input, init);
    }) as typeof fetch);

    mocks.getX402Gateway.mockReturnValue({
      health: vi.fn().mockResolvedValue({ ok: true, latency: 12, networks: ['base'] }),
    });
    mocks.getX402Challenge.mockReturnValue({
      body: {
        accepts: [{ network: 'base', amount: '5000', asset: 'USDC' }],
        facilitator: 'https://facilitator.example',
      },
      headers: {
        'WWW-Authenticate': 'X402',
      },
    });
    mocks.getX402PaymentHeader.mockImplementation((headers: Record<string, unknown>) => {
      if (typeof headers['payment-signature'] === 'string') {
        return { type: 'payment-signature', value: headers['payment-signature'] };
      }
      if (typeof headers['x-payment'] === 'string') {
        return { type: 'x-payment', value: headers['x-payment'] };
      }
      return { type: 'missing', value: null };
    });
    mocks.verifyAndSettleX402Payment.mockResolvedValue({
      ok: true,
      payment: {
        payer: 'payer',
        network: 'base',
        amount: '5000',
        tx: 'tx-1',
        headerType: 'payment-signature',
      },
    });
  });

  async function withServer(run: (baseUrl: string) => Promise<void>): Promise<void> {
    const { default: sapRoutes } = await import('../api/routes/sap');
    const app = express();
    app.use(express.json());
    app.use('/api/sap', sapRoutes);

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

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();

    if (previousEscrowAllowedApis === undefined) delete process.env.SAP_ESCROW_ALLOWED_APIS;
    else process.env.SAP_ESCROW_ALLOWED_APIS = previousEscrowAllowedApis;

    if (previousEscrowMaxAmountSol === undefined) delete process.env.SAP_ESCROW_MAX_AMOUNT_SOL;
    else process.env.SAP_ESCROW_MAX_AMOUNT_SOL = previousEscrowMaxAmountSol;
  });

  it('serves metadata and pricing from the shared SAP profile', async () => {
    await withServer(async (baseUrl) => {
      const metadataRes = await fetch(`${baseUrl}/api/sap/metadata`);
      const pricingRes = await fetch(`${baseUrl}/api/sap/pricing`);

      await expect(metadataRes.json()).resolves.toEqual(getSapMetadata());
      await expect(pricingRes.json()).resolves.toEqual(getSapPricingManifest());
    });
  });

  it('rejects unsupported tool names', async () => {
    await withServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/sap/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tool: 'unknown_tool', args: {} }),
      });

      expect(res.status).toBe(400);
      await expect(res.json()).resolves.toEqual({
        success: false,
        code: 'INVALID_TOOL',
        error: 'Unsupported SAP tool',
        tool: 'unknown_tool',
      });
    });
  });

  it('rejects invalid args payloads', async () => {
    await withServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/sap/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tool: 'x402_check_pricing' }),
      });

      expect(res.status).toBe(400);
      await expect(res.json()).resolves.toEqual({
        success: false,
        code: 'INVALID_REQUEST',
        error: 'Request body must include an args object',
        tool: 'x402_check_pricing',
      });
    });
  });

  it('rejects disallowed fetch targets', async () => {
    await withServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/sap/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tool: 'x402_fetch',
          args: { url: 'https://evil.example/x402' },
        }),
      });

      expect(res.status).toBe(403);
      await expect(res.json()).resolves.toEqual({
        success: false,
        code: 'FORBIDDEN',
        error: 'target url not allowed',
        tool: 'x402_fetch',
      });
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  it('runs pricing checks without requiring SAP payment', async () => {
    mocks.executeHostedTool.mockResolvedValue({
      success: true,
      free: false,
      options: [{ network: 'base', priceUsd: 0.005 }],
    });

    await withServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/sap/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tool: 'x402_check_pricing',
          args: { url: 'https://api.kamiyo.ai/api/paid/market' },
        }),
      });

      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toEqual({
        success: true,
        free: false,
        options: [{ network: 'base', priceUsd: 0.005 }],
      });
      expect(mocks.getX402Challenge).not.toHaveBeenCalled();
      expect(mocks.verifyAndSettleX402Payment).not.toHaveBeenCalled();
    });
  });

  it('returns 503 for create_escrow when spend controls are not configured', async () => {
    delete process.env.SAP_ESCROW_ALLOWED_APIS;
    delete process.env.SAP_ESCROW_MAX_AMOUNT_SOL;

    await withServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/sap/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tool: 'create_escrow',
          args: { api: '11111111111111111111111111111111', amount: 0.1 },
        }),
      });

      expect(res.status).toBe(503);
      await expect(res.json()).resolves.toEqual({
        success: false,
        code: 'SAP_ESCROW_DISABLED',
        error: 'SAP create_escrow is disabled until allowlisted APIs and a spend cap are configured',
        tool: 'create_escrow',
      });
      expect(mocks.getX402Challenge).not.toHaveBeenCalled();
    });
  });

  it('returns 402 for paid SAP tools without payment', async () => {
    await withServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/sap/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tool: 'create_escrow',
          args: { api: '11111111111111111111111111111111', amount: 0.1 },
        }),
      });

      expect(res.status).toBe(402);
      expect(res.headers.get('WWW-Authenticate')).toBe('X402');
      await expect(res.json()).resolves.toMatchObject({
        success: false,
        code: 'PAYMENT_REQUIRED',
        tool: 'create_escrow',
      });
      expect(mocks.executeHostedTool).not.toHaveBeenCalled();
    });
  });

  it('rejects create_escrow for non-allowlisted API providers before charging', async () => {
    await withServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/sap/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tool: 'create_escrow',
          args: { api: 'SysvarRent111111111111111111111111111111111', amount: 0.1 },
        }),
      });

      expect(res.status).toBe(403);
      await expect(res.json()).resolves.toEqual({
        success: false,
        code: 'FORBIDDEN',
        error: 'api provider is not allowlisted for SAP escrow execution',
        tool: 'create_escrow',
      });
      expect(mocks.getX402Challenge).not.toHaveBeenCalled();
    });
  });

  it('rejects create_escrow amounts above the configured cap before charging', async () => {
    await withServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/sap/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tool: 'create_escrow',
          args: { api: '11111111111111111111111111111111', amount: 0.5 },
        }),
      });

      expect(res.status).toBe(403);
      await expect(res.json()).resolves.toEqual({
        success: false,
        code: 'FORBIDDEN',
        error: 'amount exceeds SAP escrow max of 0.25 SOL',
        tool: 'create_escrow',
      });
      expect(mocks.getX402Challenge).not.toHaveBeenCalled();
    });
  });

  it('accepts payment-signature for paid SAP tools', async () => {
    mocks.executeHostedTool.mockResolvedValue({ success: true, transactionId: 'tx-123' });

    await withServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/sap/execute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'payment-signature': 'signature-1',
        },
        body: JSON.stringify({
          tool: 'check_escrow_status',
          args: { transactionId: 'tx-123' },
        }),
      });

      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toEqual({ success: true, transactionId: 'tx-123' });
      expect(mocks.verifyAndSettleX402Payment).toHaveBeenCalled();
    });
  });

  it('accepts X-Payment for paid SAP tools', async () => {
    mocks.verifyAndSettleX402Payment.mockResolvedValue({
      ok: true,
      payment: {
        payer: 'payer',
        network: 'base',
        amount: '5000',
        tx: 'tx-2',
        headerType: 'x-payment',
      },
    });
    mocks.executeHostedTool.mockResolvedValue({ success: true, escrowAddress: 'escrow-1' });

    await withServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/sap/execute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-payment': 'legacy-payment',
        },
        body: JSON.stringify({
          tool: 'create_escrow',
          args: { api: '11111111111111111111111111111111', amount: 0.1 },
        }),
      });

      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toEqual({ success: true, escrowAddress: 'escrow-1' });
    });
  });

  it('keeps x402_fetch as true pass-through and relays the upstream challenge', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({
        accepts: [{ network: 'base', amount: '15000', asset: 'USDC' }],
        facilitator: 'https://facilitator.example',
      }), {
        status: 402,
        headers: {
          'WWW-Authenticate': 'X402',
        },
      })
    );

    await withServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/sap/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tool: 'x402_fetch',
          args: { url: 'https://api.kamiyo.ai/api/paid/market' },
        }),
      });

      expect(res.status).toBe(402);
      expect(res.headers.get('WWW-Authenticate')).toBe('X402');
      await expect(res.json()).resolves.toEqual({
        accepts: [{ network: 'base', amount: '15000', asset: 'USDC' }],
        facilitator: 'https://facilitator.example',
        success: false,
        code: 'PAYMENT_REQUIRED',
        tool: 'x402_fetch',
      });
      expect(mocks.executeHostedTool).not.toHaveBeenCalled();
      expect(mocks.getX402Challenge).not.toHaveBeenCalled();
      expect(mocks.verifyAndSettleX402Payment).not.toHaveBeenCalled();
    });
  });

  it('forwards the caller payment header upstream for x402_fetch', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ ok: true, market: 'kamiyo' }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      })
    );

    await withServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/sap/execute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-payment': 'legacy-payment',
        },
        body: JSON.stringify({
          tool: 'x402_fetch',
          args: {
            url: 'https://api.kamiyo.ai/api/paid/market',
            headers: {
              Authorization: 'Bearer token-1',
            },
          },
        }),
      });

      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toEqual({
        success: true,
        paid: true,
        data: { ok: true, market: 'kamiyo' },
        summary: 'ok: boolean, market: kamiyo',
      });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [, init] = fetchMock.mock.calls[0];
      expect(init?.headers).toEqual({
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: 'Bearer token-1',
        'X-Payment': 'legacy-payment',
      });
      expect(mocks.executeHostedTool).not.toHaveBeenCalled();
      expect(mocks.verifyAndSettleX402Payment).not.toHaveBeenCalled();
    });
  });

  it('surfaces upstream fetch errors without issuing a local surcharge', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: 'upstream boom' }), {
        status: 404,
        headers: {
          'Content-Type': 'application/json',
        },
      })
    );

    await withServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/sap/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tool: 'x402_fetch',
          args: { url: 'https://api.kamiyo.ai/api/paid/market' },
        }),
      });

      expect(res.status).toBe(404);
      await expect(res.json()).resolves.toEqual({
        success: false,
        code: 'NOT_FOUND',
        error: 'upstream boom',
        tool: 'x402_fetch',
      });
      expect(mocks.getX402Challenge).not.toHaveBeenCalled();
      expect(mocks.verifyAndSettleX402Payment).not.toHaveBeenCalled();
    });
  });
});
