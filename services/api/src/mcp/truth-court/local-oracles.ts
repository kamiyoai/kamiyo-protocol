import { sha256Hex } from './hash.js';
import type {
  TruthCourtFactor,
  TruthCourtOracle,
  TruthCourtOracleRequest,
  TruthCourtOracleResponse,
  TruthCourtVerdict,
} from './types.js';

function scoreVerdict(qualityScore: number, requestedRefundPercentage: number): TruthCourtVerdict {
  if (qualityScore <= 35 || requestedRefundPercentage >= 70) {
    return 'client_wins';
  }

  if (qualityScore >= 80 && requestedRefundPercentage <= 20) {
    return 'provider_wins';
  }

  if (qualityScore < 55) {
    return 'client_wins';
  }

  return 'split';
}

function buildModelHash(label: string): string {
  return sha256Hex(`local:${label}`);
}

export class QualityBandOracle implements TruthCourtOracle {
  readonly name = 'quality-band-oracle';

  async evaluate(request: TruthCourtOracleRequest): Promise<TruthCourtOracleResponse> {
    const verdict = scoreVerdict(
      request.input.qualityScore,
      request.input.requestedRefundPercentage
    );

    const confidence = Math.min(
      0.95,
      0.6 + Math.abs(request.input.qualityScore - 50) / 100
    );

    const factors: TruthCourtFactor[] = [
      {
        name: 'quality_score',
        impact: request.input.qualityScore <= 50 ? 0.7 : -0.7,
        evidence: `quality=${request.input.qualityScore}`,
      },
      {
        name: 'requested_refund',
        impact: request.input.requestedRefundPercentage >= 50 ? 0.4 : -0.4,
        evidence: `refund=${request.input.requestedRefundPercentage}`,
      },
    ];

    return {
      oracle: this.name,
      provider: 'local',
      model: 'local-quality-band-v1',
      modelHash: buildModelHash('quality-band-v1'),
      verdict,
      confidence,
      factors,
      evidenceHash: request.evidenceHash,
      featureHash: request.featureHash,
      reasoningRef: 'local://quality-band-v1',
      generatedAt: Date.now(),
    };
  }
}

function evidenceCompletenessScore(evidence: Record<string, unknown>): number {
  const keys = Object.keys(evidence);
  if (keys.length === 0) {
    return 0;
  }
  if (keys.length >= 5) {
    return 1;
  }
  return keys.length / 5;
}

export class EvidenceIntegrityOracle implements TruthCourtOracle {
  readonly name = 'evidence-integrity-oracle';

  async evaluate(request: TruthCourtOracleRequest): Promise<TruthCourtOracleResponse> {
    const completeness = evidenceCompletenessScore(request.input.evidence);
    const hasFeatureSignals = Object.keys(request.input.featureVector).length > 0;

    let verdict: TruthCourtVerdict;
    if (completeness < 0.25 || !hasFeatureSignals) {
      verdict = 'insufficient_evidence';
    } else {
      verdict = scoreVerdict(
        request.input.qualityScore,
        request.input.requestedRefundPercentage
      );
    }

    const confidence =
      verdict === 'insufficient_evidence'
        ? 0.85
        : Math.min(0.92, 0.55 + completeness * 0.3 + (hasFeatureSignals ? 0.07 : 0));

    const factors: TruthCourtFactor[] = [
      {
        name: 'evidence_completeness',
        impact: completeness,
        evidence: `keys=${Object.keys(request.input.evidence).length}`,
      },
      {
        name: 'feature_vector_coverage',
        impact: hasFeatureSignals ? 0.6 : -0.8,
        evidence: `feature_keys=${Object.keys(request.input.featureVector).length}`,
      },
    ];

    return {
      oracle: this.name,
      provider: 'local',
      model: 'local-evidence-integrity-v1',
      modelHash: buildModelHash('evidence-integrity-v1'),
      verdict,
      confidence,
      factors,
      evidenceHash: request.evidenceHash,
      featureHash: request.featureHash,
      reasoningRef: 'local://evidence-integrity-v1',
      generatedAt: Date.now(),
    };
  }
}
