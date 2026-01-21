import { describe, it, expect, beforeEach } from 'vitest';
import { ReasoningChainBuilder } from '../verification/reasoningChain';
import { Verifier } from '../verification/verifier';
import type { DeliberationResult, GatheredEvidence } from '../deliberation/types';
import type { EvaluationContext } from '../types';

describe('ReasoningChainBuilder', () => {
  let builder: ReasoningChainBuilder;
  let mockDeliberation: DeliberationResult;
  let mockContext: EvaluationContext;
  let mockEvidence: GatheredEvidence;

  beforeEach(() => {
    builder = new ReasoningChainBuilder();
    mockDeliberation = createMockDeliberation();
    mockContext = createMockContext();
    mockEvidence = createMockEvidence();
  });

  describe('build', () => {
    it('creates reasoning chain with all steps', () => {
      const chain = builder.build(mockDeliberation, mockContext, mockEvidence);

      expect(chain.id).toBe(mockDeliberation.id);
      expect(chain.escrowPda).toBe(mockDeliberation.escrowPda);
      expect(chain.finalScore).toBe(mockDeliberation.finalScore);
      expect(chain.confidence).toBe(mockDeliberation.confidence);
      expect(chain.steps.length).toBeGreaterThan(0);
    });

    it('includes context step', () => {
      const chain = builder.build(mockDeliberation, mockContext, mockEvidence);
      const contextStep = chain.steps.find((s) => s.type === 'context');

      expect(contextStep).toBeDefined();
      expect(contextStep?.content).toContain('Dispute Context');
    });

    it('includes evidence step when evidence provided', () => {
      const chain = builder.build(mockDeliberation, mockContext, mockEvidence);
      const evidenceStep = chain.steps.find((s) => s.type === 'evidence');

      expect(evidenceStep).toBeDefined();
      expect(evidenceStep?.content).toContain('Evidence Gathered');
    });

    it('skips evidence step when no evidence', () => {
      const chain = builder.build(mockDeliberation, mockContext, null);
      const evidenceStep = chain.steps.find((s) => s.type === 'evidence');

      expect(evidenceStep).toBeUndefined();
    });

    it('includes debate steps for each round', () => {
      const chain = builder.build(mockDeliberation, mockContext, mockEvidence);
      const debateSteps = chain.steps.filter((s) => s.type === 'debate');

      // 2 debate steps per round (agent + provider) * 2 rounds = 4
      expect(debateSteps.length).toBe(4);
    });

    it('includes judgment step', () => {
      const chain = builder.build(mockDeliberation, mockContext, mockEvidence);
      const judgmentStep = chain.steps.find((s) => s.type === 'judgment');

      expect(judgmentStep).toBeDefined();
      expect(judgmentStep?.actor).toBe('arbiter');
      expect(judgmentStep?.content).toContain('Final Judgment');
    });

    it('calculates root hash', () => {
      const chain = builder.build(mockDeliberation, mockContext, mockEvidence);

      expect(chain.rootHash).toBeDefined();
      expect(chain.rootHash.length).toBe(64); // hex-encoded SHA256
    });

    it('each step has unique hash', () => {
      const chain = builder.build(mockDeliberation, mockContext, mockEvidence);
      const hashes = chain.steps.map((s) => s.hash);
      const uniqueHashes = new Set(hashes);

      expect(uniqueHashes.size).toBe(hashes.length);
    });
  });

  describe('createCommitment', () => {
    it('creates commitment from chain', () => {
      const chain = builder.build(mockDeliberation, mockContext, mockEvidence);
      const commitment = builder.createCommitment(chain);

      expect(commitment.chainId).toBe(chain.id);
      expect(commitment.escrowPda).toBe(chain.escrowPda);
      expect(commitment.rootHash).toBe(chain.rootHash);
      expect(commitment.finalScore).toBe(chain.finalScore);
      expect(commitment.timestamp).toBe(chain.createdAt);
    });
  });

  describe('verify', () => {
    it('verifies valid chain against commitment', () => {
      const chain = builder.build(mockDeliberation, mockContext, mockEvidence);
      const commitment = builder.createCommitment(chain);

      expect(builder.verify(chain, commitment)).toBe(true);
    });

    it('rejects modified chain', () => {
      const chain = builder.build(mockDeliberation, mockContext, mockEvidence);
      const commitment = builder.createCommitment(chain);

      // Tamper with chain
      chain.finalScore = 99;

      expect(builder.verify(chain, commitment)).toBe(false);
    });

    it('rejects mismatched commitment', () => {
      const chain = builder.build(mockDeliberation, mockContext, mockEvidence);
      const commitment = builder.createCommitment(chain);

      // Create different commitment
      commitment.rootHash = 'tampered_hash';

      expect(builder.verify(chain, commitment)).toBe(false);
    });
  });

  describe('serialization', () => {
    it('serializes and deserializes chain', () => {
      const chain = builder.build(mockDeliberation, mockContext, mockEvidence);
      const json = builder.serialize(chain);
      const restored = builder.deserialize(json);

      expect(restored.id).toBe(chain.id);
      expect(restored.rootHash).toBe(chain.rootHash);
      expect(restored.steps.length).toBe(chain.steps.length);
    });
  });
});

