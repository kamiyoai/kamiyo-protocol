import { once } from 'node:events';
import express from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  emitFairscaleFusionEvent: vi.fn(),
  getContext: vi.fn(),
  getBurnService: vi.fn(),
  getCreditBalance: vi.fn(),
  deductCredits: vi.fn(),
  getCreditBalanceUsd: vi.fn(),
  usdToCredits: vi.fn(),
  isDailySpendCapExceeded: vi.fn(),
  incrementDailyApiSpend: vi.fn(),
  getDailySpendStatus: vi.fn(),
  getX402Capability: vi.fn(),
  getX402Gateway: vi.fn(),
  getSupportedX402Networks: vi.fn(),
  getX402PaymentHeader: vi.fn(),
  getX402Challenge: vi.fn(),
  initX402Gateway: vi.fn(),
  verifyAndSettleX402Payment: vi.fn(),
}));

vi.mock('../crypto-context', () => ({
  getContext: mocks.getContext,
  formatContextForPrompt: vi.fn(),
}));

vi.mock('../fairscale-fusion-emitter', () => ({
  emitFairscaleFusionEvent: mocks.emitFairscaleFusionEvent,
}));

vi.mock('../logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../db', () => ({
  getCreditBalance: mocks.getCreditBalance,
  deductCredits: mocks.deductCredits,
  getCreditBalanceUsd: mocks.getCreditBalanceUsd,
  usdToCredits: mocks.usdToCredits,
  isDailySpendCapExceeded: mocks.isDailySpendCapExceeded,
  incrementDailyApiSpend: mocks.incrementDailyApiSpend,
  getDailySpendStatus: mocks.getDailySpendStatus,
}));

vi.mock('../burn-service', () => ({
  getBurnService: mocks.getBurnService,
}));

vi.mock('../core-capabilities', () => ({
  getX402Capability: mocks.getX402Capability,
}));

vi.mock('../x402-runtime', () => ({
  getX402Gateway: mocks.getX402Gateway,
  getSupportedX402Networks: mocks.getSupportedX402Networks,
  getX402PaymentHeader: mocks.getX402PaymentHeader,
  getX402Challenge: mocks.getX402Challenge,
  initX402Gateway: mocks.initX402Gateway,
  verifyAndSettleX402Payment: mocks.verifyAndSettleX402Payment,
}));

describe('paid HTTP routes', () => {
  beforeEach(() => {
    mocks.emitFairscaleFusionEvent.mockReset();
    mocks.getContext.mockReset();
    mocks.getBurnService.mockReset();
    mocks.getCreditBalance.mockReset();
    mocks.deductCredits.mockReset();
    mocks.getCreditBalanceUsd.mockReset();
    mocks.usdToCredits.mockReset();
    mocks.isDailySpendCapExceeded.mockReset();
    mocks.incrementDailyApiSpend.mockReset();
    mocks.getDailySpendStatus.mockReset();
    mocks.getX402Capability.mockReset();
    mocks.getX402Gateway.mockReset();
    mocks.getSupportedX402Networks.mockReset();
    mocks.getX402PaymentHeader.mockReset();
    mocks.getX402Challenge.mockReset();
    mocks.initX402Gateway.mockReset();
    mocks.verifyAndSettleX402Payment.mockReset();

    mocks.getBurnService.mockReturnValue({
      recordCreditBurn: vi.fn().mockReturnValue(null),
      recordX402Burn: vi.fn().mockReturnValue(null),
    });
    mocks.getCreditBalance.mockReturnValue(0);
    mocks.deductCredits.mockReturnValue(false);
    mocks.getCreditBalanceUsd.mockReturnValue(0);
    mocks.usdToCredits.mockImplementation((usd: number) => Math.floor(usd * 1_000_000));
    mocks.isDailySpendCapExceeded.mockReturnValue(false);
    mocks.getDailySpendStatus.mockReturnValue({ spendUsd: 0, capUsd: 100, requestCount: 0 });
    mocks.getX402Capability.mockReturnValue({
      enabled: true,
      merchantWallet: 'merchant-1',
      reason: null,
    });
    mocks.getX402Gateway.mockReturnValue({});
    mocks.getSupportedX402Networks.mockReturnValue(['solana']);
    mocks.getX402PaymentHeader.mockReturnValue({
      type: 'sap-x402',
      value: null,
      forwardHeaders: {
        'X-Payment-Protocol': 'SAP-x402',
      },
      sapHeaders: {
        'X-Payment-Protocol': 'SAP-x402',
        'X-Payment-Escrow': 'escrow-1',
        'X-Payment-Agent': 'agent-1',
        'X-Payment-Depositor': 'depositor-1',
        'X-Payment-MaxCalls': '15',
        'X-Payment-PricePerCall': '1388',
        'X-Payment-Program': 'program-1',
        'X-Payment-Network': 'mainnet-beta',
      },
    });
    mocks.getX402Challenge.mockReturnValue({
      body: {
        accepts: [{ network: 'solana', amount: '5000', asset: 'USDC' }],
        facilitator: 'https://facilitator.example',
      },
      headers: {
        'WWW-Authenticate': 'X402',
      },
    });
    mocks.verifyAndSettleX402Payment.mockResolvedValue({
      ok: false,
      verifyError: 'sap x402 headers are not supported for this endpoint',
    });
    mocks.getContext.mockResolvedValue({
      btcPrice: 1,
      ethPrice: 2,
      kamiyo: null,
      marketSentiment: 'neutral',
      trending: [],
      headlines: [],
    });
  });

  async function withServer(run: (baseUrl: string) => Promise<void>): Promise<void> {
    const { default: paidRoutes } = await import('../api/routes/paid');
    const app = express();
    app.use(express.json());
    app.use('/api/paid', paidRoutes);

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
    vi.resetModules();
  });

  it('rejects SAP-x402 headers on direct paid endpoints', async () => {
    await withServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/paid/market`, {
        headers: {
          'X-Payment-Protocol': 'SAP-x402',
          'X-Payment-Escrow': 'escrow-1',
          'X-Payment-Agent': 'agent-1',
          'X-Payment-Depositor': 'depositor-1',
          'X-Payment-MaxCalls': '15',
          'X-Payment-PricePerCall': '1388',
          'X-Payment-Program': 'program-1',
          'X-Payment-Network': 'mainnet-beta',
        },
      });

      expect(res.status).toBe(402);
      expect(res.headers.get('WWW-Authenticate')).toBeNull();
      await expect(res.json()).resolves.toEqual({
        accepts: [{ network: 'solana', amount: '5000', asset: 'USDC' }],
        facilitator: 'https://facilitator.example',
        verifyError: 'sap x402 headers are not supported for this endpoint',
      });
      expect(mocks.verifyAndSettleX402Payment).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'sap-x402' }),
        '/market',
        0.005,
        'KAMIYO Market Data',
        ['solana'],
        { allowSapX402: false }
      );
      expect(mocks.getContext).not.toHaveBeenCalled();
    });
  });
});
