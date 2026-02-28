import { describe, it, expect } from 'vitest';
import {
  TaskCompletionSchema,
  CapabilityAttestationSchema,
  TrustRelationshipSchema,
  PoCHContributionSchema,
  buildTaskCompletionAsset,
  buildCapabilityAttestationAsset,
  buildTrustRelationshipAsset,
  buildPoCHContributionAsset,
  parseTaskCompletionResult,
  parseCapabilityAttestationResult,
  parseTrustRelationshipResult,
  parsePoCHContributionResult,
  DKGQueryResponseSchema,
  TaskSummaryResultSchema,
  TrustSummaryResultSchema,
  safeParseDKGResponse,
} from './index';
import type { TaskCompletion, CapabilityAttestation, TrustRelationship } from '../types';

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

describe('PoCHContributionSchema', () => {
  const contribution = {
    identityDid: 'did:pkh:eip155:8453:0x1111111111111111111111111111111111111111',
    contentHash: '0xabc123ef',
    createdAt: '2026-01-01T00:00:00.000Z',
    contributionType: 'knowledge_artifact',
    provenanceRefs: ['urn:test:1'],
    contextMetadata: { topic: 'proofs' },
  } as const;

  it('validates a valid PoCH contribution', () => {
    expect(PoCHContributionSchema.safeParse(contribution).success).toBe(true);
  });

  it('rejects invalid content hash', () => {
    expect(PoCHContributionSchema.safeParse({ ...contribution, contentHash: 'x' }).success).toBe(false);
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

describe('buildPoCHContributionAsset', () => {
  it('builds a CreativeWork JSON-LD asset', () => {
    const asset = buildPoCHContributionAsset({
      identityDid: 'did:pkh:eip155:8453:0x1111111111111111111111111111111111111111',
      contentHash: '0xabc123ef',
      createdAt: '2026-01-01T00:00:00.000Z',
      contributionType: 'creative_work',
      provenanceRefs: ['urn:test:1'],
      contextMetadata: { foo: 'bar' },
    }) as Record<string, unknown>;

    expect(asset['@type']).toBe('CreativeWork');
    expect(asset['name']).toBe('PoCHContribution');
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

  it('parsePoCHContributionResult handles SPARQL result', () => {
    const result = parsePoCHContributionResult({
      assetDid: { value: 'urn:kamiyo:poch:1' },
      identityDid: { value: 'did:pkh:eip155:8453:0x1111111111111111111111111111111111111111' },
      contentHash: { value: '0xabc123' },
      contributionType: { value: 'knowledge_artifact' },
      createdAt: { value: '2026-01-01T00:00:00.000Z' },
      scoreBundleCommitment: { value: '0xcommit' },
      chainAnchors: { value: '{"solanaTxId":"5abc","baseTxHash":"0xdef"}' },
    });

    expect(result.assetDid).toBe('urn:kamiyo:poch:1');
    expect(result.contributionType).toBe('knowledge_artifact');
    expect(result.scoreBundleCommitment).toBe('0xcommit');
    expect(result.chainAnchors?.solanaTxId).toBe('5abc');
  });
});

describe('DKGQueryResponseSchema', () => {
  it('validates valid DKG response with data', () => {
    const response = {
      data: [
        { taskCount: { value: 10 }, avgQuality: { value: 85 } },
      ],
    };
    const result = DKGQueryResponseSchema.safeParse(response);
    expect(result.success).toBe(true);
  });

  it('validates response with null data', () => {
    const response = { data: null };
    const result = DKGQueryResponseSchema.safeParse(response);
    expect(result.success).toBe(true);
  });

  it('validates response with undefined data', () => {
    const response = {};
    const result = DKGQueryResponseSchema.safeParse(response);
    expect(result.success).toBe(true);
  });

  it('validates response with empty array', () => {
    const response = { data: [] };
    const result = DKGQueryResponseSchema.safeParse(response);
    expect(result.success).toBe(true);
  });

  it('allows extra fields (passthrough)', () => {
    const response = { data: [], metadata: { query: 'SELECT *' } };
    const result = DKGQueryResponseSchema.safeParse(response);
    expect(result.success).toBe(true);
  });
});

describe('TaskSummaryResultSchema', () => {
  it('validates complete task summary', () => {
    const row = {
      taskCount: { value: 100 },
      avgQuality: { value: 87.5 },
      avgResponseTime: { value: 3600000 },
      firstTask: { value: '2024-01-01T00:00:00Z' },
      lastTask: { value: '2024-06-01T00:00:00Z' },
      disputeCount: { value: 2 },
      disputesWon: { value: 1 },
    };
    const result = TaskSummaryResultSchema.safeParse(row);
    expect(result.success).toBe(true);
  });

  it('validates partial task summary', () => {
    const row = { taskCount: { value: 50 } };
    const result = TaskSummaryResultSchema.safeParse(row);
    expect(result.success).toBe(true);
  });
});

describe('TrustSummaryResultSchema', () => {
  it('validates trust summary', () => {
    const row = {
      avgTrust: { value: 75 },
      trustorCount: { value: 5 },
    };
    const result = TrustSummaryResultSchema.safeParse(row);
    expect(result.success).toBe(true);
  });
});

describe('safeParseDKGResponse', () => {
  it('returns empty array for null data', () => {
    const result = safeParseDKGResponse({ data: null });
    expect(result.data).toEqual([]);
    expect(result.error).toBeUndefined();
  });

  it('returns empty array for undefined data', () => {
    const result = safeParseDKGResponse({});
    expect(result.data).toEqual([]);
    expect(result.error).toBeUndefined();
  });

  it('returns error for completely invalid response', () => {
    const result = safeParseDKGResponse('invalid');
    expect(result.data).toBeNull();
    expect(result.error).toBeDefined();
  });

  it('parses valid data without row schema', () => {
    const response = {
      data: [
        { foo: { value: 1 } },
        { foo: { value: 2 } },
      ],
    };
    const result = safeParseDKGResponse(response);
    expect(result.data).toHaveLength(2);
  });

  it('validates rows with provided schema', () => {
    const response = {
      data: [
        { taskCount: { value: 10 }, avgQuality: { value: 85 } },
        { taskCount: { value: 20 }, avgQuality: { value: 90 } },
      ],
    };
    const result = safeParseDKGResponse(response, TaskSummaryResultSchema);
    expect(result.data).toHaveLength(2);
  });

  it('passes all rows when using passthrough schema', () => {
    const response = {
      data: [
        { taskCount: { value: 10 } },               // matches expected fields
        { unknownField: { value: 'extra' } },       // extra field, still valid
        { taskCount: { value: 20 }, extra: { value: 'data' } }, // mixed
      ],
    };
    const result = safeParseDKGResponse(response, TaskSummaryResultSchema);
    // All rows pass because schema uses passthrough and all fields are optional
    expect(result.data).toHaveLength(3);
  });

  it('rejects malformed row structure in base validation', () => {
    const response = {
      data: [
        { taskCount: { value: 10 } },
        { invalid: 'not_an_object' }, // string instead of { value: ... }
      ],
    };
    // Base schema validation fails because row values must be objects
    const result = safeParseDKGResponse(response);
    expect(result.data).toBeNull();
    expect(result.error).toBeDefined();
  });

  it('handles malformed input gracefully', () => {
    const result = safeParseDKGResponse(null);
    expect(result.data).toBeNull();
    expect(result.error).toBeDefined();
  });
});
