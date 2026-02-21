import { createHash, timingSafeEqual } from 'crypto';
import type { SettlementResult } from './types.js';

const COURT_COMMITMENT_DOMAIN = 'limitless-court:v1:commit';
const HASH_BYTE_LENGTH = 32;
const SALT_BYTE_LENGTH = 32;
const CONFIDENCE_SCALE = 10_000;
const SNAPSHOT_VERSION = 1;

export interface LimitlessCourtOracle {
  id: string;
  provider?: string;
  weight?: number;
  active?: boolean;
  metadata?: Record<string, unknown>;
}

export interface LimitlessCourtCommitmentSubmission {
  settlementId: string;
  oracleId: string;
  commitmentHash: Uint8Array;
  committedAt?: number;
}

export interface LimitlessCourtAttestationSubmission {
  settlementId: string;
  oracleId: string;
  score: number;
  confidence: number;
  evidenceHash: string;
  salt: Uint8Array;
  metadata?: Record<string, unknown>;
  revealedAt?: number;
}

export interface LimitlessCourtAttestation {
  oracleId: string;
  provider: string;
  weight: number;
  score: number;
  confidence: number;
  evidenceHash: string;
  revealedAt: number;
  metadata?: Record<string, unknown>;
}

export interface LimitlessCourtProgress {
  settlementId: string;
  threshold: number;
  minWeight: number;
  minProviderCount: number;
  commitmentCount: number;
  attestationCount: number;
  attestationWeight: number;
  providerCount: number;
  pendingAttestations: number;
  pendingWeight: number;
  missingProviders: number;
  countMet: boolean;
  weightMet: boolean;
  providerMet: boolean;
  quorumMet: boolean;
  settled: boolean;
  finalizing: boolean;
  attestedOracles: string[];
}

export interface LimitlessCourtVerdict {
  settlementId: string;
  oracleScore: number;
  confidence: number;
  attestationCount: number;
  attestationWeight: number;
  providerCount: number;
  disagreement: number;
  includedOracles: string[];
  outlierOracles: string[];
  attestationRoot: string;
  transcriptHash: string;
  createdAt: number;
  attestations: LimitlessCourtAttestation[];
}

export interface LimitlessCourtResult extends LimitlessCourtProgress {
  settlementTriggered: boolean;
  verdict?: LimitlessCourtVerdict;
  settlementResult?: SettlementResult;
}

export interface LimitlessCourtConfig {
  threshold: number;
  oracles: LimitlessCourtOracle[];
  onVerdict: (verdict: LimitlessCourtVerdict) => Promise<SettlementResult>;
  minWeight?: number;
  minProviderCount?: number;
  maxOutlierDeviation?: number;
  normalizeOracleId?: (oracleId: string) => string;
  now?: () => number;
}

export interface LimitlessCourtSnapshotOracle {
  id: string;
  provider: string;
  weight: number;
  active: boolean;
  metadata?: Record<string, unknown>;
}

export interface LimitlessCourtSnapshotSettlement {
  settlementId: string;
  settled: boolean;
  commitments: Array<{
    oracleId: string;
    commitmentHashHex: string;
    committedAt: number;
    attestation?: LimitlessCourtAttestation;
  }>;
  verdict?: LimitlessCourtVerdict;
  settlementResult?: SettlementResult;
}

export interface LimitlessCourtSnapshot {
  version: number;
  threshold: number;
  minWeight: number;
  minProviderCount: number;
  maxOutlierDeviation: number;
  oracles: LimitlessCourtSnapshotOracle[];
  settlements: LimitlessCourtSnapshotSettlement[];
}

interface OracleProfileState {
  id: string;
  provider: string;
  weight: number;
  active: boolean;
  metadata?: Record<string, unknown>;
}

interface OracleCommitmentState {
  commitmentHash: Buffer;
  committedAt: number;
  attestation?: LimitlessCourtAttestation;
}

interface SettlementState {
  commitments: Map<string, OracleCommitmentState>;
  settled: boolean;
  finalizing: boolean;
  verdict?: LimitlessCourtVerdict;
  settlementResult?: SettlementResult;
}

