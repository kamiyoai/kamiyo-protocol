import { createHash } from 'node:crypto';
import type { DKGClient, PoCHScoreBundle } from '../types';
import { queryPoCHClusterOverlap, queryPoCHSimilarityNeighborhood } from '../queries/index';

interface SparqlValue {
  value?: unknown;
}

type SparqlRow = Record<string, SparqlValue | undefined>;

export interface PoCHSimilarityObservation {
  identityDid: string;
  contentHash: string;
  contributionType: string;
  createdAt: string;
}

export interface PoCHClusterObservation {
  relatedIdentity: string;
  sharedCount: number;
}

export interface ComputePoCHScoreBundleInput {
  policyId: string;
  contentHash: string;
  neighborhood: PoCHSimilarityObservation[];
  clusters: PoCHClusterObservation[];
}

export interface PoCHScoreBundleResult {
  scoreBundle: PoCHScoreBundle;
  duplicateCount: number;
  minHashDistance: number;
}

interface QueryRowsResult {
  rows: SparqlRow[];
  failed: boolean;
}

function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

function normalizeHash(input: string): string {
  return input.toLowerCase().replace(/^0x/, '').replace(/[^a-f0-9]/g, '').slice(0, 64);
}

function hashDistanceRatio(hashA: string, hashB: string): number {
  const a = normalizeHash(hashA);
  const b = normalizeHash(hashB);
  if (!a || !b) return 1;

  const len = Math.min(a.length, b.length);
  if (len === 0) return 1;

  let mismatches = 0;
  for (let i = 0; i < len; i += 1) {
    if (a[i] !== b[i]) mismatches += 1;
  }
  return mismatches / len;
}

export function computePoCHScoreBundle(input: ComputePoCHScoreBundleInput): PoCHScoreBundleResult {
  const normalizedTarget = normalizeHash(input.contentHash);
  const duplicateCount = input.neighborhood.filter(
    row => normalizeHash(row.contentHash) === normalizedTarget
  ).length;

  let minHashDistance = 1;
  for (const row of input.neighborhood) {
    const distance = hashDistanceRatio(normalizedTarget, row.contentHash);
    if (distance < minHashDistance) {
      minHashDistance = distance;
    }
  }

  const graphDivergence = clampScore(Math.round(minHashDistance * 100));
  const sharedOverlap = input.clusters.reduce((acc, row) => acc + Math.max(0, row.sharedCount), 0);
  const clusterOverlapRisk = clampScore(Math.round(Math.min(100, sharedOverlap * 10)));
  const nonMembershipSignal = duplicateCount === 0 && clusterOverlapRisk < 50;

  const duplicatePenalty = Math.min(60, duplicateCount * 20);
  const uniquenessScore = clampScore(
    Math.round(100 - duplicatePenalty - clusterOverlapRisk * 0.4 + graphDivergence * 0.25)
  );

  return {
    scoreBundle: {
      policyId: input.policyId,
      uniquenessScore,
      graphDivergence,
      clusterOverlapRisk,
      nonMembershipSignal,
      evaluatedAt: new Date().toISOString(),
    },
    duplicateCount,
    minHashDistance,
  };
}

export function hashPoCHScoreBundle(bundle: PoCHScoreBundle): string {
  const payload = [
    bundle.policyId,
    String(bundle.uniquenessScore),
    String(bundle.graphDivergence),
    String(bundle.clusterOverlapRisk),
    bundle.nonMembershipSignal ? '1' : '0',
  ].join('|');
  return `0x${createHash('sha256').update(payload).digest('hex')}`;
}

export function buildPoCHChallengeId(
  assetDid: string,
  scoreBundleCommitment: string,
  chain: 'solana' | 'base'
): string {
  const digest = createHash('sha256')
    .update(`${assetDid}|${scoreBundleCommitment}|${chain}`)
    .digest('hex');
  return `poch_${digest.slice(0, 24)}`;
}

function coerceRows(value: unknown): SparqlRow[] {
  if (!value || typeof value !== 'object') return [];
  const rows = (value as { data?: unknown[] }).data;
  if (!Array.isArray(rows)) return [];
  return rows.filter((row): row is SparqlRow => typeof row === 'object' && row !== null);
}

function clampDaysBack(daysBack?: number): number {
  const raw = Number(daysBack ?? 90);
  if (!Number.isFinite(raw)) return 90;
  return Math.max(1, Math.min(3650, Math.floor(raw)));
}

function withinDaysBack(isoDate: string, nowMs: number, daysBack: number): boolean {
  const timestamp = Date.parse(isoDate);
  if (!Number.isFinite(timestamp)) return true;
  return timestamp >= (nowMs - (daysBack * 24 * 60 * 60 * 1000));
}

async function safeSelectQuery(dkg: DKGClient, query: string): Promise<QueryRowsResult> {
  try {
    const response = await dkg.graph.query(query, 'SELECT');
    return {
      rows: coerceRows(response),
      failed: false,
    };
  } catch {
    return {
      rows: [],
      failed: true,
    };
  }
}

export async function loadPoCHObservations(
  dkg: DKGClient,
  params: { identityDid: string; contentHash: string; policyId: string; daysBack?: number }
): Promise<PoCHScoreBundleResult> {
  const daysBack = clampDaysBack(params.daysBack);
  const nowMs = Date.now();

  const [neighborhoodResult, clusterResult] = await Promise.all([
    safeSelectQuery(
      dkg,
      queryPoCHSimilarityNeighborhood(params.identityDid, params.contentHash, {
        daysBack,
        limit: 100,
      })
    ),
    safeSelectQuery(dkg, queryPoCHClusterOverlap(params.identityDid, { limit: 20 })),
  ]);

  if (neighborhoodResult.failed && clusterResult.failed) {
    return {
      scoreBundle: {
        policyId: params.policyId,
        uniquenessScore: 0,
        graphDivergence: 0,
        clusterOverlapRisk: 100,
        nonMembershipSignal: false,
        evaluatedAt: new Date().toISOString(),
      },
      duplicateCount: 0,
      minHashDistance: 0,
    };
  }

  const neighborhood = neighborhoodResult.rows
    .map(row => ({
      identityDid: String(row.identityDid?.value || ''),
      contentHash: String(row.contentHash?.value || ''),
      contributionType: String(row.contributionType?.value || ''),
      createdAt: String(row.createdAt?.value || ''),
    }))
    .filter(row => withinDaysBack(row.createdAt, nowMs, daysBack));

  const clusters = clusterResult.rows.map(row => ({
    relatedIdentity: String(row.relatedIdentity?.value || ''),
    sharedCount: Number(row.sharedCount?.value || 0),
  }));

  return computePoCHScoreBundle({
    policyId: params.policyId,
    contentHash: params.contentHash,
    neighborhood,
    clusters,
  });
}
