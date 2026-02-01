import { describe, it, expect } from 'vitest';
import {
  TaskCompletionSchema,
  CapabilityAttestationSchema,
  TrustRelationshipSchema,
  buildTaskCompletionAsset,
  buildCapabilityAttestationAsset,
  buildTrustRelationshipAsset,
  parseTaskCompletionResult,
  parseCapabilityAttestationResult,
  parseTrustRelationshipResult,
} from './index.js';
import type { TaskCompletion, CapabilityAttestation, TrustRelationship } from '../types.js';

const validGlobalId = 'eip155:8453:0x935D2f0e59f5d5d5d5d5d5d5d5d5d5d5d5d5d5d5:123';

describe('TaskCompletionSchema', () => {
  const validTask: TaskCompletion = {
    providerGlobalId: validGlobalId,
    clientGlobalId: validGlobalId,
    taskType: 'code_review',
    taskDescription: 'Reviewed smart contract for security issues',
    startTime: '2024-01-01T00:00:00.000Z',
    endTime: '2024-01-01T02:00:00.000Z',
    qualityScore: 85,
    responseTimeMs: 7200000,
    payment: { amount: 100, currency: 'USDC' },
    disputeOutcome: 'none',
  };

  it('validates correct task completion', () => {
    const result = TaskCompletionSchema.safeParse(validTask);
    expect(result.success).toBe(true);
  });

  it('rejects invalid global ID', () => {
    const result = TaskCompletionSchema.safeParse({
      ...validTask,
      providerGlobalId: 'invalid',
    });
    expect(result.success).toBe(false);
  });

  it('rejects quality score out of range', () => {
    expect(TaskCompletionSchema.safeParse({ ...validTask, qualityScore: -1 }).success).toBe(false);
    expect(TaskCompletionSchema.safeParse({ ...validTask, qualityScore: 101 }).success).toBe(false);
  });

  it('rejects empty task description', () => {
    const result = TaskCompletionSchema.safeParse({
      ...validTask,
      taskDescription: '',
    });
    expect(result.success).toBe(false);
  });

  it('rejects overly long task description', () => {
    const result = TaskCompletionSchema.safeParse({
      ...validTask,
      taskDescription: 'x'.repeat(1001),
    });
    expect(result.success).toBe(false);
  });
});

describe('CapabilityAttestationSchema', () => {
  const validAttestation: CapabilityAttestation = {
    agentGlobalId: validGlobalId,
    capability: 'solidity_audit',
    attestorGlobalId: validGlobalId,
    attestationType: 'peer',
    confidence: 90,
  };

  it('validates correct attestation', () => {
    const result = CapabilityAttestationSchema.safeParse(validAttestation);
    expect(result.success).toBe(true);
  });

  it('rejects invalid attestation type', () => {
    const result = CapabilityAttestationSchema.safeParse({
      ...validAttestation,
      attestationType: 'invalid',
    });
    expect(result.success).toBe(false);
  });

  it('rejects confidence out of range', () => {
    expect(CapabilityAttestationSchema.safeParse({ ...validAttestation, confidence: -1 }).success).toBe(false);
    expect(CapabilityAttestationSchema.safeParse({ ...validAttestation, confidence: 101 }).success).toBe(false);
  });
});

describe('TrustRelationshipSchema', () => {
  const validTrust: TrustRelationship = {
    trustorGlobalId: validGlobalId,
    trusteeGlobalId: validGlobalId,
    trustLevel: 80,
    trustType: 'general',
    since: '2024-01-01T00:00:00.000Z',
  };

  it('validates correct trust relationship', () => {
    const result = TrustRelationshipSchema.safeParse(validTrust);
    expect(result.success).toBe(true);
  });

  it('rejects invalid trust type', () => {
    const result = TrustRelationshipSchema.safeParse({
      ...validTrust,
      trustType: 'invalid',
    });
    expect(result.success).toBe(false);
  });

  it('rejects trust level out of range', () => {
    expect(TrustRelationshipSchema.safeParse({ ...validTrust, trustLevel: -1 }).success).toBe(false);
    expect(TrustRelationshipSchema.safeParse({ ...validTrust, trustLevel: 101 }).success).toBe(false);
  });
});

