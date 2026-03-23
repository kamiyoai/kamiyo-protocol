import { describe, expect, it } from 'vitest';
import { hashRequestMaterial } from './decision/envelope.js';
import { canonicalString, normalizeRequestHashInput } from './decision/request-hash.js';

describe('kizuna request hashing', () => {
  it('normalizes empty optional fields', () => {
    const first = hashRequestMaterial(
      canonicalString(
        normalizeRequestHashInput({
          agentId: 'agent-1',
          repayWallet: 'repay-1',
          payerWallet: 'payer-1',
          requestNonce: 'nonce-1',
          network: 'eip155:8453',
          requestedMicro: '1000000',
          lane: 'enterprise',
          poolId: 'enterprise-main',
        })
      )
    );
    const second = hashRequestMaterial(
      canonicalString(
        normalizeRequestHashInput({
          agentId: 'agent-1',
          repayWallet: 'repay-1',
          payerWallet: 'payer-1',
          requestNonce: 'nonce-1',
          network: 'eip155:8453',
          requestedMicro: '1000000',
          resource: '',
          payTo: '',
          collateralAccount: '',
          lane: 'enterprise',
          poolId: 'enterprise-main',
        })
      )
    );

    expect(first).toBe(second);
  });
});