function defaultNormalizeOracleId(oracleId: string): string {
  const normalized = oracleId.trim();
  if (!normalized) {
    throw new Error('oracleId is required');
  }
  if (/^0x[a-fA-F0-9]{40}$/.test(normalized)) {
    return normalized.toLowerCase();
  }
  return normalized;
}

function normalizeSettlementId(settlementId: string): string {
  const normalized = settlementId.trim();
  if (!normalized) {
    throw new Error('settlementId is required');
  }
  return normalized;
}

function normalizeProvider(provider: string | undefined, fallback: string): string {
  const normalized = provider?.trim().toLowerCase();
  return normalized && normalized.length > 0 ? normalized : fallback;
}

function normalizeEvidenceHash(evidenceHash: string): string {
  const normalized = evidenceHash.trim().toLowerCase();
  const stripped = normalized.startsWith('0x') ? normalized.slice(2) : normalized;
  if (!/^[a-f0-9]{64}$/.test(stripped)) {
    throw new Error('evidenceHash must be a 32-byte hex string');
  }
  return stripped;
}

function normalizeCommitmentHash(commitmentHash: Uint8Array): Buffer {
  if (commitmentHash.length !== HASH_BYTE_LENGTH) {
    throw new Error(`commitmentHash must be ${HASH_BYTE_LENGTH} bytes`);
  }
  return Buffer.from(commitmentHash);
}

function normalizeSalt(salt: Uint8Array): Buffer {
  if (salt.length !== SALT_BYTE_LENGTH) {
    throw new Error(`salt must be ${SALT_BYTE_LENGTH} bytes`);
  }
  return Buffer.from(salt);
}

function validateScore(score: number): void {
  if (!Number.isInteger(score) || score < 0 || score > 100) {
    throw new Error('score must be an integer between 0 and 100');
  }
}

function normalizeConfidence(confidence: number): number {
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    throw new Error('confidence must be a number between 0 and 1');
  }
  return confidence;
}

function normalizeWeight(weight: number): number {
  if (!Number.isFinite(weight) || weight <= 0) {
    throw new Error('oracle weight must be a positive number');
  }
  return weight;
}

function confidenceToBasisPoints(confidence: number): number {
  return Math.round(normalizeConfidence(confidence) * CONFIDENCE_SCALE);
}

function encodeField(value: Buffer): Buffer {
  const length = Buffer.allocUnsafe(4);
  length.writeUInt32BE(value.length, 0);
  return Buffer.concat([length, value]);
}

function toHex(value: Buffer | Uint8Array): string {
  return Buffer.from(value).toString('hex');
}

function fromHex(value: string): Buffer {
  const normalized = value.trim().toLowerCase();
  const stripped = normalized.startsWith('0x') ? normalized.slice(2) : normalized;
  if (!/^[a-f0-9]*$/.test(stripped) || stripped.length % 2 !== 0) {
    throw new Error('Invalid hex string');
  }
  return Buffer.from(stripped, 'hex');
}

function weightedMedian(entries: Array<{ score: number; weight: number }>): number {
  const sorted = [...entries].sort((a, b) => a.score - b.score);
  const totalWeight = sorted.reduce((sum, entry) => sum + entry.weight, 0);
  const midpoint = totalWeight / 2;
  let cumulative = 0;
  for (const entry of sorted) {
    cumulative += entry.weight;
    if (cumulative >= midpoint) {
      return entry.score;
    }
  }
  return sorted[sorted.length - 1]?.score ?? 0;
}

function weightedAverage(values: Array<{ value: number; weight: number }>): number {
  const weightedTotal = values.reduce((sum, entry) => sum + entry.value * entry.weight, 0);
  const totalWeight = values.reduce((sum, entry) => sum + entry.weight, 0);
  if (totalWeight <= 0) {
    return 0;
  }
  return weightedTotal / totalWeight;
}

function computeAttestationRoot(attestations: LimitlessCourtAttestation[]): string {
  const hash = createHash('sha256');
  const sorted = [...attestations].sort((a, b) => a.oracleId.localeCompare(b.oracleId));
  for (const attestation of sorted) {
    const payload = [
      attestation.oracleId,
      attestation.provider,
      String(attestation.weight),
      String(attestation.score),
      attestation.confidence.toFixed(6),
      attestation.evidenceHash,
      String(attestation.revealedAt),
    ].join('|');
    hash.update(encodeField(Buffer.from(payload, 'utf8')));
  }
  return hash.digest('hex');
}

