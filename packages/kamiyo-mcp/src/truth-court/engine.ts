import {
  computeCaseHashes,
  hashCommitteeDigest,
  hashOracleResponse,
} from './hash.js';
import { performance } from 'node:perf_hooks';
import type {
  TruthCourtCaseInput,
  TruthCourtDecision,
  TruthCourtOracle,
  TruthCourtOracleMetric,
  TruthCourtOracleResponse,
  TruthCourtReplayBundle,
  TruthCourtReplayDigest,
  TruthCourtReplayReport,
  TruthCourtRunOptions,
  TruthCourtSlashingRecommendation,
  TruthCourtVerdict,
} from './types.js';

function emptyVoteBreakdown(): Record<TruthCourtVerdict, number> {
  return {
    client_wins: 0,
    provider_wins: 0,
    split: 0,
    insufficient_evidence: 0,
  };
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function buildSlashing(
  oracle: string,
  reason: 'runtime_error' | 'schema_invalid' | 'hash_mismatch',
  detail: string
): TruthCourtSlashingRecommendation {
  if (reason === 'hash_mismatch') {
    return { oracle, severity: 'high', reason: detail };
  }

  if (reason === 'schema_invalid') {
    return { oracle, severity: 'medium', reason: detail };
  }

  return { oracle, severity: 'low', reason: detail };
}

function validateInput(input: TruthCourtCaseInput): string | null {
  if (!input.transactionId) {
    return 'transactionId is required';
  }
  if (!input.claimant) {
    return 'claimant is required';
  }
  if (!isFiniteNumber(input.qualityScore) || input.qualityScore < 0 || input.qualityScore > 100) {
    return 'qualityScore must be in [0, 100]';
  }
  if (
    !isFiniteNumber(input.requestedRefundPercentage) ||
    input.requestedRefundPercentage < 0 ||
    input.requestedRefundPercentage > 100
  ) {
    return 'requestedRefundPercentage must be in [0, 100]';
  }
  if (!input.evidence || typeof input.evidence !== 'object') {
    return 'evidence must be an object';
  }
  if (!input.featureVector || typeof input.featureVector !== 'object') {
    return 'featureVector must be an object';
  }
  return null;
}

function validateOracleResponse(
  response: TruthCourtOracleResponse,
  evidenceHash: string,
  featureHash: string
): string | null {
  if (!response.oracle || !response.model || !response.modelHash) {
    return 'oracle response is missing identity fields';
  }

  if (!isFiniteNumber(response.confidence) || response.confidence < 0 || response.confidence > 1) {
    return 'oracle response confidence must be in [0, 1]';
  }

  if (!Array.isArray(response.factors) || response.factors.length === 0) {
    return 'oracle response must include factors';
  }

  for (const factor of response.factors) {
    if (!factor.name || !factor.evidence || !isFiniteNumber(factor.impact)) {
      return 'oracle response factor is malformed';
    }
  }

  if (response.evidenceHash !== evidenceHash) {
    return 'oracle response evidence hash mismatch';
  }

  if (response.featureHash !== featureHash) {
    return 'oracle response feature hash mismatch';
  }

  return null;
}

function selectFinalVerdict(
  responses: TruthCourtOracleResponse[],
  voteBreakdown: Record<TruthCourtVerdict, number>
): TruthCourtVerdict {
  const ranking: TruthCourtVerdict[] = [
    'client_wins',
    'provider_wins',
    'split',
    'insufficient_evidence',
  ];

  let bestVerdict: TruthCourtVerdict = 'insufficient_evidence';
  let bestVotes = -1;
  let bestConfidence = -1;

  for (const verdict of ranking) {
    const votes = voteBreakdown[verdict];
    if (votes < bestVotes) {
      continue;
    }

    const verdictResponses = responses.filter((entry) => entry.verdict === verdict);
    const avgConfidence =
      verdictResponses.length === 0
        ? 0
        : verdictResponses.reduce((sum, entry) => sum + entry.confidence, 0) /
          verdictResponses.length;

    if (votes > bestVotes || (votes === bestVotes && avgConfidence > bestConfidence)) {
      bestVerdict = verdict;
      bestVotes = votes;
      bestConfidence = avgConfidence;
    }
  }

  return bestVerdict;
}

function buildSummary(
  finalVerdict: TruthCourtVerdict,
  confidence: number,
  responses: TruthCourtOracleResponse[],
  voteBreakdown: Record<TruthCourtVerdict, number>
): string {
  const leadingFactors = responses
    .filter((entry) => entry.verdict === finalVerdict)
    .flatMap((entry) => entry.factors)
    .slice(0, 3)
    .map((factor) => `${factor.name}=${factor.impact.toFixed(2)}`);

  return `verdict=${finalVerdict}; confidence=${confidence.toFixed(3)}; votes=${JSON.stringify(
    voteBreakdown
  )}; factors=${leadingFactors.join(', ')}`;
}

function replayDigestsFromResponses(
  responses: TruthCourtOracleResponse[]
): TruthCourtReplayDigest[] {
  return responses
    .map((entry) => ({
      oracle: entry.oracle,
      responseHash: hashOracleResponse(entry),
      modelHash: entry.modelHash,
    }))
    .sort((left, right) => left.oracle.localeCompare(right.oracle));
}

export function verifyTruthCourtReplayBundle(
  input: TruthCourtCaseInput,
  replayBundle: TruthCourtReplayBundle,
  responses: TruthCourtOracleResponse[]
): TruthCourtReplayReport {
  const hashes = computeCaseHashes(input);
  const caseHashMatches = hashes.caseHash === replayBundle.caseHash;
  const evidenceHashMatches = hashes.evidenceHash === replayBundle.evidenceHash;
  const featureHashMatches = hashes.featureHash === replayBundle.featureHash;

  const expectedByOracle = new Map<string, string>(
    replayBundle.oracleDigests.map((entry) => [entry.oracle, entry.responseHash])
  );

  const observedByOracle = new Map<string, string>(
    responses.map((entry) => [entry.oracle, hashOracleResponse(entry)])
  );

  const missingOracles: string[] = [];
  const mismatchedOracles: string[] = [];
  const unexpectedOracles: string[] = [];

  for (const [oracle, expectedHash] of expectedByOracle.entries()) {
    const observedHash = observedByOracle.get(oracle);
    if (!observedHash) {
      missingOracles.push(oracle);
      continue;
    }
    if (observedHash !== expectedHash) {
      mismatchedOracles.push(oracle);
    }
  }

  for (const oracle of observedByOracle.keys()) {
    if (!expectedByOracle.has(oracle)) {
      unexpectedOracles.push(oracle);
    }
  }

  const expectedCommitteeHash = hashCommitteeDigest(
    replayBundle.finalVerdict,
    replayBundle.confidence,
    replayDigestsFromResponses(
      responses.filter((entry) => expectedByOracle.has(entry.oracle))
    )
  );
  const committeeHashMatches = expectedCommitteeHash === replayBundle.committeeHash;

  return {
    success: true,
    replayable:
      caseHashMatches &&
      evidenceHashMatches &&
      featureHashMatches &&
      committeeHashMatches &&
      missingOracles.length === 0 &&
      mismatchedOracles.length === 0 &&
      unexpectedOracles.length === 0,
    caseHashMatches,
    evidenceHashMatches,
    featureHashMatches,
    committeeHashMatches,
    missingOracles: missingOracles.sort(),
    mismatchedOracles: mismatchedOracles.sort(),
    unexpectedOracles: unexpectedOracles.sort(),
  };
}

export class TruthCourtEngine {
  constructor(private readonly oracles: TruthCourtOracle[]) {
    const seen = new Set<string>();
    for (const oracle of oracles) {
      if (seen.has(oracle.name)) {
        throw new Error(`duplicate oracle name: ${oracle.name}`);
      }
      seen.add(oracle.name);
    }
  }

  async evaluate(
    input: TruthCourtCaseInput,
    options: TruthCourtRunOptions = {}
  ): Promise<TruthCourtDecision> {
    const voteBreakdown = emptyVoteBreakdown();
    if (!this.oracles.length) {
      return {
        success: false,
        caseHash: '',
        evidenceHash: '',
        featureHash: '',
        quorumMet: false,
        voteBreakdown,
        acceptedResponses: [],
        rejectedResponses: [],
        oracleMetrics: [],
        slashingRecommendations: [],
        error: 'at least one oracle is required',
      };
    }

    const inputError = validateInput(input);
    if (inputError) {
      return {
        success: false,
        caseHash: '',
        evidenceHash: '',
        featureHash: '',
        quorumMet: false,
        voteBreakdown,
        acceptedResponses: [],
        rejectedResponses: [],
        oracleMetrics: [],
        slashingRecommendations: [],
        error: inputError,
      };
    }

    const minValidResponses = Math.max(1, options.minValidResponses ?? 2);
    const { caseHash, evidenceHash, featureHash } = computeCaseHashes(input);
    const request = { caseHash, evidenceHash, featureHash, input };
    const acceptedResponses: TruthCourtOracleResponse[] = [];
    const rejectedResponses: TruthCourtDecision['rejectedResponses'] = [];
    const oracleMetrics: TruthCourtOracleMetric[] = [];
    const slashingRecommendations: TruthCourtSlashingRecommendation[] = [];

    await Promise.all(
      this.oracles.map(async (oracle) => {
        const started = performance.now();
        try {
          const response = await oracle.evaluate(request);
          const latencyMs = Number((performance.now() - started).toFixed(3));
          const validationError = validateOracleResponse(
            response,
            evidenceHash,
            featureHash
          );
          if (validationError) {
            const reason = validationError.includes('hash mismatch')
              ? 'hash_mismatch'
              : 'schema_invalid';
            rejectedResponses.push({
              oracle: oracle.name,
              reason,
              detail: validationError,
            });
            oracleMetrics.push({
              oracle: oracle.name,
              provider: response.provider,
              status: 'rejected',
              reason,
              latencyMs,
            });
            slashingRecommendations.push(
              buildSlashing(oracle.name, reason, validationError)
            );
            return;
          }

          acceptedResponses.push(response);
          oracleMetrics.push({
            oracle: oracle.name,
            provider: response.provider,
            status: 'accepted',
            latencyMs,
          });
          voteBreakdown[response.verdict] += 1;
        } catch (error: any) {
          const latencyMs = Number((performance.now() - started).toFixed(3));
          const detail = error?.message || 'oracle evaluation failed';
          rejectedResponses.push({
            oracle: oracle.name,
            reason: 'runtime_error',
            detail,
          });
          oracleMetrics.push({
            oracle: oracle.name,
            provider: 'custom',
            status: 'rejected',
            reason: 'runtime_error',
            latencyMs,
          });
          slashingRecommendations.push(
            buildSlashing(oracle.name, 'runtime_error', detail)
          );
        }
      })
    );

    const quorumMet = acceptedResponses.length >= minValidResponses;
    if (!quorumMet) {
      return {
        success: false,
        caseHash,
        evidenceHash,
        featureHash,
        quorumMet: false,
        voteBreakdown,
        acceptedResponses,
        rejectedResponses,
        oracleMetrics: oracleMetrics
          .slice()
          .sort((left, right) => left.oracle.localeCompare(right.oracle)),
        slashingRecommendations,
        error: `insufficient valid oracle responses: ${acceptedResponses.length}/${minValidResponses}`,
      };
    }

    const finalVerdict = selectFinalVerdict(acceptedResponses, voteBreakdown);
    const verdictVotes = voteBreakdown[finalVerdict];
    const avgConfidence =
      acceptedResponses.reduce((sum, entry) => sum + entry.confidence, 0) /
      acceptedResponses.length;
    const agreement = verdictVotes / acceptedResponses.length;
    const confidence = Math.min(1, avgConfidence * 0.65 + agreement * 0.35);

    const oracleDigests = replayDigestsFromResponses(acceptedResponses);

    const committeeHash = hashCommitteeDigest(finalVerdict, confidence, oracleDigests);
    const replayBundle: TruthCourtReplayBundle = {
      caseHash,
      evidenceHash,
      featureHash,
      committeeHash,
      finalVerdict,
      confidence,
      issuedAt: Date.now(),
      oracleDigests,
    };

    return {
      success: true,
      caseHash,
      evidenceHash,
      featureHash,
      committeeHash,
      quorumMet: true,
      finalVerdict,
      confidence,
      voteBreakdown,
      acceptedResponses: acceptedResponses
        .slice()
        .sort((left, right) => left.oracle.localeCompare(right.oracle)),
      rejectedResponses: rejectedResponses
        .slice()
        .sort((left, right) => left.oracle.localeCompare(right.oracle)),
      oracleMetrics: oracleMetrics
        .slice()
        .sort((left, right) => left.oracle.localeCompare(right.oracle)),
      slashingRecommendations: slashingRecommendations
        .slice()
        .sort((left, right) => left.oracle.localeCompare(right.oracle)),
      replayBundle,
      summary: buildSummary(finalVerdict, confidence, acceptedResponses, voteBreakdown),
    };
  }

  verifyReplay(
    input: TruthCourtCaseInput,
    replayBundle: TruthCourtReplayBundle,
    responses: TruthCourtOracleResponse[]
  ): TruthCourtReplayReport {
    return verifyTruthCourtReplayBundle(input, replayBundle, responses);
  }
}
