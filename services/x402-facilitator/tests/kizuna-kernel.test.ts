import { beforeEach, describe, expect, it } from 'vitest';
import { clearConfigCache } from '../src/config';
import {
  hashKizunaDecisionEnvelope,
  mintLocalKizunaEnvelope,
  verifyKizunaDecisionEnvelope,
} from '../src/services/kizuna-kernel';

function seedEnv(): void {
  process.env.SOLANA_RPC_URL = 'https://api.mainnet-beta.solana.com';
  process.env.FACILITATOR_PRIVATE_KEY = JSON.stringify(Array.from({ length: 64 }, (_, i) => i));
  process.env.TREASURY_WALLET = '11111111111111111111111111111111';
  process.env.DATABASE_URL = 'postgresql://localhost:5432/test';
  process.env.KIZUNA_KERNEL_SIGNING_KEYS = JSON.stringify({ kid1: 'secret-1' });
}

describe('kizuna kernel envelope', () => {
  beforeEach(() => {
    seedEnv();
    clearConfigCache();
  });

  it('mints and verifies local envelopes', () => {
    const envelope = mintLocalKizunaEnvelope({
      decisionId: 'd-1',
      agentId: 'a-1',
      payerWallet: '11111111111111111111111111111111',
      requestNonce: 'n-1',
      network: 'eip155:8453',
      lane: 'enterprise',
      poolId: 'enterprise-main',
      approvedMicro: '1000000',
      policyPackId: 'policy-v1',
      riskBand: 'medium',
    });

    expect(envelope).toBeTruthy();
    const parsed = verifyKizunaDecisionEnvelope(envelope!);
    expect(parsed.payload.decisionId).toBe('d-1');
  });

  it('rejects tampered envelope payload', () => {
    const envelope = mintLocalKizunaEnvelope({
      decisionId: 'd-1',
      agentId: 'a-1',
      payerWallet: '11111111111111111111111111111111',
      requestNonce: 'n-1',
      network: 'eip155:8453',
      lane: 'enterprise',
      poolId: 'enterprise-main',
      approvedMicro: '1000000',
      policyPackId: 'policy-v1',
      riskBand: 'medium',
    });

    const tampered = {
      ...envelope!,
      payload: {
        ...envelope!.payload,
        approvedMicro: '2000000',
      },
    };

    expect(() => verifyKizunaDecisionEnvelope(tampered)).toThrowError(
      'kizuna_envelope_invalid_signature'
    );
  });

  it('hashes envelope deterministically', () => {
    const envelope = mintLocalKizunaEnvelope({
      decisionId: 'd-2',
      agentId: 'a-2',
      payerWallet: '11111111111111111111111111111111',
      requestNonce: 'n-2',
      network: 'eip155:8453',
      lane: 'crypto-fast',
      poolId: 'fastpath-main',
      approvedMicro: '2000000',
      policyPackId: 'policy-v1',
      riskBand: 'low',
      ltvBps: 4000,
      healthFactor: 1.8,
    });

    const hash1 = hashKizunaDecisionEnvelope(envelope!);
    const hash2 = hashKizunaDecisionEnvelope({ ...envelope! });
    expect(hash1).toBe(hash2);
  });
});
