import { PublicKey } from '@solana/web3.js';
import { createHash, randomUUID } from 'crypto';
import type { UAL, InferenceProvenance, QualityQueryResult } from './types.js';

/**
 * Tracks which Knowledge Assets influenced AI decisions.
 */
export class InferenceProvenanceTracker {
  private provenances: Map<string, InferenceProvenance> = new Map();
  private assetUsage: Map<string, string[]> = new Map(); // UAL -> inference IDs

  startInference(agent: PublicKey): string {
    const inferenceId = randomUUID();

    const provenance: InferenceProvenance = {
      inferenceId,
      timestamp: Math.floor(Date.now() / 1000),
      agent,
      usedAssets: [],
      confidence: 0,
    };

    this.provenances.set(inferenceId, provenance);
    return inferenceId;
  }

  recordAssetUsage(params: {
    inferenceId: string;
    assetUal: UAL;
    qualityScore: number;
    publisherReputation: number;
    weight?: number;
  }): void {
    const { inferenceId, assetUal, qualityScore, publisherReputation, weight = 1.0 } = params;

    const provenance = this.provenances.get(inferenceId);
    if (!provenance) {
      throw new Error(`Inference not found: ${inferenceId}`);
    }

    provenance.usedAssets.push({
      assetUal,
      qualityScore,
      publisherReputation,
      weight,
    });

    // Track reverse mapping
    const usages = this.assetUsage.get(assetUal) || [];
    usages.push(inferenceId);
    this.assetUsage.set(assetUal, usages);
  }

  recordQueryResults(
    inferenceId: string,
    results: QualityQueryResult[]
  ): void {
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      // Weight decreases for later results (relevance ordering)
      const weight = 1.0 / (i + 1);

      this.recordAssetUsage({
        inferenceId,
        assetUal: result.metadata.assetUal,
        qualityScore: result.metadata.qualityScore,
        publisherReputation: result.metadata.publisherReputation,
        weight,
      });
    }
  }

  finalizeInference(params: {
    inferenceId: string;
    confidence: number;
    escrowPda?: PublicKey;
  }): InferenceProvenance {
    const { inferenceId, confidence, escrowPda } = params;

    const provenance = this.provenances.get(inferenceId);
    if (!provenance) {
      throw new Error(`Inference not found: ${inferenceId}`);
    }

    provenance.confidence = confidence;
    if (escrowPda) {
      provenance.escrowPda = escrowPda;
    }

    return provenance;
  }

  calculateWeightedConfidence(inferenceId: string): number {
    const provenance = this.provenances.get(inferenceId);
    if (!provenance || provenance.usedAssets.length === 0) {
      return 0;
    }

    let totalWeight = 0;
    let weightedScore = 0;

    for (const asset of provenance.usedAssets) {
      totalWeight += asset.weight;
      weightedScore += asset.qualityScore * asset.weight;
    }

    return Math.round(weightedScore / totalWeight);
  }

  getProvenance(inferenceId: string): InferenceProvenance | undefined {
    return this.provenances.get(inferenceId);
  }

  getInferencesUsingAsset(assetUal: UAL): InferenceProvenance[] {
    const inferenceIds = this.assetUsage.get(assetUal) || [];
    return inferenceIds
      .map((id) => this.provenances.get(id))
      .filter((p): p is InferenceProvenance => p !== undefined);
  }

  getInferencesByAgent(agent: PublicKey): InferenceProvenance[] {
    return Array.from(this.provenances.values()).filter((p) =>
      p.agent.equals(agent)
    );
  }

  calculateDisputeRefund(params: {
    inferenceId: string;
    disputedAssets: UAL[];
  }): number {
    const { inferenceId, disputedAssets } = params;

    const provenance = this.provenances.get(inferenceId);
    if (!provenance) {
      return 0;
    }

    let disputedWeight = 0;
    let totalWeight = 0;

    for (const asset of provenance.usedAssets) {
      totalWeight += asset.weight;
      if (disputedAssets.includes(asset.assetUal)) {
        disputedWeight += asset.weight;
      }
    }

    if (totalWeight === 0) return 0;

    // Refund proportion based on weight of disputed sources
    return disputedWeight / totalWeight;
  }

  buildProvenanceJsonLd(inferenceId: string): object | null {
    const provenance = this.provenances.get(inferenceId);
    if (!provenance) {
      return null;
    }

    return {
      '@context': {
        kamiyo: 'https://kamiyo.ai/schema/',
        prov: 'http://www.w3.org/ns/prov#',
      },
      '@type': 'prov:Activity',
      '@id': `urn:kamiyo:inference:${provenance.inferenceId}`,
      'prov:wasAssociatedWith': provenance.agent.toBase58(),
      'prov:generatedAtTime': new Date(provenance.timestamp * 1000).toISOString(),
      'kamiyo:confidence': provenance.confidence,
      'prov:used': provenance.usedAssets.map((asset) => ({
        '@type': 'prov:Entity',
        '@id': asset.assetUal,
        'kamiyo:qualityScore': asset.qualityScore,
        'kamiyo:publisherReputation': asset.publisherReputation,
        'kamiyo:weight': asset.weight,
      })),
    };
  }

  generateProvenanceHash(inferenceId: string): string {
    const provenance = this.provenances.get(inferenceId);
    if (!provenance) {
      throw new Error(`Inference not found: ${inferenceId}`);
    }

    const data = JSON.stringify({
      inferenceId: provenance.inferenceId,
      timestamp: provenance.timestamp,
      agent: provenance.agent.toBase58(),
      assets: provenance.usedAssets.map((a) => a.assetUal).sort(),
      confidence: provenance.confidence,
    });

    return createHash('sha256').update(data).digest('hex');
  }
}
