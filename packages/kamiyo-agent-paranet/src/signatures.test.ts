import { describe, it, expect } from 'vitest';
import {
  extractAddressFromGlobalId,
  createSignatureVerifier,
  createTaskCompletionTypedData,
  createCapabilityAttestationTypedData,
  createTrustRelationshipTypedData,
  EIP712_DOMAIN,
  EIP712_TYPES,
  verifyTaskCompletionSignature,
  verifyCapabilityAttestationSignature,
  verifyTrustRelationshipSignature,
} from './signatures';

const validGlobalId = 'eip155:8453:0x935D2f0e59f5d5d5d5d5d5d5d5d5d5d5d5d5d5d5:123';
const validAddress = '0x935d2f0e59f5d5d5d5d5d5d5d5d5d5d5d5d5d5d5';

describe('extractAddressFromGlobalId', () => {
  it('extracts address from valid global ID', () => {
    const address = extractAddressFromGlobalId(validGlobalId);
    expect(address).toBe(validAddress);
  });

  it('returns null for invalid global ID', () => {
    expect(extractAddressFromGlobalId('invalid')).toBeNull();
    expect(extractAddressFromGlobalId('')).toBeNull();
    expect(extractAddressFromGlobalId('eip155:8453:notanaddress:123')).toBeNull();
  });

  it('handles various chain IDs', () => {
    const base = extractAddressFromGlobalId('eip155:8453:0xAbCdEf0123456789AbCdEf0123456789AbCdEf01:1');
    expect(base).toBe('0xabcdef0123456789abcdef0123456789abcdef01');

    const gnosis = extractAddressFromGlobalId('eip155:100:0x1234567890123456789012345678901234567890:99');
    expect(gnosis).toBe('0x1234567890123456789012345678901234567890');
  });
});

describe('createSignatureVerifier', () => {
  it('creates verifier with default config (signatures not required)', () => {
    const verifier = createSignatureVerifier();
    expect(verifier.config.requireSignatures).toBe(false);
  });

  it('creates verifier with custom config', () => {
    const verifier = createSignatureVerifier({
      requireSignatures: true,
      allowedSigners: [validAddress],
      maxTimestampDriftMs: 7200000,
      chainId: 100,
    });
    expect(verifier.config.requireSignatures).toBe(true);
    expect(verifier.config.allowedSigners).toContain(validAddress);
  });

  it('returns valid=true when signatures not required', async () => {
    const verifier = createSignatureVerifier({ requireSignatures: false });

    const taskResult = await verifier.verifyTaskCompletion({
      providerGlobalId: validGlobalId,
      clientGlobalId: validGlobalId,
      taskType: 'code_review',
      qualityScore: 85,
      paymentAmount: 100,
      paymentCurrency: 'USDC',
      timestamp: Date.now(),
      signature: '0x' as `0x${string}`,
    });
    expect(taskResult.valid).toBe(true);

    const attestationResult = await verifier.verifyCapabilityAttestation({
      agentGlobalId: validGlobalId,
      capability: 'code_review',
      attestorGlobalId: validGlobalId,
      confidence: 80,
      timestamp: Date.now(),
      signature: '0x' as `0x${string}`,
    });
    expect(attestationResult.valid).toBe(true);

    const trustResult = await verifier.verifyTrustRelationship({
      trustorGlobalId: validGlobalId,
      trusteeGlobalId: validGlobalId,
      trustLevel: 75,
      trustType: 'general',
      timestamp: Date.now(),
      signature: '0x' as `0x${string}`,
    });
    expect(trustResult.valid).toBe(true);
  });
});

describe('EIP712 typed data builders', () => {
  it('creates task completion typed data', () => {
    const typedData = createTaskCompletionTypedData({
      providerGlobalId: validGlobalId,
      clientGlobalId: validGlobalId,
      taskType: 'code_review',
      qualityScore: 85,
      paymentAmount: 100,
      paymentCurrency: 'USDC',
      timestamp: 1704067200000,
    });

    expect(typedData.domain).toEqual(EIP712_DOMAIN);
    expect(typedData.primaryType).toBe('TaskCompletion');
    expect(typedData.message.providerGlobalId).toBe(validGlobalId);
    expect(typedData.message.qualityScore).toBe(85);
    expect(typeof typedData.message.timestamp).toBe('bigint');
  });

  it('creates capability attestation typed data', () => {
    const typedData = createCapabilityAttestationTypedData({
      agentGlobalId: validGlobalId,
      capability: 'security_audit',
      attestorGlobalId: validGlobalId,
      confidence: 90,
      timestamp: 1704067200000,
    });

    expect(typedData.primaryType).toBe('CapabilityAttestation');
    expect(typedData.message.capability).toBe('security_audit');
    expect(typedData.message.confidence).toBe(90);
  });

  it('creates trust relationship typed data', () => {
    const typedData = createTrustRelationshipTypedData({
      trustorGlobalId: validGlobalId,
      trusteeGlobalId: validGlobalId,
      trustLevel: 80,
      trustType: 'general',
      timestamp: 1704067200000,
    });

    expect(typedData.primaryType).toBe('TrustRelationship');
    expect(typedData.message.trustLevel).toBe(80);
    expect(typedData.message.trustType).toBe('general');
  });

  it('respects custom chainId', () => {
    const typedData = createTaskCompletionTypedData(
      {
        providerGlobalId: validGlobalId,
        clientGlobalId: validGlobalId,
        taskType: 'code_review',
        qualityScore: 85,
        paymentAmount: 100,
        paymentCurrency: 'USDC',
        timestamp: 1704067200000,
      },
      100 // Gnosis chain
    );

    expect(typedData.domain.chainId).toBe(100);
  });
});