function computeTranscriptHash(
  settlementId: string,
  threshold: number,
  minWeight: number,
  minProviderCount: number,
  commitments: Map<string, OracleCommitmentState>,
  verdict: LimitlessCourtVerdict
): string {
  const hash = createHash('sha256');
  hash.update(encodeField(Buffer.from(settlementId, 'utf8')));
  hash.update(encodeField(Buffer.from(String(threshold), 'utf8')));
  hash.update(encodeField(Buffer.from(String(minWeight), 'utf8')));
  hash.update(encodeField(Buffer.from(String(minProviderCount), 'utf8')));
  hash.update(encodeField(Buffer.from(verdict.attestationRoot, 'utf8')));

  const sortedCommitments = [...commitments.entries()].sort((a, b) =>
    a[0].localeCompare(b[0])
  );
  for (const [oracleId, entry] of sortedCommitments) {
    hash.update(encodeField(Buffer.from(oracleId, 'utf8')));
    hash.update(encodeField(entry.commitmentHash));
    hash.update(encodeField(Buffer.from(String(entry.committedAt), 'utf8')));
    if (entry.attestation) {
      hash.update(encodeField(Buffer.from(String(entry.attestation.revealedAt), 'utf8')));
    }
  }

  return hash.digest('hex');
}

export function computeLimitlessCourtCommitmentHash(
  settlementId: string,
  oracleId: string,
  score: number,
  confidence: number,
  evidenceHash: string,
  salt: Uint8Array,
  normalizeOracleId: (oracleId: string) => string = defaultNormalizeOracleId
): Uint8Array {
  const normalizedSettlementId = normalizeSettlementId(settlementId);
  const normalizedOracleId = normalizeOracleId(oracleId);
  validateScore(score);
  const confidenceBasis = confidenceToBasisPoints(confidence);
  const normalizedEvidenceHash = normalizeEvidenceHash(evidenceHash);
  const normalizedSalt = normalizeSalt(salt);

  const confidenceBytes = Buffer.allocUnsafe(2);
  confidenceBytes.writeUInt16BE(confidenceBasis, 0);

  const hash = createHash('sha256');
  hash.update(encodeField(Buffer.from(COURT_COMMITMENT_DOMAIN, 'utf8')));
  hash.update(encodeField(Buffer.from(normalizedSettlementId, 'utf8')));
  hash.update(encodeField(Buffer.from(normalizedOracleId, 'utf8')));
  hash.update(Buffer.from([score]));
  hash.update(confidenceBytes);
  hash.update(encodeField(Buffer.from(normalizedEvidenceHash, 'utf8')));
  hash.update(normalizedSalt);
  return new Uint8Array(hash.digest());
}

export class LimitlessVerdictCourt {
  private readonly threshold: number;
  private readonly minWeight: number;
  private readonly minProviderCount: number;
  private readonly maxOutlierDeviation: number;
  private readonly onVerdict: (verdict: LimitlessCourtVerdict) => Promise<SettlementResult>;
  private readonly normalizeOracleId: (oracleId: string) => string;
  private readonly now: () => number;
  private readonly oracleRegistry = new Map<string, OracleProfileState>();
  private readonly settlements = new Map<string, SettlementState>();
  private initializing = false;