describe('Verifier', () => {
  let verifier: Verifier;
  let builder: ReasoningChainBuilder;

  beforeEach(() => {
    verifier = new Verifier();
    builder = new ReasoningChainBuilder();
  });

  describe('verify', () => {
    it('validates correct chain', () => {
      const chain = builder.build(
        createMockDeliberation(),
        createMockContext(),
        createMockEvidence()
      );
      const commitment = builder.createCommitment(chain);

      const result = verifier.verify(chain, commitment);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('validates step hash integrity', () => {
      const chain = builder.build(
        createMockDeliberation(),
        createMockContext(),
        createMockEvidence()
      );
      const commitment = builder.createCommitment(chain);

      // Tamper with step content
      chain.steps[0].content = 'tampered content';

      const result = verifier.verify(chain, commitment);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e: string) => e.includes('hash'))).toBe(true);
    });

    it('detects commitment mismatch', () => {
      const chain = builder.build(
        createMockDeliberation(),
        createMockContext(),
        createMockEvidence()
      );
      const commitment = builder.createCommitment(chain);

      commitment.rootHash = 'wrong_hash';

      const result = verifier.verify(chain, commitment);

      expect(result.valid).toBe(false);
    });
  });

  describe('generateAuditReport', () => {
    it('generates report with all fields', () => {
      const chain = builder.build(
        createMockDeliberation(),
        createMockContext(),
        createMockEvidence()
      );
      const commitment = builder.createCommitment(chain);

      const report = verifier.generateAuditReport(chain, commitment);

      expect(report.chainId).toBe(chain.id);
      expect(report.verification.valid).toBe(true);
      expect(report.summary.totalSteps).toBeGreaterThan(0);
      expect(report.timeline.length).toBe(chain.steps.length);
    });
  });
});

