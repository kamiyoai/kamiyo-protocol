import { describe, expect, it } from 'vitest';
import { matchesUsdcAmount, parseSettleInput, parseVerifyInput } from '../src/protocol/request-compat';

describe('request compatibility adapters', () => {
  it('parses legacy verify input', () => {
    const parsed = parseVerifyInput({
      paymentHeader: 'exact:eip155:8453:Zm9v',
      resource: '/resource',
      maxAmount: 10,
    });

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    expect(parsed.value.mode).toBe('legacy');
    expect(parsed.value.paymentHeader).toBe('exact:eip155:8453:Zm9v');
    expect(parsed.value.resource).toBe('/resource');
    expect(parsed.value.maxAmount).toBe(10);
  });

  it('parses x402 v2 verify input (paymentHeader + paymentRequirements)', () => {
    const parsed = parseVerifyInput({
      paymentHeader: 'exact:eip155:8453:Zm9v',
      paymentRequirements: {
        scheme: 'exact',
        network: 'eip155:8453',
        amount: '1500000',
        payTo: '0x8ba1f109551bD432803012645Ac136ddd64DBA72',
        asset: 'USDC',
        resource: '/resource',
      },
    });

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    expect(parsed.value.mode).toBe('x402');
    expect(parsed.value.paymentHeader).toBe('exact:eip155:8453:Zm9v');
    expect(parsed.value.requirementNetwork).toBe('eip155:8453');
    expect(parsed.value.requirementAmountRaw).toBe('1500000');
    expect(parsed.value.resource).toBe('/resource');
  });

  it('parses Kizuna extension from verify paymentRequirements.extra', () => {
    const parsed = parseVerifyInput({
      paymentHeader: 'exact:eip155:8453:Zm9v',
      paymentRequirements: {
        scheme: 'exact',
        network: 'eip155:8453',
        amount: '1500000',
        payTo: '0x8ba1f109551bD432803012645Ac136ddd64DBA72',
        asset: 'USDC',
        extra: {
          kizuna: {
            mode: 'credit',
            agentId: 'agent-123',
            repayWallet: '11111111111111111111111111111111',
          },
        },
      },
    });

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.requirementKizuna).toEqual({
      mode: 'credit',
      agentId: 'agent-123',
      repayWallet: '11111111111111111111111111111111',
      lane: 'enterprise',
      collateralAccount: undefined,
      poolId: undefined,
      decisionEnvelope: undefined,
    });
  });

  it('parses x402 verify input and derives payment header from payload object', () => {
    const parsed = parseVerifyInput({
      paymentPayload: {
        x402Version: 2,
        accepted: {
          scheme: 'exact',
          network: 'eip155:8453',
          amount: '1500000',
        },
        payload: {
          signature: 'tx123',
          payer: '11111111111111111111111111111111',
          timestamp: Date.now(),
          nonce: 'n1',
          resource: '/resource',
          amount: '1.5',
          authSignature: 'Zm9v',
        },
      },
      paymentRequirements: {
        scheme: 'exact',
        network: 'eip155:8453',
        amount: '1500000',
      },
    });

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    expect(parsed.value.mode).toBe('x402');
    expect(parsed.value.paymentHeader.startsWith('exact:eip155:8453:')).toBe(true);
    expect(parsed.value.requirementAmountRaw).toBe('1500000');
  });

  it('parses x402 v2 settle input (paymentHeader + paymentRequirements) and extracts payTo', () => {
    const parsed = parseSettleInput({
      paymentHeader: 'exact:eip155:8453:Zm9v',
      paymentRequirements: {
        scheme: 'exact',
        network: 'eip155:8453',
        amount: '1000000',
        payTo: '0x8ba1f109551bD432803012645Ac136ddd64DBA72',
        asset: 'USDC',
        resource: '/settlements/demo',
      },
    });

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    expect(parsed.value.mode).toBe('x402');
    expect(parsed.value.merchantWallet).toBe('0x8ba1f109551bD432803012645Ac136ddd64DBA72');
    expect(parsed.value.requirementAmountRaw).toBe('1000000');
    expect(parsed.value.requirementResource).toBe('/settlements/demo');
  });

  it('parses Kizuna extension from settle paymentRequirements.extra', () => {
    const parsed = parseSettleInput({
      paymentHeader: 'exact:eip155:8453:Zm9v',
      paymentRequirements: {
        scheme: 'exact',
        network: 'eip155:8453',
        amount: '1000000',
        payTo: '0x8ba1f109551bD432803012645Ac136ddd64DBA72',
        asset: 'USDC',
        extra: {
          kizuna: {
            mode: 'credit',
            agentId: 'agent-123',
            repayWallet: '11111111111111111111111111111111',
          },
        },
      },
    });

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.requirementKizuna).toEqual({
      mode: 'credit',
      agentId: 'agent-123',
      repayWallet: '11111111111111111111111111111111',
      lane: 'enterprise',
      collateralAccount: undefined,
      poolId: undefined,
      decisionEnvelope: undefined,
    });
  });

  it('parses lane and collateral fields from Kizuna extension', () => {
    const parsed = parseSettleInput({
      paymentHeader: 'exact:eip155:8453:Zm9v',
      paymentRequirements: {
        scheme: 'exact',
        network: 'eip155:8453',
        amount: '1000000',
        payTo: '0x8ba1f109551bD432803012645Ac136ddd64DBA72',
        asset: 'USDC',
        extra: {
          kizuna: {
            mode: 'credit',
            agentId: 'agent-fast',
            repayWallet: '11111111111111111111111111111111',
            lane: 'crypto-fast',
            collateralAccount: '0xabc123',
            poolId: 'fastpath-main',
            decisionEnvelope: { keyId: 'kid-1' },
          },
        },
      },
    });

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.requirementKizuna).toEqual({
      mode: 'credit',
      agentId: 'agent-fast',
      repayWallet: '11111111111111111111111111111111',
      lane: 'crypto-fast',
      collateralAccount: '0xabc123',
      poolId: 'fastpath-main',
      decisionEnvelope: { keyId: 'kid-1' },
    });
  });

  it('rejects crypto-fast requests without collateralAccount', () => {
    const parsed = parseVerifyInput({
      paymentHeader: 'exact:eip155:8453:Zm9v',
      paymentRequirements: {
        scheme: 'exact',
        network: 'eip155:8453',
        amount: '1000000',
        extra: {
          kizuna: {
            mode: 'credit',
            agentId: 'agent-fast',
            repayWallet: '11111111111111111111111111111111',
            lane: 'crypto-fast',
          },
        },
      },
    });

    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.error).toContain('collateralAccount');
  });

  it('parses x402 settle input and extracts payTo', () => {
    const parsed = parseSettleInput({
      paymentPayload: {
        x402Version: 2,
        accepted: {
          scheme: 'exact',
          network: 'eip155:8453',
          amount: '1000000',
          payTo: '0x8ba1f109551bD432803012645Ac136ddd64DBA72',
          asset: 'USDC',
        },
        payload: {
          paymentHeader: 'exact:eip155:8453:Zm9v',
        },
      },
      paymentRequirements: {
        scheme: 'exact',
        network: 'eip155:8453',
        amount: '1000000',
        payTo: '0x8ba1f109551bD432803012645Ac136ddd64DBA72',
        asset: 'USDC',
        resource: '/settlements/demo',
      },
    });

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    expect(parsed.value.mode).toBe('x402');
    expect(parsed.value.merchantWallet).toBe('0x8ba1f109551bD432803012645Ac136ddd64DBA72');
    expect(parsed.value.requirementAmountRaw).toBe('1000000');
    expect(parsed.value.requirementResource).toBe('/settlements/demo');
  });

  it('matches requirement amounts in decimal and base units', () => {
    expect(matchesUsdcAmount(1.5, '1.5')).toBe(true);
    expect(matchesUsdcAmount(1.5, '1500000')).toBe(true);
    expect(matchesUsdcAmount(1.5, '1400000')).toBe(false);
  });
});