  constructor(config: LimitlessCourtConfig) {
    if (!Number.isInteger(config.threshold) || config.threshold < 1 || config.threshold > 255) {
      throw new Error('threshold must be an integer between 1 and 255');
    }
    this.threshold = config.threshold;
    this.minWeight = config.minWeight ?? config.threshold;
    this.minProviderCount = config.minProviderCount ?? 1;
    this.maxOutlierDeviation = config.maxOutlierDeviation ?? 20;
    if (
      !Number.isFinite(this.minWeight) ||
      this.minWeight <= 0 ||
      this.minWeight > Number.MAX_SAFE_INTEGER
    ) {
      throw new Error('minWeight must be a positive number');
    }
    if (
      !Number.isInteger(this.minProviderCount) ||
      this.minProviderCount < 1 ||
      this.minProviderCount > 255
    ) {
      throw new Error('minProviderCount must be an integer between 1 and 255');
    }
    if (
      !Number.isFinite(this.maxOutlierDeviation) ||
      this.maxOutlierDeviation < 0 ||
      this.maxOutlierDeviation > 100
    ) {
      throw new Error('maxOutlierDeviation must be between 0 and 100');
    }

    this.onVerdict = config.onVerdict;
    this.normalizeOracleId = config.normalizeOracleId ?? defaultNormalizeOracleId;
    this.now = config.now ?? (() => Date.now());

    this.initializing = true;
    for (const oracle of config.oracles) {
      this.registerOracle(oracle);
    }
    this.initializing = false;
    if (this.oracleRegistry.size === 0) {
      throw new Error('At least one oracle must be configured');
    }
    this.validateOracleRegistryCoverage();
  }

  registerOracle(oracle: LimitlessCourtOracle): void {
    const id = this.normalizeOracleId(oracle.id);
    if (this.oracleRegistry.has(id)) {
      throw new Error(`Oracle already registered: ${id}`);
    }
    const weight = normalizeWeight(oracle.weight ?? 1);
    this.oracleRegistry.set(id, {
      id,
      provider: normalizeProvider(oracle.provider, id),
      weight,
      active: oracle.active ?? true,
      metadata: oracle.metadata,
    });
    if (!this.initializing) {
      try {
        this.validateOracleRegistryCoverage();
      } catch (error) {
        this.oracleRegistry.delete(id);
        throw error;
      }
    }
  }

  setOracleActive(oracleId: string, active: boolean): void {
    const id = this.normalizeOracleId(oracleId);
    const oracle = this.oracleRegistry.get(id);
    if (!oracle) {
      throw new Error(`Unknown oracle: ${id}`);
    }
    const previous = oracle.active;
    oracle.active = active;
    try {
      this.validateOracleRegistryCoverage();
    } catch (error) {
      oracle.active = previous;
      throw error;
    }
  }

  updateOracleWeight(oracleId: string, weight: number): void {
    const id = this.normalizeOracleId(oracleId);
    const oracle = this.oracleRegistry.get(id);
    if (!oracle) {
      throw new Error(`Unknown oracle: ${id}`);
    }
    const normalizedWeight = normalizeWeight(weight);
    const previous = oracle.weight;
    oracle.weight = normalizedWeight;
    try {
      this.validateOracleRegistryCoverage();
    } catch (error) {
      oracle.weight = previous;
      throw error;
    }
  }

  listOracles(): LimitlessCourtSnapshotOracle[] {
    return [...this.oracleRegistry.values()].map((oracle) => ({
      id: oracle.id,
      provider: oracle.provider,
      weight: oracle.weight,
      active: oracle.active,
      metadata: oracle.metadata,
    }));
  }

  submitCommitment(
    input: LimitlessCourtCommitmentSubmission
  ): LimitlessCourtProgress {
    const settlementId = normalizeSettlementId(input.settlementId);
    const oracleId = this.normalizeOracleId(input.oracleId);
    const commitmentHash = normalizeCommitmentHash(input.commitmentHash);
    const oracle = this.requireActiveOracle(oracleId);

    const state = this.getOrCreateSettlement(settlementId);
    if (state.settled) {
      throw new Error('Settlement is already resolved');
    }
    if (state.finalizing) {
      throw new Error('Settlement finalization is in progress');
    }
    if (state.commitments.has(oracle.id)) {
      throw new Error(`Commitment already submitted by oracle ${oracle.id}`);
    }

    state.commitments.set(oracle.id, {
      commitmentHash,
      committedAt: input.committedAt ?? this.now(),
    });
    return this.buildProgress(settlementId, state);
  }