describe('EIP712 types structure', () => {
  it('has correct TaskCompletion fields', () => {
    const fields = EIP712_TYPES.TaskCompletion;
    expect(fields).toContainEqual({ name: 'providerGlobalId', type: 'string' });
    expect(fields).toContainEqual({ name: 'clientGlobalId', type: 'string' });
    expect(fields).toContainEqual({ name: 'qualityScore', type: 'uint8' });
    expect(fields).toContainEqual({ name: 'paymentAmount', type: 'uint256' });
  });

  it('has correct CapabilityAttestation fields', () => {
    const fields = EIP712_TYPES.CapabilityAttestation;
    expect(fields).toContainEqual({ name: 'agentGlobalId', type: 'string' });
    expect(fields).toContainEqual({ name: 'attestorGlobalId', type: 'string' });
    expect(fields).toContainEqual({ name: 'confidence', type: 'uint8' });
  });

  it('has correct TrustRelationship fields', () => {
    const fields = EIP712_TYPES.TrustRelationship;
    expect(fields).toContainEqual({ name: 'trustorGlobalId', type: 'string' });
    expect(fields).toContainEqual({ name: 'trusteeGlobalId', type: 'string' });
    expect(fields).toContainEqual({ name: 'trustLevel', type: 'uint8' });
  });
});

describe('signature verification', () => {
  it('rejects missing signature', async () => {
    const result = await verifyTaskCompletionSignature({
      providerGlobalId: validGlobalId,
      clientGlobalId: validGlobalId,
      taskType: 'code_review',
      qualityScore: 85,
      paymentAmount: 100,
      paymentCurrency: 'USDC',
      timestamp: Date.now(),
      signature: '' as `0x${string}`,
    });
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Missing or invalid signature');
  });

  it('rejects expired timestamp', async () => {
    const oldTimestamp = Date.now() - 7200000; // 2 hours ago
    const result = await verifyTaskCompletionSignature({
      providerGlobalId: validGlobalId,
      clientGlobalId: validGlobalId,
      taskType: 'code_review',
      qualityScore: 85,
      paymentAmount: 100,
      paymentCurrency: 'USDC',
      timestamp: oldTimestamp,
      signature: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef12' as `0x${string}`,
    });
    expect(result.valid).toBe(false);
    expect(result.error).toContain('timestamp out of range');
  });

  it('rejects future timestamp', async () => {
    const futureTimestamp = Date.now() + 120000; // 2 minutes in future
    const result = await verifyCapabilityAttestationSignature({
      agentGlobalId: validGlobalId,
      capability: 'code_review',
      attestorGlobalId: validGlobalId,
      confidence: 80,
      timestamp: futureTimestamp,
      signature: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef12' as `0x${string}`,
    });
    expect(result.valid).toBe(false);
    expect(result.error).toContain('timestamp out of range');
  });

  it('rejects invalid global ID for attestor', async () => {
    const result = await verifyCapabilityAttestationSignature({
      agentGlobalId: validGlobalId,
      capability: 'code_review',
      attestorGlobalId: 'invalid',
      confidence: 80,
      timestamp: Date.now(),
      signature: '0x1234' as `0x${string}`,
    });
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Cannot extract address');
  });

  it('rejects invalid global ID for trustor', async () => {
    const result = await verifyTrustRelationshipSignature({
      trustorGlobalId: 'invalid',
      trusteeGlobalId: validGlobalId,
      trustLevel: 75,
      trustType: 'general',
      timestamp: Date.now(),
      signature: '0x1234' as `0x${string}`,
    });
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Cannot extract address');
  });
});

describe('EIP712 domain', () => {
  it('has correct default values', () => {
    expect(EIP712_DOMAIN.name).toBe('KAMIYO Paranet');
    expect(EIP712_DOMAIN.version).toBe('1');
    expect(EIP712_DOMAIN.chainId).toBe(8453); // Base mainnet
  });
});
