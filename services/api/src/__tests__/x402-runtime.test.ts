import { describe, expect, it } from 'vitest';
import { getX402PaymentHeader } from '../x402-runtime';

describe('x402 runtime header parsing', () => {
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
});