  async submitAttestation(
    input: LimitlessCourtAttestationSubmission
  ): Promise<LimitlessCourtResult> {
    const settlementId = normalizeSettlementId(input.settlementId);
    const oracleId = this.normalizeOracleId(input.oracleId);
    validateScore(input.score);
    const confidence = normalizeConfidence(input.confidence);
    const evidenceHash = normalizeEvidenceHash(input.evidenceHash);
    const salt = normalizeSalt(input.salt);
    const oracle = this.requireActiveOracle(oracleId);

    const state = this.settlements.get(settlementId);
    if (!state) {
      throw new Error(`No commitments found for settlement ${settlementId}`);
    }
    if (state.settled) {
      throw new Error('Settlement is already resolved');
    }

    const commitment = state.commitments.get(oracle.id);
    if (!commitment) {
      throw new Error(`No commitment found for oracle ${oracle.id}`);
    }
    if (commitment.attestation) {
      throw new Error(`Attestation already revealed for oracle ${oracle.id}`);
    }

    const expectedHash = Buffer.from(
      computeLimitlessCourtCommitmentHash(
        settlementId,
        oracle.id,
        input.score,
        confidence,
        evidenceHash,
        salt,
        this.normalizeOracleId
      )
    );
    if (!timingSafeEqual(expectedHash, commitment.commitmentHash)) {
      throw new Error('Commitment hash mismatch');
    }

    commitment.attestation = {
      oracleId: oracle.id,
      provider: oracle.provider,
      weight: oracle.weight,
      score: input.score,
      confidence,
      evidenceHash,
      metadata: input.metadata,
      revealedAt: input.revealedAt ?? this.now(),
    };

    return this.finalize(settlementId);
  }

  async finalize(settlementId: string): Promise<LimitlessCourtResult> {
    const normalizedSettlementId = normalizeSettlementId(settlementId);
    const state = this.settlements.get(normalizedSettlementId);
    if (!state) {
      throw new Error(`No commitments found for settlement ${normalizedSettlementId}`);
    }

    const progress = this.buildProgress(normalizedSettlementId, state);
    if (state.settled) {
      return {
        ...progress,
        settlementTriggered: false,
        verdict: state.verdict,
        settlementResult: state.settlementResult,
      };
    }
    if (!progress.quorumMet || state.finalizing) {
      return {
        ...progress,
        settlementTriggered: false,
      };
    }

    state.finalizing = true;
    try {
      const verdict = this.buildVerdict(normalizedSettlementId, state);
      const settlementResult = await this.onVerdict(verdict);
      state.settled = true;
      state.verdict = verdict;
      state.settlementResult = settlementResult;
      const finalizedProgress = this.buildProgress(normalizedSettlementId, state);
      return {
        ...finalizedProgress,
        settlementTriggered: true,
        verdict,
        settlementResult,
      };
    } finally {
      state.finalizing = false;
    }
  }

  getProgress(settlementId: string): LimitlessCourtProgress | null {
    const normalizedSettlementId = normalizeSettlementId(settlementId);
    const state = this.settlements.get(normalizedSettlementId);
    if (!state) {
      return null;
    }
    return this.buildProgress(normalizedSettlementId, state);
  }

  getVerdict(settlementId: string): LimitlessCourtVerdict | null {
    const normalizedSettlementId = normalizeSettlementId(settlementId);
    return this.settlements.get(normalizedSettlementId)?.verdict ?? null;
  }

  exportSnapshot(): LimitlessCourtSnapshot {
    return {
      version: SNAPSHOT_VERSION,
      threshold: this.threshold,
      minWeight: this.minWeight,
      minProviderCount: this.minProviderCount,
      maxOutlierDeviation: this.maxOutlierDeviation,
      oracles: this.listOracles(),
      settlements: [...this.settlements.entries()].map(([settlementId, state]) => ({
        settlementId,
        settled: state.settled,
        commitments: [...state.commitments.entries()].map(([oracleId, commitment]) => ({
          oracleId,
          commitmentHashHex: toHex(commitment.commitmentHash),
          committedAt: commitment.committedAt,
          attestation: commitment.attestation,
        })),
        verdict: state.verdict,
        settlementResult: state.settlementResult,
      })),
    };
  }