function createMockDeliberation(): DeliberationResult {
  return {
    id: 'deliberation-123',
    escrowPda: 'escrowPda12345678901234567890123456789012',
    transcript: [
      {
        round: 1,
        agentArgument: {
          position: 'Agent argues for refund',
          keyPoints: ['Point 1', 'Point 2'],
          evidenceCited: ['Evidence A'],
          confidence: 70,
        },
        providerArgument: {
          position: 'Provider argues for payment',
          keyPoints: ['Point 3', 'Point 4'],
          evidenceCited: ['Evidence B'],
          confidence: 65,
        },
        investigatorChallenges: [
          {
            target: 'both',
            challenge: 'Provide more evidence',
            weaknessIdentified: 'Insufficient documentation',
          },
        ],
        agentResponse: {
          advocate: 'agent',
          response: 'Agent responds',
          strengthenedPoints: ['Strengthened 1'],
        },
        providerResponse: {
          advocate: 'provider',
          response: 'Provider responds',
          strengthenedPoints: ['Strengthened 2'],
        },
        timestamp: Date.now(),
      },
      {
        round: 2,
        agentArgument: {
          position: 'Agent refines argument',
          keyPoints: ['Refined 1'],
          evidenceCited: ['Evidence C'],
          confidence: 75,
        },
        providerArgument: {
          position: 'Provider refines argument',
          keyPoints: ['Refined 2'],
          evidenceCited: ['Evidence D'],
          confidence: 60,
        },
        investigatorChallenges: [],
        agentResponse: {
          advocate: 'agent',
          response: 'Final agent response',
          strengthenedPoints: [],
        },
        providerResponse: {
          advocate: 'provider',
          response: 'Final provider response',
          strengthenedPoints: [],
        },
        timestamp: Date.now(),
      },
    ],
    arbiterAnalysis: {
      agentStrengths: ['Strong evidence'],
      agentWeaknesses: ['Limited documentation'],
      providerStrengths: ['Good history'],
      providerWeaknesses: ['Delayed delivery'],
      investigatorInsights: ['Timeline inconsistency'],
      evidenceWeight: {
        supportingAgent: 40,
        supportingProvider: 35,
        inconclusive: 25,
      },
    },
    finalScore: 45,
    confidence: 'medium',
    arbiterReasoning: 'Based on the evidence presented, the agent has demonstrated partial validity in their claim. Reasoning: The provider did not fully meet SLA requirements.',
    keyFactors: ['Evidence quality', 'Timeline analysis'],
    metadata: {
      totalRounds: 2,
      totalLLMCalls: 8,
      deliberationTimeMs: 15000,
      modelUsed: 'claude-3-5-sonnet-20241022',
    },
  };
}

function createMockContext(): EvaluationContext {
  return {
    escrow: {
      pda: 'escrowPda12345678901234567890123456789012',
      amount: 2.5,
      status: 'disputed',
      createdAt: Date.now() / 1000 - 86400,
      expiresAt: Date.now() / 1000 + 86400,
      transactionId: 'tx-12345',
    },
    agent: {
      pubkey: 'agentPubkey123456789012345678901234567890',
      reputation: 750,
      totalEscrows: 25,
      disputeRate: 12,
    },
    provider: {
      pubkey: 'providerPubkey12345678901234567890123456',
      reputation: 680,
      totalEscrows: 100,
      disputeRate: 8,
      averageQualityScore: 72,
    },
    service: {
      type: 'api_access',
      description: 'API service subscription',
      slaTerms: ['99.9% uptime', '< 100ms response time'],
    },
    evidence: {
      agentClaim: 'Service was not delivered as promised',
      providerClaim: 'Service was delivered on time',
    },
  };
}

function createMockEvidence(): GatheredEvidence {
  return {
    onChain: {
      agentTransactions: [
        {
          signature: 'sig123',
          timestamp: Date.now() / 1000 - 1000,
          type: 'transfer',
          amount: 2.5,
          success: true,
        },
      ],
      providerTransactions: [
        {
          signature: 'sig456',
          timestamp: Date.now() / 1000 - 500,
          type: 'transfer',
          success: true,
        },
      ],
      previousDisputes: [],
      escrowHistory: [],
    },
    offChain: {
      apiHealthCheck: {
        endpoint: 'https://api.example.com',
        reachable: true,
        responseTimeMs: 150,
        statusCode: 200,
      },
    },
    patterns: {
      similarDisputes: [],
      fraudIndicators: [],
      legitimacySignals: [
        {
          type: 'established_account',
          strength: 'moderate',
          description: 'Provider has established history',
        },
      ],
    },
  };
}