describe('buildTaskCompletionAsset', () => {
  const task: TaskCompletion = {
    providerGlobalId: validGlobalId,
    clientGlobalId: validGlobalId,
    taskType: 'code_review',
    taskDescription: 'Test task',
    startTime: '2024-01-01T00:00:00.000Z',
    endTime: '2024-01-01T02:00:00.000Z',
    qualityScore: 85,
    responseTimeMs: 7200000,
    payment: { amount: 100, currency: 'USDC' },
    disputeOutcome: 'none',
  };

  it('builds valid JSON-LD asset', () => {
    const asset = buildTaskCompletionAsset(task) as Record<string, unknown>;

    expect(asset['@type']).toBe('Action');
    expect(asset['name']).toBe('TaskCompletion');
    expect((asset['agent'] as Record<string, string>)['@id']).toContain(validGlobalId);
    expect((asset['result'] as Record<string, number>)['ratingValue']).toBe(85);
  });

  it('includes payment info', () => {
    const asset = buildTaskCompletionAsset(task) as Record<string, unknown>;
    const payment = asset['object'] as Record<string, unknown>;

    expect(payment['@type']).toBe('MonetaryAmount');
    expect(payment['value']).toBe(100);
    expect(payment['currency']).toBe('USDC');
  });
});

describe('buildCapabilityAttestationAsset', () => {
  const attestation: CapabilityAttestation = {
    agentGlobalId: validGlobalId,
    capability: 'solidity_audit',
    attestorGlobalId: validGlobalId,
    attestationType: 'peer',
    confidence: 90,
  };

  it('builds valid JSON-LD asset', () => {
    const asset = buildCapabilityAttestationAsset(attestation) as Record<string, unknown>;

    expect(asset['@type']).toBe('EndorseAction');
    expect(asset['name']).toBe('CapabilityAttestation');
    expect((asset['result'] as Record<string, number>)['ratingValue']).toBe(90);
  });
});

describe('buildTrustRelationshipAsset', () => {
  const trust: TrustRelationship = {
    trustorGlobalId: validGlobalId,
    trusteeGlobalId: validGlobalId,
    trustLevel: 80,
    trustType: 'general',
    since: '2024-01-01T00:00:00.000Z',
  };

  it('builds valid JSON-LD asset', () => {
    const asset = buildTrustRelationshipAsset(trust) as Record<string, unknown>;

    expect(asset['@type']).toBe('EndorseAction');
    expect(asset['name']).toBe('TrustRelationship');
    expect(asset['actionStatus']).toBe('ActiveActionStatus');
  });

  it('marks expired trust as completed', () => {
    const expiredTrust = { ...trust, until: '2024-01-02T00:00:00.000Z' };
    const asset = buildTrustRelationshipAsset(expiredTrust) as Record<string, unknown>;

    expect(asset['actionStatus']).toBe('CompletedActionStatus');
  });
});

describe('parse functions', () => {
  it('parseTaskCompletionResult handles SPARQL result', () => {
    const result = parseTaskCompletionResult({
      provider: { value: `urn:erc8004:${validGlobalId}` },
      quality: { value: 85 },
      taskType: { value: 'code_review' },
      dispute: { value: 'none' },
    });

    expect(result.providerGlobalId).toBe(validGlobalId);
    expect(result.qualityScore).toBe(85);
    expect(result.taskType).toBe('code_review');
  });

  it('parseCapabilityAttestationResult handles SPARQL result', () => {
    const result = parseCapabilityAttestationResult({
      agent: { value: `urn:erc8004:${validGlobalId}` },
      capability: { value: 'solidity' },
      confidence: { value: 90 },
    });

    expect(result.agentGlobalId).toBe(validGlobalId);
    expect(result.capability).toBe('solidity');
    expect(result.confidence).toBe(90);
  });

  it('parseTrustRelationshipResult handles SPARQL result', () => {
    const result = parseTrustRelationshipResult({
      trustor: { value: `urn:erc8004:${validGlobalId}` },
      trustee: { value: `urn:erc8004:${validGlobalId}` },
      trustLevel: { value: 80 },
      trustType: { value: 'general' },
    });

    expect(result.trustorGlobalId).toBe(validGlobalId);
    expect(result.trustLevel).toBe(80);
    expect(result.trustType).toBe('general');
  });
});
