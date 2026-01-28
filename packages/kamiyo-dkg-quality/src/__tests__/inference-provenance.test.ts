import { describe, it, expect, beforeEach } from 'vitest';
import { Keypair } from '@solana/web3.js';
import { InferenceProvenanceTracker } from '../inference-provenance.js';

describe('InferenceProvenanceTracker', () => {
  let tracker: InferenceProvenanceTracker;
  let agent: Keypair;
  const validUal = 'did:dkg:otp/0x1234567890abcdef/12345';

  beforeEach(() => {
    tracker = new InferenceProvenanceTracker();
    agent = Keypair.generate();
  });

  describe('startInference', () => {
    it('creates new inference with unique ID', () => {
      const id1 = tracker.startInference(agent.publicKey);
      const id2 = tracker.startInference(agent.publicKey);

      expect(id1).toBeDefined();
      expect(id2).toBeDefined();
      expect(id1).not.toBe(id2);
    });

    it('initializes provenance with empty assets', () => {
      const id = tracker.startInference(agent.publicKey);
      const provenance = tracker.getProvenance(id);

      expect(provenance).toBeDefined();
      expect(provenance!.usedAssets).toHaveLength(0);
      expect(provenance!.confidence).toBe(0);
      expect(provenance!.agent.equals(agent.publicKey)).toBe(true);
    });

    it('sets timestamp', () => {
      const before = Math.floor(Date.now() / 1000);
      const id = tracker.startInference(agent.publicKey);
      const after = Math.floor(Date.now() / 1000);

      const provenance = tracker.getProvenance(id);
      expect(provenance!.timestamp).toBeGreaterThanOrEqual(before);
      expect(provenance!.timestamp).toBeLessThanOrEqual(after);
    });
  });

  describe('recordAssetUsage', () => {
    it('records asset with quality metadata', () => {
      const id = tracker.startInference(agent.publicKey);

      tracker.recordAssetUsage({
        inferenceId: id,
        assetUal: validUal,
        qualityScore: 85,
        publisherReputation: 80,
      });

      const provenance = tracker.getProvenance(id);
      expect(provenance!.usedAssets).toHaveLength(1);
      expect(provenance!.usedAssets[0].assetUal).toBe(validUal);
      expect(provenance!.usedAssets[0].qualityScore).toBe(85);
      expect(provenance!.usedAssets[0].publisherReputation).toBe(80);
    });

    it('uses default weight of 1.0', () => {
      const id = tracker.startInference(agent.publicKey);

      tracker.recordAssetUsage({
        inferenceId: id,
        assetUal: validUal,
        qualityScore: 85,
        publisherReputation: 80,
      });

      const provenance = tracker.getProvenance(id);
      expect(provenance!.usedAssets[0].weight).toBe(1.0);
    });

    it('records custom weight', () => {
      const id = tracker.startInference(agent.publicKey);

      tracker.recordAssetUsage({
        inferenceId: id,
        assetUal: validUal,
        qualityScore: 85,
        publisherReputation: 80,
        weight: 0.5,
      });

      const provenance = tracker.getProvenance(id);
      expect(provenance!.usedAssets[0].weight).toBe(0.5);
    });

    it('throws for non-existent inference', () => {
      expect(() =>
        tracker.recordAssetUsage({
          inferenceId: 'non-existent',
          assetUal: validUal,
          qualityScore: 85,
          publisherReputation: 80,
        })
      ).toThrow('Inference not found');
    });

    it('records multiple assets', () => {
      const id = tracker.startInference(agent.publicKey);
      const ual2 = 'did:dkg:otp/0xother/99999';

      tracker.recordAssetUsage({
        inferenceId: id,
        assetUal: validUal,
        qualityScore: 85,
        publisherReputation: 80,
      });

      tracker.recordAssetUsage({
        inferenceId: id,
        assetUal: ual2,
        qualityScore: 90,
        publisherReputation: 85,
      });

      const provenance = tracker.getProvenance(id);
      expect(provenance!.usedAssets).toHaveLength(2);
    });
  });

  describe('recordQueryResults', () => {
    it('records results with decreasing weights', () => {
      const id = tracker.startInference(agent.publicKey);

      tracker.recordQueryResults(id, [
        { data: {}, metadata: { qualityScore: 90, verifiedAt: 0, publisherReputation: 85, assetUal: 'did:dkg:otp/0x1/1' } },
        { data: {}, metadata: { qualityScore: 85, verifiedAt: 0, publisherReputation: 80, assetUal: 'did:dkg:otp/0x2/2' } },
        { data: {}, metadata: { qualityScore: 80, verifiedAt: 0, publisherReputation: 75, assetUal: 'did:dkg:otp/0x3/3' } },
      ]);

      const provenance = tracker.getProvenance(id);
      expect(provenance!.usedAssets).toHaveLength(3);
      expect(provenance!.usedAssets[0].weight).toBe(1.0);
      expect(provenance!.usedAssets[1].weight).toBe(0.5);
      expect(provenance!.usedAssets[2].weight).toBeCloseTo(0.333, 2);
    });
  });

  describe('finalizeInference', () => {
    it('sets confidence score', () => {
      const id = tracker.startInference(agent.publicKey);

      const result = tracker.finalizeInference({
        inferenceId: id,
        confidence: 92,
      });

      expect(result.confidence).toBe(92);
      expect(tracker.getProvenance(id)!.confidence).toBe(92);
    });

    it('sets escrow PDA', () => {
      const id = tracker.startInference(agent.publicKey);
      const escrowPda = Keypair.generate().publicKey;

      const result = tracker.finalizeInference({
        inferenceId: id,
        confidence: 92,
        escrowPda,
      });

      expect(result.escrowPda?.equals(escrowPda)).toBe(true);
    });

    it('throws for non-existent inference', () => {
      expect(() =>
        tracker.finalizeInference({
          inferenceId: 'non-existent',
          confidence: 92,
        })
      ).toThrow('Inference not found');
    });
  });

  describe('calculateWeightedConfidence', () => {
    it('returns 0 for non-existent inference', () => {
      expect(tracker.calculateWeightedConfidence('non-existent')).toBe(0);
    });

    it('returns 0 for inference with no assets', () => {
      const id = tracker.startInference(agent.publicKey);
      expect(tracker.calculateWeightedConfidence(id)).toBe(0);
    });

    it('calculates weighted average of quality scores', () => {
      const id = tracker.startInference(agent.publicKey);

      tracker.recordAssetUsage({
        inferenceId: id,
        assetUal: 'did:dkg:otp/0x1/1',
        qualityScore: 100,
        publisherReputation: 80,
        weight: 1.0,
      });

      tracker.recordAssetUsage({
        inferenceId: id,
        assetUal: 'did:dkg:otp/0x2/2',
        qualityScore: 50,
        publisherReputation: 80,
        weight: 1.0,
      });

      expect(tracker.calculateWeightedConfidence(id)).toBe(75);
    });

    it('respects weights in calculation', () => {
      const id = tracker.startInference(agent.publicKey);

      tracker.recordAssetUsage({
        inferenceId: id,
        assetUal: 'did:dkg:otp/0x1/1',
        qualityScore: 100,
        publisherReputation: 80,
        weight: 3.0, // Higher weight
      });

      tracker.recordAssetUsage({
        inferenceId: id,
        assetUal: 'did:dkg:otp/0x2/2',
        qualityScore: 0,
        publisherReputation: 80,
        weight: 1.0,
      });

      // (100*3 + 0*1) / (3+1) = 75
      expect(tracker.calculateWeightedConfidence(id)).toBe(75);
    });
  });

  describe('getProvenance', () => {
    it('returns undefined for non-existent inference', () => {
      expect(tracker.getProvenance('non-existent')).toBeUndefined();
    });

    it('returns provenance after start', () => {
      const id = tracker.startInference(agent.publicKey);
      expect(tracker.getProvenance(id)).toBeDefined();
    });
  });

  describe('getInferencesUsingAsset', () => {
    it('returns empty array for unused asset', () => {
      expect(tracker.getInferencesUsingAsset(validUal)).toHaveLength(0);
    });

    it('returns inferences that used asset', () => {
      const id1 = tracker.startInference(agent.publicKey);
      const id2 = tracker.startInference(agent.publicKey);

      tracker.recordAssetUsage({
        inferenceId: id1,
        assetUal: validUal,
        qualityScore: 85,
        publisherReputation: 80,
      });

      tracker.recordAssetUsage({
        inferenceId: id2,
        assetUal: validUal,
        qualityScore: 90,
        publisherReputation: 85,
      });

      const inferences = tracker.getInferencesUsingAsset(validUal);
      expect(inferences).toHaveLength(2);
    });

    it('excludes inferences that did not use asset', () => {
      const id1 = tracker.startInference(agent.publicKey);
      const id2 = tracker.startInference(agent.publicKey);

      tracker.recordAssetUsage({
        inferenceId: id1,
        assetUal: validUal,
        qualityScore: 85,
        publisherReputation: 80,
      });

      tracker.recordAssetUsage({
        inferenceId: id2,
        assetUal: 'did:dkg:otp/0xother/99999',
        qualityScore: 90,
        publisherReputation: 85,
      });

      const inferences = tracker.getInferencesUsingAsset(validUal);
      expect(inferences).toHaveLength(1);
      expect(inferences[0].inferenceId).toBe(id1);
    });
  });

  describe('getInferencesByAgent', () => {
    it('returns empty array for agent with no inferences', () => {
      const other = Keypair.generate();
      expect(tracker.getInferencesByAgent(other.publicKey)).toHaveLength(0);
    });

    it('returns inferences by agent', () => {
      tracker.startInference(agent.publicKey);
      tracker.startInference(agent.publicKey);

      const other = Keypair.generate();
      tracker.startInference(other.publicKey);

      const agentInferences = tracker.getInferencesByAgent(agent.publicKey);
      expect(agentInferences).toHaveLength(2);
    });
  });

  describe('calculateDisputeRefund', () => {
    it('returns 0 for non-existent inference', () => {
      expect(tracker.calculateDisputeRefund({
        inferenceId: 'non-existent',
        disputedAssets: [validUal],
      })).toBe(0);
    });

    it('returns 0 for inference with no assets', () => {
      const id = tracker.startInference(agent.publicKey);
      expect(tracker.calculateDisputeRefund({
        inferenceId: id,
        disputedAssets: [validUal],
      })).toBe(0);
    });

    it('returns 1.0 when all assets disputed', () => {
      const id = tracker.startInference(agent.publicKey);

      tracker.recordAssetUsage({
        inferenceId: id,
        assetUal: validUal,
        qualityScore: 85,
        publisherReputation: 80,
        weight: 1.0,
      });

      expect(tracker.calculateDisputeRefund({
        inferenceId: id,
        disputedAssets: [validUal],
      })).toBe(1.0);
    });

    it('returns proportional refund for partial disputes', () => {
      const id = tracker.startInference(agent.publicKey);
      const ual2 = 'did:dkg:otp/0xother/99999';

      tracker.recordAssetUsage({
        inferenceId: id,
        assetUal: validUal,
        qualityScore: 85,
        publisherReputation: 80,
        weight: 0.5,
      });

      tracker.recordAssetUsage({
        inferenceId: id,
        assetUal: ual2,
        qualityScore: 90,
        publisherReputation: 85,
        weight: 0.5,
      });

      expect(tracker.calculateDisputeRefund({
        inferenceId: id,
        disputedAssets: [validUal],
      })).toBe(0.5);
    });

    it('returns 0 when no assets disputed', () => {
      const id = tracker.startInference(agent.publicKey);

      tracker.recordAssetUsage({
        inferenceId: id,
        assetUal: validUal,
        qualityScore: 85,
        publisherReputation: 80,
      });

      expect(tracker.calculateDisputeRefund({
        inferenceId: id,
        disputedAssets: ['did:dkg:otp/0xother/99999'],
      })).toBe(0);
    });
  });

  describe('buildProvenanceJsonLd', () => {
    it('returns null for non-existent inference', () => {
      expect(tracker.buildProvenanceJsonLd('non-existent')).toBeNull();
    });

    it('builds valid JSON-LD structure', () => {
      const id = tracker.startInference(agent.publicKey);

      tracker.recordAssetUsage({
        inferenceId: id,
        assetUal: validUal,
        qualityScore: 85,
        publisherReputation: 80,
        weight: 1.0,
      });

      tracker.finalizeInference({
        inferenceId: id,
        confidence: 85,
      });

      const jsonLd = tracker.buildProvenanceJsonLd(id) as any;

      expect(jsonLd['@context']).toBeDefined();
      expect(jsonLd['@type']).toBe('prov:Activity');
      expect(jsonLd['@id']).toContain('urn:kamiyo:inference:');
      expect(jsonLd['prov:wasAssociatedWith']).toBe(agent.publicKey.toBase58());
      expect(jsonLd['kamiyo:confidence']).toBe(85);
      expect(jsonLd['prov:used']).toHaveLength(1);
      expect(jsonLd['prov:used'][0]['@id']).toBe(validUal);
    });
  });

  describe('generateProvenanceHash', () => {
    it('throws for non-existent inference', () => {
      expect(() => tracker.generateProvenanceHash('non-existent')).toThrow('Inference not found');
    });

    it('generates deterministic hash', () => {
      const id = tracker.startInference(agent.publicKey);

      tracker.recordAssetUsage({
        inferenceId: id,
        assetUal: validUal,
        qualityScore: 85,
        publisherReputation: 80,
      });

      tracker.finalizeInference({
        inferenceId: id,
        confidence: 85,
      });

      const hash1 = tracker.generateProvenanceHash(id);
      const hash2 = tracker.generateProvenanceHash(id);

      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64); // SHA256 hex
    });

    it('generates different hashes for different inferences', () => {
      const id1 = tracker.startInference(agent.publicKey);
      const id2 = tracker.startInference(agent.publicKey);

      tracker.recordAssetUsage({
        inferenceId: id1,
        assetUal: validUal,
        qualityScore: 85,
        publisherReputation: 80,
      });

      tracker.recordAssetUsage({
        inferenceId: id2,
        assetUal: validUal,
        qualityScore: 90,
        publisherReputation: 85,
      });

      tracker.finalizeInference({ inferenceId: id1, confidence: 85 });
      tracker.finalizeInference({ inferenceId: id2, confidence: 90 });

      const hash1 = tracker.generateProvenanceHash(id1);
      const hash2 = tracker.generateProvenanceHash(id2);

      expect(hash1).not.toBe(hash2);
    });
  });
});
