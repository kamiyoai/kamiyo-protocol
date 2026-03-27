import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createPayAIFacilitator: vi.fn(() => ({
    response402: vi.fn(),
    headers402: vi.fn(),
    verifyAndSettle: vi.fn(),
  })),
}));

vi.mock('@kamiyo/x402-client', async () => {
  const actual = await vi.importActual<typeof import('@kamiyo/x402-client')>('@kamiyo/x402-client');
  return {
    ...actual,
    createPayAIFacilitator: mocks.createPayAIFacilitator,
  };
});

import {
  getX402PaymentHeader,
  initX402Gateway,
  resolveX402FacilitatorUrls,
  verifyAndSettleX402Payment,
} from '../x402-runtime';

describe('x402 runtime header parsing', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    mocks.createPayAIFacilitator.mockClear();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('parses legacy payment-signature headers', () => {
    const header = getX402PaymentHeader({
      'payment-signature': 'signature-1',
    });

    expect(header).toEqual({
      type: 'payment-signature',
      value: 'signature-1',
      forwardHeaders: {
        'payment-signature': 'signature-1',
      },
      sapHeaders: null,
    });
  });

  it('parses SAP-x402 escrow headers', () => {
    const header = getX402PaymentHeader({
      'x-payment-protocol': 'SAP-x402',
      'x-payment-escrow': 'escrow-1',
      'x-payment-agent': 'agent-1',
      'x-payment-depositor': 'depositor-1',
      'x-payment-maxcalls': '15',
      'x-payment-pricepercall': '1388',
      'x-payment-program': 'program-1',
      'x-payment-network': 'mainnet-beta',
    });

    expect(header).toEqual({
      type: 'sap-x402',
      value: null,
      forwardHeaders: {
        'X-Payment-Protocol': 'SAP-x402',
        'X-Payment-Escrow': 'escrow-1',
        'X-Payment-Agent': 'agent-1',
        'X-Payment-Depositor': 'depositor-1',
        'X-Payment-MaxCalls': '15',
        'X-Payment-PricePerCall': '1388',
        'X-Payment-Program': 'program-1',
        'X-Payment-Network': 'mainnet-beta',
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
  });

  it('deduplicates facilitator URLs across x402-specific and legacy env vars', () => {
    const urls = resolveX402FacilitatorUrls({
      X402_FACILITATOR_URLS: 'https://x402.kamiyo.ai, https://facilitator.payai.network',
      FACILITATOR_URLS: 'https://fallback.example, https://x402.kamiyo.ai',
      X402_FACILITATOR_URL: 'https://primary.example',
      FACILITATOR_URL: 'https://fallback.example',
    } as NodeJS.ProcessEnv);

    expect(urls).toEqual([
      'https://x402.kamiyo.ai',
      'https://facilitator.payai.network',
      'https://fallback.example',
      'https://primary.example',
    ]);
  });

  it('initializes the payment gateway with configured facilitator URLs', () => {
    process.env.X402_MERCHANT_WALLET = '11111111111111111111111111111111';
    process.env.X402_FACILITATOR_URLS = 'https://x402.kamiyo.ai, https://facilitator.payai.network';

    initX402Gateway();

    expect(mocks.createPayAIFacilitator).toHaveBeenCalledWith(
      '11111111111111111111111111111111',
      expect.objectContaining({
        facilitatorUrls: ['https://x402.kamiyo.ai', 'https://facilitator.payai.network'],
        defaultNetwork: 'solana',
      })
    );
  });

  it('rejects SAP-x402 headers when the route does not opt in', async () => {
    const header = getX402PaymentHeader({
      'x-payment-protocol': 'SAP-x402',
      'x-payment-escrow': 'escrow-1',
      'x-payment-agent': 'agent-1',
      'x-payment-depositor': 'depositor-1',
      'x-payment-maxcalls': '15',
      'x-payment-pricepercall': '1388',
      'x-payment-program': 'program-1',
      'x-payment-network': 'mainnet-beta',
    });

    await expect(
      verifyAndSettleX402Payment(
        header,
        '/api/paid/market',
        0.005,
        'KAMIYO Market Data',
        ['solana'],
        { allowSapX402: false }
      )
    ).resolves.toEqual({
      ok: false,
      verifyError: 'sap x402 headers are not supported for this endpoint',
    });
  });
});
