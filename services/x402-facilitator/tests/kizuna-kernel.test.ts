import { generateKeyPairSync } from 'crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { clearConfigCache } from '../src/config';
import {
  hashKizunaDecisionEnvelope,
  verifyKizunaDecisionEnvelope,
} from '../src/services/kizuna-kernel';
import {
  mintLegacyDecisionEnvelope,
  mintV2DecisionEnvelope,
} from './helpers/kizuna-envelopes';

const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const publicKeyPem = publicKey.export({ format: 'pem', type: 'spki' }).toString();
const privateKeyPem = privateKey.export({ format: 'pem', type: 'pkcs8' }).toString();

function seedEnv(): void {
  process.env.SOLANA_RPC_URL = 'https://api.mainnet-beta.solana.com';
  process.env.FACILITATOR_PRIVATE_KEY = JSON.stringify(Array.from({ length: 64 }, (_, i) => i));
  process.env.TREASURY_WALLET = '11111111111111111111111111111111';
  process.env.DATABASE_URL = 'postgresql://localhost:5432/test';
  process.env.KIZUNA_KERNEL_SIGNING_KEYS = JSON.stringify({ kid1: 'secret-1' });
  process.env.KIZUNA_KERNEL_PUBLIC_KEYS = JSON.stringify({ 'kernel-v2': publicKeyPem });
}

describe('kizuna kernel envelope', () => {
  beforeEach(() => {
    seedEnv();
    clearConfigCache();
  });

  it('verifies legacy envelopes during migration', () => {
    const envelope = mintLegacyDecisionEnvelope(
      {
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
      },
      'secret-1'
    );

    const parsed = verifyKizunaDecisionEnvelope(envelope);
    expect(parsed.version).toBe('kizuna-envelope-v1');
    expect(parsed.payload.decisionId).toBe('d-1');
  });

  it('verifies v2 envelopes with public keys', () => {
    const envelope = mintV2DecisionEnvelope({
      privateKeyPem,
      payload: {
        decisionId: 'd-2',
        agentId: 'a-2',
        payerWallet: '11111111111111111111111111111111',
        repayWallet: '22222222222222222222222222222222',
        requestNonce: 'n-2',
        network: 'eip155:8453',
        lane: 'crypto-fast',
        poolId: 'fastpath-main',
        approvedMicro: '2000000',
        policyPackId: 'policy-v2',
        policyPackVersion: 'v2',
        riskLevel: 'low',
        riskAction: 'none',
        requestHash: 'abc123',
        ltvBps: 4000,
        healthFactor: 1.8,
      },
    });

    const parsed = verifyKizunaDecisionEnvelope(envelope);
    expect(parsed.version).toBe('kizuna-envelope-v2');
    expect(parsed.payload.decisionId).toBe('d-2');
  });

  it('rejects tampered v2 payloads', () => {
    const envelope = mintV2DecisionEnvelope({
      privateKeyPem,
      payload: {
        decisionId: 'd-3',
        agentId: 'a-3',
        payerWallet: '11111111111111111111111111111111',
        repayWallet: '22222222222222222222222222222222',
        requestNonce: 'n-3',
        network: 'eip155:8453',
        lane: 'enterprise',
        poolId: 'enterprise-main',
        approvedMicro: '1000000',
        policyPackId: 'policy-v2',
        policyPackVersion: 'v2',
        riskLevel: 'medium',
        riskAction: 'none',
        requestHash: 'hash-1',
      },
    });

    const tampered = {
      ...envelope,
      payload: {
        ...envelope.payload,
        approvedMicro: '2000000',
      },
    };

    expect(() => verifyKizunaDecisionEnvelope(tampered)).toThrowError(
      'kizuna_envelope_invalid_signature'
    );
  });

  it('hashes envelopes deterministically', () => {
    const envelope = mintLegacyDecisionEnvelope(
      {
        decisionId: 'd-4',
        agentId: 'a-4',
        payerWallet: '11111111111111111111111111111111',
        requestNonce: 'n-4',
        network: 'eip155:8453',
        lane: 'crypto-fast',
        poolId: 'fastpath-main',
        approvedMicro: '2000000',
        policyPackId: 'policy-v1',
        riskBand: 'low',
        ltvBps: 4000,
        healthFactor: 1.8,
      },
      'secret-1'
    );

    const hash1 = hashKizunaDecisionEnvelope(envelope);
    const hash2 = hashKizunaDecisionEnvelope({ ...envelope });
    expect(hash1).toBe(hash2);
  });
});
