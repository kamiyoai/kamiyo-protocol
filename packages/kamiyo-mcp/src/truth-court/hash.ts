import { createHash } from 'node:crypto';
import type {
  TruthCourtCaseInput,
  TruthCourtOracleResponse,
  TruthCourtReplayDigest,
} from './types.js';

function normalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => normalize(item));
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, normalize(entry)]);
    return Object.fromEntries(entries);
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      return String(value);
    }
    return Number(value.toFixed(12));
  }

  return value;
}

export function stableStringify(value: unknown): string {
  return JSON.stringify(normalize(value));
}

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function hashJson(value: unknown): string {
  return sha256Hex(stableStringify(value));
}

export function computeCaseHashes(input: TruthCourtCaseInput): {
  caseHash: string;
  evidenceHash: string;
  featureHash: string;
} {
  const evidenceHash = hashJson(input.evidence);
  const featureHash = hashJson(input.featureVector);

  const casePayload = {
    transactionId: input.transactionId,
    claimant: input.claimant,
    respondent: input.respondent ?? null,
    missionTag: input.missionTag ?? null,
    qualityScore: input.qualityScore,
    requestedRefundPercentage: input.requestedRefundPercentage,
    evidenceHash,
    featureHash,
    context: input.context ?? null,
  };

  return {
    caseHash: hashJson(casePayload),
    evidenceHash,
    featureHash,
  };
}

export function hashOracleResponse(response: TruthCourtOracleResponse): string {
  const payload = {
    oracle: response.oracle,
    provider: response.provider,
    model: response.model,
    modelHash: response.modelHash,
    verdict: response.verdict,
    confidence: Number(response.confidence.toFixed(6)),
    factors: response.factors.map((factor) => ({
      name: factor.name,
      impact: Number(factor.impact.toFixed(6)),
      evidence: factor.evidence,
    })),
    evidenceHash: response.evidenceHash,
    featureHash: response.featureHash,
    reasoningRef: response.reasoningRef,
  };

  return hashJson(payload);
}

export function hashCommitteeDigest(
  finalVerdict: string,
  confidence: number,
  digests: TruthCourtReplayDigest[]
): string {
  return hashJson({
    finalVerdict,
    confidence: Number(confidence.toFixed(6)),
    digests: digests
      .slice()
      .sort((left, right) => left.oracle.localeCompare(right.oracle)),
  });
}