  importSnapshot(snapshot: LimitlessCourtSnapshot, replace = true): void {
    if (snapshot.version !== SNAPSHOT_VERSION) {
      throw new Error(`Unsupported snapshot version: ${snapshot.version}`);
    }
    if (
      snapshot.threshold !== this.threshold ||
      snapshot.minWeight !== this.minWeight ||
      snapshot.minProviderCount !== this.minProviderCount ||
      snapshot.maxOutlierDeviation !== this.maxOutlierDeviation
    ) {
      throw new Error('Snapshot configuration does not match court configuration');
    }

    if (replace) {
      this.settlements.clear();
    }

    for (const oracle of snapshot.oracles) {
      const id = this.normalizeOracleId(oracle.id);
      const existing = this.oracleRegistry.get(id);
      if (!existing) {
        this.oracleRegistry.set(id, {
          id,
          provider: normalizeProvider(oracle.provider, id),
          weight: normalizeWeight(oracle.weight),
          active: oracle.active,
          metadata: oracle.metadata,
        });
        continue;
      }
      existing.provider = normalizeProvider(oracle.provider, id);
      existing.weight = normalizeWeight(oracle.weight);
      existing.active = oracle.active;
      existing.metadata = oracle.metadata;
    }

    for (const settlement of snapshot.settlements) {
      const settlementId = normalizeSettlementId(settlement.settlementId);
      const state: SettlementState = {
        commitments: new Map(),
        settled: settlement.settled,
        finalizing: false,
        verdict: settlement.verdict,
        settlementResult: settlement.settlementResult,
      };

      for (const entry of settlement.commitments) {
        const oracleId = this.normalizeOracleId(entry.oracleId);
        if (!this.oracleRegistry.has(oracleId)) {
          throw new Error(`Snapshot references unknown oracle: ${oracleId}`);
        }
        const commitmentHash = fromHex(entry.commitmentHashHex);
        if (commitmentHash.length !== HASH_BYTE_LENGTH) {
          throw new Error(`Invalid commitment hash length for oracle ${oracleId}`);
        }
        state.commitments.set(oracleId, {
          commitmentHash,
          committedAt: entry.committedAt,
          attestation: entry.attestation,
        });
      }

      this.settlements.set(settlementId, state);
    }
  }

  clear(settlementId?: string): void {
    if (settlementId === undefined) {
      this.settlements.clear();
      return;
    }
    this.settlements.delete(normalizeSettlementId(settlementId));
  }

  private requireActiveOracle(oracleId: string): OracleProfileState {
    const oracle = this.oracleRegistry.get(oracleId);
    if (!oracle) {
      throw new Error(`Oracle is not registered: ${oracleId}`);
    }
    if (!oracle.active) {
      throw new Error(`Oracle is inactive: ${oracleId}`);
    }
    return oracle;
  }

  private getOrCreateSettlement(settlementId: string): SettlementState {
    const existing = this.settlements.get(settlementId);
    if (existing) {
      return existing;
    }
    const state: SettlementState = {
      commitments: new Map(),
      settled: false,
      finalizing: false,
    };
    this.settlements.set(settlementId, state);
    return state;
  }

  private getAttestations(state: SettlementState): LimitlessCourtAttestation[] {
    return [...state.commitments.values()]
      .map((entry) => entry.attestation)
      .filter((entry): entry is LimitlessCourtAttestation => entry !== undefined)
      .sort((a, b) => {
        if (a.revealedAt !== b.revealedAt) {
          return a.revealedAt - b.revealedAt;
        }
        return a.oracleId.localeCompare(b.oracleId);
      });
  }

  private meetsQuorum(attestations: LimitlessCourtAttestation[]): {
    countMet: boolean;
    weightMet: boolean;
    providerMet: boolean;
    attestationWeight: number;
    providerCount: number;
  } {
    const attestationWeight = attestations.reduce((sum, entry) => sum + entry.weight, 0);
    const providerCount = new Set(attestations.map((entry) => entry.provider)).size;
    const countMet = attestations.length >= this.threshold;
    const weightMet = attestationWeight >= this.minWeight;
    const providerMet = providerCount >= this.minProviderCount;
    return { countMet, weightMet, providerMet, attestationWeight, providerCount };
  }

