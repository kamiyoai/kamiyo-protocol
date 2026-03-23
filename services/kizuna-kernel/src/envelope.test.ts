import { generateKeyPairSync, createVerify } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { clearConfigCache } from './config.js';
import { clearSigningContextCache, getEnvelopeMaterial, mintDecisionEnvelope } from './decision/envelope.js';

const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const privateKeyPem = privateKey.export({ format: 'pem', type: 'pkcs8' }).toString();
const publicKeyPem = publicKey.export({ format: 'pem', type: 'spki' }).toString();

function seedEnv(): void {
  process.env.DATABASE_URL = 'postgresql://localhost:5432/kernel_test';
  process.env.KIZUNA_KERNEL_INTERNAL_TOKEN = 'internal-token';
  process.env.KIZUNA_KERNEL_OPERATOR_TOKEN = 'operator-token';
  process.env.KIZUNA_KERNEL_SIGNING_BACKEND = 'local-pem';
  process.env.KIZUNA_KERNEL_ACTIVE_SIGNING_KID = 'kernel-v2';
  process.env.KIZUNA_KERNEL_LOCAL_PRIVATE_KEYS = JSON.stringify({ 'kernel-v2': privateKeyPem });
  process.env.KIZUNA_KERNEL_ACTIVE_POLICY_PACKS = JSON.stringify({
    enterprise: 'enterprise-default-v1',
    'crypto-fast': 'fastpath-default-v1',
  });
}

describe('kizuna envelope signing', () => {
  beforeEach(() => {
    seedEnv();
    clearConfigCache();
    clearSigningContextCache();
  });

  it('mints ES256 envelopes that verify with the public key', async () => {
    const envelope = await mintDecisionEnvelope({
      ttlMs: 120_000,
      payload: {
        decisionId: 'dec-1',
        agentId: 'agent-1',
        payerWallet: 'payer-1',
        repayWallet: 'repay-1',
        requestNonce: 'nonce-1',
        network: 'eip155:8453',
        lane: 'enterprise',
        poolId: 'enterprise-main',
        approvedMicro: '1000000',
        policyPackId: 'enterprise-default-v1',
        policyPackVersion: 'v1',
        riskLevel: 'medium',
        riskAction: 'none',
        requestHash: 'request-hash',
      },
    });

    const verifier = createVerify('SHA256');
    verifier.update(
      getEnvelopeMaterial({
        version: envelope.version,
        alg: envelope.alg,
        kid: envelope.kid,
        issuedAt: envelope.issuedAt,
        expiresAt: envelope.expiresAt,
        payload: envelope.payload,
      })
    );
    verifier.end();

    expect(verifier.verify(publicKeyPem, Buffer.from(envelope.signature, 'base64url'))).toBe(true);
  });
});