  private buildProgress(settlementId: string, state: SettlementState): LimitlessCourtProgress {
    const attestations = this.getAttestations(state);
    const { countMet, weightMet, providerMet, attestationWeight, providerCount } =
      this.meetsQuorum(attestations);

    return {
      settlementId,
      threshold: this.threshold,
      minWeight: this.minWeight,
      minProviderCount: this.minProviderCount,
      commitmentCount: state.commitments.size,
      attestationCount: attestations.length,
      attestationWeight,
      providerCount,
      pendingAttestations: Math.max(this.threshold - attestations.length, 0),
      pendingWeight: Math.max(this.minWeight - attestationWeight, 0),
      missingProviders: Math.max(this.minProviderCount - providerCount, 0),
      countMet,
      weightMet,
      providerMet,
      quorumMet: countMet && weightMet && providerMet,
      settled: state.settled,
      finalizing: state.finalizing,
      attestedOracles: attestations.map((entry) => entry.oracleId),
    };
  }

  private buildVerdict(settlementId: string, state: SettlementState): LimitlessCourtVerdict {
    const attestations = this.getAttestations(state);
    if (!this.meetsQuorum(attestations).countMet) {
      throw new Error('Not enough attestations to build verdict');
    }

    const baselineScore = weightedMedian(
      attestations.map((entry) => ({ score: entry.score, weight: entry.weight }))
    );

    let included = attestations.filter(
      (entry) => Math.abs(entry.score - baselineScore) <= this.maxOutlierDeviation
    );
    if (included.length === 0) {
      included = attestations;
    }
    const includedQuorum = this.meetsQuorum(included);
    if (!includedQuorum.countMet || !includedQuorum.weightMet || !includedQuorum.providerMet) {
      included = attestations;
    }

    const oracleScore = weightedMedian(
      included.map((entry) => ({ score: entry.score, weight: entry.weight }))
    );
    const confidence = weightedAverage(
      included.map((entry) => ({ value: entry.confidence, weight: entry.weight }))
    );
    const disagreement = included.reduce((max, entry) => {
      const diff = Math.abs(entry.score - oracleScore);
      return diff > max ? diff : max;
    }, 0);

    const includedSet = new Set(included.map((entry) => entry.oracleId));
    const outlierOracles = attestations
      .filter((entry) => !includedSet.has(entry.oracleId))
      .map((entry) => entry.oracleId);
    const sortedIncluded = [...included].sort((a, b) => a.oracleId.localeCompare(b.oracleId));
    const sortedOutliers = [...outlierOracles].sort((a, b) => a.localeCompare(b));
    const includedSummary = this.meetsQuorum(sortedIncluded);

    const attestationRoot = computeAttestationRoot(sortedIncluded);
    const provisionalVerdict: LimitlessCourtVerdict = {
      settlementId,
      oracleScore,
      confidence,
      attestationCount: sortedIncluded.length,
      attestationWeight: includedSummary.attestationWeight,
      providerCount: includedSummary.providerCount,
      disagreement,
      includedOracles: sortedIncluded.map((entry) => entry.oracleId),
      outlierOracles: sortedOutliers,
      attestationRoot,
      transcriptHash: '',
      createdAt: this.now(),
      attestations: sortedIncluded,
    };

    provisionalVerdict.transcriptHash = computeTranscriptHash(
      settlementId,
      this.threshold,
      this.minWeight,
      this.minProviderCount,
      state.commitments,
      provisionalVerdict
    );

    return provisionalVerdict;
  }

  private validateOracleRegistryCoverage(): void {
    const activeOracles = [...this.oracleRegistry.values()].filter((oracle) => oracle.active);
    if (activeOracles.length < this.threshold) {
      throw new Error('Not enough active oracles to satisfy threshold');
    }
    const activeWeight = activeOracles.reduce((sum, oracle) => sum + oracle.weight, 0);
    if (activeWeight < this.minWeight) {
      throw new Error('Active oracle weight is below minWeight');
    }
    const activeProviders = new Set(activeOracles.map((oracle) => oracle.provider)).size;
    if (activeProviders < this.minProviderCount) {
      throw new Error('Not enough active oracle providers to satisfy minProviderCount');
    }
  }
}
